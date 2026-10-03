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

`.env.example` ships with `DEMO_MODE=true` so local and judge runs get one-click role sign-in
(`POST /api/v1/auth/demo-login`: seeded `is_demo` accounts only, rate-limited per IP, every attempt
(success, denied, rate-limited) in `audit_log`). The backend logs a startup warning while it is on.

**For any public hosting set `DEMO_MODE=false` in `.env`.** The demo-login endpoint is then not
registered at all and every sign-in needs a password. Also set your own `JWT_SECRET` and demo
passwords.

## More for judges / reviewers

- [docs/JUDGING_MAP.md](docs/JUDGING_MAP.md) — rubric criteria mapped to concrete evidence (files, routes, numbers)
- [docs/PATH_TO_PRODUCTION.md](docs/PATH_TO_PRODUCTION.md) — from this prototype to a real upay pilot
- [docs/RESPONSIBLE_AI_CHECKLIST.md](docs/RESPONSIBLE_AI_CHECKLIST.md) — governance, fairness, safety, privacy
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/METHODS.md](docs/METHODS.md), [docs/LLM_SPEC.md](docs/LLM_SPEC.md) — how it's built and how every number is produced
