# AtomQuest — local start (no Docker required; uses SQLite)
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host "AtomQuest local startup" -ForegroundColor Cyan

Set-Location "$Root\backend"
if (-not (Test-Path "venv")) { python -m venv venv }
& .\venv\Scripts\pip install -q -r requirements.txt
$env:DATABASE_URL = "sqlite+aiosqlite:///./atomquest.db"
& .\venv\Scripts\python seed.py

Write-Host "Starting API: http://localhost:8000" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\backend'; `$env:DATABASE_URL='sqlite+aiosqlite:///./atomquest.db'; .\venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

Set-Location "$Root\frontend"
if (-not (Test-Path "node_modules")) { npm install }
Write-Host "Starting UI: http://127.0.0.1:5173" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\frontend'; npm run dev -- --host 127.0.0.1 --port 5173"

Write-Host ""
Write-Host "Open:  http://127.0.0.1:5173" -ForegroundColor Yellow
Write-Host "API:   http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host "Login: emp1@demo.com / Emp@123" -ForegroundColor Yellow
