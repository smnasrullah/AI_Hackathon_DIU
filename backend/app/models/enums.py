"""Python enums mirrored as PostgreSQL enum types (names in PG_ENUM_NAMES)."""

from enum import StrEnum


class UserRole(StrEnum):
    agent = "agent"
    distributor = "distributor"
    admin = "admin"


class UrbanRural(StrEnum):
    urban = "urban"
    peri_urban = "peri_urban"
    rural = "rural"


class FloatType(StrEnum):
    cash = "cash"
    emoney = "emoney"


class TxnType(StrEnum):
    cash_in = "cash_in"
    cash_out = "cash_out"


class EventType(StrEnum):
    salary = "salary"
    eid = "eid"
    hat_bazar = "hat_bazar"
    weather = "weather"
    holiday = "holiday"


class RiskLevelCode(StrEnum):
    green = "green"
    yellow = "yellow"
    red = "red"


class RecommendationKind(StrEnum):
    add_cash = "add_cash"
    add_emoney = "add_emoney"
    swap = "swap"
    van = "van"


class RecommendationStatus(StrEnum):
    open = "open"
    requested = "requested"
    done = "done"
    expired = "expired"


class SwapStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class AnomalyStatus(StrEnum):
    open = "open"
    confirmed = "confirmed"
    dismissed = "dismissed"


class ImpactScenario(StrEnum):
    model = "model"
    baseline = "baseline"


class LlmIntent(StrEnum):
    copilot = "copilot"
    narrate = "narrate"
    agent_briefing = "agent_briefing"
    distributor_briefing = "distributor_briefing"
    anomaly_narrative = "anomaly_narrative"


class GeneratedBy(StrEnum):
    llm = "llm"
    template = "template"
    replay = "replay"


class GuardResult(StrEnum):
    passed = "pass"
    numbers_fail = "numbers_fail"
    injection = "injection"
    schema_fail = "schema_fail"
    timeout = "timeout"
    error = "error"


class Lang(StrEnum):
    bn = "bn"
    en = "en"


class Theme(StrEnum):
    light = "light"
    dark = "dark"
    system = "system"


class ChatRole(StrEnum):
    user = "user"
    assistant = "assistant"


PG_ENUM_NAMES: dict[type[StrEnum], str] = {
    UserRole: "user_role",
    UrbanRural: "urban_rural",
    FloatType: "float_type",
    TxnType: "txn_type",
    EventType: "event_type",
    RiskLevelCode: "risk_level",
    RecommendationKind: "recommendation_kind",
    RecommendationStatus: "recommendation_status",
    SwapStatus: "swap_status",
    AnomalyStatus: "anomaly_status",
    ImpactScenario: "impact_scenario",
    LlmIntent: "llm_intent",
    GeneratedBy: "generated_by",
    GuardResult: "guard_result",
    Lang: "lang_code",
    ChatRole: "chat_role",
    Theme: "theme_pref",
}
