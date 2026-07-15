# JustDial Scraper

Scrapes [JustDial](https://www.justdial.com) for event/wedding business leads across **25 Indian cities** (16 queries each). Two scraping methods + a dashboard.

---

## Prerequisites

- **Node.js 18+** (for `fetch` support)
- A browser (for userscript / bookmarklet methods)

## Quick Start

```bash
cd JustDial
node scraper.js --all
```

Scrapes all incomplete queries across all cities, resumes automatically via `state.json`. Output goes to `output/csv/`.

## CLI Reference

| Command | Description |
|---------|-------------|
| `node scraper.js --all` | Scrape all incomplete queries from `queries.json` |
| `node scraper.js --city Mumbai` | Scrape incomplete queries for a specific city |
| `node scraper.js Mumbai "Event Planner"` | Scrape a single city + query |
| `node scraper.js --serve [port]` | Start the dashboard (default port 3456) |
| `node scraper.js --list-pending` | List all incomplete queries |
| `node scraper.js --list-done` | List all completed queries |
| `node scraper.js --reset-state` | Clear all completion state |

## Dashboard

```bash
node scraper.js --serve
```

Open `http://localhost:3456` to view progress, toggle queries, and open JustDial search pages.

## Scraping Methods

### 1. Node.js Scraper (recommended)

Automated batch scraping with retry logic, 2s delay between pages, max 10 pages per query. Uses JustDial's internal `__NEXT_DATA__` API. Handles 403s with exponential backoff.

**Fields extracted:** name, phone, whatsapp, address, area, city, rating, reviews, categories, lat, lon, pincode, docid, weburl, images, verified, paid_status

### 2. Userscript (manual per-page)

Install `justdial-scraper.user.js` in Tampermonkey/Violentmonkey. Navigate to any JustDial listing page — a floating **"Scrape"** button appears in the bottom-right corner. Click it to download the current page as CSV.

### 3. Bookmarklet (manual per-page)

Drag this into your bookmarks bar (or create a bookmark with the minified code from `bookmarklet.min.txt`). Click it on any JustDial listing page to download the data.

---

## Output

- **Per-query CSVs:** `output/csv/{City}_{Query}.csv`
- **State tracking:** `state.json` — enables resume across crashes
- **Merged data:** `justdial_clean.csv` (combined output, if generated)

## Queries

25 cities × 16 queries = 400 total searches. Queries cover event management, wedding planning, corporate events, entertainment, and talent agencies. See `queries.json` for the full list.
