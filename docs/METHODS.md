# Methods (AgentPulse AI)

How each number on screen is produced, and which code produces it. Paths and tables refer to docs/ARCHITECTURE.md. Items not yet decided are listed under "Open questions"; this file does not guess them.
Principle: rules and ML compute every number; the LLM only words them; a human approves anything that moves money.

## 1. Synthetic data generation

| Item | Method | Implemented in |
|---|---|---|
| Source | Fully synthetic, no real customer or agent data | `backend/ml/data_gen/` |
| Seed | One fixed random seed for all generators; stored in `system_meta.seed` | `backend/ml/data_gen/`, `system_meta` |
| Entities | Distributors (district, hub lat/lon); agents (district, upazila, `area_type` urban/peri/rural, lat/lon, cash + e-money capacity, opened_on); hourly flows per agent; events; daily weather; demo users; Playbook docs | tables `distributors`, `agents`, `agent_hourly`, `events`, `weather_daily`, `users`, `knowledge_docs` |
| Hourly flows | Per agent and hour: cash_in/out, emoney_in/out, txn_count, resulting cash/e-money balance | `agent_hourly` |
| Event effects | Event types salary, eid, hat_bazar, weather, holiday with `intensity` and optional district scope; they shift hourly flows | `events`, `weather_daily` |
| Distributions + assumptions | Documented in docs/SYNTHETIC_ASSUMPTIONS.md (single source; not repeated here) | docs/SYNTHETIC_ASSUMPTIONS.md |
| Holdout | Last 14 days flagged `is_holdout = true`; never used for training | `agent_hourly.is_holdout` |
| Versioning | `system_meta.data_version` compared to code version; regenerate only on mismatch (idempotent) | `backend/bootstrap.py` step 5 |
| SIM_NOW | Fixed simulated "now" stored in `system_meta.sim_now`; all precompute (forecast, risk, recommendations, swaps, anomalies, impact) runs at SIM_NOW so the demo is identical on every PC | `backend/bootstrap.py` step 7, `system_meta` |

## 2. Forecasting (F1, F2, F6)

| Item | Method | Implemented in |
|---|---|---|
| Model | LightGBM quantile regression, one model per quantile: q10 / q50 / q90 (low / expected / high) | `backend/ml/training/` |
| Targets | Hourly demand per float (cash, e-money), horizon up to 72 h | `forecasts` (q_low, q_mid, q_high, horizon_h) |
| Features | Lags, calendar, event, weather features | `backend/ml/features/` |
| Split | Train on all history before the holdout; clean held-out last 14 days for backtest only | `backend/ml/training/` (backtest) |
| Metrics | Pinball loss per quantile; MAE vs same-hour-last-week naive baseline; stockout recall on holdout | `model_runs.metrics`, `/admin/models` |
| Time-to-stockout | Project current balance forward with quantile forecasts; first hour the float runs out = `stockout_at`, with a confidence value | `backend/ml/inference/`, `risk_snapshots.stockout_at`, `.confidence` |
| Why LightGBM quantile | Fast on CPU, handles mixed tabular features, native quantile loss gives an uncertainty band without extra models, works with SHAP | - |
| Explanation (F7) | SHAP on the forecast -> top factors list -> bn/en template sentence (LLM may reword, see §4) | `backend/ml/explain/`, `risk_snapshots.shap_top`, `GET /agents/{id}/explanation` |
| What-if (F8) | Re-run stockout projection with `{float_type, delta_amount, at}` added to the balance; no retraining | `backend/ml/inference/`, `POST /agents/{id}/whatif` |
| Output contract | Every response carries `model_version` + `generated_at` | `backend/app/schemas/` |

## 3. Risk scoring and actions (F3, F4, F5, F9, F11)

