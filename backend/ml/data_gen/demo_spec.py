"""Pinned demo cast. demo_scenario.py enforces the story; this module only holds constants."""

from datetime import datetime

from ml.data_gen.timeline import BDT, SIM_NOW

STOCKOUT_AGENT = "AGT-0001"  # Mirpur 10, logs in as agent.mirpur@agentpulse.demo
DONOR_AGENT = "AGT-0004"  # ~1 km away, same distributor, cash surplus
ANOMALY_AGENT = "AGT-0005"  # same distributor, night structuring before SIM_NOW

# Tomorrow (relative to SIM_NOW 2026-04-30 20:00) is the 1st: salary day, a Friday (banks shut,
# no scheduled refill). Cash crosses zero at 15:40 on the expected-demand path.
STOCKOUT_AT = datetime(2026, 5, 1, 15, 40, tzinfo=BDT)
STOCKOUT_REFILL_AT = datetime(2026, 4, 30, 10, tzinfo=BDT)  # last scheduled refill before
ANOMALY_WINDOW = (datetime(2026, 4, 24, 0, tzinfo=BDT), SIM_NOW)

# Donor must hold at least this much cash at every hour of the next 24 h.
DONOR_MIN_CASH = 150_000
# Dhaka is kept dry on the demo days so the salary effect is the clean "why".
DRY_DAYS: tuple[tuple[str, str], ...] = (("Dhaka", "2026-04-30"), ("Dhaka", "2026-05-01"))
