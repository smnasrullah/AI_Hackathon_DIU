"""Agent Copilot chat (SSE). Advisory language over the scoped agent's evidence only."""

import logging
import uuid
from collections.abc import Iterator

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.core.config import get_settings
from app.core.db import get_engine
from app.core.deps import CurrentUser, SessionDep, can_access_agent
from app.llm.copilot import chat
from app.models import Agent, User
from app.models.enums import Lang, UserRole
from app.schemas.copilot import CopilotChatIn, CopilotDraft, CopilotError

router = APIRouter(prefix="/copilot", tags=["copilot"])
log = logging.getLogger(__name__)

EVENTS_DOC = """`text/event-stream`, in order:
`meta` (CopilotMeta: route, tool, playbook sources) -> `template` (CopilotDraft: deterministic
answer, show it at once) -> `delta`* (CopilotDraft: chunks of the final answer) -> `done`
(CopilotReply). On an internal failure: `error` ({"detail": "copilot_failed"})."""


def _agent(user: User, session: Session, agent_id: int | None) -> Agent:
    """Agents talk about their own account; distributors / admins name an agent in scope."""
    if user.role == UserRole.agent:
        if agent_id is not None and agent_id != user.agent_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")
        agent_id = user.agent_id
    elif agent_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="agent_id_required")
    agent = session.get(Agent, agent_id) if agent_id is not None else None
    if agent is not None and can_access_agent(user, agent):
        return agent
    if agent is None and user.role == UserRole.admin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="agent_not_found")
    raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")


def _event(name: str, body: BaseModel) -> dict[str, str]:
    return {"event": name, "data": body.model_dump_json()}


FAILED = CopilotError(detail="copilot_failed")


def _stream(user_id: uuid.UUID, agent_id: int, message: str, lang: Lang
            ) -> Iterator[dict[str, str]]:
    """Own DB session: the request's session is closed once the response starts streaming."""
    settings = get_settings()
    with Session(get_engine()) as session:
        user, agent = session.get(User, user_id), session.get(Agent, agent_id)
        if user is None or agent is None:
            yield _event("error", FAILED)
            return
        try:
            turn = chat.plan(session, settings, user, agent, message, lang)
            yield _event("meta", chat.meta(turn, agent))
            yield _event("template", CopilotDraft(text=turn.draft.text))
            reply = chat.answer(session, settings, user, agent, message, lang, turn)
            session.commit()  # chat history, llm_call_log, llm_cache
        except Exception:  # never leave the client hanging; details stay in the server log
            session.rollback()
            log.exception("copilot turn failed")
            yield _event("error", FAILED)
            return
    for part in chat.chunks(reply.answer.text):
        yield _event("delta", CopilotDraft(text=part))
    yield _event("done", reply)


@router.post("/chat", response_class=EventSourceResponse, description=EVENTS_DOC,
             responses={200: {"content": {"text/event-stream": {}}}})
def copilot_chat(body: CopilotChatIn, user: CurrentUser, session: SessionDep
                 ) -> EventSourceResponse:
    """Agent Copilot (bn/en): grounded, role-scoped, advisory. Off-topic and injection attempts
    are refused without an LLM call; every answer is labelled generated_by llm|replay|template."""
    agent = _agent(user, session, body.agent_id)
    return EventSourceResponse(_stream(user.id, agent.id, body.message, body.lang or user.lang))