| Item | Method | Implemented in |
|---|---|---|
| Risk inputs | Per agent and float: `stockout_at`, confidence, current balance, capacity | `backend/ml/inference/` -> `backend/app/rules/` |
| Risk level | Rules map stockout time vs horizon (6 / 24 / 72 h) and confidence to green / amber / red | `backend/app/rules/` (thresholds, risk levels), `risk_snapshots.level` |
| Display | Always colour + icon + word: Safe / Watch / Act now (নিরাপদ / নজরে রাখুন / এখনই করুন) | frontend per DESIGN.md |
| Rebalance (F4) | Rules turn risk + forecast into `kind` add_cash / add_emoney / swap / van, `amount_bdt`, `deadline_at`, `rationale` | `backend/app/rules/`, `backend/app/services/`, `recommendations` |
| Swap matching (F5) | Rules filter feasible donor/receiver pairs (swap constraints), then a scipy optimiser picks pairs on ML forecasts; stores distance_km, van_trip_saved, score | `backend/app/rules/`, `backend/ml/inference/` (scipy), `swaps`, `POST /swaps/match` |
| Agent risk (F9) | Isolation Forest over per-agent window features; score + features stored as evidence | `backend/ml/training/`, `anomalies` |
| Impact (F11) | On the 14-day holdout, compare model-driven actions vs fixed-threshold alert baseline: stockout hours, BDT value saved, van trips; `van_cost` is a parameter | `backend/app/rules/` (baseline alerts), `backend/app/services/`, `impact_results`, `GET /impact` |

| Who | Sees | Can do | Logged in |
|---|---|---|---|
| Agent | Own risk, countdown, recommendation, swap status | Request distributor action (no money moves) | `recommendations.status` |
| Distributor | Own agents' risk map, swap queue, anomalies | Approve / reject swap with note; review anomaly confirmed / dismissed with note | `audit_log` (user id + note), `swaps.decided_by`, `anomalies.reviewed_by` |
| Admin | All | Users, models, LLM logs, audit | `audit_log` |

## 4. LLM usage (language only; matches docs/LLM_SPEC.md)

| Feature | Intent (`llm_call_log.intent`) | Deterministic part | LLM-generated part | Endpoint |
|---|---|---|---|---|
| Agent Copilot (chat + voice) + Playbook RAG | copilot | Evidence pack, allow-listed tools (`get_whatif`, `get_swap_status`, `get_forecast_window`), TF-IDF top-3 retrieval | Answer wording, cites doc title | `POST /copilot/chat` |
| "Why?" wording (F7) | narrate | SHAP factors + template sentence | Natural bn/en rewrite | `POST /explanations/narrate` |
| Agent morning summary | agent_briefing | Evidence pack | Summary text | `GET /agents/{id}/briefing` |
| Distributor daily briefing | distributor_briefing | Evidence pack (own agents only) | Briefing text | `GET /distributor/briefing` |
| Anomaly investigation | anomaly_narrative | Isolation Forest score + features | Narrative | `GET /anomalies/{id}/narrative` |

| Mechanism | Method | Implemented in |
|---|---|---|
| Grounding | LLM sees only the role-scoped evidence pack + user question + retrieved passages | `backend/app/services/` (evidence pack), `backend/app/llm/rag/` |
| Providers | `LLM_PROVIDER=auto\|anthropic\|openai_compatible\|replay\|template`; auto: key -> live, no key -> replay, replay miss -> template | `backend/app/llm/providers/` |
| Guards | Injection filter (delimiters, 500 chars, out-of-scope refusal); numbers guard (every number/time must exist in pack); Pydantic output schema `{text, lang, cited_factors[]}`; max_tokens copilot 350 / narrate 150 / briefing 400 | `backend/app/llm/guards/` |
| Fallback | Timeout 8 s, 1 retry, then fall back; any guard failure -> template. UI shows template first, swaps in LLM text when ready | `backend/app/llm/` |
| Cache | Key = sha256(evidence pack + intent + lang); stored with expiry; replay answers in a pre-recorded file | `llm_cache`, `backend/app/llm/cache/demo_replay.json` |
| Logging | One row per call: user, intent, provider, model, lang, evidence_hash, tokens, latency_ms, generated_by, guard_result, error | `llm_call_log`, `GET /admin/llm/logs` |
| Labelling | Every response has `generated_by: llm\|template\|replay`; UI chip "AI-generated wording" kept apart from "Model prediction" | `backend/app/schemas/`, WhyStones |
| Never | Decide risk, approve swaps, set amounts, compute numbers, see other agents' data | enforced by guards + role scoping in `backend/app/core/` deps |

