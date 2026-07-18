# Link Scrapper

Scraper for collecting links/leads from web sources, organized as a standalone module within the scraping_info project.

## Folder Structure

```
link_scrapper/
├── data/        # Input datasets and scraped output (CSV/JSON)
├── log/         # Runtime logs
├── reference/   # Reference docs, query lists, and static assets
├── src/         # Source code (scraper modules, utilities)
├── tools/       # Helper scripts and standalone tools
└── README.md    # This file
```

## Setup

```bash
cd link_scrapper
python -m venv .venv
.venv\Scripts\Activate.ps1        # Windows (PowerShell)
# source .venv/bin/activate        # Linux/macOS
pip install -r requirements.txt
```

## Run Commands

```bash
# Run the main scraper
python src/scraper.py

# Run a specific tool
python tools/<tool_name>.py

# Run with a custom input file
python src/scraper.py --input data/queries.txt --output data/output.csv

# Run with logging
python src/scraper.py --log log/run.log
```

> Adjust the exact module/script names to match what lives in `src/` and `tools/`.
