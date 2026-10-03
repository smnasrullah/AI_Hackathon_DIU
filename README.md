# AI_Hackathon_DIU

AgentPulse AI: smart agent liquidity predictor for MFS agents (synthetic data only, advisory:
a human approves anything that moves money).

## Run

Needs only Docker Desktop. `run.bat` (Windows) or `./run.sh` (Linux/Mac), then open
http://localhost:5173. Fresh database: `run.bat --reset`. More commands: [docs/COMMANDS.md](docs/COMMANDS.md).

The **first** run needs internet (pulls Docker base images and installs packages), takes a few
minutes, and also trains/verifies the committed ML artifacts. After that first build, everything
works fully offline except an optional live LLM key (below) — no other service is called.
`run.bat`/`run.sh` wait up to 5 minutes for `GET /api/v1/system/status` to report `ready: true`;
if it times out they print the container logs.

## 3-minute demo

A scripted, deterministic walkthrough (same seed, same scenario agent, same timings on every PC):
[docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## Optional LLM key

The app works with **no key at all** — see "Replay and template answers" below. Setting one in
`.env` turns on live LLM wording (never numbers, never decisions — see docs/LLM_SPEC.md):

```
LLM_PROVIDER=anthropic        # or openai_compatible / auto (default)
LLM_MODEL=claude-haiku-4-5-20251001
LLM_API_KEY=...
```

Any OpenAI-compatible endpoint also works via `LLM_PROVIDER=openai_compatible` +
`LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL`, including free options:

- **Groq** free tier — `LLM_BASE_URL=https://api.groq.com/openai/v1`
- **Gemini** free tier (OpenAI-compatible endpoint) — `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`
- **Local Ollama** (no key, no cost, no internet) — `LLM_BASE_URL=http://host.docker.internal:11434/v1`, `LLM_API_KEY=ollama`

Restart the stack after editing `.env`. `GET /api/v1/llm/status` (and `/admin/llm` in the app)
shows which provider is actually serving.

## Demo logins

Seeded, synthetic accounts only. With `DEMO_MODE=true` (the `.env.example` default) `/login` shows
one-click chips for these; otherwise sign in with the password set at seed time.

| Role | Email | Notes |
|---|---|---|
| Admin | `admin@agentpulse.demo` | System status, models, users, LLM log, audit log |
| Distributor | `dist.dhaka@agentpulse.demo` | DST-DHK — pairs with the agent below for the demo script |
| Distributor | `dist.chattogram@agentpulse.demo` | DST-CTG |
| Distributor | `dist.sylhet@agentpulse.demo` | DST-SYL |
| Agent | `agent.mirpur@agentpulse.demo` | AGT-0001 — the scripted "cash runs dry at 3:40 PM" scenario |
| Agent | `agent.patiya@agentpulse.demo` | AGT-0002 |
| Agent | `agent.sunamganj@agentpulse.demo` | AGT-0003 |
| Agent | `agent.mirpur11@agentpulse.demo` | AGT-0004, ~1 km from AGT-0001: help-request helper (cash donor) |
| Agent | `agent.mirpur.chowdhury@agentpulse.demo` | AGT-0072, ~1.7 km: help-request helper |
| Agent | `agent.mirpur.sarkar@agentpulse.demo` | AGT-0064, ~1.8 km: help-request helper |
| Agent | `agent.mohammadpur@agentpulse.demo` | AGT-0106, ~4.3 km: help-request helper |

The four helper logins are synthetic shops of the generated data under DST-DHK, near AGT-0001.
They use the agent password (no one-click chip) and are created after the data load, on every
start if missing (`python bootstrap.py seed-helpers`), so an existing database gets them too.

## Replay and template answers

Every AI-written sentence in the app is labelled with where it came from, right next to the
"Model prediction" numbers it's explaining (never mixed together):

| Chip | Means |
|---|---|
| **AI-generated wording** | A live LLM call just answered, under the numbers guard (docs/LLM_SPEC.md §4) |
| **AI-generated wording (recorded)** | No live key right now: a real LLM answer recorded earlier for this exact scenario (`backend/app/llm/cache/demo_replay.json`), so the demo still sounds natural with zero cost and zero internet |
| **Template wording** | Deterministic bn/en sentence, used if there's no key *and* no recorded answer for that case, or if a live answer failed the numbers guard |

`LLM_PROVIDER=auto` (default) picks automatically: key present -> live; no key -> replay; no
matching replay entry -> template. The numbers are identical in every case — only the sentence
wording differs. Full call log, provider status and today's usage: `/admin/llm` in the app.

## Demo mode and public hosting

Opening the app never signs anyone in: `/login` is a normal email + password form (show/hide
password, generic "Email or password is incorrect", lockout after 5 failures per email + IP).

`.env.example` ships with `DEMO_MODE=true` so local and judge runs also get a **Judge demo**
section on `/login` with one-click agent / distributor / admin accounts
(`POST /api/v1/auth/demo-login`: seeded `is_demo` accounts only, rate-limited per IP, every attempt
(success, denied, rate-limited) in `audit_log`). The section is shown only while the public
`GET /api/v1/system/status` reports `demo_mode: true`, and the backend logs a startup warning while
it is on.

**For any public hosting set `DEMO_MODE=false` in `.env`.** The demo-login endpoint is then not
registered at all, the Judge demo section disappears and every sign-in needs a password. Also set
your own `JWT_SECRET` and demo passwords.

### Sign-up and approval

`/signup` (name, email, password >= 8 characters, confirm) creates an account that is **pending**:
always the least-privileged role (agent), inactive, not linked to any agent counter. The client
cannot choose the role (unknown fields are rejected). Sign-up is rate-limited per IP
(`SIGNUP_PER_HOUR`, default 5) and audited (`auth.signup`); a taken email gets a generic refusal.
A pending account cannot sign in until an admin opens **Admin > Users**, filters by *Pending
approval*, picks the agent (or another role and link) and presses **Approve and activate**
(`PATCH /api/v1/admin/users/{id}` with `is_active: true`, audited as `user.approve`).

### Forgot / reset password (development mailer)

`/forgot-password` always answers the same, whether or not the email has an account. For an active
account it issues a single-use reset link valid for 30 minutes (`RESET_TOKEN_TTL_MIN`); only a
SHA-256 hash of the token is stored, a newer link cancels older ones, and requests are
rate-limited per IP (`RESET_REQUEST_PER_HOUR`) and per account (`RESET_PER_ACCOUNT_PER_HOUR`).
Resetting signs the user out everywhere (all refresh tokens revoked). Requests and resets are
audited (`auth.password_reset_request`, `auth.password_reset`); passwords are never logged.

There is no email server. `MAILER=dev_log` (the only mailer today) is **for development only**: it
writes the reset link to the backend log, marked `[DEV ONLY MAILER - no email sent]`:

```
docker compose logs backend | findstr "DEV ONLY MAILER"     (Linux/Mac: grep "DEV ONLY MAILER")
```

The link points at `PUBLIC_BASE_URL` (default `http://localhost:5173`) and carries the token in the
URL fragment (`/reset-password#token=...`), so it never reaches a server access log. To send real
email, add an SMTP class next to `DevLogMailer` in `backend/app/services/mailer.py`.

## More for judges / reviewers

- [docs/JUDGING_MAP.md](docs/JUDGING_MAP.md) — rubric criteria mapped to concrete evidence (files, routes, numbers)
- [docs/PATH_TO_PRODUCTION.md](docs/PATH_TO_PRODUCTION.md) — from this prototype to a real upay pilot
- [docs/RESPONSIBLE_AI_CHECKLIST.md](docs/RESPONSIBLE_AI_CHECKLIST.md) — governance, fairness, safety, privacy
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/METHODS.md](docs/METHODS.md), [docs/LLM_SPEC.md](docs/LLM_SPEC.md) — how it's built and how every number is produced
