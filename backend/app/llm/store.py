"""Evidence hash, response cache (llm_cache), demo replay file, call log (llm_call_log)."""

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.llm.mode import LIVE
from app.models import LlmCache, LlmCallLog
from app.models.enums import GeneratedBy, GuardResult, Lang, LlmIntent


def evidence_key(intent: LlmIntent, lang: Lang, data: dict[str, Any],
                 question: str | None = None) -> str:
    """sha256(intent + lang + pack [+ copilot question]); keys without a question are unchanged."""
    doc: dict[str, Any] = {"intent": intent.value, "lang": lang.value, "pack": data}
    if question is not None:
        doc["question"] = question
    blob = json.dumps(doc, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode()).hexdigest()


def _utc(ts: datetime) -> datetime:
    return ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts.astimezone(UTC)


# --- response cache -------------------------------------------------------------------------

def cache_get(session: Session, key: str) -> LlmCache | None:
    row = session.get(LlmCache, key)
    if row is None or (row.expires_at is not None and _utc(row.expires_at) <= datetime.now(UTC)):
        return None
    return row


def cache_put(session: Session, key: str, intent: LlmIntent, response: dict[str, Any],
              provider: str, ttl_h: int) -> None:
    now = datetime.now(UTC)
    session.merge(LlmCache(key=key, intent=intent, response=response, provider=provider,
                           created_at=now, expires_at=now + timedelta(hours=ttl_h)))


# --- demo replay file -----------------------------------------------------------------------

@lru_cache(maxsize=4)
def _read(path: str, mtime: float) -> dict[str, dict[str, Any]]:
    data: dict[str, dict[str, Any]] = json.loads(Path(path).read_text(encoding="utf-8"))
    return data


def replay_entries(path: Path) -> dict[str, dict[str, Any]]:
    if not path.is_file():
        return {}
    try:
        return _read(str(path), path.stat().st_mtime)
    except (OSError, ValueError):
        return {}


def replay_record(path: Path, key: str, entry: dict[str, Any]) -> None:
    data = dict(replay_entries(path))
    data[key] = entry
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                    encoding="utf-8")


# --- call log -------------------------------------------------------------------------------

@dataclass
class CallRecord:
    user_id: uuid.UUID | None
    intent: LlmIntent
    lang: Lang
    evidence_hash: str
    provider: str
    model: str | None
    generated_by: GeneratedBy
    guard_result: GuardResult
    latency_ms: int = 0
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    error: str | None = None


def log_call(session: Session, rec: CallRecord) -> None:
    session.add(LlmCallLog(
        user_id=rec.user_id, intent=rec.intent, provider=rec.provider, model=rec.model,
        lang=rec.lang, evidence_hash=rec.evidence_hash, prompt_tokens=rec.prompt_tokens,
        completion_tokens=rec.completion_tokens, latency_ms=rec.latency_ms,
        generated_by=rec.generated_by, guard_result=rec.guard_result, error=rec.error,
        created_at=datetime.now(UTC)))
    session.flush()


def live_calls_today(session: Session) -> int:
    """Calls that reached a live provider since 00:00 UTC (every attempt counts)."""
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    return session.scalar(select(func.count()).select_from(LlmCallLog).where(
        LlmCallLog.provider.in_(sorted(LIVE)), LlmCallLog.created_at >= start)) or 0


def last_error(session: Session) -> tuple[str, datetime] | None:
    row = session.scalars(select(LlmCallLog).where(LlmCallLog.error.is_not(None))
                          .order_by(LlmCallLog.id.desc()).limit(1)).first()
    return None if row is None or row.error is None else (row.error, _utc(row.created_at))
