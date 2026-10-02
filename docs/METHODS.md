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
| Model | LightGBM quantile regression, one booster per target and quantile: q10 / q50 / q90 (low / expected / high) = 6 boosters; 300 rounds, lr 0.05, 31 leaves, min 100 rows/leaf, `deterministic=true`, fixed seed | `backend/ml/training/train.py` |
| Targets | Hourly **cash_out** and **cash_in** demand per agent (observed served BDT from `transactions`), trained separately. Cash float is drawn by cash_out, e-money float by cash_in; the API returns them as `float_type` cash / emoney | `forecasts` (q_low, q_mid, q_high, horizon_h) |
| Multi-horizon | Direct: one row per (agent, origin t0, horizon h = 1..72); target hour t = t0 + h - 1; `horizon_h` is a feature. Only demand before t0 is read | `backend/ml/features/build.py` |
| Features | Target-hour calendar: hour, day of week, day of month. Events at the target hour for the agent's district (from `events`): salary (1st-3rd), factory wage, Eid day number, holiday, hat-bazar, severe weather. Weather of the target day: rain_mm, temp_c. Agent: tier, area type, district, cash/e-money capacity. History (divided by `scale`): most recent observed same hour (lag 24 / 48 / 72 h depending on h), lag 168 h, lag 336 h, same-hour mean of last 4 weeks, rolling 24 h mean, last hour; plus log(scale) | `backend/ml/features/` |
| Scaling | `scale` = agent's trailing 168 h mean hourly demand at t0. The model predicts demand / scale; inference multiplies back (quantiles are scale-equivariant), so one model serves tier 1 and tier 3 agents | `backend/ml/features/build.py` |
| Quantile order | Predictions clipped at 0 and sorted per row so low <= expected <= high (no quantile crossing) | `backend/ml/inference/forecaster.py` |
| Split | Training rows: origins from day 28 (4 weeks of lag history), 2 random origin hours per agent-day, 12 random horizons each, kept only if the target hour is before the holdout (2026-04-21) → 550,956 rows. The last 14 days are never trained on | `backend/ml/training/train.py` (`sample_rows`) |
| Backtest | Origins every holdout day at 08:00 and 20:00, all 300 agents, every horizon 1..72 inside the holdout (536,400 rows per target). Baseline = same hour last week, y[t-168], used as the point forecast for every quantile | `backend/ml/training/evaluate.py` |
| Metrics | MAE (q50) and pinball loss per quantile vs baseline; q10-q90 coverage; MAE by horizon bucket. Stored in `manifest.json` and `model_versions.metrics` | `backend/ml/artifacts/manifest.json`, `model_versions` |
| Serving | Inference is separate from training: bootstrap verifies artifact sha256, registers the active `model_versions` row, then caches forecasts for every agent at SIM_NOW (300 agents x 2 floats x 72 h = 43,200 rows). The API only reads this cache | `backend/ml/inference/`, `backend/app/services/forecast.py`, `GET /agents/{id}/forecast?horizon_hours=24` |

Held-out results (model `lgbq-1.0.0-56571e7f`, seed 42, data_version 1.0.0; BDT per agent-hour, all 24 hours incl. closed night hours):

| Target | Mean demand | MAE model | MAE baseline | MAE skill | Pinball q10 / q50 / q90 (mean) model | Pinball q10 / q50 / q90 (mean) baseline | q10-q90 coverage |
|---|---|---|---|---|---|---|---|
| cash_out | 5,052 | 2,211 | 3,056 | 27.6% | 404 / 1,106 / 616 (708) | 1,234 / 1,528 / 1,822 (1,528) | 87.4% |
| cash_in | 4,517 | 2,163 | 2,932 | 26.2% | 372 / 1,081 / 607 (687) | 1,303 / 1,466 / 1,630 (1,466) | 89.1% |

