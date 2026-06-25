# AGENTS.md — Project State & Conventions

## Goal
Scrape Google Maps for event/wedding business leads across **27 Indian cities**, 2,025 queries total. Two independent methods.

---

## Structure

```
scraping_info/
├── DEPLOY.md          # Cloud deployment guide
├── AGENTS.md          # This file
├── README.md          # Project overview
├── method1/           # Playwright (Python) — custom scraper
│   ├── scraper.py     # Core: CLI args, profiles, resume, headless, email
│   ├── run_all.py     # Orchestrator: parallel scrapers (default: 3)
│   ├── split_batches.py  # Reads priority_*.txt → batches/p{1,2,3}/*.txt
│   ├── merge.py       # Merge CSVs, dedup (name+phone+address), quality report
│   ├── batches/p{1,2,3}/  # City batch files (p1_Mumbai.txt, etc.)
│   ├── output/csv/p{1,2,3}/   # CSVs + .done files
│   ├── output/logs/p{1,2,3}/  # Log files
│   ├── profiles/      # Chrome persistent profiles
│   ├── view.html      # CSV drag-drop viewer + live dashboard
│   ├── details.html   # Minimal batch viewer
│   └── priority_{1,2,3}_queries.txt  # Source query files
└── method2/           # gosom Docker (Go)
    ├── run.sh         # Parallel Docker runner (--concurrent N)
    ├── run.bat        # Windows CMD runner
    ├── run.ps1        # PowerShell runner
    ├── merge.py       # Merge + dedup (title+phone) + quality report
    ├── view.html      # CSV viewer with pagination (100/page)
    ├── batches/       # batch_00.txt..batch_08.txt (48 queries each)
    ├── output/        # batch_00.csv..batch_08.csv + final.csv
    ├── logs/          # batch_00.log..batch_08.log
    ├── queries.txt    # All 432 P1 queries
    ├── p1_final.csv   # Merged final output (5,874 leads)
    └── backup/        # Old backups
```

---

## Methods Comparison

| | Method 1 (Playwright) | Method 2 (gosom Docker) |
|---|---|---|
| Engine | Python + Playwright | Go + Docker |
| Queries | 2,025 (P1:432, P2:324, P3:1269) | 432 (P1 only, but richer fields) |
| Batch style | Per-city: 27 files per priority | Per-group: 9 files of 48 queries |
| Results/query | 60–180 | ~80–180 |
| Fields/lead | 11 | 33+ (emails, coords, reviews, etc.) |
| Resume | Per-query (.done file) | Per-batch (CSV has data check) |
| Concurrency | 3 parallel browsers (default) | 3 parallel containers, each -c 4 |
| Speed | ~2–4 min/query | ~5–8 min/query (depth 20 + email) |
| Total leads (P1) | N/A | **5,874** (merged, deduped) |

---

## Quick Commands

### Method 1
```bash
cd method1
python split_batches.py                         # generate city batches
python run_all.py --phase 1                     # scrape P1 (3 scrapers)
python run_all.py --phase 1 --max-concurrent 5  # faster, more CPU
python merge.py                                 # merge all CSVs
```

### Method 2
```bash
cd method2
./run.sh                          # 3 parallel Docker containers
./run.sh --concurrent 2           # lighter on CPU
python merge.py                   # merge batch_*.csv → final.csv
```

### Merge
```bash
# Method 1
python method1/merge.py

# Method 2
python method2/merge.py
```

---

## State

- **P1 method2 scraping:** ✅ Complete — 5,874 leads in `method2/p1_final.csv` (9 batches, 0.8% duplicates)
- **P1 method1:** 🔄 Not started
- **P2, P3:** ❌ Not started (both methods)
- **Deploy:** Ready for cloud via DEPLOY.md

---

## Key Conventions

| Rule | Detail |
|------|--------|
| Legacy file | `method1/google_maps_leads.csv` — **NEVER modify** |
| Runtime dirs | `output/`, `profiles/`, `logs/`, `batches/` — gitignored, auto-created |
| Batch naming | `p{phase}_{City}.txt` (method1), `batch_{nn}.txt` (method2) |
| Output nesting | `output/csv/p{phase}/` + `output/logs/p{phase}/` (method1) |
| Dedup method1 | `(name, phone, address)` |
| Dedup method2 | `(title, phone)` |
| PC temps | 70–75°C is safe; throttle at 95–100°C |

---

## Scenario: User asks "what did we do so far?"

**Answer this concisely:** We scraped P1 using method2 (gosom Docker) — 9 batches, 5,874 leads merged. Method 1 is ready but unused. P2/P3 pending. DEPLOY.md guides cloud deployment. View results by opening `method2/view.html` in a browser and dragging `p1_final.csv`.

---

## Scenario: User asks to resume P1 method2

**Answer:** Already done — `method2/p1_final.csv` has 5,874 leads. No resume needed.

---

## Scenario: User wants to scrape more

1. **Method 1 P1:** `cd method1 && python run_all.py --phase 1` (generates city batches first if needed)
2. **Method 2 P2/P3:** Would need new query files and batches for method2. Currently only P1 queries exist in `method2/queries.txt`.
