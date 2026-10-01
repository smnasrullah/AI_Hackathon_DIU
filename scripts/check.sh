#!/bin/sh
# All checks, inside Docker (no local node/python needed).
# Usage: scripts/check.sh [--e2e] [--no-build]
set -u
cd "$(dirname "$0")/.." || exit 1

E2E=0
BUILD=1
for a in "$@"; do
  case "$a" in
    --e2e) E2E=1 ;;
    --no-build) BUILD=0 ;;
  esac
done

failed=0
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

step() {
  name="$1"
  shift
  start=$(date +%s)
  docker "$@" >"$LOG" 2>&1
  code=$?
  t=$(( $(date +%s) - start ))
  if [ "$code" -eq 0 ]; then
    printf 'PASS  %-10s %4ss\n' "$name" "$t"
  else
    printf 'FAIL  %-10s %4ss  (exit %s)\n' "$name" "$t" "$code"
    grep -Ev '^ *Container [^ ]+ (Creat|Start)' "$LOG" | tail -n 40 | sed 's/^/      /'
    failed=$((failed + 1))
  fi
}

BE="compose --profile tools run --rm -T backend-tools"
FE="compose --profile tools run --rm -T frontend-tools"

if [ "$BUILD" -eq 1 ]; then
  step build compose --profile tools build -q backend-tools frontend-tools
  [ "$failed" -eq 0 ] || exit 1
fi
# shellcheck disable=SC2086
step ruff $BE ruff check .
# shellcheck disable=SC2086
step pytest $BE pytest -q -p no:cacheprovider
# shellcheck disable=SC2086
step typecheck $FE npm run -s typecheck
# shellcheck disable=SC2086
step eslint $FE npm run -s lint
# shellcheck disable=SC2086
step vitest $FE npm run -s test
if [ "$E2E" -eq 1 ]; then
  if docker compose --profile e2e config --services | grep -qx e2e; then
    # Rebuild app images so e2e tests the working tree; `up -d` recreates changed containers.
    [ "$BUILD" -eq 1 ] && step e2e-build compose --profile e2e build -q backend frontend e2e
    step e2e-up compose up -d --wait db frontend
    step e2e compose --profile e2e run --rm -T e2e
  else
    echo "SKIP  e2e        (no e2e service defined yet)"
  fi
fi

if [ "$failed" -ne 0 ]; then
  echo "$failed check(s) failed"
  exit 1
fi
echo "All checks passed"
