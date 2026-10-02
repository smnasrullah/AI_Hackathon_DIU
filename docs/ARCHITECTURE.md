# Architecture (AgentPulse AI)

Modular monolith: React SPA -> FastAPI `/api/v1` -> PostgreSQL 16. ML artifacts are committed joblib files. LLM provider is optional (`auto` -> replay -> template).
Role codes: **A** agent, **D** distributor, **Ad** admin, **P** public. Scoping: A sees own agent_id only, D sees own agents only, Ad sees all.

## 1. Sitemap

| Route | Role | Page | Main components / features |
|---|---|---|---|
| `/login` | P | Sign in + demo-account chips | - |
| `/agent` | A | Home (story view) | PulseLine, CountdownCard, 2 VesselGauge, Why, primary action (F1-F4, F7) |
| `/agent/forecast` | A | 72h forecast + what-if | RunwayStrip, event ribbons, what-if slider (F1, F2, F6, F8) |
| `/agent/swap` | A | Swap offers + recommendation status | SwapFlow card (read-only, D approves) (F4, F5) |
| `/agent/copilot` | A | Ask (chat + voice) | CopilotSheet, mini-card answers, AI-generated chip (LLM) |
| `/agent/settings` | A | Language, digits, theme | - |
| `/distributor` | D | Control room map | Filters/list, map (risk dots, swap droplets), inspector, RunwayStrip, Ctrl+K (F3, F10) |
| `/distributor/agents/:id` | D | Agent detail | Forecast, risk, Why, recommendation (F1-F4, F7) |
| `/distributor/swaps` | D | Swap queue | Handshake approve/reject + note (F5) |
| `/distributor/anomalies` | D | Anomaly list | Isolation Forest scores (F9) |
| `/distributor/anomalies/:id` | D | Investigation | Evidence + LLM narrative, review + note (F9, LLM) |
| `/distributor/impact` | D | Impact calculator | Model vs rule baseline (F11) |
| `/distributor/briefing` | D | Daily briefing | LLM briefing grounded in evidence pack (LLM) |
| `/admin` | Ad | System status | `/system/status`, LLM mode, artifacts |
| `/admin/users` | Ad | Users + roles | - |
| `/admin/models` | Ad | Model registry + metrics | Pinball/MAE, stockout recall, drift |
| `/admin/llm` | Ad | LLM call log | provider, tokens, latency, guard_result |
| `/admin/audit` | Ad | Audit log | Human decisions |
| `/responsible-ai` | A, D, Ad | Responsible AI panel | Model cards, fairness, limitations, data notice (F12) |

## 2. REST endpoints (prefix `/api/v1`)

All prediction responses include `model_version` + `generated_at`. All LLM responses include `generated_by: llm|template|replay`.

