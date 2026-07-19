# BlueEye — Lead Scraping & Data Pipeline

A multi-source lead-generation toolkit that scrapes business/artist profiles from **Google Maps** (India + global), **JustDial**, and **StarClinch**, then enriches them with emails, migrates images to ImageKit, and produces analytics dashboards.

---

## What's in this repo

| Module | Source | Scope | Engine | Status |
|--------|--------|-------|--------|--------|
| `Global_scrape_map/` | Google Maps | 59 countries, 26,143 queries | gosom Docker (Go) | ✅ 74,128 leads |
| `method1/` + `method2/` | Google Maps | 27 Indian cities | Playwright (Py) / gosom Docker | P1 done (5,874 leads) |
| `taskFetchEmail/` | Emails | Enrich Maps leads | Python + requests | 🔄 running |
| `JustDial/` | JustDial | 27 Indian cities, 432 queries | Node.js scraper | ✅ 4,175 cleaned leads |
| `Starclinch/` | StarClinch | Artist profiles | Node.js + ImageKit | ✅ migration done |
| `clean_data.py` | — | Merge/dedup JustDial CSVs | Python utility | ✅ |

---

## Global Scrape — Google Maps (59 Countries)

**Location:** `Global_scrape_map/`

Scrapes 59 countries using gosom Docker containers (4 parallel, fast mode). 26,143 queries, 2,011 state-level batches. **74,128 leads** collected.

### Pipeline

```bash
# 1. Docker scrape (59 countries)
cd Global_scrape_map
./run.bat

# 2. Clean rows without phone + website
cd email_scraper
python clean.py

# 3. Email enrichment (recommended: both passes)
python scrapper.py --both       # fast → deep, fully automatic

# 4. Analytics dashboard
python analytics.py --source no_missing_emails
```

### Scraper Modes

| Command | Input | Scrape | Target |
|---------|-------|--------|--------|
| `scrapper.py --fast` | `cleaned_missing_emails/` | Homepage only | All rows without email |
| `scrapper.py --deep` | `no_missing_emails/` | Shallow (up to 5 pages) | Rows still missing email |
| `scrapper.py --both` | Both in sequence | fast → deep | Full pipeline, one command |

Auto-resume via CSV — crash-safe, no `--resume` flag needed.

### Analytics

Rich dashboard with per-country breakdowns, coverage, website status, email performance, intersections, and top domains. Generates `report.txt` + `report.csv`.

```bash
python analytics.py --source no_missing_emails          # post-email-enrichment (default)
python analytics.py --source missing_emails             # raw email scrape output
python analytics.py --source cleaned_missing_emails      # pre-enrichment
```

### Results (post-enrichment)

| Metric | Value |
|--------|-------|
| Countries | 59 |
| Total leads | 71,090 (after clean) |
| Has website | 55,470 (78.0%) |
| Has phone | 67,861 (95.5%) |
| Has email | 32,811 (46.2%) |
| All three | 31,046 (43.7%) |
| Email hit rate | 59.2% of websites |
| Total CSV size | ~35 MB |

---

## India Scrape — Google Maps (27 Cities)

### Method 2: gosom Docker (Go) — Primary

**Location:** `method2/`

**P1 complete:** 5,874 leads. Uses [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper).

```bash
cd method2
./run.sh
```

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

## JustDial Scraper (`JustDial/`)

