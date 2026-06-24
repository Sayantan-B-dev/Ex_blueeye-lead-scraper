@echo off
REM P-2 Google Maps Scraper using gosom/google-maps-scraper Docker image
REM
REM Prerequisites:
REM   1. Docker Desktop installed and running
REM   2. Pull the image first: docker pull gosom/google-maps-scraper
REM
REM This will scrape all 324 P2 queries and save results to ..\gmaps-output\p2_results.csv
REM
REM Adjust -c (concurrency) based on your CPU/RAM. Start with -c 4.

set SCRIPTPATH=%~dp0
set BASEPATH=%SCRIPTPATH%..
set QUERIES=%SCRIPTPATH%p2_queries.txt
set OUTDIR=%BASEPATH%\gmaps-output

if not exist %OUTDIR% mkdir %OUTDIR%

docker run ^
  -v gmaps-playwright-cache:/opt ^
  -v "%QUERIES%:/queries.txt:ro" ^
  -v "%OUTDIR%:/out" ^
  gosom/google-maps-scraper ^
  -input /queries.txt ^
  -results /out/p2_results.csv ^
  -depth 1 ^
  -c 4 ^
  -exit-on-inactivity 3m

echo.
echo Done. Results saved to %OUTDIR%\p2_results.csv
