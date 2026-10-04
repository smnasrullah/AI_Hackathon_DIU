# Decisions (hardening pass)

Decisions taken during the hardening pass without asking, each with the safest default.
Format: what, why, alternative considered.

## D1. Isolated verify stack with a compose overlay
- What: `docker-compose.verify.yml`, run as project `agentpulse-verify` on ports 18000/15173 with
  its own volume. It forces `LLM_PROVIDER=template`, `PERF_HEADERS=true`,
  `API_RATE_PER_MIN=1000000`.
- Why: load, fuzz and chaos tests must never touch the main stack or spend LLM credit. Bench and
  load clients share one IP, so the coarse per-IP cap would turn a latency test into a 429 test;
  that cap is covered by pytest (`test_hardening.py`) instead.
- Alternative: a second `.env`. Rejected: compose always reads the project `.env` via `env_file`,
  and `environment:` is the only layer that reliably overrides it.

## D2. Opt-in `Server-Timing` header (`PERF_HEADERS`, default off)
- What: per-request SQL query count, DB time and total time (`app/core/perf.py`).
- Why: the only way to count queries per endpoint from outside, and to catch N+1 regressions in
  the -Perf gate. Off by default so production responses carry no timing data.

## D3. Several uvicorn workers + shared security rate limits
- What: `entrypoint.sh` starts `WEB_CONCURRENCY` workers (default: CPU count clamped to 2..4).
  The security limits (login per IP, demo login, signup, password reset, per-user LLM calls)
  moved from process memory to the `rate_limit_hits` table (`app/core/shared_limit.py`), so they
  stay exact across workers. The coarse per-IP request cap stays in process and is divided by
  the worker count.
- Why: measured. One process served ~47 req/s at 50 users (p95 1.7 s) because handlers are
  CPU-bound Python. In-process limiters would silently become N times looser with N workers.
- Alternative: keep one worker and only shave CPU per request. Not enough: even halving the cost
  leaves one core for every user.
- Trade-off: the coarse cap is approximate per worker (a client can be limited slightly early if
  its requests land unevenly). It is a flood guard, not a security boundary.

## D4. Load-test user model
- What: each k6 virtual user loads a page's requests, then thinks for 3-6 s (see
  `scripts/perf/load.js`).
- Why: a 1 s think time made every virtual user ~10x busier than a real person. Budgets are set
  for realistic users; the aggressive profile is still reported in docs/PERFORMANCE.md.

