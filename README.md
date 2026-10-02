# AI_Hackathon_DIU

AgentPulse AI: smart agent liquidity predictor for MFS agents (synthetic data only, advisory:
a human approves anything that moves money).

## Run

Needs only Docker Desktop. `run.bat` (Windows) or `./run.sh` (Linux/Mac), then open
http://localhost:5173. Fresh database: `run.bat --reset`. More commands: [docs/COMMANDS.md](docs/COMMANDS.md).

## Demo mode and public hosting

`.env.example` ships with `DEMO_MODE=true` so local and judge runs get one-click role sign-in
(`POST /api/v1/auth/demo-login`: seeded `is_demo` accounts only, rate-limited per IP, every use in
`audit_log`).

**For any public hosting set `DEMO_MODE=false` in `.env`.** The demo-login endpoint is then not
registered at all and every sign-in needs a password. Also set your own `JWT_SECRET` and demo
passwords.
