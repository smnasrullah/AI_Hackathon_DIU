# Path to Production

What stays the same, what has to change, and in what order, to take AgentPulse AI from this
synthetic-data hackathon prototype to a pilot on real upay agent data. Written against the current
implementation (docs/ARCHITECTURE.md, docs/METHODS.md); it does not re-derive numbers already
measured there.

## What doesn't change

- The seam between rules, ML and LLM (CLAUDE.md "Hard rules") — it is what makes every later step
  below possible without a rewrite.
- Advisory-only, human-approved money movement (`HoldToApprove`, `audit_log` with a note on every
  decision) — this is a product requirement, not a prototype shortcut, and carries through to
  production unchanged.
- The REST contract (`docs/ARCHITECTURE.md` §2): a real data source is a new adapter behind the
  same endpoints, not a frontend rewrite.

## Stage 1 — Shadow mode on real upay data (no decisions shown)

1. **Data adapter**: replace `backend/ml/data_gen/` as the source of `agents`, `float_snapshots`,
   `transactions` with an ingestion job reading upay's agent ledger, mapped to the same schema
   (docs/ARCHITECTURE.md §3). Everything downstream (features, training, inference, rules) is
   unchanged because it only ever reads those tables.
2. **Governed, anonymised data**: agent identifiers pseudonymised before they reach the ML/LLM
   layers; a data-processing agreement with upay covering retention and purpose limitation.
3. **Retrain on real history**: same LightGBM quantile pipeline, same 14-day holdout discipline
   (docs/METHODS.md §2), but the per-tier/area synthetic demand assumptions
   (docs/SYNTHETIC_ASSUMPTIONS.md) are replaced by whatever the real data shows — expect the model
   to need re-tuning (feature set, quantile loss weighting) once real noise characteristics are
   known.
4. **Re-run every gate blind**: the same-hour-last-week baseline gate (docs/METHODS.md §2), the
   fairness-by-group check (§6), and the anomaly precision/recall check (§3) all need to pass on
   real data before anyone sees a recommendation. A synthetic result does not transfer.
5. **No UI changes yet**: predictions are computed and logged, but recommendations are not acted
   on and are not shown to real agents. This stage exists to validate the pipeline against ground
   truth without any production risk.

## Stage 2 — Limited pilot (one distributor, real recommendations, still advisory)

1. Turn on the agent/distributor UI for one distributor's agents only (the existing role scoping
   in `backend/app/core/deps.py` already enforces this boundary; it just needs a real
   `distributor_id` instead of a seeded one).
2. Keep every human-approval gate exactly as built: swap handshake, recommendation approve/decline,
   anomaly review. This is the point of the pilot — measure whether the *recommendations* are
   good, not whether removing the human step would be faster.
3. Re-measure impact against the pilot distributor's own historical fixed-threshold baseline
   (the same methodology as docs/METHODS.md §3, replacing the synthetic simulator with a real
   before/after comparison: did fewer agents actually turn customers away).
4. LLM layer: switch from replay/template (demo-only) to a live provider for the pilot, keeping
   every guard (numbers guard, injection filter, rate limits, daily cap) unchanged — these were
   built provider-agnostic specifically so production doesn't need new guardrail work
   (docs/LLM_SPEC.md §3-4).
5. Load-test the LLM cost controls under real usage: daily cap, per-user rate limit, cache hit
   rate (visible today at `/admin/llm`) — tune the cap and cache TTL from real traffic, not
   guesses.

## Stage 3 — Operational hardening

- **Secrets**: move `JWT_SECRET` and the LLM API key from `.env` to a managed secret store;
  rotate on a schedule. The >=32-byte JWT secret check and the "no key -> never crash" LLM
  fallback already in the code carry over unchanged.
- **Database**: managed PostgreSQL with backups and point-in-time recovery; the schema
  (docs/ARCHITECTURE.md §3) does not need to change for this.
- **Drift monitoring**: `/admin/models` already has a placeholder for drift
  (docs/METHODS.md, open question 11) — wire it to compare live forecast error against the
  held-out baseline on a rolling window, and alert before silently degrading.
- **Retrain cadence**: decide a schedule (e.g. monthly) and promote only a model that passes the
  same baseline-beating and fairness gates as the current one, versioned exactly as artifacts are
  today (`model_versions`, sha256-checked `manifest.json`).
- **Scale the precompute step**: today it runs once at bootstrap for ~300 agents. At upay's real
  agent count this becomes a scheduled job (queue + workers), still writing to the same
  `forecasts`/`risk_levels`/`recommendations` tables the API already only reads from — the API
  layer does not need to change.
- **Observability**: structured logs already exist per request; add request tracing and
  dashboards for the metrics already logged (`llm_call_log`, `audit_log`, impact cache).

## Stage 4 — Phased rollout

1. Expand distributor by distributor, re-running the Stage 2 impact re-measurement each time —
   regional demand patterns differ (docs/SYNTHETIC_ASSUMPTIONS.md's own Dhaka/Chattogram/Sylhet
   split is a reminder that one national model may need per-region calibration).
2. Re-check fairness by group at each expansion, not once — a region added later could reintroduce
   a gap that passed when the pilot group was narrower.
3. Only after the pilot's own before/after numbers hold up across more than one distributor would
   any discussion of a faster (less human-gated) swap-approval path be appropriate — and even then
   only for the lowest-risk action class (e.g. small same-district swaps already below a
   materiality threshold), decided with upay, not assumed here.

## Known gaps to close before Stage 2 (carried from docs/RESPONSIBLE_AI_CHECKLIST.md)

- Impact backtest currently forecasts from logged (status-quo) history rather than a true
  counterfactual, and does not yet account for an agent's own routine refills when sizing a
  recommendation (docs/METHODS.md §3) — fix before trusting a real-data impact number.
- The AI plan uses more van trips than the fixed-threshold baseline for its service level; a real
  pilot needs an explicit answer on whether upay accepts that trade-off or wants the recommendation
  rule tuned to cap trips (docs/METHODS.md §3, docs/IDEA_CHAIN.md step 6).
- Anomaly detection is validated only against three synthetic fraud patterns; Stage 1 must include
  a real-fraud-case review with upay's fraud/ops team before anomaly flags reach a distributor.

## Regulatory and compliance (flagged, not solved here)

Bangladesh Bank MFS guidelines on agent liquidity management, data residency for financial
transaction data, and upay's own data-sharing agreement all need legal review before Stage 1 reads
real transaction data — out of scope for this document to resolve, but called out so it isn't
missed.
