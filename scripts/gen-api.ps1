# Regenerate frontend API types from the backend OpenAPI schema (inside Docker).
# Writes frontend/openapi.json and frontend/src/api/schema.d.ts. Commit both.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$json = docker compose --profile tools run --rm -T backend-tools python -c "import json; from app.main import app; print(json.dumps(app.openapi(), indent=1, sort_keys=True))"
if ($LASTEXITCODE -ne 0) { Write-Host 'Could not export the OpenAPI schema'; exit 1 }
[IO.File]::WriteAllText((Join-Path (Get-Location) 'frontend/openapi.json'), ($json -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))

docker run --rm -v "${PWD}/frontend:/app" -w /app node:22-alpine npx -y openapi-typescript@7 openapi.json -o src/api/schema.d.ts
if ($LASTEXITCODE -ne 0) { Write-Host 'openapi-typescript failed'; exit 1 }
Write-Host 'Updated frontend/openapi.json and frontend/src/api/schema.d.ts'
