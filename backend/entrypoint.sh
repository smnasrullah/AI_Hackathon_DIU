#!/bin/sh
# Bootstrap runs in the background so /api/v1/system/status can report progress.
set -eu

./scripts/bootstrap.sh &
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
