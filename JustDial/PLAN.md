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
├── RUN.md                # Quick start guide
├── queries.json          # Source: 27 cities × 16 search terms (432 total)
├── scraper.py            # Main entry point
├── worker.py             # Worker logic (scrape one city subset)
├── output/               # City-wise CSV files
├── state/                # Per-worker resume checkpoints
│   ├── worker_1.json
│   ├── worker_2.json
│   ├── worker_3.json
│   ├── worker_4.json
│   └── worker_5.json
├── logs/                 # Runtime logs
│   ├── scraper.log
│   └── workers/          # Per-worker logs
└── html/                 # Reference HTML samples
    ├── target_demo.html
    └── full_demo.html
```

## Scraping Flow (per worker)
1. Load `queries.json`, pick assigned cities
2. For each city → each search term:
   - Check own `state/worker_{id}.json` → skip if completed
   - Build URL: `https://www.justdial.com/{City}/{slugified-term}`
     - Open page first, let autocomplete resolve the correct slug
     - If page shows 404/search-not-found, derive slug by removing stopwords, pluralizing, hyphenating
   - Wait for results container (select by `[class*="results_listing_container"]`)
   - Loop:
     - Scroll down → random wait 2–5s
     - Scrape new `.resultbox` items (select by `[class*="resultbox"]`)
     - Identify new items by unique `snt` / `data-keyid` / `id` attribute
     - Save incrementally to city CSV
     - Stop when 3 consecutive scrolls yield zero new `snt` values (or max 200 scrolls)
   - Mark term complete in own state file

## Data Extraction (per listing)
| Field | Source |
|---|---|
| Name | `[class*="resultbox_info"] div[title]` → text before address separator |
| Address | `[class*="resultbox_info"] div[title]` → text after separator |
| Rating | Inside `[class*="resultbox_info"]` star/rating element |
| Phone | Click phone reveal element → wait for number text to appear |
| Profile URL | `a` inside `[class*="resultbox_imagebox"]` → full `href` |
| Image URL | `img` inside slideshow → `src` (first slide) |

**Note**: JD uses hashed JSX class names (`jsx-4ff69b57a666abb8 resultbox_info`) that change per deploy. Always use attribute-contains selectors like `[class*="resultbox_info"]` instead of exact class names.

## Disaster Recovery
- **Granularity**: per (city, term). Each worker has own `state/worker_{id}.json`.
- **Mid-term crash**: Listings saved incrementally after each scroll cycle → max ~10–20 listings lost.
- **Resume**: On restart, load existing city CSV into dedup sets → skip already-saved rows by matching `snt/id`.
- **Logs**: timestamped entries per scroll cycle, error captured per term.

## Deduplication
- Track `seen_snt` (unique listing ID from attribute) + `seen_phones` sets per city
- Skip if `snt` is seen OR if phone matches a previously saved phone
- On resume, hydrate these sets from existing CSV rows

## Anti-Blocking
| Measure | Detail |
|---|---|
| Staggered workers | 30–90s random delay between each worker start |
| Random delays | 2–5s between scroll cycles (jittered ±30%) |
| Viewport variety | Randomize width (1280–1440) and height (720–900) per worker |
| User-agents | Rotate 10+ realistic desktop UAs across workers |
| Headed mode | `channel: "chrome"` with `headless: false` — JD detects headless |
| CAPTCHA check | Detect block page text / "unusual traffic" → skip term, log |
| Mouse emulation | Random mouse movement path before each scroll |
| Scroll cap | 200 max scrolls per term (~2000 listings) |
| Cookie persistence | Warm session cookies reused per worker |
| Proxy ready | Optional `--proxy` flag; if no proxy, serialize scroll speed higher |

## URL Slug Handling
JustDial uses plural/hyphenated slugs (e.g. `Event-Management-Companies` not `Event Management Company`). Strategy:
1. Navigate to `https://www.justdial.com/{City}/{term}` with spaces replaced by `-`
2. If the resulting page is a search/404, try common slug transformations
3. **Fallback**: derive slug from the browser's URL after the page auto-redirects

## Parallel Strategy (5 workers)
| Worker | Cities |
|---|---|
| 1 | Mumbai, Delhi, Gurugram, Noida, Bengaluru, Hyderabad |
| 2 | Pune, Kolkata, Ahmedabad, Goa, Lonavala, Lucknow |
| 3 | Indore, Bhopal, Bhubaneswar, Patna, Nagpur, Surat |
| 4 | Vapi, Vadodara, Raipur, Bilaspur, Udaipur |
| 5 | Jaipur, Jodhpur, Bikaner, Siliguri |

## Output
- `output/{City}.csv` — columns: `name,rating,address,phone,profile_url,image_url,search_term`
- All 16 terms for a city append into the same city CSV
- ~5,000–10,000+ listings per city expected
