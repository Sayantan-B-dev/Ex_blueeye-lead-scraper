@echo off
cd /d "%~dp0global_scraper"
python run.py %*
if %errorlevel% neq 0 (
  echo.
  echo FAILED with exit code %errorlevel%
  pause
)
