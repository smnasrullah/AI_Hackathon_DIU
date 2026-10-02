"""Deterministic bn/en text for every LLM intent, built only from the evidence pack.

Always computed: it is the fallback, the draft the LLM rewrites, and the source of allowed
numbers. Bangla uses Bangla digits and lakh grouping (ml/explain/templates.py).
"""

from dataclasses import dataclass
from typing import Any

from app.llm.packs import Pack
from app.models.enums import Lang, LlmIntent
from ml.explain.templates import amount, bn_digits, sentence

EN, BN = Lang.en, Lang.bn
NOTICE = {EN: "Advice only: a person must approve any money movement.",
          BN: "শুধু পরামর্শ: যেকোনো টাকা লেনদেনের আগে একজন মানুষের অনুমোদন লাগবে।"}
LEVEL = {EN: {"red": "Red", "amber": "Amber", "green": "Green"},
         BN: {"red": "লাল", "amber": "হলুদ", "green": "সবুজ"}}
FLOAT = {EN: {"cash": "Cash", "emoney": "E-money"}, BN: {"cash": "নগদ", "emoney": "ই-মানি"}}
DAY = {EN: {"today": "today", "tomorrow": "tomorrow", "later": "later"},
       BN: {"today": "আজ", "tomorrow": "আগামীকাল", "later": "পরে"}}
ACTION = {EN: {"add_cash": "add cash", "add_emoney": "top up e-money",
               "swap": "swap with a nearby agent", "van": "collect cash from the van"},
          BN: {"add_cash": "নগদ যোগ করুন", "add_emoney": "ই-মানি টপ-আপ করুন",
               "swap": "কাছের এজেন্টের সাথে অদল-বদল করুন", "van": "ভ্যান থেকে নগদ নিন"}}
FEATURE = {EN: {"cash_out_growth": "Cash-out growth", "hour_shift": "Shift in busy hours",
                "refills_per_day": "Refills per day",
                "out_in_log_ratio": "Cash-out to cash-in balance"},
           BN: {"cash_out_growth": "ক্যাশ-আউট বৃদ্ধি", "hour_shift": "ব্যস্ত সময়ের পরিবর্তন",
                "refills_per_day": "দৈনিক রিফিল",
                "out_in_log_ratio": "ক্যাশ-আউট ও ক্যাশ-ইনের অনুপাত"}}


@dataclass(frozen=True)
class Draft:
    text: str
    cited_factors: list[str]


def _n(x: float | int | str, lang: Lang) -> str:
    text = f"{x:g}" if isinstance(x, float) else str(x)
    return bn_digits(text) if lang is BN else text


def _pct(p: float, lang: Lang) -> str:
    return _n(round(p * 100), lang) + "%"


def _narrate(d: dict[str, Any], lang: Lang) -> Draft:
    parts = [sentence(x["factor"], x["impact_bdt"], x["facts"], d["demand_type"], lang,
                      d["window_h"]) for x in d["drivers"]]
    return Draft(" ".join(parts), [x["factor"] for x in d["drivers"]])


def _float_line(f: dict[str, Any], lang: Lang) -> str:
    name, level = FLOAT[lang][f["float_type"]], LEVEL[lang][f["level_24h"]]
    conf = _pct(f["confidence"], lang)
    if f["hours_to_stockout"] is not None and f["stockout_time"]:
        hours, when = _n(f["hours_to_stockout"], lang), _n(f["stockout_time"], lang)
        day = DAY[lang][f["stockout_day"]]
        if lang is EN:
            return (f"{name}: may run out in about {hours} hours (around {when} {day}, "
                    f"confidence {conf}); 24-hour risk {level}.")
        return (f"{name}: প্রায় {hours} ঘণ্টায় শেষ হতে পারে ({day} {when}-এর কাছাকাছি, "
                f"আস্থা {conf}); ২৪ ঘণ্টার ঝুঁকি {level}।")
    if lang is EN:
        return f"{name}: no stockout expected soon (confidence {conf}); 24-hour risk {level}."
    return f"{name}: শিগগির শেষ হওয়ার সম্ভাবনা কম (আস্থা {conf}); ২৪ ঘণ্টার ঝুঁকি {level}।"


def _action_line(a: dict[str, Any], lang: Lang) -> str:
    what, amt = ACTION[lang][a["kind"]], amount(a["amount_bdt"], lang)
    when, day = _n(a["deadline_time"], lang), DAY[lang][a["deadline_day"]]
    if lang is EN:
        return f"Suggested: {what}, {amt}, by {when} {day}."
    return f"পরামর্শ: {day} {when}-এর মধ্যে {amt} — {what}।"


