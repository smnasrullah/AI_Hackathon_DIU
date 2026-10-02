#!/bin/sh
# Regenerate frontend API types from the backend OpenAPI schema (inside Docker).
# Writes frontend/openapi.json and frontend/src/api/schema.d.ts. Commit both.
set -eu
cd "$(dirname "$0")/.."

docker compose --profile tools run --rm -T backend-tools \
  python -c "import json; from app.main import app; print(json.dumps(app.openapi(), indent=1, sort_keys=True))" \
  > frontend/openapi.json
docker run --rm -v "$(pwd)/frontend:/app" -w /app node:22-alpine \
  npx -y openapi-typescript@7 openapi.json -o src/api/schema.d.ts
echo "Updated frontend/openapi.json and frontend/src/api/schema.d.ts"