| Module | Method | Route | Purpose | Role |
|---|---|---|---|---|
| auth | POST | `/auth/login` | Access JWT in body, refresh in httpOnly cookie (path /api/v1/auth); lockout 5 fails per email+IP / 15 min | P |
| auth | POST | `/auth/refresh` | Rotate refresh cookie; reuse of a rotated token revokes its family | P (refresh cookie) |
| auth | POST | `/auth/logout` | Revoke refresh token + clear cookie | P (refresh cookie) |
| auth | POST | `/auth/change-password` | Verify old, min 8 chars, revoke other sessions | A, D, Ad |
| auth | GET | `/auth/me` | Current user, role, lang, theme, agent_id/distributor_id, last_login_at | A, D, Ad |
| agents | GET | `/agents` | List agents (filters: risk, district, q) | D, Ad |
| agents | GET | `/agents/{id}` | Agent profile + current floats | A(self), D, Ad |
| forecast | GET | `/agents/{id}/forecast` | Dual-float hourly q10/q50/q90 demand (cash <- cash_out, emoney <- cash_in), `?horizon_hours=24` (1..72), read from the bootstrap cache; 503 `forecast_not_ready` before precompute (F1) | A(self), D, Ad |
| risk | GET | `/agents/risk` | Scoped risk list at one horizon: `?horizon=6\|24\|72&level=&sort=risk\|stockout\|code\|name&page=&page_size=&q=`; paginated `{items,total,page,page_size}` (F3, F10) | A(self), D, Ad |
| risk | GET | `/agents/{id}/summary` | Profile, balances, time-to-stockout, risk per float and horizon, agent level (worst float) | A(self), D, Ad |
| risk | GET | `/agents/{id}/stockout` | Most likely time-to-stockout + confidence per float, no-refill projection; 503 `risk_not_ready` before precompute (F2) | A(self), D, Ad |
| risk | GET | `/agents/{id}/risk` | Stockout probability + green/amber/red at 6/24/72h per float (F3) | A(self), D, Ad |
| whatif | POST | `/agents/{id}/whatif` | Recompute runway for `{float_type, delta_amount, at}` (F8) | A(self), D |
| explanations | GET | `/agents/{id}/explanation` | Top SHAP factors + template bn/en text (F7) | A(self), D, Ad |
| explanations | POST | `/explanations/narrate` | LLM rewrite of template sentence (F7, LLM) | A(self), D |
| events | GET | `/events` | Salary/Eid/hat-bazar/weather in window (F6) | A, D, Ad |
| recommendations | GET | `/agents/{id}/recommendations` | Rebalance recommendation (F4) | A(self), D |
| recommendations | POST | `/recommendations/{id}/request` | Agent asks distributor to act (no money moves) | A(self) |
| swaps | GET | `/swaps` | Swap proposals `?status=` (A sees own) (F5) | A, D |
| swaps | POST | `/swaps/match` | Run rules + scipy optimiser on current forecasts | D |
| swaps | POST | `/swaps/{id}/approve` | Approve + note -> audit_log | D |
| swaps | POST | `/swaps/{id}/reject` | Reject + note -> audit_log | D |
| anomalies | GET | `/anomalies` | Isolation Forest flags (F9) | D, Ad |
| anomalies | GET | `/anomalies/{id}` | Evidence (features, scores) | D, Ad |
| anomalies | POST | `/anomalies/{id}/review` | confirmed/dismissed + note -> audit_log | D, Ad |
| anomalies | GET | `/anomalies/{id}/narrative` | LLM investigation narrative (LLM) | D, Ad |
| distributor | GET | `/distributor/overview` | Map points, risk counts, open swaps (F10) | D |
| impact | GET | `/impact` | Model vs baseline: stockout h, BDT saved, van trips; `?from&to&van_cost` (F11) | D, Ad |
| responsible-ai | GET | `/responsible-ai` | Model cards, metrics, fairness by group, limitations (F12) | A, D, Ad |
| copilot | POST | `/copilot/chat` | SSE stream; body `{message, lang}`; grounded + allow-listed tools | A |
| copilot | GET | `/copilot/history` | Own recent messages | A |
| briefing | GET | `/agents/{id}/briefing` | Agent morning summary (LLM) | A(self), D |
| briefing | GET | `/distributor/briefing` | Daily distributor briefing (LLM) | D |
| llm | GET | `/llm/status` | provider, mode, model, last error | A, D, Ad |
| llm | GET | `/admin/llm/logs` | llm_call_log page `?intent&generated_by` | Ad |
| admin | GET/POST | `/admin/users` | List / create users | Ad |
| admin | GET | `/admin/audit` | audit_log page | Ad |
| admin | GET | `/admin/models` | model_runs + metrics | Ad |
| admin | POST | `/admin/knowledge/reindex` | Reload playbook docs + TF-IDF index | Ad |
| system | GET | `/system/health` | Liveness (process up) | P |
| system | GET | `/system/status` | Readiness: db, migration head, seed/data_version, artifacts ok, model_version, llm mode, `ready` | P |

## 3. Database tables (PostgreSQL 16)

Money = `NUMERIC(14,2)` BDT. Times = `TIMESTAMPTZ` (Asia/Dhaka on display). Enums as PG enums.