## D5. Build chunk grouping (frontend/vite.chunks.ts)
- What: modules the first load needs (the entry, landing and auth pages) keep the default split;
  everything else is grouped: icons, libraries and app code shared by two or more routes.
  A small build plugin records the entry's and the public pages' static import graphs (and the
  lucide icons they import, resolved through lucide's own export table) at `buildEnd`.
- Why: measured. A cold visit to /agent fetched ~70 chunks under 2 KB after the shell, six at a
  time over HTTP/1.1; on Slow 4G that was ~7 s of the 10 s LCP. Now +19 files (was +68); initial
  JS 176 KB gz (was 178), / and /login first loads unchanged (budget 250 KB).
- Alternatives measured (scripts/bundle-report.mjs): one shared chunk for everything (initial
  231-240 KB, /login over budget); one lazy vendor chunk (+120-140 KB per route); icons only
  (+44 files per route). HTTP/2 would lift the six-connection limit but needs TLS in browsers.

## D6. Startup screen only when it is true
- What: BootstrapGate renders a blank page while the first status answer is in flight, and the
  "Preparing" screen only when the backend reports not-ready or cannot be reached.
- Why: every cold load flashed "First start takes a minute", which was also measured as the LCP
  element.

## D7. Refresh-token retry grace (30 s)
- What: a rotated refresh token presented again within 30 s, while its successor has never been
  used, replaces that unused successor instead of revoking the whole session family. A row lock
  serialises two refreshes of the same token. Any other reuse still revokes the family.
- Why: found while measuring. A reload, navigation or dropped mobile connection during a refresh
  leaves the browser with the old cookie although the server already rotated it; the next load
  looked like token theft and signed the user out (reproduced in the vitals run; regression
  tests in tests/test_auth_refresh.py).
- Trade-off: a thief who replays a stolen token inside those 30 s, before the real user's
  browser uses its new token, gets a session and the real user is signed out (visible to them).
  Before, both were signed out. Alternative: keep strict reuse detection and accept random
  logouts on flaky networks; rejected for a product aimed at agents on mobile data.

## D8. Thread pool left at the anyio default (40 per worker)
- Measured with 50 users: 8 threads per worker gave 10-25% more throughput, 4 threads
  deadlocked (requests hung 60 s: sync dependencies with `yield` need a free thread to finish).
  The gain is not worth a deadlock margin, so the default stays.
- Pool size (5+10 vs 20+0) and 8 workers instead of 4 made no meaningful difference.

## D9. What-if path cache (per worker, 8 entries)
- What: the 2,000 sampled demand paths and the "before" scenario are kept per agent and float;
  each slider move only re-projects the new balance. The key includes a digest of the cached
  forecast quantiles and the balance, so new data never hits a stale entry.
- Why: sampling was most of a what-if call (p95 under 50 users: 670 ms before, 108 ms after).
  Results are identical (tests compare cached and fresh answers bit for bit). Memory: ~2.3 MB
  an entry, ~18 MB per worker at most.

## D10. A network failure during the page-load session check retries instead of signing out
- What: only a 401 from /auth/refresh ends a session. During the check on page load, a network
  error, 5xx or restart keeps the user "checking" and retries after 1, 2, 4, 8, then every 15 s
  (at once when the browser comes back online), with a "Cannot reach the server" note.
- Why: found by the offline e2e test. A blip while the refresh was in flight sent users with a
  valid cookie to the login page.
- Alternative: give up after N tries and show the login page. Rejected: signing in cannot work
  while the server is unreachable either, and the retry note says what is happening.

## D11. OpenAPI describes the real error shape and statuses
- What: `app/core/openapi.py` replaces FastAPI's default 422 schema with the app's one error shape
  (`ErrorResponse`) and declares 400/413/422/429/500 everywhere, 401/403/404 on signed-in
  operations, 409 on signed-in writes. Frontend types regenerated (scripts/gen-api.ps1).
- Why: Schemathesis found 102 schema violations and ~300 undocumented statuses, all caused by the
  spec, not by the API. No API behaviour changed.

## D12. Double-submit guard on chosen actions, not a global scheduler change
- What: `useSingleFlight` (a ref set in the click) on the actions where a second request would
  create a duplicate or a confusing error: event and user forms, demo shortage, job start, and
  "Mark all read" (both places).
- Why: switching React Query's notify scheduler to microtasks fixed double clicks everywhere but
  changed callback ordering (a test lost an error toast when the card unmounted first). Server
  state machines already reject repeated claims, decisions and requests (409 / idempotent).

## D13. /dev/kit is exempt from the phone layout and skeleton checks
- The design kit is built only for e2e (VITE_DEV_KIT=true), shows loading states on purpose and
  has oversized demo visuals. Every product route is checked at 390 and 1440 px.

## D14. Signup approval and rejection lock the user row
- What: `SELECT ... FOR UPDATE` on the user in update/approve and reject.
- Why: reproduced on Postgres: two admins approving and rejecting the same pending signup at once
  both succeeded, leaving an active-and-rejected account with two contradictory audit entries.

## D15. Database outage is a 503, not a 500
- What: SQLAlchemy `OperationalError` (database unreachable or restarting) answers
  503 `database_unavailable` with `Retry-After: 5`; the frontend's reconnect banner treats 502,
  503, 504 and network errors as "server unreachable", pings /health and refetches when back.
- Liveness vs readiness: `/health` = the process answers (no database); `/system/status` = the
  database, migrations and bootstrap are ready. Docker's healthcheck uses liveness.

## D16. nginx re-resolves the backend name
- What: `resolver 127.0.0.11 valid=10s` and a variable `proxy_pass`.
- Why: reproduced: with the original config, recreating the backend container with a new IP
  left nginx answering 502 until nginx itself restarted. Now it follows within 10 s.

## D17. Postgres ends sessions of vanished clients
- What: `client_connection_check_interval=5s`, TCP keepalives 20 s / 5 s / 3 probes.
- Why: reproduced: killing the backend during the first seeding left its COPY session
  "active" for 10+ minutes; the restarted bootstrap waited on its locks and never got ready.

## D18. No statement_timeout on API connections
- The API process also runs admin background jobs (retraining) on the same engine; a timeout
  could kill those. No request-path query took more than ~70 ms under fuzzing or 50-user load.
