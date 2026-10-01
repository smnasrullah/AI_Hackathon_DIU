# Synthetic Data Assumptions (AgentPulse AI)

All data is synthetic. Every pattern below is an assumption chosen to look plausible for
Bangladesh MFS agents. None of it is measured upay behaviour. Code: `backend/ml/data_gen/`.
Constants live in the module named in each section, so a change there must be mirrored here.

## 1. Scope and reproducibility

| Item | Value | Code |
|---|---|---|
| Seed | `SEED` env (default 42). One `SeedSequence` split into 5 streams: world, weather, demand, anomalies, simulation | `dataset.py` |
| Agents | 300: DST-DHK 110, DST-CTG 100, DST-SYL 90 | `agents.py`, `geography.py` |
| History | 120 days, hourly: 2026-01-05 00:00 to 2026-05-04 23:00 Asia/Dhaka (UTC+6, no DST); stored as UTC | `timeline.py` |
| Holdout | Last 14 days (from 2026-04-21 00:00), `is_holdout = true` on snapshots and transactions; never trained on | `timeline.py` |
| SIM_NOW | 2026-04-30 20:00 (Thursday), inside the holdout; the 72 h after it are in the data as ground truth | `timeline.py`, `system_meta.sim_now` |
| Data version | `DATA_VERSION` in `app/core/config.py`; bootstrap regenerates when it changes | `load.py` |
| Ground-truth labels | `system_meta.synthetic_labels` = anomalous agents (kind, window) + demo summary | `load.py` |

Same seed gives the same rows on every PC (pure numpy, no clock or threads involved).

## 2. Geography

| Distributor | Area mix | Upazila clusters (approximate real coordinates) |
|---|---|---|
| DST-DHK Dhaka North | ~70% urban, ~30% peri-urban | Dhaka: Mirpur, Uttara, Mohammadpur, Badda, Jatrabari. Gazipur: Tongi, Gazipur Sadar, Kaliakair |
| DST-CTG Chattogram South | ~20% urban, ~55% peri-urban, ~25% rural | Chattogram: Panchlaish, Double Mooring, Patiya, Boalkhali, Anwara, Banshkhali, Satkania |
| DST-SYL Sylhet Haor | ~10% peri-urban, ~90% rural | Sylhet: Sylhet Sadar, Companiganj, Gowainghat. Sunamganj: Sunamganj Sadar, Tahirpur, Jamalganj, Derai |

- Agents sit at the cluster centre plus Gaussian noise (1 to 3 km sd; rural spread is wider).
- Tier mix (tier 1 / 2 / 3): urban 30/45/25, peri-urban 15/45/40, rural 5/35/60.
- Capacity per float: tier 1 BDT 400k, tier 2 200k, tier 3 80k, each x U(0.85, 1.15). E-money capacity is cash capacity x U(0.9, 1.1).
- AGT-0001..0003 are exactly the reference-seed agents (`app/services/seed.py`).

## 3. Demand model (`demand.py`, `calendar_effects.py`, `weather.py`)

Expected hourly BDT = daily base x hour share x weekday x calendar events x hat-bazar x rain x trend.
Realised demand: transaction count ~ Poisson(expected / ticket); amount = count x ticket x
log-normal noise; plus an AR(1) daily level noise per agent (phi 0.6, sd 0.12).

| Factor | Assumption |
|---|---|
| Daily cash-out base | Tier 1: urban 260k, peri 200k, rural 150k. Tier 2: 130k / 100k / 70k. Tier 3: 50k / 40k / 30k. Per-agent scale log-normal(0, 0.3), clipped 0.5 to 2 |
| Cash-in vs cash-out | Cash-in = cash-out x 1.10 urban, 0.85 peri, 0.55 rural. Cities send money home (net cash-in, e-money drains); villages receive it (net cash-out, cash drains) |
| Ticket size | Cash-out 1,800 / 1,500 / 1,200; cash-in 2,200 / 1,800 / 1,500 (urban / peri / rural) |
| Hour of day | Closed roughly 22:00 to 07:00. Urban peaks 18:00 to 20:00 (after work); rural peaks 10:00 to 12:00 (bazaar hours) |
| Weekday | Friday weekend x0.80 urban / 0.85 peri / 0.90 rural; Saturday x0.90 / 0.94 / 0.97; Thursday x1.12 / 1.08 / 1.05, with extra cash-in on Thursday (send-home evening). Jumu'ah: Friday 12:00 to 14:00 x0.35 |
| Salary days | Credited on the 1st. Cash-out day 1/2/3: urban x2.3/1.7/1.3, peri x2.0/1.6/1.25, rural x1.5/1.7/1.4 (remittances arrive a day later). Cash-in rises less (x1.4 urban on day 1) |
| Factory wages | Days 7 to 9 in Dhaka, Gazipur, Chattogram (urban + peri agents): cash-out x1.5, cash-in x1.3 |
| Eid-ul-Fitr | Assumed 2026-03-21. Pre-Eid rush days -7..-1 is cash-out heavy: urban up to x2.5, rural up to x3.2 (cash-in only up to x1.6 / x1.2). Eid day: city shuts (x0.35), villages stay busy (x1.0); recovery by day +4. Peri-urban = mean of urban and rural |
| Public holidays | 21 Feb, 26 Mar, 14 Apr (Pohela Boishakh): volume x0.75 urban, 0.85 peri, 0.9 rural |
| Hat-bazar | Weekly, one weekday per district: Gazipur Tue, Chattogram Wed, Sylhet Thu, Sunamganj Sat (Dhaka city has none). 09:00 to 17:00, peri / rural agents only: cash-out x1.4 / x2.0, cash-in x1.3 / x1.7; eve of hat from 16:00 cash-out x1.15. Each DHK, CTG, SYL territory has at least one hat district |
| Rain | Rainy-day chance per month Jan 3%, Feb 5%, Mar 10%, Apr 25%, May 40% (pre-monsoon Kalbaishakhi), x1.15 Chattogram, x1.5 Sylhet, x1.6 Sunamganj. Amount ~ gamma. Demand drops linearly up to 80 mm: -25% urban, -35% peri, -45% rural. Severe = 50 mm or more (also an `events` row of type weather) |
| Trend | +0.08% per day (about +10% over the period) |

