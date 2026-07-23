# data_modifier

Post-processing pipeline for the Starclinch artist scrape. It cleans the raw
scraped data (`artists.json`) into DB-upload-ready JSON, without ever mutating
the source files.

## Important rules

- **Never edit** `artists.json` or `existing_data.json` at the project root —
  they are the raw sources. They are copied read-only into `input_data/`.
- All transformation scripts live in `scripts/` and define the naming
  conventions for inputs/outputs.
- All generated JSON goes to `output_json/`; all reports/logs go to `logs/`.
- Scripts are run **manually**, in order (no orchestrator file). Each script
  reads the previous script's output.

## Folder structure

```
data_modifier/
├── artists.json            # RAW scrape source (DO NOT EDIT)
├── existing_data.json      # App DB snapshot (DO NOT EDIT)
├── README.md
├── .env                    # API keys & config (gitignored)
├── .env.example            # Template for .env
├── input_data/             # Read-only copies of the two sources
│   ├── artists.json
│   └── existing_data.json
├── 6_view.html             # Card viewer for final data
├── scripts/                # All transformation scripts (run manually, in order)
│   ├── 1_remove_duplicates.js
│   ├── 2_rename_categories.js
│   ├── 3_split_null_free.js
│   ├── 4_image_migrate.js         # ImageKit image migration
│   ├── 5_anti_copyright.js        # AI-powered about text rewriting
│   ├── 5.2_data_preparance.js     # Merge abouts + fix URLs → 5_copyright_free.json
│   ├── 6_final_verification_before_uploading.js  # Comprehensive verification vs MongoDB
│   ├── 7_upload_to_db.js          # STUB (MongoDB upload)
│   └── ai-services/               # AI provider adapters
│       ├── index.js               # Provider factory (reads AI_PROVIDER)
│       ├── gemini.js              # Gemini provider
│       └── openrouter.js          # OpenRouter provider
├── output_json/            # Generated outputs (one file per script)
│   ├── no_duplicate_artists.json
│   ├── 2_renamed_data.json
│   ├── 3_null_free.json
│   ├── extra.json
│   ├── 4_imaged_migration_final.json      # step 4 final (9012 records, 0 foreign links)
│   ├── 5_copyright_free.json              # step 5.2: merged + URLs cleaned (9,012)
│   └── 6_final_data.json                  # copy of 5_copyright_free.json for viewer/upload
└── logs/                   # Reports & progress checkpoints
    ├── 1_remove_duplicates_report.json
    ├── 2_rename_categories_report.json
    ├── 3_split_null_free_report.json
    ├── 4_image_migrate_progress.json
    ├── 4_image_migrate_extra_progress.json
    ├── 5_abouts.json               # Extracted about texts (step 5 input)
    ├── 5_modified_abouts.json      # AI-rewritten abouts (step 5 output)
    ├── 5_gemini_progress.json      # Resume checkpoint (step 5)
    ├── 5_gemini_failed.json        # Permanent failures log (step 5)
    └── 5_anti_copyright.log        # Step 5 run log
```

## Pipeline (data flow)

```
artists.json
   │  scripts/1_remove_duplicates.js
   ▼
no_duplicate_artists.json        (dedup within + vs existing_data)
   │  scripts/2_rename_categories.js
   ▼
2_renamed_data.json              (normalize category casing)
   │  scripts/3_split_null_free.js
   ▼
3_null_free.json  +  extra.json  (split: complete vs missing fields)
   │  scripts/4_image_migrate.js
   ▼
4_imaged_migration_final.json    (image URLs migrated to ImageKit)
   │  scripts/5_anti_copyright.js
   ▼
logs/5_modified_abouts.json      (about texts rewritten via AI — 9,008 rewritten, 0 fail)
   │  scripts/5.2_data_preparance.js
   ▼
output_json/5_copyright_free.json (merged abouts + blueeye URLs — 9,012 records)
   │  scripts/6_final_verification_before_uploading.js
   ▼
Verdict: ⚠️ PASS WITH WARNINGS     (verified vs MongoDB, 5 warnings, 0 issues)
   │  scripts/7_upload_to_db.js   [next — not yet implemented]
   ▼
MongoDB (BlueEyeEntertainment.artists)
```

## What each script does

### 1_remove_duplicates.js
- Normalizes names (lowercase + strip spaces/punctuation) and removes:
  - internal duplicates inside `artists.json`
  - artists already present in `existing_data.json` (your app DB)
- Output: `output_json/no_duplicate_artists.json`
- Report: `logs/1_remove_duplicates_report.json`

### 2_rename_categories.js
Maps artist category casing to match `existing_data.json`:
- `SINGER` → `Singer`
- `LIVE BAND` → `Band`
- `INSTRUMENTALIST` → `Instrumentalist`
- `DJ` → `DJ` (unchanged)
- Any other value → Title Case fallback.
- Output: `output_json/2_renamed_data.json`
- Report: `logs/2_rename_categories_report.json`

### 3_split_null_free.js
Splits records into two groups based on required fields:
- **missing fields checked:** `location.city`, `performance.languages`,
  `performance.duration_minutes` (min & max), and `media.videos`.
