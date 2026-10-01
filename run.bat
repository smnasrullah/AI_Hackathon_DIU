@echo off
rem AgentPulse AI one-command start (Windows). Usage: run.bat [--reset]
setlocal
cd /d "%~dp0"

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Start Docker Desktop, wait until it says "running", then run this again.
  exit /b 1
)

if not exist .env (
  copy /y .env.example .env >nul
  echo Created .env from .env.example
)

if /i "%~1"=="--reset" (
  echo Resetting: removing containers and database volume...
  docker compose down -v
)

docker compose up --build -d
if errorlevel 1 (
  docker compose logs --tail 100
  exit /b 1
)

echo Waiting for AgentPulse AI to be ready, up to 5 minutes...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline = (Get-Date).AddSeconds(300); while ((Get-Date) -lt $deadline) { try { $s = Invoke-RestMethod -Uri 'http://localhost:5173/api/v1/system/status' -TimeoutSec 3; if ($s.ready) { exit 0 }; Write-Host ('  state: ' + $s.bootstrap_state); if ($s.bootstrap_state -eq 'failed') { exit 1 } } catch { Write-Host '  starting...' }; Start-Sleep -Seconds 3 }; exit 1"
if errorlevel 1 (
  echo AgentPulse AI did not become ready. Recent logs:
  docker compose logs --tail 100
  exit /b 1
)

echo AgentPulse AI is ready at http://localhost:5173
start "" http://localhost:5173
endlocal
