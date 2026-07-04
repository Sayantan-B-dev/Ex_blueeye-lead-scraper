$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $ScriptDir "global_scraper")
python run.py @args
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nFAILED with exit code $LASTEXITCODE" -ForegroundColor Red
    pause
}
