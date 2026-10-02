# All checks, inside Docker (no local node/python needed).
# Usage: scripts\check.ps1 [-E2E] [-NoBuild]
param([switch]$E2E, [switch]$NoBuild)
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)

$failed = 0
function Invoke-Step([string]$Name, [string[]]$Cmd) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $out = & docker @Cmd 2>&1 | ForEach-Object { "$_" } |
    Where-Object { $_ -notmatch '^\s*Container \S+ (Creat|Start)|RemoteException$' }
  $code = $LASTEXITCODE
  $t = '{0,5:N1}s' -f $sw.Elapsed.TotalSeconds
  if ($code -eq 0) {
    Write-Host ("PASS  {0,-10} {1}" -f $Name, $t)
  } else {
    Write-Host ("FAIL  {0,-10} {1}  (exit {2})" -f $Name, $t, $code)
    $out | Select-Object -Last 40 | ForEach-Object { Write-Host "      $_" }
    $script:failed++
  }
}

$be = @('compose', '--profile', 'tools', 'run', '--rm', '-T', 'backend-tools')
$fe = @('compose', '--profile', 'tools', 'run', '--rm', '-T', 'frontend-tools')

if (-not $NoBuild) {
  Invoke-Step 'build' @('compose', '--profile', 'tools', 'build', '-q', 'backend-tools', 'frontend-tools')
  if ($failed) { exit 1 }
}
Invoke-Step 'ruff'      ($be + @('ruff', 'check', '.'))
Invoke-Step 'pytest'    ($be + @('pytest', '-q', '-p', 'no:cacheprovider'))
Invoke-Step 'typecheck' ($fe + @('npm', 'run', '-s', 'typecheck'))
Invoke-Step 'eslint'    ($fe + @('npm', 'run', '-s', 'lint'))
Invoke-Step 'vitest'    ($fe + @('npm', 'run', '-s', 'test'))
if ($E2E) {
  if ((docker compose --profile e2e config --services) -contains 'e2e') {
    # Rebuild app images so e2e tests the working tree; `up -d` recreates changed containers.
    # The e2e bundle includes the dev-only /dev/kit route.
    $env:VITE_DEV_KIT = 'true'
    if (-not $NoBuild) { Invoke-Step 'e2e-build' @('compose', '--profile', 'e2e', 'build', '-q', 'backend', 'frontend', 'e2e') }
    Invoke-Step 'e2e-up' @('compose', 'up', '-d', '--wait', 'db', 'frontend')
    Remove-Item Env:VITE_DEV_KIT -ErrorAction SilentlyContinue
    Invoke-Step 'e2e' @('compose', '--profile', 'e2e', 'run', '--rm', '-T', 'e2e')
  } else { Write-Host 'SKIP  e2e        (no e2e service defined yet)' }
}

if ($failed) { Write-Host "$failed check(s) failed"; exit 1 }
Write-Host 'All checks passed'
exit 0
