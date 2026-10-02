# AgentPulse AI — Project Memory

Smart Agent Liquidity Predictor for MFS agents. AI Hackathon 2026 (DIU CPC x upay), Track 05 Merchant & Agent Intelligence.
Synthetic data ONLY. System is ADVISORY: a human approves anything that moves money.
Detail lives in docs/ (read only the file or section the task names): ARCHITECTURE.md, LLM_SPEC.md, DESIGN.md, PRODUCT_CHECKLIST.md, IDEA_CHAIN.md, METHODS.md, COMMANDS.md (full command list).

## Environment
- Windows host, project root D:\Git\AI_Hackathon_DIU. Give PowerShell commands. Forward slashes inside code, Docker and config files.
- LOCAL npm/tsc/pytest are NOT reliable on this machine. Never run them locally. Run everything in Docker via `scripts/check.ps1` (see Commands) or `docker compose run --rm <tool-service> ...`.
- Shell scripts and entrypoints must be LF (.gitattributes enforces it).
- Must run on ANY other PC (judges) with only Docker Desktop: `run.bat` / `run.sh`. First build needs internet (images, packages); afterwards offline except the optional LLM key.
- Never read or print .env. Never commit secrets. JWT secret must be >= 32 bytes (app refuses to start otherwise).

## Fixed stack (do not change)
- Frontend: React 18 + TypeScript + Vite, React Router 6, TanStack Query, Zustand, Tailwind (custom tokens), Radix primitives as base, Recharts, motion (framer-motion), cmdk, MapLibre GL, react-i18next (bn/en), React Hook Form + Zod, Axios, lucide-react. Fonts self-hosted via @fontsource. Served in Docker by nginx (built dist, SPA fallback, `/api` proxied to backend, same-origin) on port 5173.
- Backend: Python 3.11, FastAPI modular monolith, SQLAlchemy 2 + Alembic, Pydantic v2, JWT access (15 min, in memory) + refresh (httpOnly cookie, rotating, revocable), bcrypt, httpx, sse-starlette
- DB: PostgreSQL 16
- ML: pandas, scikit-learn, LightGBM (quantile), SHAP, scipy; joblib artifacts in backend/ml/artifacts (COMMITTED)
- LLM layer (REQUIRED): backend/app/llm, provider-agnostic: anthropic (default claude-haiku-4-5-20251001), openai_compatible, replay, template. See docs/LLM_SPEC.md.
- Tests: pytest, vitest, Playwright e2e (compose profile `e2e`). Lint: ruff, eslint.

## Layout
/frontend /backend/{app,ml,migrations,tests} /docs /scripts /e2e docker-compose.yml .env.example run.bat run.sh
- backend/app: api/, services/, rules/ (business rules), models/, schemas/, core/, llm/
- backend/ml: data_gen/, features/, training/, inference/, explain/, artifacts/

## Roles / routes
agent, distributor, admin. API prefix /api/v1. Frontend /agent/*, /distributor/*, /admin/*, plus shared /settings, /profile, /help, /notifications.

## The 12 features (+ LLM layer)
1 Dual-float forecast 2 Time-to-stockout + confidence 3 Risk at 6/24/72h 4 Rebalance recommendation 5 Agent-to-agent swap matching
6 Event-aware (salary, Eid, hat-bazar, weather) 7 "Why?" explanation (SHAP -> bn/en, LLM-polished) 8 What-if slider
9 Agent risk detection (Isolation Forest) 10 Distributor map dashboard 11 Impact calculator vs rule baseline 12 Responsible AI panel
LLM: Agent Copilot (bn/en chat + voice, grounded), explanation wording, distributor briefing, anomaly narrative, RAG over the Liquidity Playbook.

## Hard rules
- Rules in backend/app/rules, ML in backend/ml, LLM in backend/app/llm. Never mix.
- LLM writes language ONLY. It never decides, approves, moves money, or computes numbers. Numbers come from the backend evidence pack and are verified (numbers guard, Bangla digits normalised). Every LLM output: validated, labelled generated_by llm|template|replay, logged to llm_call_log, template fallback.
- LLM key only in backend env. Treat all user text as untrusted. Role-scoped data, no cross-agent leakage.
- Swap matching = rules + scipy optimiser. Every prediction response has model_version + generated_at.
- Human decisions (swap approve/reject, anomaly review) -> audit_log with user id + note.
- Auth: logout must revoke the refresh token, clear Zustand + TanStack cache + storage, and redirect; roles checked server-side on every endpoint.
- Fixed seed. Held-out last 14 days never trained on. Forecast must beat the same-hour-last-week baseline (ML gate test).
- Strict typing (no `any`). Small files. Every endpoint: Pydantic schema + at least one test.
- UI: follow docs/DESIGN.md and docs/PRODUCT_CHECKLIST.md exactly. lucide icons only, no emoji, no lorem ipsum, no default-looking Tailwind/shadcn. Every new route is added to e2e/routes.ts.
- Every data block has skeleton, empty, error (with retry) states. Honour prefers-reduced-motion.

## Working style (token saving)
- Do exactly the task. No unrelated refactors. Use grep and targeted views, not whole-file reads.
- Never wait on or poll long jobs, never start background monitors. If a command runs over 5 minutes, stop and tell me to run it myself.
- Run only the check for the task: backend task `check.ps1 -Backend`; UI task `check.ps1 -Frontend` (+ `-Up -E2E` when routes/flows change); ML/data change also `-Slow`. Never run `-Full` unless I ask.
- check.ps1 prints one line per step plus failing tests only; do not re-run with full logs. `BUSY` = another check holds scripts/.check.lock: do not delete it, tell me.
- New tests: reuse session-scoped DB templates (`seeded`, `ready`, `flagged`, `backtested`); anything that trains models, loads the full synthetic set, or gates ML gets `@pytest.mark.slow`.
- Stop and report after 2 failed attempts at the same problem.
- Reply ONLY: files changed, commands to run, blockers. No explanations, no re-printing files.

## Commands (full list: docs/COMMANDS.md)
- Start: run.bat (Linux/Mac: ./run.sh) -> http://localhost:5173, API /docs on :8000. Fresh DB: run.bat --reset
- Readiness: http://localhost:5173/api/v1/system/status (`ready`, `bootstrap_state`)
- Checks: scripts\check.ps1 (FAST) | -Backend | -Frontend | -Slow | -Up | -E2E (needs -Up stack) | -Full
- Logs: docker compose logs -f backend
- Everything else (bootstrap CLI, e2e fixtures, tool containers, timings): docs/COMMANDS.md
