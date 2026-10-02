"""Reason templates: every template renders in bn and en; unknown factors fall back."""

import re

import numpy as np
import pytest

from app.models.enums import Lang
from ml.explain.drivers import Driver, rank, round_bdt, top
from ml.explain.factors import FACTOR_OF, FACTORS
from ml.explain.facts import Facts
from ml.explain.templates import CAUSES, FALLBACK, amount, num, sentence, template_key
from ml.features.build import FEATURES

ASCII_DIGIT = re.compile(r"[0-9]")
BANGLA = re.compile(r"[ঀ-৿]")
EVENT: Facts = {"event_en": "Salary days (1st-3rd)", "event_bn": "বেতন দিবস (১-৩ তারিখ)",
                "when": "tomorrow", "days": 1}
NUMERIC: Facts = {"ratio": 2.3, "temp_c": 31, "weekday": 4}
VARIANT_FACTS: dict[str, Facts] = {"severe": {"rain_mm": 42.5, "severe": True},
                                   "wet": {"rain_mm": 12.0, "severe": False},
                                   "dry": {"rain_mm": 0.0, "severe": False}, "event": EVENT}


def _facts_for(key: str, impact: float) -> tuple[str, Facts]:
    factor, _, variant = key.partition(".")
    # Ratio agrees with the impact's direction, except for the neutral "pattern" variant.
    agrees = (impact > 0) != (variant == "pattern")
    ratio = {"ratio": 2.3 if agrees else 0.6}
    return factor, {**NUMERIC, **ratio, **VARIANT_FACTS.get(variant, {})}


@pytest.mark.parametrize("key", sorted(k for k in CAUSES if k != FALLBACK))
@pytest.mark.parametrize("impact", [12_400.0, -3_100.0])
def test_every_template_renders_in_both_languages(key: str, impact: float) -> None:
    factor, facts = _facts_for(key, impact)
    assert template_key(factor, facts, impact) == key
    for demand in ("cash_out", "cash_in"):
        en = sentence(factor, impact, facts, demand, Lang.en, 24)
        bn = sentence(factor, impact, facts, demand, Lang.bn, 24)
        fallback_en = sentence(FALLBACK, impact, {}, demand, Lang.en, 24)
        assert en != fallback_en, key
        assert "{" not in en + bn and "}" not in en + bn
        assert en.endswith(".") and en[0].isupper() and not BANGLA.search(en)
        assert bn.endswith("।") and BANGLA.search(bn) and not ASCII_DIGIT.search(bn), bn
        assert ("more" if impact > 0 else "less") in en
        assert ("বেশি" if impact > 0 else "কম") in bn
        assert amount(impact, Lang.en) in en and amount(impact, Lang.bn) in bn


def test_story_sentences() -> None:
    en = sentence("salary", 12_400, EVENT, "cash_out", Lang.en, 24)
    assert en == ("Salary days (1st-3rd) from tomorrow: expect about BDT 12,400 more cash-out "
                  "in the next 24 hours.")
    bn = sentence("salary", 12_400, EVENT, "cash_out", Lang.bn, 24)
    assert bn == ("বেতন দিবস (১-৩ তারিখ) আগামীকাল থেকে: "
                  "আগামী ২৪ ঘণ্টায় প্রায় ৳১২,৪০০ বেশি ক্যাশ-আউট হতে পারে।")
    week = sentence("last_week", 5_000, {"ratio": 2.3}, "cash_out", Lang.en, 24)
    assert week.startswith("Cash-out was 2.3x the usual level at this time last week:")
    assert "২.৩ গুণ" in sentence("last_week", 5_000, {"ratio": 2.3}, "cash_out", Lang.bn, 24)
    # A ratio that contradicts the impact is never quoted.
    odd = sentence("last_week", 5_000, {"ratio": 0.7}, "cash_in", Lang.en, 24)
    assert odd.startswith("Same-hour pattern of recent weeks:") and "0.7" not in odd


@pytest.mark.parametrize("factor,facts", [
    ("sunspots", {}),  # unknown factor
    ("last_week", {}),  # known factor, missing fact
    ("salary", {**EVENT, "when": "next_year"}),  # unknown event phase
    ("weekday", {"weekday": 9}),  # out of range
])
def test_unknown_factor_falls_back(factor: str, facts: Facts) -> None:
    for lang, cause in ((Lang.en, "Other factors"), (Lang.bn, "অন্যান্য কারণ")):
        text = sentence(factor, -2_000, facts, "cash_in", lang, 24)
        assert text.startswith(f"{cause}: ")
    assert sentence(factor, -2_000, facts, "cash_in", Lang.en, 24).endswith(
        "BDT 2,000 less cash-in in the next 24 hours.")


def test_every_factor_has_a_template() -> None:
    assert set(FACTOR_OF) == set(FEATURES)
    bases = {k.partition(".")[0] for k in CAUSES}
    assert set(FACTORS) <= bases


def test_number_formatting() -> None:
    assert amount(1_234_500, Lang.bn) == "৳১২,৩৪,৫০০"
    assert amount(-950, Lang.bn) == "৳৯৫০"
    assert amount(1_234_500, Lang.en) == "BDT 1,234,500"
    assert (num(2.0, Lang.en), num(2.34, Lang.en), num(12.5, Lang.bn)) == ("2", "2.3", "১২.৫")
    assert (round_bdt(12_437), round_bdt(-437), round_bdt(-4)) == (12_400, -440, 0)


def test_rank_and_top() -> None:
    impacts = np.zeros(len(FACTORS))
    impacts[FACTORS.index("salary")] = 9_000
    impacts[FACTORS.index("rain")] = -3_000
    impacts[FACTORS.index("weekday")] = 200  # 1.6% share: dropped
    impacts[FACTORS.index("hat_bazar")] = 300
    ranked = rank(impacts, {"salary": EVENT})
    assert [d.factor for d in ranked[:2]] == ["salary", "rain"]
    assert ranked[0].facts == EVENT and ranked[1].facts == {}
    assert sum(d.share for d in ranked) == pytest.approx(1.0, abs=0.01)
    shown = top(ranked)
    assert [d.factor for d in shown] == ["salary", "rain"]
    assert Driver.from_json(shown[0].as_json()) == shown[0]