Scrapes [JustDial](https://www.justdial.com) for event/wedding business leads across **27 Indian cities** (16 categories each = 432 queries). Includes a Node.js scraping engine, a data-processing pipeline, and analytical reports.

### Pipeline

```bash
# 1. Scrape raw data (longest step, auto-resumes via state.json)
cd JustDial
node scraper.js --all

# 2. Merge + dedup + split by phone
python clean_csv.py

# 3. Generate MD analysis reports
python analyse_csv.py
```

Other entry points: `node scraper.js --city Mumbai`, `node scraper.js --serve` (dashboard), `node scraper.js --list-pending`.

### Data Stats

| Dataset | Files | Rows | Tracked? |
|---------|-------|------|----------|
| Raw scraped (`csv/`) | 432 | 43,200 | No (gitignored) |
| Merged per city (`raw_merged_data/`) | 27 | 43,200 | No (gitignored) |
| Cleaned with phone (`with_number/`) | 27 | 2,990 | Yes |
| Cleaned without phone (`without_number/`) | 27 | 1,185 | Yes |

Dedup key: `(name, phone)` — 90.3% duplicates removed (39,025 of 43,200).

### Top-level merge utility

`clean_data.py` (repo root) merges all `JustDial/output/csv/*.csv` files into a single deduped `JustDial/justdial_clean.csv` with normalized city names.

```bash
python clean_data.py
```

---

## StarClinch Artist Migration (`Starclinch/`)

Scrapes artist profiles from StarClinch and migrates their image assets into ImageKit. Two sub-projects:

### Link Scraper (`Starclinch/link_scrapper/`)
Crawls StarClinch category pages and collects artist profile URLs + raw data into `data/artists.json` and `data/state.json`.

### Data Modifier Pipeline (`Starclinch/data_modifier/`)

7-stage migration pipeline that cleans the scraped artist data and migrates images to ImageKit.

| Stage | Script | Purpose | Status |
|-------|--------|---------|--------|
| 1 | `1_remove_duplicates.js` | Dedupe artists | ✅ |
| 2 | `2_rename_categories.js` | Normalize category names | ✅ |
| 3 | `3_split_null_free.js` | Split null-free subset | ✅ |
| 4 | `4_image_migrate.js` | **ImageKit image migration** (consolidated, resume-safe, reuse-existing) | ✅ |
| 5 | `5_anti_copyright.js` | Anti-copyright check | 🔲 stub |
| 6 | `6_final_verification_before_uploading.js` | Pre-upload verification | 🔲 stub |
| 7 | `7_upload_to_db.js` | Upload to DB | 🔲 stub |

Stage 4 produces `output_json/4_imaged_migration_final.json` (9,012 records, 0 foreign links, 89 blanked dead-link failures).

```bash
cd Starclinch/data_modifier
npm install
node scripts/4_image_migrate.js      # run the core migration
# open view.html and point config.js at the output JSON to browse results
```

> Generated outputs in `output_json/` and `input_data/` are gitignored (reproducible from scripts). `.env` holds ImageKit keys.

---

## Directory Structure

```
scraping_info/
├── README.md
├── AGENTS.md
├── DEPLOY.md
├── .gitignore
├── clean_data.py                  # Merge/dedup JustDial CSVs → justdial_clean.csv
├── data/                         # Data archives (gitignored)
├── method1/                      # Playwright scraper (India cities)
├── method2/                      # gosom Docker scraper (India P1 done)
├── taskFetchEmail/               # Legacy email enrichment
├── JustDial/                     # JustDial scraper (27 cities, 432 queries)
│   ├── scraper.js                # Node.js scraping engine
│   ├── clean_csv.py / analyse_csv.py
│   └── output/                   # csv/ + cleaned_data/ (gitignored runtime)
├── Starclinch/                   # StarClinch artist scrape + ImageKit migration
│   ├── link_scrapper/            # Artist URL/data crawler
│   └── data_modifier/            # 7-stage migration pipeline (scripts/ + view.html)
└── Global_scrape_map/            # Global 59-country scraper
    ├── run.bat / run.ps1         # Convenience launchers
    ├── country.txt               # 59 target countries
    ├── data_tags.json            # 13 search tags
    ├── states.json               # Country → state subdivisions
    ├── queries.json              # 26,143 queries
    ├── expand_country.py         # Generate states.json
    ├── generate_queries.py       # Generate queries.json
    ├── global_scraper/
    │   ├── run.py                # Docker orchestrator
    │   ├── split_queries.py      # Batch generator
    │   ├── geo_data.py           # Country coordinates
    │   ├── analytics.py          # Lead quality report
    │   ├── batches/              # (gitignored)
    │   ├── output/               # (gitignored) Per-country CSVs
    │   └── logs/                 # (gitignored)
    └── email_scraper/
        ├── scrapper.py           # Async email extractor
        ├── clean.py              # Remove rows with no phone/website
        ├── analytics.py          # Full analytics dashboard
        ├── report.csv / .txt     # Generated reports
        ├── missing_emails/        # (gitignored)
        ├── cleaned_missing_emails/ # (gitignored)
        ├── no_missing_emails/     # (gitignored)
        └── logs/                 # (gitignored)
```

## Quick Start

```bash
# Global scrape → clean → enrich → analyze
cd Global_scrape_map
./run.bat
cd email_scraper
python clean.py
python scrapper.py --both
python analytics.py
```

## Acknowledgments

- **[gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper)** — MIT-licensed Go tool. ⭐ the repo if you find it useful!
