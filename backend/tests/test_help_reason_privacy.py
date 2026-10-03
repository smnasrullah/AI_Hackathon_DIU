"""The reason of a help request: stored as code + parameters, rendered in the reader's language
for the requester side; helpers get only the coarse category, never the sentence or numbers."""

from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.models.enums import FloatType, HelpReasonCategory, Lang
from app.services import help_reason
from app.services.help_reason import HelpReason
from tests.auth_helpers import ADMIN, AGENT_MIRPUR, AGENT_PATIYA, DIST_DHAKA, bearer
from tests.help_helpers import (
    AGENT_SUNAMGANJ,
    API,
    REASON,
    act,
    help_params,
    make_request,
    set_lang,
)

SALARY = {"factor": "salary", "impact_bdt": 12_000.0, "facts": {}, "demand": "cash_out",
          "window_h": 24}
WHY = HelpReason(help_reason.FORECAST_SHORT, {"float_type": "cash", "hours": 3,
                                              "simulated": False, "driver": SALARY},
                 HelpReasonCategory.salary_day)
EN = ("Cash is forecast to run short in about 3 hours. Monthly salary cycle: expect about "
      "BDT 12,000 more cash-out in the next 24 hours.")
LEAKS = ("salary cycle", "12,000", "12000", "run short", "বেতন", "balance", "forecast")


def _assert_no_reason(body: dict[str, Any]) -> None:
    assert body["view"] == "recipient"
    assert body["reason_summary"] is None and body["reason_category"] == "salary_day"
    text = str(body).lower()
    for leaked in LEAKS:
        assert leaked not in text, leaked


def test_owner_side_reads_the_reason_in_their_own_language(client: TestClient,
                                                           seeded: Path) -> None:
    set_lang(AGENT_MIRPUR, Lang.en)
    set_lang(DIST_DHAKA, Lang.bn)
    req_id, _ = make_request([AGENT_PATIYA, DIST_DHAKA], reason=WHY)
    mine = client.get(f"{API}/{req_id}", headers=bearer(client, AGENT_MIRPUR)).json()
    assert mine["reason_summary"] == EN and mine["reason_category"] == "salary_day"
    dist = client.get(f"{API}/{req_id}", headers=bearer(client, DIST_DHAKA)).json()
    assert dist["view"] == "owner"  # the requester's distributor, though also asked to help
    assert "মাসিক বেতন চক্র" in dist["reason_summary"] and "৳১২,০০০" in dist["reason_summary"]
    assert client.get(f"{API}/{req_id}",
                      headers=bearer(client, ADMIN)).json()["reason_summary"] is not None


def test_helpers_never_receive_the_full_reason(client: TestClient, seeded: Path) -> None:
    set_lang(AGENT_PATIYA, Lang.en)
    req_id, _ = make_request([AGENT_PATIYA, AGENT_SUNAMGANJ], reason=WHY)
    _assert_no_reason(client.get(f"{API}/{req_id}", headers=bearer(client, AGENT_PATIYA)).json())
    inbox = client.get(f"{API}/inbox", headers=bearer(client, AGENT_SUNAMGANJ)).json()
    _assert_no_reason(inbox["items"][0])
    _assert_no_reason(act(client, req_id, "claim", AGENT_PATIYA).json())  # even the winner
    _assert_no_reason(act(client, req_id, "decline", AGENT_SUNAMGANJ).json())
    for email in (AGENT_PATIYA, AGENT_SUNAMGANJ):  # nor any notification
        for params in help_params(req_id, email):
            assert not {"reason", "reason_summary", "reason_code"} & set(params)
            for leaked in LEAKS:
                assert leaked not in str(params).lower()


def test_free_text_reasons_from_before_stay_owner_only(client: TestClient, seeded: Path) -> None:
    req_id, _ = make_request([AGENT_PATIYA])
    assert client.get(f"{API}/{req_id}",
                      headers=bearer(client, AGENT_MIRPUR)).json()["reason_summary"] == REASON
    body = client.get(f"{API}/{req_id}", headers=bearer(client, AGENT_PATIYA)).json()
    assert body["reason_summary"] is None and body["reason_category"] == "unknown"


def test_category_comes_from_the_top_demand_raising_driver() -> None:
    cases = {"salary": "salary_day", "eid": "eid", "holiday": "holiday",
             "hat_bazar": "market_day", "rain": "weather", "temperature": "weather",
             "last_week": "high_demand", "recent_demand": "high_demand"}
    for factor, category in cases.items():
        assert help_reason.category_of({"factor": factor}) == category
    assert help_reason.category_of(None) == HelpReasonCategory.unknown


def test_render_in_both_languages_without_a_driver() -> None:
    plain = help_reason.forecast_short(FloatType.emoney, 2.4, True, None)
    assert plain.category == HelpReasonCategory.unknown
    en = help_reason.render(plain.code, plain.params, Lang.en)
    assert en == "[SIMULATED] E-money is forecast to run short in about 2 hours."
    bn = help_reason.render(plain.code, plain.params, Lang.bn)
    assert bn is not None and bn.startswith("[SIMULATED] ") and "ই-মানি" in bn and "২" in bn
    assert help_reason.render("unknown_code", plain.params, Lang.en) is None
