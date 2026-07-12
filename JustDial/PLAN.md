# JustDial Scraper — Plan

## Objective
Scrape 27 Indian cities × 16 search terms (432 combos) from justdial.com. Extract name, rating, address, phone, profile link, image URL per listing. Output: 27 city-wise CSV files.

## Source Data
- `queries.json` — 27 cities, each with 16 search queries (e.g. `"Event Management Company in Mumbai"`)
- Derived from `search_term.txt` (16 terms) + `cities.txt` (27 unique cities)

## Tech Stack
- **Python 3** + **Playwright** (Chromium, headed mode with `channel: "chrome"`)
- **5 parallel workers** via `multiprocessing`
- Each worker owns a subset of cities (5–6 each)
- No Docker — no speed benefit, adds overhead

## Folder Structure
```
JustDial/
├── PLAN.md               # This file
├── queries.json          # Source: 27 cities × 16 search terms (432 total)
├── scraper.py            # Main entry point
├── worker.py             # Worker logic (scrape one city subset)
├── output/               # City-wise CSV files (one per city, appended across 16 terms)
├── state/                # Resume checkpoints
│   └── progress.json     # Per-term completion tracking
├── logs/                 # Runtime logs
│   ├── scraper.log       # Master log
│   └── workers/          # Per-worker logs
├── target_demo.html      # Reference: single listing card
└── full_demo.html        # Reference: full page HTML
```

## Scraping Flow (per worker)
1. Load `queries.json`, pick assigned cities
2. For each city → each search term:
   - Check `state/progress.json` → skip if completed
   - Build URL: `https://www.justdial.com/{City}/{slugified-term}`
   - Open page, wait for `.results_listing_container`
   - Loop: scroll down → wait 2–3s → scrape new `.resultbox` items → save incrementally to city CSV
   - Stop when no new listings appear for 3 consecutive scrolls (or max 200 scrolls)
   - Mark term complete in `state/progress.json`

## Data Extraction (per listing)
| Field | Source |
|---|---|
| Name | `resultbox_info div[title]` → extract before address separator |
| Address | `resultbox_info div[title]` → extract after separator |
| Rating | Inside `resultbox_info` star element |
| Phone | Inside `resultbox_info` — may need click to reveal |
| Profile URL | `a` inside `resultbox_imagebox` → full `href` |
| Image URL | `img` inside slideshow → `src` attribute |

## Disaster Recovery
- **Granularity**: per (city, term). `state/progress.json` tracks completion.
- **Mid-term crash**: Listings saved incrementally after each scroll cycle → max ~20 listings lost.
- **Resume**: On restart, load existing CSVs into dedup sets → skip already-saved rows.
- **Logs**: timestamped entries per scroll cycle, error captured per term.

## Deduplication
- Track `seen_names` and `seen_phones` sets per city (loaded from existing CSV on resume)
- Skip if **name** matches OR **phone** matches (normalized, stripped)

## Anti-Blocking
| Measure | Detail |
|---|---|
| Staggered workers | 30–90s random delay between each worker start |
| Random delays | 3–8s between scroll cycles |
| Viewport variety | Randomize per worker |
| User-agents | Rotate realistic desktop UAs |
| Headed mode | `channel: "chrome"` with `headless: false` |
| CAPTCHA check | Detect block page text → skip term, log |
| Mouse emulation | Random mouse movement before each scroll |
| Scroll cap | 200 max scrolls per term (~2000 listings) |

## Parallel Strategy (5 workers)
| Worker | Cities |
|---|---|
| 1 | Mumbai, Delhi, Gurugram, Noida, Bengaluru, Hyderabad |
| 2 | Pune, Kolkata, Ahmedabad, Goa, Lonavala, Lucknow |
| 3 | Indore, Bhopal, Bhubaneswar, Patna, Nagpur, Surat |
| 4 | Vapi, Vadodara, Raipur, Bilaspur, Udaipur |
| 5 | Jaipur, Jodhpur, Bikaner, Siliguri |

## Output
- `output/{City}.csv` — one file per city, columns: `name,rating,address,phone,profile_url,image_url,search_term`
- All 16 terms for a city append into the same city CSV
- ~5,000–10,000+ listings per city expected