| Table | Columns (type) | Keys | Indexes |
|---|---|---|---|
| users | id uuid, email text, full_name text, password_hash text, role enum(agent,distributor,admin), agent_id int null, distributor_id int null, lang enum(bn,en), theme enum(light,dark,system), is_active bool, last_login_at null, created_at | PK id; FK agent_id, distributor_id; CHECK role scope | UQ email |
| refresh_tokens | id uuid, user_id uuid, token_hash text, expires_at, revoked_at null, replaced_by uuid null, user_agent text null, created_at | PK id; FK user_id, replaced_by -> refresh_tokens | UQ token_hash; (user_id) |
| login_failures | id, email text, ip text, created_at | PK id | (email, ip, created_at) |
| distributors | id int, code text, name text, region text, district text, hub_lat float8, hub_lng float8, created_at | PK id | UQ code |
| agents | id int, code text, name text, distributor_id int, region text, district text, upazila text null, urban_rural enum(urban,peri_urban,rural), tier smallint(1-3), lat float8, lng float8, cash_capacity numeric, emoney_capacity numeric, opened_on date null, is_active bool, created_at | PK id; FK distributor_id | UQ code; (distributor_id); (region, district) |
| float_snapshots | id bigint, agent_id int, ts, cash_balance numeric, emoney_balance numeric, is_holdout bool | PK id; FK agent_id | UQ (agent_id, ts); (ts) |
| transactions | id bigint, agent_id int, ts, txn_type enum(cash_in,cash_out), amount_bdt numeric, txn_count int, is_holdout bool | PK id; FK agent_id | (agent_id, ts); (ts) |
| events | id int, type enum(salary,eid,hat_bazar,weather,holiday), name_en text, name_bn text, starts_at, ends_at, district text null, intensity numeric | PK id | (starts_at, ends_at); (district) |
| weather_daily | district text, date date, rain_mm numeric, temp_c numeric, severe bool | PK (district, date) | - |
| model_versions | id int, model_name text, version text, trained_at, artifact_sha256 text, metrics jsonb, is_active bool, created_at | PK id | UQ (model_name, version); (is_active) |
| forecasts | id bigint, model_version_id int, agent_id int, float_type enum(cash,emoney), ts (target), horizon_h smallint, q_low, q_mid, q_high numeric, generated_at | PK id; FK model_version_id, agent_id | (agent_id, ts); (agent_id, float_type, ts) |
| stockout_predictions | id bigint, model_version_id int, agent_id int, float_type enum, ts (as-of), stockout_at null, hours_to_stockout numeric null, confidence numeric, generated_at | PK id; FK model_version_id, agent_id | (agent_id, ts) |
| risk_levels | id bigint, model_version_id int, agent_id int, float_type enum, ts (as-of), horizon_h smallint(6/24/72), level enum(green,amber,red), probability numeric, confidence numeric, shap_top jsonb, generated_at | PK id; FK model_version_id, agent_id | (agent_id, ts); (level) |
| recommendations | id bigint, agent_id int, model_version_id int null, kind enum(add_cash,add_emoney,swap,van), float_type enum, amount_bdt numeric, deadline_at, rationale jsonb, status enum(open,requested,done,expired), created_at | PK id; FK agent_id, model_version_id | (agent_id, created_at); (agent_id, status) |
| swap_suggestions | id bigint, model_version_id int null, donor_agent_id int, receiver_agent_id int, float_type enum, amount_bdt numeric, distance_km numeric, van_trip_saved bool, score numeric, status enum(pending,approved,rejected), decided_by uuid null, decided_at null, note text null, created_at | PK id; FK model_version_id, donor/receiver -> agents, decided_by -> users; CHECK donor <> receiver | (status); (donor_agent_id); (receiver_agent_id) |
| anomalies | id bigint, model_version_id int, agent_id int, window_start, window_end, score numeric, features jsonb, status enum(open,confirmed,dismissed), reviewed_by uuid null, reviewed_at null, note text null, created_at | PK id; FK model_version_id, agent_id, reviewed_by | (agent_id, window_start); (status, score) |
| impact_results | id int, model_version_id int, scenario enum(model,baseline), window_start, window_end, stockout_hours numeric, value_saved_bdt numeric, van_trips int, params jsonb, created_at | PK id; FK model_version_id | (model_version_id, scenario) |
| audit_log | id bigint, user_id uuid, action text, entity_type text, entity_id text, note text, payload jsonb, created_at | PK id; FK user_id | (entity_type, entity_id); (created_at) |
| llm_call_log | id bigint, user_id uuid null, intent enum(copilot,narrate,agent_briefing,distributor_briefing,anomaly_narrative), provider text, model text, lang text, evidence_hash text, prompt_tokens int, completion_tokens int, latency_ms int, generated_by enum(llm,template,replay), guard_result enum(pass,numbers_fail,injection,schema_fail,timeout,error), error text null, created_at | PK id; FK user_id | (created_at desc); (intent, generated_by) |
| llm_cache | key text (sha256 pack+intent+lang), intent enum, response jsonb, provider text, created_at, expires_at | PK key | (expires_at) |
| copilot_messages | id bigint, user_id uuid, agent_id int, role enum(user,assistant), text text, lang text, generated_by enum null, llm_call_id bigint null, created_at | PK id; FK user_id, agent_id, llm_call_id | (user_id, created_at desc) |
| knowledge_docs | id int, slug text, title text, lang enum(bn,en), chunk_idx int, body text, source_path text, checksum text, updated_at | PK id | UQ (slug, lang, chunk_idx) |
| system_meta | key text, value jsonb, updated_at | PK key | - (seed, data_version, sim_now, bootstrap_state) |

TF-IDF index for RAG is built in memory at startup from knowledge_docs (no extra service).

## 4. Folder tree

