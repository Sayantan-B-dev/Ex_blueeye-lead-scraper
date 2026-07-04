# Google Maps Lead Scraper

Scrapes Google Maps for event/wedding businesses. Two scopes: **27 Indian cities** (legacy) and **59 countries** (global).

---

## Global Scrape (59 Countries)

**Location:** `Global_scrape_map/`

Scrapes 59 countries using gosom Docker containers (4 parallel, fast mode). 26,143 queries, 2,011 state-level batches.

### Run

```bash
cd Global_scrape_map
./run.bat
```

### Email Enrichment

Async email extractor (aiohttp, 50 concurrent):

```bash
cd Global_scrape_map\email_scraper
python clean.py                  # Remove rows missing phone AND website
python scrapper.py --fast        # Homepage-only email extraction
python scrapper.py               # Shallow crawl on remaining
```

Auto-resume via logs. Outputs to `no_missing_emails/`.

### Results

| Metric | Value |
|--------|-------|
| Countries | 59 |
| Total leads | 74,128 |
| Missing only phone | 3,229 |
| Missing only website | 15,620 |
| Missing both | 3,038 |
| Total CSV size | ~35 MB |

---

## India Scrape (27 Cities)

Two independent methods for 2,025 queries across 27 Indian cities.

### Method 2: gosom Docker (Go) — Primary

**Location:** `method2/`

Uses [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper).

```bash
cd method2
./run.sh
```

| Feature | Detail |
|---------|--------|
| Results/query | ~80–180 (depth 20) |
| Email extraction | `-email` flag |
| Resume | Skips batch if CSV has data |
| Columns | 33+ fields |
| Speed | ~5–8 min/query |

**P1 complete:** 5,874 leads in `p1_final.csv`.

### Method 1: Playwright (Python)

**Location:** `method1/`

```bash
cd method1
python run_all.py --phase 1
```

### Method 3: Email Extractor (Legacy)

**Location:** `taskFetchEmail/`

```bash
cd taskFetchEmail
python scraper_v1.py
```

---

## Directory Structure

```
scraping_info/
├── README.md                     # This file
├── AGENTS.md                     # Full project state & conventions
├── DEPLOY.md                     # Cloud deployment guide
├── .gitignore
├── method1/                      # Playwright scraper (India cities)
├── method2/                      # gosom Docker scraper (India P1 done)
├── taskFetchEmail/               # Legacy email enrichment (requests)
└── Global_scrape_map/            # Global 59-country scraper
    ├── global_scraper/
    │   ├── run.py                # Docker orchestrator
    │   ├── split_queries.py      # Batch generator
    │   ├── geo_data.py           # Country coordinates
    │   ├── analytics.py          # Lead quality report
    │   └── output/               # Per-country CSVs (gitignored)
    └── email_scraper/
        ├── scrapper.py           # Async email extractor (aiohttp)
        ├── clean.py              # Removes rows with no phone/website
        ├── analytics.py          # Email-less analytics
        ├── missing_emails/        # (gitignored)
        ├── cleaned_missing_emails/ # (gitignored)
        ├── no_missing_emails/     # (gitignored)
        └── logs/                 # (gitignored)
```

## Quick Start

```bash
# Global scrape (59 countries)
cd Global_scrape_map
./run.bat

# Clean and enrich emails
cd email_scraper
python clean.py
python scrapper.py --fast
python scrapper.py
```

View CSVs by opening `method2/view.html` in a browser and dragging the file in.

## Acknowledgments

- **[gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper)** — MIT-licensed Go tool. ⭐ the repo if you find it useful!
