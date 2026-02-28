$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "== Mail Tool one-click start ==" -ForegroundColor Cyan
Write-Host "Project root: $root"

Set-Location $root

$venvDir = Join-Path $root ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"

function Ensure-Venv {
  if (Test-Path $venvPython) { return }

  Write-Host "Creating venv (Python 3.11)..." -ForegroundColor Yellow

  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($null -ne $py) {
    & py -3.11 -m venv $venvDir
    return
  }

  # Fallback: use whatever `python` is on PATH (may be wrong).
  # If user doesn't have `py` launcher, they can still run start.ps1 after setting PATH to Python 3.11.
  & python -m venv $venvDir
}

Ensure-Venv

Write-Host "Installing backend deps..." -ForegroundColor Yellow
& $venvPython -m pip install -r "$root\requirements.txt"

# Ensure .env exists and has ENCRYPTION_KEY
$envPath = Join-Path $root ".env"
if (!(Test-Path $envPath)) {
  New-Item -ItemType File -Path $envPath | Out-Null
}

$envText = Get-Content -Path $envPath -Raw
if ($envText -notmatch "(?m)^\s*ENCRYPTION_KEY\s*=") {
  Write-Host "Generating ENCRYPTION_KEY..." -ForegroundColor Yellow
  $key = & $venvPython -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  Add-Content -Path $envPath -Value "ENCRYPTION_KEY=$key"
}

if ($envText -notmatch "(?m)^\s*DATABASE_URL\s*=") {
  Add-Content -Path $envPath -Value "DATABASE_URL=sqlite+aiosqlite:///./mail_agg.db"
}

Write-Host "Init DB tables..." -ForegroundColor Yellow
& $venvPython (Join-Path $root "scripts\init_db.py")

Write-Host "Starting backend (new window)..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "cd `"$root`"; `"$venvPython`" -m uvicorn main:app --reload"
)

if (Test-Path (Join-Path $root "frontend\package.json")) {
  Write-Host "Starting frontend (new window)..." -ForegroundColor Green
  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd `"$root\frontend`"; npm install; npm run dev"
  )
} else {
  Write-Host "frontend/ not found, skipping frontend start." -ForegroundColor DarkYellow
}

Write-Host "Done. Backend: http://127.0.0.1:8000/docs  Frontend: http://127.0.0.1:5173" -ForegroundColor Cyan