| Path | Contents |
|---|---|
| `run.bat`, `run.sh` | One-command start for judges |
| `docker-compose.yml`, `.env.example` | db, backend, frontend services; env template (no secrets) |
| `docs/` | ARCHITECTURE, LLM_SPEC, DESIGN, IDEA_CHAIN, METHODS, SYNTHETIC_ASSUMPTIONS |
| `scripts/` | Dev helpers (record replay cache, reset db) |
| `backend/Dockerfile`, `backend/entrypoint.sh` | Image + bootstrap entrypoint (LF) |
| `backend/app/main.py` | FastAPI app, router mount, startup checks |
| `backend/app/api/v1/` | One router per module (auth, agents, forecast, ..., copilot, briefing, llm, admin, system) |
| `backend/app/services/` | Orchestration: evidence pack, forecast/risk/swap/impact services |
| `backend/app/rules/` | Business rules: thresholds, baseline alerts, swap constraints, risk levels |
| `backend/app/models/` | SQLAlchemy 2 ORM |
| `backend/app/schemas/` | Pydantic v2 request/response |
| `backend/app/core/` | config, security (JWT, bcrypt), db session, deps (role scoping), logging |
| `backend/app/llm/providers/` | anthropic, openai_compatible, replay, template |
| `backend/app/llm/guards/` | injection filter, numbers guard, output schema |
| `backend/app/llm/prompts/` | System prompts per intent (bn/en) |
| `backend/app/llm/rag/` | TF-IDF retriever |
| `backend/app/llm/knowledge/` | Liquidity Playbook *.md (bn+en) |
| `backend/app/llm/cache/demo_replay.json` | Pre-recorded demo answers |
| `backend/ml/data_gen/` | Seeded synthetic generator (agents, hourly txns, events, weather) |
| `backend/ml/features/` | Lags, calendar, event, weather features |
| `backend/ml/training/` | LightGBM quantile, Isolation Forest, backtest (14-day holdout) |
| `backend/ml/inference/` | Load artifacts, predict, stockout, swap optimiser (scipy) |
| `backend/ml/explain/` | SHAP -> factor list |
| `backend/ml/artifacts/` | *.joblib + manifest.json (version, sha256) — committed |
| `backend/bootstrap.py` | Idempotent seed/generate/precompute |
| `backend/migrations/` | Alembic |
| `backend/tests/` | pytest (api, rules, ml, llm) |
| `frontend/Dockerfile`, `frontend/nginx.conf` | Build Vite, serve static, proxy `/api` |
| `frontend/src/app/` | Router, providers, auth guard per role |
| `frontend/src/features/{agent,distributor,admin,copilot,shared}/` | Pages + hooks per area |
| `frontend/src/components/signature/` | VesselGauge, RunwayStrip, CountdownCard, PulseLine, WhyStones, SwapFlow, CopilotSheet, CommandPalette |
| `frontend/src/components/ui/` | Restyled primitives (shadcn base) |
| `frontend/src/lib/` | Axios client, query keys, zod schemas, stores (Zustand) |
| `frontend/src/i18n/{bn,en}.json` | Strings |
| `frontend/src/styles/tokens.css` | DESIGN.md tokens (light + dark) |
| `frontend/public/geo/bd.geojson` | Offline map boundary |

## 5. Fresh-PC bootstrap flow

| # | Step | Where | Action | Success check | On failure |
|---|---|---|---|---|---|
| 1 | run.bat / run.sh | host | Check Docker running; copy `.env.example` -> `.env` if missing | `docker info` ok | Print "Start Docker Desktop" and exit |
| 2 | Build + up | compose | `docker compose up --build -d` (db, backend, frontend) | containers created | Show compose logs |
| 3 | DB up | db | Postgres 16 with named volume | healthcheck `pg_isready` | backend waits (`depends_on: service_healthy`) |
| 4 | Migrate | backend entrypoint | `alembic upgrade head` | head revision recorded | Exit non-zero, logs shown |
| 5 | Seed / generate | `bootstrap.py` | If `system_meta.data_version` != code version: generate synthetic data (fixed seed), load agents, hourly, events, weather, demo users, playbook docs | row counts > 0, data_version set | Skipped when already current (idempotent) |
| 6 | Artifacts check | `bootstrap.py` | Verify `ml/artifacts/manifest.json` sha256 + model_version, register in model_runs | all hashes match | Retrain from seed (slow path, logged); fail if still missing |
| 7 | Precompute | `bootstrap.py` | At `SIM_NOW`: forecasts, risk, recommendations, swaps, anomalies, impact | rows for active run | Logged; status shows not ready |
| 8 | LLM mode | backend startup | `LLM_PROVIDER=auto`: key -> live; else replay; miss -> template | `/llm/status` | Always degrades to template, never blocks |
| 9 | Serve | backend + frontend | uvicorn :8000; nginx :8080 proxies `/api` | `GET /api/v1/system/status` -> `ready: true` | run script polls up to 180 s, then prints logs |
| 10 | Ready | host | Open `http://localhost:8080`, print demo logins | browser opens | - |

Reset: `run.bat --reset` -> `docker compose down -v`, then steps 1-10. No internet needed except optional LLM key and optional OSM tiles.
