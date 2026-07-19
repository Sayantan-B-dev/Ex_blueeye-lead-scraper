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
├── input_data/             # Read-only copies of the two sources
│   ├── artists.json
│   └── existing_data.json
├── scripts/                # All transformation scripts (run manually, in order)
│   ├── 1_remove_duplicates.js
│   ├── 2_rename_categories.js
│   ├── 3_split_null_free.js
│   ├── 4_image_migrate.js      # ImageKit image migration (implemented)
│   ├── 5_anti_copyright.js     # STUB
│   ├── 6_final_verification_before_uploading.js  # STUB
│   └── 7_upload_to_db.js       # STUB
├── output_json/            # Generated outputs (one file per script)
│   ├── no_duplicate_artists.json   # from step 1
│   ├── 2_renamed_data.json         # from step 2
│   ├── 3_null_free.json            # from step 3 (complete records)
│   └── extra.json                  # from step 3 (records with missing fields)
└── logs/                   # Reports
    ├── 1_remove_duplicates_report.json
    ├── 2_rename_categories_report.json
    └── 3_split_null_free_report.json
```

## Pipeline (data flow)

Run scripts manually, in this order. Each step reads the previous step's output:

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
```

Note: video filling (yt-dlp) was removed from this flow. Records missing
YouTube videos are no longer dealt with here — they are routed into `extra.json`
by step 3 and set aside for later.

Steps 5–7 are stubs (not yet implemented): anti-copyright sanitization,
final verification, DB upload. Step 4 (image migration) is implemented.

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
- Input: `output_json/3_null_free.json`
- Output: `output_json/4_images_migrated.json`
- Report: `logs/4_image_migrate_report.json`

## How to run (manually, in order)

Requirements: Node.js, `imagekit` + `dotenv` (`npm install imagekit dotenv`),
and ImageKit credentials in `.env` (IMAGEKIT_PUBLIC_KEY / PRIVATE_KEY /
URL_ENDPOINT).

```bash
cd data_modifier

node scripts/1_remove_duplicates.js
node scripts/2_rename_categories.js
node scripts/3_split_null_free.js
node scripts/4_image_migrate.js      # uploads images to ImageKit (long run)
```

Each script overwrites its output (idempotent given the same input). To start
from scratch, clear `output_json/` and `logs/` first.

## Notes
- `existing_data.json` and `artists.json` are never written to by any script.
- Steps 5–7 are placeholders for the next phase (anti-copyright → verify → upload).
