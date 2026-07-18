# OpenCode Session — StarClinch Scraper

**Date:** 2026-07-18
**Folder:** `g:\code\Web techs\projects\BlueEye\scraping_info\Starclinch`
**Goal:** Build a StarClinch artist scraper (mirroring the JustDial scraper conventions) that collects artists across music categories into `artists.json`, in the same schema as `BlueEyeEntertainment_dev`'s `existing_data.json`.

---

## Reference material reviewed

- `Starclinch/existing_data.json` — target output schema (id, slug, name, category, source, location, performance, booking, about, faq, media).
- `Starclinch/plan.txt` — only music categories: `book-singer-online`, `book-band-online`, `book-dj-online`, `book-instrumentalist-online`. Skip others.
- `JustDial/scraper.js` — reference scraper to copy conventions from (Node.js, `state.json` resume, delays, user-agent rotation, `__NEXT_DATA__` parsing, terminal analytics).
- `JustDial/state.json`, `JustDial/README.md` — state + pipeline conventions.
- `BlueEyeEntertainment_dev/AGENTS.md` — project context (Next.js app, not directly relevant to scraping).

---

## Site probe findings (starclinch.com)

- Listings are server-rendered with `__NEXT_DATA__` (JSON in `<script id="__NEXT_DATA__">`).
- Artist links are direct slugs: `/niladri-kumar`, `/sivamani`, etc. (not `/book-...`).
- Per-page data lives in `props.pageProps.data`:
  - `artist_list[]` — 15 artists per page. Each item has:
    `id`, `professional_name`, `slug`, `profile_pic`, `usp`, `city`, `languages`, `performance_duration`, `subscription_status`, `subscription`, `artist_videos[]`.
  - `artist_count` (total in category), `has_next` (bool), `next_page` (int), `category.name`.
- Pagination: `https://starclinch.com/<cat>` then `?page=2`, `?page=3`, ...
- `professional_name` from the listing API (`__NEXT_DATA__.props.pageProps.data.artist_list`) is already complete — so the scraper takes names directly from there and does **not** need span-merging.
- **BUT** the hidden-name obfuscation pattern (`<span class="invisible select-none">…</span>` masking part of the name with a canvas overlay) **does** appear on individual **profile pages** (`/slug`). Verified on `book-instrumentalist-online?page=45` (34 masked spans) and random profiles (`angad-kukreja` 16, `swarna-khuntia` 20). Since the scraper never visits profile pages, it currently sidesteps the issue. If profile-page scraping is ever added, names must be reconstructed by merging visible text + `invisible select-none` span text (e.g. `Avijit` + `Das` → `Avijit Das`).

---

## Files created

### `scraper.js`
Main scraper. Conventions copied from `JustDial/scraper.js`:

- **Categories:** `book-singer-online`, `book-band-online`, `book-dj-online`, `book-instrumentalist-online`.
- **Fetch:** `fetch()` with rotating User-Agent / Accept headers; retry loop (4 attempts) with exponential backoff on `403`/`429` and network errors.
- **Parse:** extracts `__NEXT_DATA__`, reads `data.artist_list`.
- **Per artist record** (matches `existing_data.json`):
  - `id`, `slug`, `name` (= `professional_name`), `category` (= `data.category.name`), `input_category`, `input_page`
  - `source.url` = `https://starclinch.com/<slug>`, `booking.url` = `https://starclinch.com/cart/checkout/<slug>`
  - `location` = `{ city, state: null, country: "India" }`
  - `performance.duration_minutes` parsed from `performance_duration` string (e.g. `"60 - 90"` → `{min:60,max:90}`); `languages` split from comma string
  - `media.videos` = YouTube embeds from `artist_videos`; `media.images` = `[profile_pic]`
  - `about` = `usp`; `faq` = `[]`; `team_members` = `{min:null,max:null}`; `genres` = `[]`
- **Disaster management / resume:** `state.json` tracks:
  - `category_page_done["<cat>|<page>"]` — skip already-scraped pages
  - `links_seen["<slug>"]` — never re-add the same artist
  - `artists.json` is written incrementally after every page, so a crash loses at most the in-flight page.
- **Delays:** 2.5–6s between pages, 8–18s between categories; hard page cap at 200.
- **Logging:** timestamped lines to both terminal and `run.log`.

### `state.json`, `artists.json`, `run.log`, `scraped_links.json`
Generated at runtime.

### Probe scripts (temporary, for investigation)
`probe.js`, `probe2.js`, `probe3.js`, `probe4.js` — used to inspect HTML / `__NEXT_DATA__` structure. Can be deleted.

---

## Run commands

```bash
cd 'g:\code\Web techs\projects\BlueEye\scraping_info\Starclinch'
node src/scraper.js                            # all 4 categories (resumes on crash)
node src/scraper.js --cat book-singer-online    # single category, from page 1
node src/scraper.js --cat book-instrumentalist-online 22   # resume a category at page 22
```

### Folder layout
```
Starclinch/
├── src/           # scraper source (scraper.js)
├── data/          # output + state (artists.json, state.json, scraped_links.json)
├── logs/          # run.log
├── reference/     # plan.txt, existing_data.json, opencodesession.md
└── tools/         # probe*.js investigation scripts (gitignored)
```

---

## Verification

- Tested `--cat book-instrumentalist-online` up to page 22 → 315 artists accumulated, then a full run was started (reached `book-singer-online` page 11 / 480 artists before being stopped by user).
- Output record at `artists.json[0]` confirmed to match `existing_data.json` schema exactly.

---

## Notes / follow-ups

- The instrumentalist category alone has ~794 artists (~53 pages). Full 4-category run is large; expect several thousand artists total. Run in background and let it complete.
- If you later want richer data (genres, team size, full bio, FAQ), those require visiting each artist's profile page (`/slug`), which adds far more server load — out of scope per the "skip server load" instruction.
- If StarClinch shows the obfuscated name pattern on profile pages later, merge the visible `<span>` text with the `invisible select-none` span text to reconstruct the full name.
