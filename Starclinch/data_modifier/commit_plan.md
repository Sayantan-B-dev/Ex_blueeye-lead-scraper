# Commit Plan — StarClinch `data_modifier`

**Git root:** `scraping_info/` (this folder `Starclinch/data_modifier/` is a subfolder, currently untracked `??`).
**Run every command from the git root** (`scraping_info/`), using paths relative to it.

Goal: commit the migration pipeline **in logical stages** so each commit is reviewable, instead of one giant dump.

---

## IMPORTANT — what gets ignored (so we don't bloat the repo)
The current `.gitignore` already ignores: `node_modules/`, `.env`, `logs/*`, `input_data/*`.
It does **NOT** ignore `output_json/*` (≈33 MB of regenerable JSON). Add this block (Stage 0) so generated
data isn't committed. The final deliverable can be force-added if you want it tracked.

Also: `logs/*` is ignored, so the temp debug logs (`4_dbg_*.log`, `4_os*.log`, `4_run_*.log`,
`4_merge_report.json`) are automatically excluded — good.

---

## Stage 0 — Gitignore cleanup (commit first, alone)
```bash
# append to .gitignore:
cat >> .gitignore <<'EOF'

# StarClinch data_modifier — generated pipeline outputs (reproducible from scripts)
Starclinch/data_modifier/output_json/*
# keep the final migrated deliverable tracked if desired (uncomment + force-add):
# !Starclinch/data_modifier/output_json/4_imaged_migration_final.json
EOF

git add .gitignore
git commit -m "chore: ignore generated StarClinch data_modifier output_json"
```

> To track the final 10 MB result in git instead, run:
> `git add -f Starclinch/data_modifier/output_json/4_imaged_migration_final.json` and commit it in its own stage.

---

## Stage 1 — Project docs & metadata
```bash
git add Starclinch/data_modifier/README.md \
        Starclinch/data_modifier/package.json \
        Starclinch/data_modifier/package-lock.json
git commit -m "docs: add StarClinch data_modifier README and package metadata"
```

---

## Stage 2 — Viewer (config + html)
```bash
git add Starclinch/data_modifier/config.js \
        Starclinch/data_modifier/view.html
git commit -m "feat: add data viewer (config.js tab bridge + view.html)"
```

---

## Stage 3 — Pipeline scripts 1–3 (dedupe / rename / split)
```bash
git add Starclinch/data_modifier/scripts/1_remove_duplicates.js \
        Starclinch/data_modifier/scripts/2_rename_categories.js \
        Starclinch/data_modifier/scripts/3_split_null_free.js
git commit -m "feat: add StarClinch pipeline steps 1-3 (dedupe, rename categories, split null-free)"
```

---

## Stage 4 — Pipeline script 4 (ImageKit migration — the core)
Consolidated migration (main + extra), reuse-existing, resume-safe, single output.
Fixes applied: URL-overwrite bug, nested-semaphore deadlock, resume validation, reuse-existing.
```bash
git add Starclinch/data_modifier/scripts/4_image_migrate.js
git commit -m "feat: add ImageKit image migration (step 4) — consolidated, resume-safe, reuse-existing"
```

---

## Stage 5 — Pipeline stubs 5–7 (anti-copyright / verify / upload)
Currently STUBS (status: not implemented). Committed as placeholders so the pipeline shape is visible.
```bash
git add Starclinch/data_modifier/scripts/5_anti_copyright.js \
        Starclinch/data_modifier/scripts/6_final_verification_before_uploading.js \
        Starclinch/data_modifier/scripts/7_upload_to_db.js
git commit -m "feat: add StarClinch pipeline stubs 5-7 (anti-copyright, verify, db-upload)"
```

---

## Stage 6 — Session transcript & this plan doc
```bash
git add Starclinch/data_modifier/session_log.md \
        Starclinch/data_modifier/commit_plan.md
git commit -m "docs: add session transcript and staged commit plan"
```

---

## TOTAL COMMITS: 7  (Stages 0–6)

---

## Final verification
```bash
git status                       # should show only intended files staged/clean
git log --oneline -8             # review the staged commits
```

### What is intentionally NOT committed
- `node_modules/` — ignored.
- `.env` — ignored (contains ImageKit keys).
- `logs/*` — ignored (runtime progress, reports, temp debug logs).
- `input_data/*` — ignored (raw scraper inputs: artists.json, existing_data.json).
- `output_json/*` — ignored by Stage 0 (regenerable: 2_renamed_data.json, 3_null_free.json,
  extra.json, no_duplicate_artists.json, 4_imaged_migration_final.json).

### Notes
- The migration **result** (`4_imaged_migration_final.json`: 9012 records, 0 foreign links, 89 blanked
  dead-link failures) lives in `output_json/` and is gitignored. To ship it in git, uncomment the
  `!...` line in Stage 0 and force-add it (or give it its own Stage).
- `7_upload_to_db.js` is an empty stub (0.2 KB) — filename placeholder only.
- `5_anti_copyright.js` still points at the deleted `4_images_migrated.json` in its header comment;
  it should be repointed at `4_imaged_migration_final.json` when implemented.
- Nothing here touches the parent repo's other folders (method1/method2/taskFetchEmail).