`events.intensity` is the event's peak demand multiplier (2.3 = cash-out x2.3; 0.7 = demand -30%).

## 4. Floats, refills, stockouts (`simulate.py`)

- Cash-in: cash +, e-money -. Cash-out: cash -, e-money +. Between refills, cash + e-money stays constant.
- Snapshot at `ts` = balance at the top of that hour, after any refill at that hour. Transactions at `ts` cover `[ts, ts + 1h)`. One transactions row = all transactions of one type in that hour (`txn_count`).
- Scheduled refills reset both floats to targets. Banks are shut Friday and Saturday:
  - urban: bank run Sun to Thu 10:00; targets cash 50% / e-money 65% of capacity;
  - peri-urban: Sun, Tue, Thu 11:00; 60% / 50%;
  - rural: distributor van twice a week (Sun+Wed, Mon+Thu or Sat+Tue) 11:00; 75% / 40%.
  - Random agents get +/-5 pp jitter on targets. No refills from Eid -2 to Eid +3, or on public holidays. Cash target x1.3 in the pre-Eid stock-up (days -7..-3), capped at 95% of capacity.
- Ad-hoc top-up: when a float is below 8% of capacity, 08:00 to 20:00, 12% chance per hour (the agent buys float from a bank, another agent or the distributor).
- Demand the float cannot cover is turned away. `transactions` record only what was served, so a model trained on them learns censored demand during stockouts (the generator keeps `unmet_*` in memory for evaluation).
- Result at seed 42: about 3% of business hours have turned-away demand. Rural agents are worst (cash), urban agents mostly run short of e-money.

## 5. Anomalous agents (`anomalies.py`)

About 3% of agents (9 of 300), labelled in `system_meta.synthetic_labels.anomalies`. Roughly half the
windows fall in training and half in the holdout, for precision/recall checks.

| Kind | Pattern | Window |
|---|---|---|
| night_structuring | Many cash-in / cash-out transactions at 23:00 to 04:00 (shop normally closed), each just under BDT 5,000 | 5 to 7 days |
| volume_burst | Business-hour volume and count x3.5 to x5.5 | 4 to 6 days |
| circular_flow | Mirrored cash-in and cash-out of identical BDT 9,990 tickets, ~15 extra each per hour (round-tripping) | 7 to 10 days |

An anomaly flag is a lead for human review, not proof of fraud.

## 6. Demo scenario (`demo_spec.py`, `demo_scenario.py`)

Built into every generation run. It can be re-applied to the database alone with `python -m ml.data_gen.demo_scenario`.

| Role | Agent | Guarantee |
|---|---|---|
| Stockout | AGT-0001 Mirpur 10 (DST-DHK, urban tier 1; cash-out heavy garment-worker area) | Tomorrow (2026-05-01) is salary day and a Friday, so there is no bank refill. From its 10:00 refill on 30 Apr, it follows noise-free expected demand. The refill amount is solved backwards so cash crosses zero at 15:40 (linear within the hour). At SIM_NOW it still holds about 36% of capacity, so a simple threshold rule stays silent |
| Donor | AGT-0004 Mirpur 11 Bazar Telecom, about 1 km away, same distributor | Cash-in heavy market location. Holds at least BDT 150k of cash at every hour of the next 24 h, more than the receiver's shortfall for the rest of the day |
| Anomaly | AGT-0005 Krishi Market Varieties (Mohammadpur, DST-DHK) | night_structuring from 2026-04-24 00:00 to SIM_NOW |

Dhaka is kept dry on 30 Apr and 1 May, so salary day is the clean "why". If a parameter change breaks
any guarantee, generation fails loudly (`RuntimeError`) and does not ship a broken demo.

## 7. Known simplifications

- Eid date, salary timing, multipliers and coordinates are assumptions, not calendars or measurements.
- No Eid-ul-Adha (outside the window), no monsoon floods, no network outages, no agent churn.
- Physical cash is not capped at capacity. Total float is bounded by refills (cash + e-money).
- Weather is independent per district (no spatial correlation).
