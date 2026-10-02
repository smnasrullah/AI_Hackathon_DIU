"""GET /copilot/suggestions serves the same questions record_replay records (exact-text replay)."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import BACKEND_DIR
from app.llm import guard, store
from app.llm.copilot.suggestions import COPILOT_DEMO
from app.models.enums import Lang
from scripts import record_replay
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, bearer

API = "/api/v1/copilot/suggestions"
COMMITTED_REPLAY = BACKEND_DIR / "app" / "llm" / "cache" / "demo_replay.json"


@pytest.mark.parametrize("lang", list(Lang))
def test_suggestions_per_language(client: TestClient, seeded: Path, lang: Lang) -> None:
    res = client.get(API, params={"lang": lang.value}, headers=bearer(client, ADMIN))
    assert res.status_code == 200, res.text
    assert res.json() == {"lang": lang.value, "items": list(COPILOT_DEMO[lang])}


def test_suggestions_default_to_user_language_and_need_auth(client: TestClient,
                                                            seeded: Path) -> None:
    body = client.get(API, headers=bearer(client, AGENT_MIRPUR)).json()
    assert body["lang"] == "bn" and body["items"] == list(COPILOT_DEMO[Lang.bn])
    assert client.get(API, headers=bearer(client, ADMIN)).json()["lang"] == "en"
    assert client.get(API).status_code == 401
    assert client.get(API, params={"lang": "fr"},
                      headers=bearer(client, ADMIN)).status_code == 422


def test_recorder_uses_the_same_source() -> None:
    assert record_replay.COPILOT_DEMO is COPILOT_DEMO


@pytest.mark.parametrize(("lang", "question"),
                         [(lang, q) for lang, qs in COPILOT_DEMO.items() for q in qs])
def test_suggestions_survive_sanitising(lang: Lang, question: str) -> None:
    """The replay key uses the sanitised question; a suggestion must be its own sanitised form."""
    assert guard.sanitize(question) == question


def test_every_suggestion_has_a_replay_entry() -> None:
    entries = store.replay_entries(COMMITTED_REPLAY)
    if not entries:
        pytest.skip("demo replay file not recorded yet (scripts/record_replay.py)")
    recorded = {(e.get("lang"), e.get("question")) for e in entries.values()}
    missing = [(lang.value, q) for lang, qs in COPILOT_DEMO.items() for q in qs
               if (lang.value, q) not in recorded]
    assert not missing, f"suggestions without replay wording: {missing}"
