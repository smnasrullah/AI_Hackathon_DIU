"""Row builders for the role-scoped CSV exports (risk list, swap queue, audit log)."""

from collections.abc import Sequence

from sqlalchemy.orm import Session

from app.core.csv_export import Cell
from app.schemas.risk import AgentRiskPage
from app.schemas.swap import SwapItem
from app.services import admin_audit
from app.services.admin_audit import AuditFilter
from app.services.forecast import _utc

Rows = list[Sequence[Cell]]

RISK_HEADER = ("agent_code", "agent_name", "district", "upazila", "urban_rural", "tier",
               "horizon_h", "level", "probability", "worst_float", "hours_to_stockout",
               "stockout_at", "model_version", "generated_at")
SWAP_HEADER = ("swap_id", "status", "float_type", "amount_bdt", "donor_code", "donor_name",
               "donor_response", "receiver_code", "receiver_name", "receiver_response",
               "distance_km", "van_trip_saved", "score", "decided_at", "note", "model_version",
               "generated_at")
AUDIT_HEADER = ("id", "created_at", "user_email", "user_role", "action", "entity_type",
                "entity_id", "note", "payload")


def risk_rows(page: AgentRiskPage) -> Rows:
    return [(r.code, r.name, r.district, r.upazila, r.urban_rural.value, r.tier, page.horizon_h,
             r.level.value, r.probability, r.worst_float.value, r.hours_to_stockout,
             r.stockout_at, page.model_version, page.generated_at) for r in page.items]


def swap_rows(items: list[SwapItem]) -> Rows:
    return [(s.id, s.status.value, s.float_type.value, s.amount_bdt, s.donor.code, s.donor.name,
             s.donor.response.value if s.donor.response else None, s.receiver.code,
             s.receiver.name, s.receiver.response.value if s.receiver.response else None,
             s.distance_km, s.van_trip_saved, s.score, s.decided_at, s.note, s.model_version,
             s.generated_at) for s in items]


def audit_rows(session: Session, f: AuditFilter | None = None) -> Rows:
    found = session.execute(admin_audit.query(f or AuditFilter())).tuples()
    return [(a.id, _utc(a.created_at), email, role.value if role else None, a.action,
             a.entity_type, a.entity_id, a.note, admin_audit.payload_text(a.payload))
            for a, email, role in found]
