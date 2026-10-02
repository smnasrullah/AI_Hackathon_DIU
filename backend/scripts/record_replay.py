"""Record live LLM wording for the demo scenario into app/llm/cache/demo_replay.json.

Judges without a key then see real LLM wording (LLM_PROVIDER=auto -> replay). Needs a live
provider (LLM_API_KEY in .env) and a bootstrapped DB. Every call goes through the normal guarded
pipeline (numbers guard, schema, daily cap); only outputs that passed are recorded.

Run with the stack up, mounting the source so the file lands in the working tree:
  docker compose run --rm --no-deps -v ./backend:/app --entrypoint python backend \
      -m scripts.record_replay [--agents-per-distributor 5]
Then commit backend/app/llm/cache/demo_replay.json.
"""

import argparse
import sys
from collections.abc import Iterator
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_engine
from app.llm import packs, store
from app.llm.copilot import chat
from app.llm.copilot.intents import Route
from app.llm.copilot.suggestions import COPILOT_DEMO
from app.llm.mode import LIVE, resolve_mode
from app.llm.packs import Pack
from app.llm.service import generate
from app.models import Agent, Anomaly, User
from app.models.enums import AnomalyStatus, FloatType, GeneratedBy, Lang, UserRole
from app.schemas.llm import LlmText
from app.services import anomalies, risk_read
from app.services.anomalies import AnomalyError

FLOATS = (FloatType.cash, FloatType.emoney)


def _agent_packs(session: Session, agent: Agent) -> Iterator[Pack]:
    for ft in FLOATS:
        if (p := packs.narrate(session, agent, ft)) is not None:
            yield p
    if (p := packs.agent_briefing(session, agent)) is not None:
        yield p


def jobs(session: Session, per_distributor: int, n_anomalies: int) -> Iterator[tuple[User, Pack]]:
    users = session.scalars(select(User).where(User.is_active).order_by(User.email)).all()
    for user in users:
        if user.role == UserRole.agent and user.agent_id is not None:
            agent = session.get(Agent, user.agent_id)
            if agent is not None:
                yield from ((user, p) for p in _agent_packs(session, agent))
        elif user.role in (UserRole.distributor, UserRole.admin):
            if (p := packs.distributor(session, user)) is not None:
                yield user, p
        if user.role == UserRole.distributor and per_distributor > 0:
            page = risk_read.risk_page(session, user, 24, None, "risk", 1, per_distributor, None)
            for row in page.items if page else []:
                agent = session.get(Agent, row.agent_id)
                if agent is not None:
                    yield from ((user, p) for p in _agent_packs(session, agent))
        if user.role == UserRole.admin and anomalies.is_ready(session):
            ids = session.scalars(select(Anomaly.id).where(Anomaly.status == AnomalyStatus.open)
                                  .order_by(Anomaly.score.desc()).limit(n_anomalies)).all()
            for anomaly_id in ids:
                try:
                    yield user, packs.anomaly(session, user, anomaly_id)
                except AnomalyError:
                    continue


def copilot_users(session: Session) -> Iterator[tuple[User, Agent]]:
    for user in session.scalars(select(User).where(User.is_active, User.role == UserRole.agent)
                                .order_by(User.email)):
        if user.agent_id is not None and (agent := session.get(Agent, user.agent_id)):
            yield user, agent


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--agents-per-distributor", type=int, default=5)
    parser.add_argument("--anomalies", type=int, default=5)
    args = parser.parse_args()
    # The recorder makes many calls in a row; the per-user minute limit is for the app.
    settings = get_settings().model_copy(update={"llm_user_calls_per_min": 1_000_000})
    mode = resolve_mode(settings)
    if mode not in LIVE:
        print(f"LLM mode is '{mode}': set LLM_API_KEY (and LLM_PROVIDER) in .env first.")
        return 1
    recorded = fallback = 0
    seen: set[str] = set()

    def record(result: LlmText, question: str | None = None) -> None:
        nonlocal recorded, fallback
        name = f"{result.intent.value:<22} {result.lang.value}"
        if result.generated_by is not GeneratedBy.llm:
            fallback += 1
            print(f"skip  {name} {result.fallback_reason}")
            return
        store.replay_record(settings.llm_replay_file, result.evidence_hash, {
            "intent": result.intent.value, "lang": result.lang.value, "text": result.text,
            "cited_factors": result.cited_factors, "model": result.model or
            settings.llm_model, "recorded_at": datetime.now(UTC).isoformat()}
            | ({"question": question} if question is not None else {}))
        recorded += 1
        print(f"ok    {name} {result.evidence_hash[:12]}")

    with Session(get_engine()) as session:
        for user, pack in jobs(session, args.agents_per_distributor, args.anomalies):
            for lang in (Lang.bn, Lang.en):
                key = store.evidence_key(pack.intent, lang, pack.data)
                if key in seen:
                    continue
                seen.add(key)
                record(generate(session, settings, user, pack, lang))
                session.commit()
        # Copilot replay is keyed by the exact question: GET /copilot/suggestions serves these.
        for user, agent in copilot_users(session):
            for lang, questions in COPILOT_DEMO.items():
                for question in questions:
                    reply = chat.ask(session, settings, user, agent, question, lang)
                    session.commit()
                    if reply.route not in (Route.blocked, Route.off_topic):
                        record(reply.answer, question)
    print(f"recorded {recorded}, fell back {fallback} -> {settings.llm_replay_file}")
    return 0 if recorded else 1


if __name__ == "__main__":
    sys.exit(main())
