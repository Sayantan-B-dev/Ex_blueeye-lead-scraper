# RUN — JustDial Scraper

## Quick Start
```bash
cd G:\code\Web techs\projects\BlueEye\scraping_info\JustDial
pip install playwright
playwright install chromium
python scraper.py
```

## Resume after crash
```bash
python scraper.py          # auto-resumes from state/worker_*.json
```

## Options (planned)
```bash
python scraper.py --workers 3          # fewer parallel workers
python scraper.py --proxy 1.2.3.4:8080 # route through proxy
python scraper.py --city Mumbai        # single city only
python scraper.py --dry-run            # validate URL slugs only
```

## Output
- City CSVs → `output/{City}.csv`
- Progress → `state/worker_{id}.json`
- Logs → `logs/workers/worker_{id}.log`