MAE by horizon (model / baseline): cash_out 1-6 h 2,395 / 3,326, 7-24 h 2,078 / 2,921, 25-72 h 2,240 / 3,073; cash_in 1-6 h 2,344 / 3,200, 7-24 h 2,044 / 2,811, 25-72 h 2,186 / 2,944. The band is slightly wider than nominal (coverage 87-89% vs 80%), i.e. conservative. Hour-level demand is noisy by construction (Poisson ticket counts, see SYNTHETIC_ASSUMPTIONS.md), so the MAE floor is high relative to the mean.
Limitations: the target is *served* demand, so hours where a float already hit zero are censored (under-stated); the target-day weather is taken as known (perfect weather forecast).
| Time-to-stockout (F2) | Per agent and float, from the balance at SIM_NOW (snapshot = top of the hour) and the cached q10/q50/q90 paths, assuming **no refill**: balance(h) = b0 + Σ(inflow − drain). Cash float: drain cash_out, inflow cash_in; e-money float the reverse. Monte Carlo, 2,000 paths, seeded per (seed, agent, float): each hour's demand is drawn from a two-piece linear quantile function through q10/q50/q90 (linear tails, clipped at 0); hours are tied by a Gaussian copula with a shared path factor (ρ = 0.6), drain and inflow independent. First passage to the floor (0 BDT) is interpolated inside the hour | `backend/ml/inference/stockout.py`, `backend/app/services/risk.py` |
| Stockout probability | P(stockout within 6 / 24 / 72 h) = share of paths whose first passage is ≤ h | `risk_levels.probability` |
| Most likely stockout time | Median first-passage time (earliest t with P(T ≤ t) ≥ 0.5). Null when no stockout within 72 h is the more likely outcome | `stockout_predictions.stockout_at`, `.hours_to_stockout` |
| Stockout confidence | With a time: share of paths that run out within ±max(1 h, 25%) of it. Without: P(no stockout within 72 h). Flat (zero-width) forecasts give exactly 1 | `stockout_predictions.confidence` |
| Stockout limitations | Ignores scheduled/ad-hoc refills (it answers "if nothing is done"), the coupling of the two floats inside one transaction, and correlation between cash_in and cash_out; ρ is an assumption, not fitted | - |
| Why LightGBM quantile | Fast on CPU, handles mixed tabular features, native quantile loss gives an uncertainty band without extra models, works with SHAP | - |
| Explanation (F7) | SHAP on the forecast -> top factors list -> bn/en template sentence (LLM may reword, see §4) | `backend/ml/explain/`, `risk_snapshots.shap_top`, `GET /agents/{id}/explanation` |
| What-if (F8) | Re-run stockout projection with `{float_type, delta_amount, at}` added to the balance; no retraining | `backend/ml/inference/`, `POST /agents/{id}/whatif` |
| Output contract | Every response carries `model_version` + `generated_at` | `backend/app/schemas/` |

## 3. Risk scoring and actions (F3, F4, F5, F9, F11)

| Item | Method | Implemented in |
|---|---|---|
| Risk inputs | Per agent and float: `stockout_at`, confidence, current balance, capacity | `backend/ml/inference/` -> `backend/app/rules/` |
| Risk level | Per float and horizon: P(stockout within h) ≥ red cut-off → red, ≥ amber cut-off → amber, else green. Cut-offs (amber / red): 6 h 0.10 / 0.30, 24 h 0.20 / 0.50, 72 h 0.35 / 0.70 (near horizons act on lower odds). Overridable via `RISK_THRESHOLDS` env (JSON `{"6": [amber, red]}`); a change re-runs the precompute. Agent level = worst float (per horizon). Headline level (float and agent) = the 24 h level: the 72 h view assumes no refill at all and would mark most agents amber (seed 42: 6 h 277/11/12, 24 h 136/128/36, 72 h 18/240/42 green/amber/red of 300), so it is shown per horizon, not headlined. Level confidence = max(p, 1 − p) | `backend/app/rules/risk_rules.py`, `risk_levels.level`, `.probability`, `.confidence` |
| Serving | Precomputed at bootstrap right after the forecast cache, for every agent at SIM_NOW (skipped when forecast cache, rules, method and seed are unchanged); API reads only the cache | `backend/app/services/risk.py`, `risk_read.py`; `GET /agents/{id}/summary`, `/stockout`, `/risk`, `GET /agents/risk?horizon&level&sort&page&page_size&q` |
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
| Startup check | Verify manifest sha256 + feature list, register in `model_versions` (artifact_sha256, metrics, is_active), then precompute the forecast cache (skipped when model, SIM_NOW and data are unchanged) | `backend/bootstrap.py` (`needs-train`, `precompute`) |
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
3. Decided (§2): cash_out and cash_in modelled separately; direct multi-horizon with horizon as a feature.
4. Decided (§2): stockout probability, time and confidence from a Monte Carlo over the quantile paths.
5. Decided (§3): probability cut-offs per horizon in `backend/app/rules/risk_rules.py`.
6. Rebalance amount rule (target buffer, capacity cap) and when `van` is chosen over `swap`.
7. Swap optimiser: which scipy routine (e.g. assignment vs linear programme), objective weights in `score`, max distance.
8. Isolation Forest: window length, feature list, contamination; whether synthetic anomalies are injected and labelled (needed for anomaly precision/recall in IDEA_CHAIN).
9. Fixed-threshold baseline parameters for F11, and impact targets ("set after P11 backtest").
10. Fairness groups (area_type? district?) and the fairness metric.
11. Drift metric shown on `/admin/models`.
12. Partly decided: training uses `deterministic=true`, `force_row_wise=true`, 4 threads and a fixed seed, but bit-identity across CPUs is not guaranteed. The committed artifacts are therefore canonical; bootstrap retrains only if they are missing or fail the sha256 / feature-list check, and a retrain gets a new `model_version`.
13. `llm_cache` TTL; whether a live-provider failure falls back to replay before template.
14. Whether the evidence pack excludes volatile fields (e.g. `generated_at`) so replay hashes match on every PC.
