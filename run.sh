#!/bin/sh
# AgentPulse AI one-command start (Linux/macOS). Usage: ./run.sh [--reset]
set -u
cd "$(dirname "$0")" || exit 1

URL="http://localhost:5173"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker, then run this again."
  exit 1
fi

if [ ! -f .env ]; then
  if command -v openssl >/dev/null 2>&1; then
    secret="$(openssl rand -hex 32)"
  else
    secret="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  fi
  sed "s/__GENERATED_ON_FIRST_RUN__/$secret/" .env.example > .env
  echo "Created .env from .env.example with a random JWT secret"
fi

if [ "${1:-}" = "--reset" ]; then
  echo "Resetting: removing containers and database volume..."
  docker compose down -v
fi

if ! docker compose up --build -d; then
  docker compose logs --tail 100
  exit 1
fi

echo "Waiting for AgentPulse AI to be ready, up to 5 minutes..."
i=0
while [ "$i" -lt 100 ]; do
  body="$(curl -fsS --max-time 3 "$URL/api/v1/system/status" 2>/dev/null || true)"
  case "$body" in
    *'"ready":true'*)
      echo "AgentPulse AI is ready at $URL"
      if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 &
      elif command -v open >/dev/null 2>&1; then open "$URL"
      fi
      exit 0 ;;
    *'"bootstrap_state":"failed"'*)
      break ;;
    "") echo "  starting..." ;;
    *) echo "  preparing..." ;;
  esac
  i=$((i + 1))
  sleep 3
done

echo "AgentPulse AI did not become ready. Recent logs:"
docker compose logs --tail 100
exit 1