## 5. Reproducibility

| Item | Method | Implemented in |
|---|---|---|
| Seeds | Fixed seed for data generation and model training; recorded in `system_meta.seed` | `backend/ml/data_gen/`, `backend/ml/training/` |
| Artifacts | Trained `*.joblib` + `manifest.json` (model_version, sha256) committed to git; fresh PC needs no training | `backend/ml/artifacts/` |
| Startup check | Verify manifest sha256 + model_version, register in `model_runs` (artifact_sha256, metrics, is_active) | `backend/bootstrap.py` step 6 |
| Retrain | Only if artifacts missing / hash mismatch: retrain from seed (slow path, logged); fail if still missing | `backend/bootstrap.py` step 6 |
| Fixed demo state | Precompute at fixed `SIM_NOW`; replay answers keyed by evidence-pack hash | `backend/bootstrap.py` step 7, `demo_replay.json` |
| Readiness | `GET /api/v1/system/status` reports db, migration head, seed/data_version, artifacts ok, model_version, llm mode, `ready` | `backend/app/api/v1/` (system) |

Verify on a fresh PC:
1. `run.bat --reset` (or `run.sh --reset`), wait for `ready: true`.
2. Compare `/system/status` seed, data_version, model_version with the values in `backend/ml/artifacts/manifest.json`.
3. `/admin/models`: holdout metrics equal those in the manifest / committed `model_runs` metrics.
4. With no LLM key: `/llm/status` shows replay; `/admin/llm/logs` shows `generated_by=replay` for the demo scenario.

## 6. Limitations and responsible AI (F12)

Shown on `/responsible-ai` (`GET /api/v1/responsible-ai`: model cards, metrics, fairness by group, limitations, data notice).

| Limitation / safeguard | Note |
|---|---|
| Synthetic data only | Patterns are assumptions (SYNTHETIC_ASSUMPTIONS.md), not measured upay behaviour; metrics show method soundness, not real-world accuracy |
| Advisory only | No endpoint moves money; swaps and anomaly outcomes need a distributor decision with note in `audit_log` |
| Uncertainty | Forecasts are a q10–q90 band; stockout time always shown with confidence |
| Fairness | Metrics reported by group on the responsible-AI panel |
| Anomaly ≠ fraud | Isolation Forest flags are leads for human review, not accusations |
| LLM wording | May be imperfect; numbers guard + template fallback; always labelled |
| Privacy | Role-scoped evidence; no cross-agent data in prompts; LLM key only in backend env |
| Footer notices | "Advisory only — a human approves" and "Synthetic data only" on relevant pages |

## Open questions

1. Seed value, number of distributors/agents, districts covered, length of generated history.
2. Exact value of SIM_NOW and whether it falls inside the 14-day holdout.
3. Forecast target: hourly net flow vs in/out separately vs balance; multi-horizon strategy (direct per horizon vs recursive).
4. How stockout `confidence` is computed from the quantiles (e.g. which quantile crosses zero, interpolation).
5. Risk thresholds: exact stockout-hours / confidence cut-offs for green / amber / red at 6 / 24 / 72 h.
6. Rebalance amount rule (target buffer, capacity cap) and when `van` is chosen over `swap`.
7. Swap optimiser: which scipy routine (e.g. assignment vs linear programme), objective weights in `score`, max distance.
8. Isolation Forest: window length, feature list, contamination; whether synthetic anomalies are injected and labelled (needed for anomaly precision/recall in IDEA_CHAIN).
9. Fixed-threshold baseline parameters for F11, and impact targets ("set after P11 backtest").
10. Fairness groups (area_type? district?) and the fairness metric.
11. Drift metric shown on `/admin/models`.
12. Is LightGBM retraining bit-identical across CPUs (deterministic flags, thread count)? If not, retrained artifacts will not match committed sha256.
13. `llm_cache` TTL; whether a live-provider failure falls back to replay before template.
14. Whether the evidence pack excludes volatile fields (e.g. `generated_at`) so replay hashes match on every PC.