def _agent_briefing(d: dict[str, Any], lang: Lang) -> Draft:
    agent, level = d["agent"], LEVEL[lang][d["level"]]
    head = (f"{agent['code']} ({agent['district']}): overall risk for the next 24 hours is "
            f"{level}." if lang is EN else
            f"{agent['code']} ({agent['district']}): আগামী ২৪ ঘণ্টার সামগ্রিক ঝুঁকি {level}।")
    parts = [head]
    for f in d["floats"]:
        parts.append(_float_line(f, lang))
        if (t := f["top_driver"]) is not None:
            parts.append(sentence(t["factor"], t["impact_bdt"], t["facts"], f["demand_type"],
                                  lang, t["window_h"]))
    parts += [_action_line(a, lang) for a in d["actions"]]
    if d["actions"]:
        parts.append(NOTICE[lang])
    return Draft(" ".join(parts), list(d["factors"]))


def _top_line(t: dict[str, Any], lang: Lang) -> str:
    level, name = LEVEL[lang][t["level"]], FLOAT[lang][t["worst_float"]]
    if t["hours_to_stockout"] is None:
        return f"{t['code']} ({t['district']}, {level})"
    hours = _n(t["hours_to_stockout"], lang)
    if lang is EN:
        return f"{t['code']} ({t['district']}, {level}, {name.lower()} may run out in {hours} h)"
    return f"{t['code']} ({t['district']}, {level}, {name} {hours} ঘণ্টায় শেষ হতে পারে)"


def _distributor_briefing(d: dict[str, Any], lang: Lang) -> Draft:
    c, total = d["levels"], _n(d["agents_total"], lang)
    red, amber, green = (_n(c[k], lang) for k in ("red", "amber", "green"))
    swaps, flags = _n(d["swaps_pending"], lang), _n(d["anomalies_open"], lang)
    tops = "; ".join(_top_line(t, lang) for t in d["top"])
    if lang is EN:
        parts = [f"Next 24 hours across {total} agents: {red} Red, {amber} Amber, {green} Green."]
        parts.append(f"Most urgent: {tops}." if tops else "No agent needs urgent attention.")
        parts.append(f"Swaps waiting for approval: {swaps}. Anomaly flags to review: {flags}.")
    else:
        parts = [f"আগামী ২৪ ঘণ্টা, মোট {total} এজেন্ট: {red} লাল, {amber} হলুদ, {green} সবুজ।"]
        parts.append(f"সবচেয়ে জরুরি: {tops}।" if tops else "এখন কোনো এজেন্টের জরুরি সহায়তা লাগবে না।")
        parts.append(f"অনুমোদনের অপেক্ষায় অদল-বদল: {swaps}। পর্যালোচনার অপেক্ষায় অস্বাভাবিকতা: {flags}।")
    parts.append(NOTICE[lang])
    return Draft(" ".join(parts), [])


def _reason_line(r: dict[str, Any], lang: Lang) -> str:
    name, value, median = FEATURE[lang][r["feature"]], _n(r["value"], lang), _n(
        r["peer_median"], lang)
    if lang is EN:
        side = "unusually high" if r["direction"] == "high" else "unusually low"
        return f"{name} is {side}: {value} (peer median {median})."
    side = "অস্বাভাবিক বেশি" if r["direction"] == "high" else "অস্বাভাবিক কম"
    return f"{name} {side}: {value} (সমগোত্রীয়দের মধ্যমা {median})।"


def _anomaly_narrative(d: dict[str, Any], lang: Lang) -> Draft:
    agent, ctx = d["agent"], d["context"]
    start, end = _n(d["window_start"], lang), _n(d["window_end"], lang)
    score, cut, peers = _n(d["score"], lang), _n(d["threshold"], lang), _n(d["peer_count"], lang)
    out, base = amount(ctx["cash_out_bdt"], lang), amount(ctx["baseline_cash_out_bdt"], lang)
    if lang is EN:
        parts = [f"{agent['code']} ({agent['district']}) was flagged for review for {start} to "
                 f"{end}: score {score} against a cut-off of {cut} among {peers} similar agents."]
        parts += [_reason_line(r, lang) for r in d["reasons"]]
        parts.append(f"Cash-out in the window: {out}, against a usual {base}.")
        parts.append("This is a lead for a person to review, not a finding of wrongdoing.")
    else:
        parts = [f"{agent['code']} ({agent['district']}) পর্যালোচনার জন্য চিহ্নিত ({start} থেকে "
                 f"{end}): {peers} জন সমগোত্রীয় এজেন্টের সীমা {cut}, স্কোর {score}।"]
        parts += [_reason_line(r, lang) for r in d["reasons"]]
        parts.append(f"এই সময়ে ক্যাশ-আউট: {out}, স্বাভাবিক {base}।")
        parts.append("এটি একজন মানুষের পর্যালোচনার সূত্র মাত্র, কোনো অনিয়মের প্রমাণ নয়।")
    return Draft(" ".join(parts), [r["feature"] for r in d["reasons"]])


_RENDER = {
    LlmIntent.narrate: _narrate,
    LlmIntent.agent_briefing: _agent_briefing,
    LlmIntent.distributor_briefing: _distributor_briefing,
    LlmIntent.anomaly_narrative: _anomaly_narrative,
}


def render(pack: Pack, lang: Lang) -> Draft:
    return _RENDER[pack.intent](pack.data, lang)