- Complete records → `output_json/3_null_free.json` (ready for next steps).
- Records with any missing field → `output_json/extra.json` (preserved, unused;
  carries a `_missing_fields` array so you know what's missing). Missing videos
  are included here and are not processed further for now.
- Report: `logs/3_split_null_free_report.json`

### 4_image_migrate.js
Migrates artist images into ImageKit and replaces original URLs in the JSON.
- Layout: `<categoryFolder>/<slug>/image-N.<ext>` (e.g.
  `singers/gajendra-verma/image-1.jpg`) — matches `existing_data.json`.
- `categoryFolder` = lowercase + pluralized category
  (`Singer→singers`, `Band→bands`, `DJ→djs`, `Instrumentalist→instrumentalists`).
- All images per artist are migrated, order preserved. Uses ImageKit Node SDK
  with the remote source URL directly (no local download).
- **Disaster-proof:** progress saved to `logs/4_image_migrate_progress.json`
  every 10 artists and on exit. Re-running skips already-migrated artists and
  never re-uploads (avoids duplicates / wasted quota). Failed images keep the
  original URL so no data is lost.
- Live analytics: per-batch progress + final summary.
- Env: `IMG_CONCURRENCY` (default 3), `IMG_RETRIES` (default 3),
  `IMG_DELAY_MS` (default 300).
- Input: `output_json/3_null_free.json` + `output_json/extra.json`
- Output: `output_json/4_imaged_migration_final.json` (9012 records, 0 foreign links)
- Report: `logs/4_image_migrate_report.json`

### 5_anti_copyright.js
Rewrites every artist about text using an AI provider to produce original
wording while preserving all factual details.
- Supports **OpenRouter** (default) and **Gemini** — swap via `AI_PROVIDER` in `.env`.
- Provider adapters in `scripts/ai-services/` share the same `rewrite(abouts)` contract.
- Batches 20 abouts per API call; progress auto-saves after every batch.
- Resume-safe: re-running skips already-processed IDs.
- **OpenRouter multi-key rotation**: set `OPENROUTER_API_KEY_1`, `OPENROUTER_API_KEY_2`... up to 10 keys.
  Falls back to single `OPENROUTER_API_KEY` if numbered keys not set.
  Set `OPENROUTER_ROTATE=random|roundrobin` (default `random`). Auto-fallback on 429.
- Env: `AI_PROVIDER` (openrouter/gemini), `OPENROUTER_API_KEY[_N]`, `BATCH_SIZE`,
  `BATCH_DELAY_MS`, `OPENROUTER_MODEL`, `GEMINI_API_KEY`, `OPENROUTER_ROTATE`.
- Input: `logs/5_abouts.json` (9008 about texts extracted from step 4 output)
- Output: `logs/5_modified_abouts.json`
- Checkpoints: `logs/5_gemini_progress.json` (done/failed IDs), `logs/5_gemini_failed.json`

### 5.2_data_preparance.js
Merges rewritten abouts into the final data and transforms all starclinch.com
URLs to blueeyeentertainment.in:
- Replaces `about` text with rewritten version (matched by `id`)
- Transforms `source.url`: `starclinch.com/{slug}` → `blueeyeentertainment.in/artists/{slug}/`
- Transforms `booking.url`: `starclinch.com/cart/checkout/{slug}` → `blueeyeentertainment.in/booking-form/?title={Name+}`
- Input: `output_json/4_imaged_migration_final.json` + `logs/5_modified_abouts.json`
- Output: `output_json/5_copyright_free.json` (9012 records, 0 starclinch URLs)

### 6_final_verification_before_uploading.js
Comprehensive verification script that checks every field against MongoDB:
- Schema comparison vs existing MongoDB collection
- URL integrity (0 starclinch, all images on ImageKit)
- Field quality (null/empty counts)
- Duplicate IDs and slugs
- MongoDB slug overlap check
- Outputs a detailed report and verdict
- Verdict: ✅ PASS / ⚠️ PASS WITH WARNINGS / ❌ FAIL
- Run before every upload attempt

## How to run

Requirements: Node.js, `npm install imagekit dotenv`, and credentials in `.env`.

Copy `.env.example` to `.env` and fill in your keys:

```bash
cd data_modifier
cp .env.example .env
# edit .env with your keys

node scripts/1_remove_duplicates.js
node scripts/2_rename_categories.js
node scripts/3_split_null_free.js
node scripts/4_image_migrate.js              # uploads images to ImageKit (long run)
node scripts/5_anti_copyright.js             # rewrites about texts via AI (~35 min)
node scripts/5.2_data_preparance.js          # merge abouts + fix URLs (~10s)
node scripts/6_final_verification_before_uploading.js  # verify before upload (~15s)
```

Each script overwrites its output (idempotent given the same input). To start
from scratch, clear `output_json/` and `logs/` first.

**Viewer:** Open `6_view.html` in browser after step 6 to browse artists with
images, YouTube links, and pagination.

## AI providers

| Provider   | Env variable                      | Notes                                       |
|------------|-----------------------------------|---------------------------------------------|
| OpenRouter | `OPENROUTER_API_KEY`              | Default. gpt-4o-mini (~$0.30)               |
|            | `OPENROUTER_API_KEY_1..10`        | Multi-key rotation (falls back to single)   |
|            | `OPENROUTER_ROTATE`               | `random` (default) or `roundrobin`          |
| Gemini     | `GEMINI_API_KEY`                  | Set `AI_PROVIDER=gemini`                    |

Set `AI_PROVIDER=openrouter` or `AI_PROVIDER=gemini` in `.env` to switch.

## Notes
- `existing_data.json` and `artists.json` are never written to by any script.
- Step 7 (MongoDB upload) is not yet implemented. Run step 6 before every upload attempt.
