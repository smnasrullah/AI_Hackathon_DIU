param([switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$venvPython = Join-Path $backend '.venv\Scripts\python.exe'
$stateFile = Join-Path $backend 'bootstrap_state.txt'

# Load optional app settings without echoing values (especially API keys).
$envFile = Join-Path $root '.env'
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in [IO.File]::ReadAllLines($envFile)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$') {
      $name = $Matches[1]; $value = $Matches[2]
      if (-not (Test-Path "Env:$name") -and $name -notin @('POSTGRES_USER','POSTGRES_PASSWORD','POSTGRES_DB')) { Set-Item "Env:$name" $value }
    }
  }
}
$env:DB_MODE = 'sqlite'
$env:DATABASE_URL = "sqlite:///$($backend.Replace('\','/'))/agentpulse-local.db"
$env:BOOTSTRAP_STATE_FILE = $stateFile
if (-not $env:LLM_PROVIDER -or $env:LLM_PROVIDER -eq 'auto') { $env:LLM_PROVIDER = 'replay' }

if (-not (Test-Path -LiteralPath $venvPython)) { & py -3.11 -m venv (Join-Path $backend '.venv'); if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 is required to create backend/.venv.' } }
if (-not $SkipInstall) { & $venvPython -m pip install -r (Join-Path $backend 'requirements.txt'); if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' } }

Set-Content -LiteralPath $stateFile -Value 'migrating' -NoNewline
Push-Location $backend
try {
  & $venvPython -m alembic upgrade head; if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
  & $venvPython bootstrap.py needs-seed
  if ($LASTEXITCODE -eq 0) { Set-Content -LiteralPath $stateFile -Value 'seeding' -NoNewline; & $venvPython bootstrap.py seed; if ($LASTEXITCODE -ne 0) { throw 'Data seed failed.' } }
  & $venvPython bootstrap.py needs-train
  if ($LASTEXITCODE -eq 0) { Set-Content -LiteralPath $stateFile -Value 'training' -NoNewline; & $venvPython bootstrap.py train; if ($LASTEXITCODE -ne 0) { throw 'Model training failed.' } }
  & $venvPython bootstrap.py mark-ready; if ($LASTEXITCODE -ne 0) { throw 'Bootstrap finalization failed.' }
  Set-Content -LiteralPath $stateFile -Value 'ready' -NoNewline
} finally { Pop-Location }

Push-Location $frontend
try {
  if (-not (Test-Path -LiteralPath (Join-Path $frontend 'node_modules'))) { npm install; if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' } }
} finally { Pop-Location }

$backendLog = Join-Path $backend 'local-server.log'
$backendError = Join-Path $backend 'local-server-error.log'
$frontendLog = Join-Path $frontend 'local-server.log'
$frontendError = Join-Path $frontend 'local-server-error.log'
$backendCommand = "`$env:DB_MODE='sqlite'; `$env:DATABASE_URL='$($env:DATABASE_URL)'; `$env:BOOTSTRAP_STATE_FILE='$stateFile'; Set-Location '$backend'; & '$venvPython' -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
$frontendCommand = "Set-Location '$frontend'; npm run dev -- --host 127.0.0.1 --port 5173"
$backendEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($backendCommand))
$frontendEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($frontendCommand))
Start-Process powershell.exe -ArgumentList @('-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-EncodedCommand',$backendEncoded) -WorkingDirectory $backend -RedirectStandardOutput $backendLog -RedirectStandardError $backendError
Start-Process powershell.exe -ArgumentList @('-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-EncodedCommand',$frontendEncoded) -WorkingDirectory $frontend -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendError
foreach ($url in @('http://127.0.0.1:8000/api/v1/system/health','http://127.0.0.1:5173/')) {
  $ready = $false
  for ($attempt = 0; $attempt -lt 20 -and -not $ready; $attempt++) {
    try { Invoke-WebRequest -Uri $url -TimeoutSec 3 -UseBasicParsing | Out-Null; $ready = $true } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ready) { throw "Server did not start at $url. Check the corresponding local-server*.log file." }
}
Write-Host 'AgentPulse local servers started.'
Write-Host 'Frontend: http://localhost:5173'
Write-Host 'Health:   http://localhost:5173/api/v1/system/health'
Write-Host 'Status:   http://localhost:5173/api/v1/system/status'
Write-Host 'The backend and frontend are running in separate PowerShell windows.'
