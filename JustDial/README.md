# JustDial Scraper

Scrapes [JustDial](https://www.justdial.com) for event/wedding business leads across **27 Indian cities** (16 queries each). Includes scraping engine, data processing pipeline, and analytical reports.

**Tracked size (excl. gitignored data):** 8.24 MB

> `output/csv/` and `output/raw_merged_data/` are gitignored at parent repo level — they are regeneratable (see Pipeline section).

---

## Full File & Folder Structure

```
JustDial/                                          (root, 8.24 MB tracked)
│
├── scraper.js                  # Node.js scraper engine (main)
├── queries.json                # 432 city+query combinations
├── state.json                  # Scraping progress state (auto-resume)
├── clean_csv.py                # Data processing: merge + dedup + split
├── analyse_csv.py              # Analysis: generates MD reports
├── bookmarklet.js              # Manual scrape via bookmarklet
├── bookmarklet.min.txt         # Minified bookmarklet code
├── justdial-scraper.user.js    # Tampermonkey userscript
├── dashboard.html              # Scraping progress dashboard
├── demo.html                   # Demo page
├── README.md                   # This file
│
└── output/ (7.49 MB tracked)
    ├── csv/ (gitignored)       # 432 raw scraped files
    │   ├── ahmedabad_event-planner.csv
    │   ├── bengaluru_wedding-decorator.csv
    │   ├── delhi_event-organizer.csv
    │   ├── mumbai_talent-agency.csv
    │   ├── pune_artist-management-company.csv
    │   └── ... (432 total)
    ├── raw_merged_data/ (gitignored)  # 27 merged city CSVs
    │   ├── ahmedabad.csv
    │   ├── mumbai.csv
    │   ├── delhi.csv
    │   ├── pune.csv
    │   ├── bengaluru.csv
    │   └── ... (27 total)
    ├── cleaned_data/ (4.3 MB)
    │   ├── with_number/ (3.1 MB, 27 files)
    │   │   ├── ahmedabad_cleaned.csv
    │   │   ├── bengaluru_cleaned.csv
    │   │   ├── bhopal_cleaned.csv
    │   │   ├── bhubaneswar_cleaned.csv
    │   │   ├── bikaner_cleaned.csv
    │   │   ├── bilaspur_cleaned.csv
    │   │   ├── delhi_cleaned.csv
    │   │   ├── goa_cleaned.csv
    │   │   ├── gurugram_cleaned.csv
    │   │   ├── hyderabad_cleaned.csv
    │   │   ├── indore_cleaned.csv
    │   │   ├── jaipur_cleaned.csv
    │   │   ├── jodhpur_cleaned.csv
    │   │   ├── kolkata_cleaned.csv
    │   │   ├── lonavala_cleaned.csv
    │   │   ├── lucknow_cleaned.csv
    │   │   ├── mumbai_cleaned.csv
    │   │   ├── nagpur_cleaned.csv
    │   │   ├── noida_cleaned.csv
    │   │   ├── patna_cleaned.csv
    │   │   ├── pune_cleaned.csv
    │   │   ├── raipur_cleaned.csv
    │   │   ├── siliguri_cleaned.csv
    │   │   ├── surat_cleaned.csv
    │   │   ├── udaipur_cleaned.csv
    │   │   ├── vadodara_cleaned.csv
    │   │   └── vapi_cleaned.csv
    │   └── without_number/ (1.0 MB, 27 files)
    │       ├── ahmedabad_cleaned.csv
    │       ├── bengaluru_cleaned.csv
    │       ├── bhopal_cleaned.csv
    │       ├── bhubaneswar_cleaned.csv
    │       ├── bikaner_cleaned.csv
    │       ├── bilaspur_cleaned.csv
    │       ├── delhi_cleaned.csv
    │       ├── goa_cleaned.csv
    │       ├── gurugram_cleaned.csv
    │       ├── hyderabad_cleaned.csv
    │       ├── indore_cleaned.csv
    │       ├── jaipur_cleaned.csv
    │       ├── jodhpur_cleaned.csv
    │       ├── kolkata_cleaned.csv
    │       ├── lonavala_cleaned.csv
    │       ├── lucknow_cleaned.csv
    │       ├── mumbai_cleaned.csv
    │       ├── nagpur_cleaned.csv
    │       ├── noida_cleaned.csv
    │       ├── patna_cleaned.csv
    │       ├── pune_cleaned.csv
    │       ├── raipur_cleaned.csv
    │       ├── siliguri_cleaned.csv
    │       ├── surat_cleaned.csv
    │       ├── udaipur_cleaned.csv
    │       ├── vadodara_cleaned.csv
    │       └── vapi_cleaned.csv
    ├── backup/
    │   └── csv_b.zip (3 MB)
    ├── raw_merged_data_report.md
    └── cleaned_data_report.md
```

---

## File Reference — What Each Does

### Scraping (Priority: HIGH — run this first)

| File | What it does |
|------|-------------|
| `scraper.js` | Node.js scraper — scrapes JustDial via `__NEXT_DATA__` API. Auto-resumes via `state.json`. Run `node scraper.js --all` to scrape everything. |
| `queries.json` | Configuration — 432 city+query combinations (27 cities x 16 categories). |
| `state.json` | Auto-generated state — tracks which queries are completed so scraper can resume after crash. |
| `bookmarklet.js` / `bookmarklet.min.txt` | Manual scraping — drag minified code into a bookmark, click on any JustDial listing page to download CSV. |
| `justdial-scraper.user.js` | Tampermonkey userscript — install in browser, navigates to JustDial listing, click "Scrape" button to download. |

### Data Processing (Priority: MEDIUM — run after scrape completes)

| File | What it does |
|------|-------------|
| `clean_csv.py` | Reads `output/csv/`, creates `raw_merged_data/` (merged per city, no dedup) + `cleaned_data/with_number/` (deduped, has phone) + `cleaned_data/without_number/` (deduped, no phone). Also prefixes `weburl` with `https://www.justdial.com/`. |
| `analyse_csv.py` | Reads all output folders, generates `raw_merged_data_report.md` (raw stats + duplicate analysis) + `cleaned_data_report.md` (cleaned stats with/without phone breakdown). |

### Other

| File | What it does |
|------|-------------|
| `dashboard.html` | Scraping progress dashboard — shows status of all 432 queries. |
| `demo.html` | Demo page for showcasing scrape results. |

---

## Pipeline (Recommended Order)

```bash
# Step 1 — Scrape raw data (takes longest)
node scraper.js --all

# Step 2 — Process: merge + dedup + split by phone
python clean_csv.py

# Step 3 — Analyse: generate MD reports
python analyse_csv.py
```

---

## Scraping Commands

| Command | Description |
|---------|-------------|
| `node scraper.js --all` | Scrape all incomplete queries |
| `node scraper.js --city Mumbai` | Scrape a specific city |
| `node scraper.js Mumbai "Event Planner"` | Scrape single city+query |
| `node scraper.js --serve` | Dashboard at `localhost:3456` |
| `node scraper.js --list-pending` | Show pending queries |
| `node scraper.js --list-done` | Show completed queries |
| `node scraper.js --reset-state` | Clear all state (re-scrape everything) |

---

## Data Stats

| Dataset | Files | Rows | Size | Tracked? |
|---------|-------|------|------|----------|
| Raw scraped (`csv/`) | 432 | 43,200 | 43.6 MB | No (gitignored) |
| Merged per city (`raw_merged_data/`) | 27 | 43,200 | 43.6 MB | No (gitignored) |
| Cleaned with phone (`with_number/`) | 27 | 2,990 | 3.1 MB | Yes |
| Cleaned without phone (`without_number/`) | 27 | 1,185 | 1.0 MB | Yes |
| Backup (`backup/csv_b.zip`) | 1 | — | 3.0 MB | Yes |

### Dedup Details

- **Key:** `(name, phone)` — case-insensitive name, exact phone match
- **Rate:** 90.3% duplicates removed (39,025 of 43,200 rows)
- **Weburl fix:** `https://www.justdial.com/` prepended to all entries in cleaned data

---

## Queries

27 cities x 16 categories = 432 searches:

artist-management-company, corporate-event-management-company, corporate-event-planner, destination-wedding-planner, entertainment-agency, event-agency, event-management-company, event-organizer, event-planner, event-production-company, talent-agency, wedding-decorator, wedding-designer, wedding-management-company, wedding-organizer, wedding-planner

See `queries.json` for the full city list.
