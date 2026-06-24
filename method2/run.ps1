# P-2 Google Maps Scraper using gosom/google-maps-scraper Docker image
# Run: powershell -ExecutionPolicy Bypass -File run.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BasePath = Join-Path $ScriptDir ".." | Resolve-Path
$QueriesFile = Join-Path $ScriptDir "p2_queries.txt"
$OutDir = Join-Path $BasePath "gmaps-output"

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

Write-Host "Starting P-2 scrape (324 queries)..."
Write-Host "Output: $OutDir\p2_results.csv"

docker run `
  -v gmaps-playwright-cache:/opt `
  -v "${QueriesFile}:/queries.txt:ro" `
  -v "${OutDir}:/out" `
  gosom/google-maps-scraper `
  -input /queries.txt `
  -results /out/p2_results.csv `
  -depth 1 `
  -c 4 `
  -exit-on-inactivity 3m

Write-Host "Done. Results saved to $OutDir\p2_results.csv"
