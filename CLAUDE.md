# AgentPulse AI — Project Memory

Smart Agent Liquidity Predictor for MFS agents. AI Hackathon 2026 (DIU CPC x upay), Track 05 Merchant & Agent Intelligence.
Synthetic data ONLY. System is ADVISORY: a human approves anything that moves money.
Detail lives in docs/ (read only the file the task needs): ARCHITECTURE.md, LLM_SPEC.md, DESIGN.md, IDEA_CHAIN.md, METHODS.md.

## Environment
- Windows host, project root D:\Git\AI_Hackathon_DIU. Give PowerShell/CMD commands. Forward slashes inside code, Docker and config files.
- Shell scripts and entrypoints must be LF (.gitattributes already enforces it).
- Must run on ANY other PC (judges) with only Docker Desktop: `run.bat` (Windows) / `run.sh` (Linux/Mac) -> everything ready, no manual steps, no internet needed except the optional LLM key.
- Never read or print .env. Never commit secrets.

## Fixed stack (do not change)
- Frontend: React 18 + TypeScript + Vite, React Router 6, TanStack Query, Zustand, Tailwind (custom tokens, shadcn/ui primitives only as a base), Recharts, motion (framer-motion), cmdk, MapLibre GL, react-i18next (bn/en), React Hook Form + Zod, Axios. Fonts self-hosted via @fontsource (no CDN).
- Backend: Python 3.11, FastAPI modular monolith, SQLAlchemy 2 + Alembic, Pydantic v2, JWT (access+refresh), bcrypt, httpx, sse-starlette
- DB: PostgreSQL 16
- ML: pandas, scikit-learn, LightGBM (quantile), SHAP, scipy; joblib artifacts in backend/ml/artifacts (COMMITTED to git so a fresh PC needs no training)
- LLM layer (REQUIRED feature): backend/app/llm, provider-agnostic: `anthropic` (default model claude-haiku-4-5-20251001, env-configurable), `openai_compatible` (base_url, covers Gemini/Groq/Ollama), `replay` (pre-recorded demo answers), `template` fallback. See docs/LLM_SPEC.md.
- Infra: Docker Compose (db, backend, frontend); pytest, vitest; ruff, eslint

## Layout
/frontend  /backend/{app,ml,migrations,tests}  /docs  /scripts  docker-compose.yml  .env.example  run.bat  run.sh
- backend/app: api/, services/, rules/ (business rules), models/, schemas/, core/, llm/
- backend/ml: data_gen/, features/, training/, inference/, explain/, artifacts/

## Roles / routes
agent, distributor, admin. API prefix /api/v1. Frontend /agent/*, /distributor/*, /admin/*.

## The 12 features (+ LLM layer)
1 Dual-float forecast (cash, e-money; low/expected/high) 2 Time-to-stockout + confidence 3 Risk G/Y/R at 6/24/72h
4 Rebalance recommendation 5 Agent-to-agent swap matching 6 Event-aware (salary, Eid, hat-bazar, weather)
7 "Why?" explanation (SHAP -> bn/en, LLM-polished) 8 What-if slider 9 Agent risk detection (Isolation Forest)
10 Distributor map dashboard 11 Impact calculator vs rule baseline 12 Responsible AI panel
LLM: Agent Copilot (Bangla/English chat + voice, grounded), natural explanation wording, distributor daily briefing, anomaly investigation narrative, RAG over the synthetic Liquidity Playbook.

## Hard rules
- Rules in backend/app/rules, ML in backend/ml, LLM in backend/app/llm. Never mix.
- LLM writes and explains language ONLY. It never decides, approves, moves money, or computes numbers. All numbers come from the backend evidence pack and are verified in the answer (numbers guard).
- Every LLM output: validated, labelled `generated_by: llm|template|replay`, logged to llm_call_log, with automatic template fallback if the LLM fails or is absent.
- LLM key only in backend env. Treat all user text as untrusted (prompt-injection guard, role-scoped evidence, no cross-agent data).
- Swap matching = rules + scipy optimiser on ML forecasts.
- Every prediction response has model_version + generated_at.
- Human decisions (swap approve/reject, anomaly review) -> audit_log with user id + note.
- Fixed random seed. Document assumptions in docs/SYNTHETIC_ASSUMPTIONS.md. Clean held-out last 14 days, never trained on.
- Strict typing (no `any`). Small files. Every endpoint: Pydantic schema + at least one test.
- UI: follow docs/DESIGN.md exactly. No default-looking shadcn/Tailwind UI, no emoji icons (lucide only), no lorem ipsum.

## Working style (token saving)
- Do exactly the task. No unrelated refactors. Use grep/targeted views, not whole-file reads.
- Run tests + lint, fix failures, then reply ONLY: files changed, commands to run, blockers. No long explanations, no re-printing files.

## Commands (update as they become real)
- Start all: run.bat (Linux/Mac: ./run.sh) -> app http://localhost:5173, API http://localhost:8000/docs
- Fresh start (drops DB volume): run.bat --reset
- Readiness: http://localhost:5173/api/v1/system/status (`ready`, `bootstrap_state`)
- Logs: docker compose logs -f backend
- Backend setup (local, once): cd backend; python -m venv .venv; .venv\Scripts\pip install -r requirements-dev.txt
- Backend tests: cd backend; .venv\Scripts\python -m pytest   (in Docker: docker compose exec backend pytest)
- Backend lint: cd backend; .venv\Scripts\python -m ruff check .
- Migration tests on Postgres too: set $env:TEST_POSTGRES_URL="postgresql+psycopg://user:pw@localhost:5432/scratch_db" before pytest (DB is wiped)
- Re-seed demo users/distributors only: docker compose exec backend python bootstrap.py seed-reference
- New migration: cd backend; .venv\Scripts\alembic revision -m "msg"  (DATABASE_URL must point at a db)
- Frontend setup: cd frontend; npm ci
- Frontend dev (proxies /api to :8000): cd frontend; npm run dev
- Frontend tests / lint / build: cd frontend; npm test ; npm run lint ; npm run build
