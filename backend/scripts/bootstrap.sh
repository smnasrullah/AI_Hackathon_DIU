#!/bin/sh
# wait for db -> migrate -> seed if needed -> train if artifacts missing/invalid
# -> register model + precompute forecast cache -> ready.
# Progress is written to $BOOTSTRAP_STATE_FILE and reported by /api/v1/system/status.
set -u

STATE_FILE="${BOOTSTRAP_STATE_FILE:-/tmp/agentpulse_bootstrap_state}"

state() {
  echo "$1" > "$STATE_FILE"
  echo "[bootstrap] state=$1"
}

step() {
  name="$1"
  shift
  state "$name"
  if ! "$@"; then
    state failed
    exit 1
  fi
}

cd "$(dirname "$0")/.." || exit 1

state starting
step waiting_for_db python bootstrap.py wait-db
step migrating alembic upgrade head

if python bootstrap.py needs-seed; then
  step seeding python bootstrap.py seed
fi

if python bootstrap.py needs-train; then
  step training python bootstrap.py train
fi

step precomputing python bootstrap.py precompute

step finalizing python bootstrap.py mark-ready
state ready
