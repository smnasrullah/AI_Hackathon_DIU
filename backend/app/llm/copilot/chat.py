"""One Agent Copilot turn: route -> evidence pack (the scoped agent only) -> deterministic draft
-> guarded LLM wording, or a fixed refusal with no LLM call -> chat history.

The LLM sees only this pack, the draft and the user's question (as untrusted data); every
number in its answer is checked against the pack, and agent codes outside it are rejected.
"""

import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.llm import guard, packs, service, templates
from app.llm.copilot import answers, tools
from app.llm.copilot.intents import Route, Routed, route
from app.llm.numbers import BDT
from app.llm.packs import Pack
from app.llm.templates import Draft
from app.models import Agent, CopilotMessage, User
from app.models.enums import ChatRole, Lang, LlmIntent
from app.schemas.copilot import CopilotMeta, CopilotReply, CopilotSource
from app.schemas.llm import LlmText
from app.services.forecast import sim_now

PACK_VERSION = 1
CHUNK_WORDS = 4
_REFUSED = (Route.blocked, Route.off_topic)


@dataclass(frozen=True)
class Turn:
    routed: Routed
    pack: Pack
    draft: Draft


def plan(session: Session, settings: Settings, user: User, agent: Agent, message: str,
         lang: Lang) -> Turn:
    """Route the question and build its evidence (tools run here, read-only, scoped)."""
    routed = route(message, lang, agent.code, 24 - sim_now(session).astimezone(BDT).hour)
    if routed.route is Route.status and (brief := packs.agent_briefing(session, agent)):
        data = {**brief.data, "route": Route.status.value}
        return Turn(routed, Pack(LlmIntent.copilot, data, brief.model_version),
                    templates.render(brief, lang))
    data = {"v": PACK_VERSION, "route": routed.route.value,
            "agent": {"id": agent.id, "code": agent.code, "district": agent.district},
            "factors": []}
    model_version: str | None = None
    if routed.tool is not None:
        result = tools.execute(session, settings, user, agent, routed.tool)
        data |= {"tool": routed.tool.model_dump(mode="json"), "result": result}
        model_version = result.get("model_version")
    if routed.hits:
        data["playbook"] = [{"slug": h.passage.slug, "title": h.passage.title,
                             "text": h.passage.text} for h in routed.hits]
    return Turn(routed, Pack(LlmIntent.copilot, data, model_version), answers.render(data, lang))


def meta(turn: Turn, agent: Agent) -> CopilotMeta:
    return CopilotMeta(agent_id=agent.id, route=turn.routed.route, tool=turn.routed.tool,
                       sources=[CopilotSource(slug=h.passage.slug, title=h.passage.title,
                                              score=h.score) for h in turn.routed.hits])


def _cited(text: LlmText, turn: Turn, lang: Lang) -> LlmText:
    """Playbook answers name their source even when the LLM dropped the title."""
    titles = list(dict.fromkeys(h.passage.title for h in turn.routed.hits))
    if not titles or any(t in text.text for t in titles):
        return text
    notice = templates.NOTICE[lang]
    cite = f"Source: {'; '.join(titles)}." if lang is Lang.en else f"সূত্র: {'; '.join(titles)}।"
    body = text.text.replace(notice, " ").strip()
    return text.model_copy(update={"text": f"{body} {cite} {notice}"})


def _save(session: Session, user: User, agent: Agent, message: str, answer: LlmText) -> None:
    session.add_all([
        CopilotMessage(user_id=user.id, agent_id=agent.id, role=ChatRole.user,
                       text=guard.sanitize(message), lang=answer.lang),
        CopilotMessage(user_id=user.id, agent_id=agent.id, role=ChatRole.assistant,
                       text=answer.text, lang=answer.lang, generated_by=answer.generated_by)])
    session.flush()


def answer(session: Session, settings: Settings, user: User, agent: Agent, message: str,
           lang: Lang, turn: Turn) -> CopilotReply:
    if turn.routed.route in _REFUSED:
        text = service.fixed(session, settings, user, turn.pack, lang, turn.draft,
                             blocked=turn.routed.route is Route.blocked)
    else:
        text = service.generate(session, settings, user, turn.pack, lang, question=message,
                                draft=turn.draft)
        if turn.routed.route is Route.howto:
            text = _cited(text, turn, lang)
    _save(session, user, agent, message, text)
    return CopilotReply(**dict(meta(turn, agent)), answer=text)


def ask(session: Session, settings: Settings, user: User, agent: Agent, message: str,
        lang: Lang) -> CopilotReply:
    """Whole turn without streaming (scripts, tests)."""
    return answer(session, settings, user, agent, message, lang,
                  plan(session, settings, user, agent, message, lang))


def chunks(text: str, words: int = CHUNK_WORDS) -> list[str]:
    parts = re.findall(r"\S+\s*", text)
    return ["".join(parts[i:i + words]) for i in range(0, len(parts), words)]
