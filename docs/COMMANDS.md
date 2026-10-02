# Commands

All commands run from the project root (`D:\Git\AI_Hackathon_DIU`). Only Docker Desktop is needed;
never run npm / tsc / pytest on the host.

## Run the app

| What | Windows | Linux / Mac |
|---|---|---|
| Start (build if needed, wait until ready) | `run.bat` | `./run.sh` |
| Start with a fresh database | `run.bat --reset` | `./run.sh --reset` |
| Stop | `docker compose down` | same |
| Backend logs | `docker compose logs -f backend` | same |

- App: http://localhost:5173 (nginx serves the built SPA and proxies `/api`)
- API docs: http://localhost:8000/docs
- Readiness: http://localhost:5173/api/v1/system/status (`ready`, `bootstrap_state`)

## Checks (`scripts\check.ps1`, Linux/Mac `scripts/check.sh --flag`)

| Flag | Runs | Measured on the dev PC |
|---|---|---|
| (none) | FAST tier: ruff, `pytest -m "not slow"`, tsc, eslint, vitest | ~2 min |
| `-Backend` | ruff + fast pytest | ~1.2 min |
| `-Frontend` | tsc + eslint + vitest | ~55 s |
| `-Slow` | `pytest -m slow` (ML gate, full synthetic set) | ~15 s |
| `-Up` | rebuild app images with the `/dev/kit` route and start the stack | 15 s cached, minutes on first build |
| `-E2E` | `bootstrap.py e2e-fixtures`, then Playwright smoke against the running stack | ~1.5 min |
| `-Full` | everything: all pytest, frontend, `-Up`, e2e | |

Behaviour:
- Output is one line per step (`PASS`/`FAIL name time`) plus only failing test names / errors.
- Tool images (`backend-tools`, `frontend-tools`, `e2e`) rebuild only when their Dockerfile,
  requirements or package files change (stamps in `scripts/.check-build-*.stamp`). Source is mounted.
- Every step has a hard timeout. A second concurrent run prints `BUSY` (lock `scripts/.check.lock`).
  Check containers (`agentpulse-check-*`) older than 15 min are removed at start.
- `-E2E` refuses to run when the stack is not ready or the frontend was built without `/dev/kit`
  (`run.bat` builds without it); run `-Up` first.

Typical use: backend change `-Backend`; UI change `-Frontend` (plus `-Up -E2E` when routes or flows
change); ML or data-generation change also `-Slow`.

## Backend CLI (`backend/bootstrap.py`)

Run inside the running stack: `docker compose exec -T backend python bootstrap.py <command>`.

| Command | Does |
|---|---|
| `wait-db` | wait until Postgres accepts connections |
| `needs-seed` / `seed` | check / load the synthetic dataset + reference seed |
| `seed-reference` | re-run only the idempotent distributor / agent / user seed |
| `needs-train` / `train` | check / retrain forecast artifacts (slow path) |
| `precompute` | register models, cache forecasts, risk, rebalance, anomalies, impact |
| `mark-ready` | set `bootstrap_state=ready` |
| `seed-notifications` | e2e: demo distributor's inbox becomes all read + exactly one unread notice |
| `e2e-fixtures` | e2e: `seed-notifications` + clear the wrong-password spec account's lockout |

`scripts/check -E2E` runs `e2e-fixtures` before every Playwright run, so the suite can be rerun
without `run.bat --reset`.

## Tool containers (one-off commands)

- Backend: `docker compose --profile tools run --rm -T backend-tools pytest tests/test_x.py`
- Frontend: `docker compose --profile tools run --rm -T frontend-tools npx vitest run src/...`
- e2e (stack up): `docker compose --profile e2e run --rm --no-deps -T e2e npx playwright test tests/shell.spec.ts`

## Tests

- pytest marker `slow`: model training, the full synthetic set, the ML gate. Fast tier excludes it.
- Test DBs are session-scoped templates (`seeded`, `ready`, `flagged`, `backtested`) copied per test.
- vitest setup skips motion animations and resets stores, storage, the app QueryClient, mocks and
  timers after every test.
