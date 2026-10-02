"""bn/en template sentences for drivers: "<cause>: <effect>." Deterministic, no LLM.

Template key = factor, or factor.variant (event / severe / wet / dry / pattern). An unknown
factor, an unknown variant or a missing fact falls back to the generic "Other factors" cause.
Bangla text uses Bangla digits and lakh grouping (12,34,500).
"""

from app.models.enums import Lang
from ml.explain.facts import Facts

FALLBACK = "other"
RATIO_FACTORS = ("last_week", "recent_demand")
_BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
_EVENT = {Lang.en: "{event} {when}", Lang.bn: "{event} {when}"}

CAUSES: dict[str, dict[Lang, str]] = {
    "salary": {Lang.en: "Monthly salary cycle", Lang.bn: "মাসিক বেতন চক্র"},
    "salary.event": _EVENT,
    "eid": {Lang.en: "Eid season pattern", Lang.bn: "ঈদ মৌসুমের প্রবণতা"},
    "eid.event": _EVENT,
    "holiday": {Lang.en: "Holiday pattern", Lang.bn: "ছুটির দিনের প্রবণতা"},
    "holiday.event": _EVENT,
    "hat_bazar": {Lang.en: "Hat bazar day pattern", Lang.bn: "হাটবারের প্রবণতা"},
    "hat_bazar.event": _EVENT,
    "rain.severe": {Lang.en: "Heavy rain expected ({rain_mm} mm)",
                    Lang.bn: "ভারী বৃষ্টির সম্ভাবনা ({rain_mm} মিমি)"},
    "rain.wet": {Lang.en: "Rain expected ({rain_mm} mm)",
                 Lang.bn: "বৃষ্টির সম্ভাবনা ({rain_mm} মিমি)"},
    "rain.dry": {Lang.en: "No rain expected", Lang.bn: "বৃষ্টির সম্ভাবনা নেই"},
    "temperature": {Lang.en: "Temperature around {temp_c}°C",
                    Lang.bn: "তাপমাত্রা প্রায় {temp_c}° সেলসিয়াস"},
    "last_week": {Lang.en: "{demand} was {ratio}x the usual level at this time last week",
                  Lang.bn: "গত সপ্তাহে এই সময়ে {demand} স্বাভাবিকের {ratio} গুণ ছিল"},
    "last_week.pattern": {Lang.en: "Same-hour pattern of recent weeks",
                          Lang.bn: "গত কয়েক সপ্তাহের একই সময়ের প্রবণতা"},
    "recent_demand": {Lang.en: "{demand} in the last 24 hours was {ratio}x the usual level",
                      Lang.bn: "গত ২৪ ঘণ্টায় {demand} স্বাভাবিকের {ratio} গুণ ছিল"},
    "recent_demand.pattern": {Lang.en: "Recent demand level",
                              Lang.bn: "সাম্প্রতিক চাহিদার মাত্রা"},
    "time_of_day": {Lang.en: "Time-of-day pattern", Lang.bn: "দিনের সময়ভিত্তিক প্রবণতা"},
    "weekday": {Lang.en: "Usual {weekday} pattern", Lang.bn: "{weekday} স্বাভাবিক প্রবণতা"},
    "agent_profile": {Lang.en: "This shop's size and location",
                      Lang.bn: "এই দোকানের আকার ও এলাকা"},
    FALLBACK: {Lang.en: "Other factors", Lang.bn: "অন্যান্য কারণ"},
}
EFFECT = {Lang.en: "expect about {amount} {more_less} {demand} in the next {hours} hours",
          Lang.bn: "আগামী {hours} ঘণ্টায় প্রায় {amount} {more_less} {demand} হতে পারে"}
END = {Lang.en: ".", Lang.bn: "।"}
MORE_LESS = {Lang.en: ("less", "more"), Lang.bn: ("কম", "বেশি")}
DEMAND = {Lang.en: {"cash_out": "cash-out", "cash_in": "cash-in"},
          Lang.bn: {"cash_out": "ক্যাশ-আউট", "cash_in": "ক্যাশ-ইন"}}
WHEN = {Lang.en: {"ongoing": "under way", "today": "later today", "tomorrow": "from tomorrow",
                  "in_days": "in {days} days"},
        Lang.bn: {"ongoing": "চলছে", "today": "আজ", "tomorrow": "আগামীকাল থেকে",
                  "in_days": "{days} দিন পর"}}
WEEKDAY = {Lang.en: ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
                     "Sunday"),
           Lang.bn: ("সোমবারের", "মঙ্গলবারের", "বুধবারের", "বৃহস্পতিবারের", "শুক্রবারের",
                     "শনিবারের", "রবিবারের")}


def bn_digits(text: str) -> str:
    return text.translate(_BN_DIGITS)


def _lakh(n: int) -> str:
    s = str(n)
    head, tail = s[:-3], s[-3:]
    parts: list[str] = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    return ",".join(([head] if head else []) + parts + [tail])


def num(x: float, lang: Lang) -> str:
    """Up to one decimal, no trailing zero: 2.3, 12, 0.5."""
    text = f"{x:.1f}".rstrip("0").rstrip(".")
    return bn_digits(text) if lang is Lang.bn else text


def amount(x: float, lang: Lang) -> str:
    n = int(round(abs(x)))
    return f"BDT {n:,}" if lang is Lang.en else "৳" + bn_digits(_lakh(n))


def template_key(factor: str, facts: Facts, impact_bdt: float) -> str:
    if "event_en" in facts:
        return f"{factor}.event"
    if factor == "rain":
        rain = float(facts.get("rain_mm", 0))
        return "rain.severe" if facts.get("severe") else "rain.wet" if rain >= 1 else "rain.dry"
    if factor in RATIO_FACTORS and "ratio" in facts:
        # Quote the ratio only when it points the same way as the impact; SHAP compares with
        # the training average, so e.g. 0.7x can still push demand up. No contradictory text.
        ratio = float(facts["ratio"])
        agrees = ratio > 1 if impact_bdt > 0 else ratio < 1
        return factor if agrees else f"{factor}.pattern"
    return factor


def _cause(key: str, facts: Facts, demand: str, lang: Lang) -> str:
    """KeyError when the key is unknown or a fact the template needs is missing."""
    values: dict[str, str] = {"demand": DEMAND[lang][demand]}
    for k in ("ratio", "rain_mm", "temp_c"):
        if k in facts:
            values[k] = num(float(facts[k]), lang)
    if "weekday" in facts:
        values["weekday"] = WEEKDAY[lang][int(facts["weekday"])]
    if "event_en" in facts:
        values["event"] = str(facts[f"event_{lang.value}"])
        values["when"] = WHEN[lang][str(facts["when"])].format(
            days=num(float(facts["days"]), lang))
    return CAUSES[key][lang].format_map(values)


def sentence(factor: str, impact_bdt: float, facts: Facts, demand: str, lang: Lang,
             window_h: int) -> str:
    try:
        cause = _cause(template_key(factor, facts, impact_bdt), facts, demand, lang)
    except (KeyError, IndexError, ValueError):
        cause = CAUSES[FALLBACK][lang]
    effect = EFFECT[lang].format(amount=amount(impact_bdt, lang),
                                 more_less=MORE_LESS[lang][impact_bdt > 0],
                                 demand=DEMAND[lang][demand], hours=num(window_h, lang))
    text = f"{cause}: {effect}{END[lang]}"
    return text[0].upper() + text[1:]
