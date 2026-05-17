<#
.SYNOPSIS
  Removes draft goals for demo employees so sheet totals stay valid for submit.

.DESCRIPTION
  Logs in as emp1..emp4 (optional -Employees) and DELETEs goals with status draft.
  Locked/submitted goals are untouched. Requires backend running.

.PARAMETER BaseUrl
  API base, default http://127.0.0.1:8000/api/v1

.PARAMETER Employees
  Which demo emails to clean (default: emp1@demo.com only — safest for main demo path)

.EXAMPLE
  .\demo-prep.ps1
  .\demo-prep.ps1 -Employees @('emp1@demo.com','emp2@demo.com')
#>
param(
    [string]$BaseUrl = "http://127.0.0.1:8000/api/v1",
    [string[]]$Employees = @("emp1@demo.com"),
    [string]$Password = "Emp@123"
)

$ErrorActionPreference = "Stop"

function Get-Token([string]$email, [string]$pw) {
    $body = @{ email = $email; password = $pw } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method POST -Body $body -ContentType "application/json"
    return $r.access_token
}

foreach ($email in $Employees) {
    Write-Host "`n== $email ==" -ForegroundColor Cyan
    try {
        $tok = Get-Token $email $Password
    }
    catch {
        Write-Warning "Skip $email (login failed — is backend up?): $_"
        continue
    }
    $H = @{ Authorization = "Bearer $tok" }
    $cycle = Invoke-RestMethod -Uri "$BaseUrl/cycles/active" -Headers $H
    if (-not $cycle.id) {
        Write-Warning "No active cycle"
        continue
    }
    $goals = Invoke-RestMethod -Uri "$BaseUrl/goals?cycle_id=$($cycle.id)" -Headers $H
    $drafts = @($goals | Where-Object { $_.status -eq "draft" })
    Write-Host "  Draft goals to remove: $($drafts.Count)"
    foreach ($g in $drafts) {
        try {
            Invoke-RestMethod -Uri "$BaseUrl/goals/$($g.id)" -Method DELETE -Headers $H | Out-Null
            Write-Host "    deleted draft: $($g.title)"
        }
        catch {
            Write-Warning "    could not delete $($g.title): $_"
        }
    }
}

Write-Host "`nDone. Re-open My Goals in the browser." -ForegroundColor Green
