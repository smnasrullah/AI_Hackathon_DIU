"""Why a help request was made: stored as a code plus parameters, rendered per reader language.

Who sees what (app/services/liquidity_read.py): the requester, their distributor and admins get
render() in their own language; helpers get only the coarse category (salary_day, eid, ...),
never the sentence, numbers or balances. Requests made before 0018 kept free text in
reason_summary; that is shown as is to the same owner side, never to helpers.
"""

from dataclasses import dataclass, field
from typing import Any

from app.models import ForecastExplanation, LiquidityRequest
from app.models.enums import FLOAT_DEMAND, FloatType, HelpReasonCategory, Lang
from ml.explain import drivers as drv
from ml.explain.templates import num, sentence

FORECAST_SHORT = "forecast_short"
SIMULATED_TAG = "[SIMULATED]"  # fixed demo marker, the same in both languages
FLOAT_NAME = {Lang.en: {FloatType.cash: "Cash", FloatType.emoney: "E-money"},
              Lang.bn: {FloatType.cash: "ক্যাশ", FloatType.emoney: "ই-মানি"}}
HEAD = {Lang.en: "{float} is forecast to run short in about {hours} hours.",
        Lang.bn: "পূর্বাভাস অনুযায়ী প্রায় {hours} ঘণ্টার মধ্যে {float} ফুরিয়ে যেতে পারে।"}
C = HelpReasonCategory
CATEGORY_OF_FACTOR: dict[str, HelpReasonCategory] = {
    "salary": C.salary_day, "eid": C.eid, "holiday": C.holiday, "hat_bazar": C.market_day,
    "rain": C.weather, "temperature": C.weather,
}


@dataclass(frozen=True)
class HelpReason:
    code: str
    params: dict[str, Any] = field(default_factory=dict)
    category: HelpReasonCategory = HelpReasonCategory.unknown


def category_of(driver: dict[str, Any] | None) -> HelpReasonCategory:
    """Coarse and number-free: the event behind the top demand-raising driver."""
    if driver is None:
        return HelpReasonCategory.unknown
    return CATEGORY_OF_FACTOR.get(str(driver["factor"]), HelpReasonCategory.high_demand)


def _top_raising(row: ForecastExplanation | None) -> dict[str, Any] | None:
    """The strongest driver that pushes demand up (a driver that lowers it explains nothing)."""
    if row is None:
        return None
    ranked = drv.top([drv.Driver.from_json(x) for x in row.drivers])
    hit = next((d for d in ranked if d.impact_bdt > 0), None)
    if hit is None:
        return None
    return {"factor": hit.factor, "impact_bdt": hit.impact_bdt, "facts": hit.facts,
            "demand": FLOAT_DEMAND[row.float_type].value, "window_h": row.window_h}


def forecast_short(float_type: FloatType, stockout_h: float, simulated: bool,
                   row: ForecastExplanation | None) -> HelpReason:
    driver = _top_raising(row)
    params = {"float_type": float_type.value, "hours": max(1, round(stockout_h)),
              "simulated": simulated, "driver": driver}
    return HelpReason(FORECAST_SHORT, params, category_of(driver))


def render(code: str | None, params: dict[str, Any] | None, lang: Lang) -> str | None:
    """The full sentence in `lang`, or None for an unknown code."""
    if code != FORECAST_SHORT or params is None:
        return None
    ft = FloatType(params["float_type"])
    text = HEAD[lang].format(float=FLOAT_NAME[lang][ft], hours=num(float(params["hours"]), lang))
    d = params.get("driver")
    if isinstance(d, dict):
        text += " " + sentence(str(d["factor"]), float(d["impact_bdt"]), dict(d["facts"]),
                               str(d["demand"]), lang, int(d["window_h"]))
    return f"{SIMULATED_TAG} {text}" if params.get("simulated") else text


def for_owner(req: LiquidityRequest, lang: Lang) -> str | None:
    """Owner side only. Structured reason in `lang`; older free text unchanged."""
    return render(req.reason_code, req.reason_params, lang) or req.reason_summary
