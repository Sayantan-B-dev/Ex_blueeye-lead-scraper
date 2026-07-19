const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INPUT_ARTISTS = path.join(ROOT, "input_data", "artists.json");
const INPUT_EXISTING = path.join(ROOT, "input_data", "existing_data.json");
const OUTPUT = path.join(ROOT, "output_json", "no_duplicate_artists.json");
const LOG = path.join(ROOT, "logs", "1_remove_duplicates_report.json");

function normalizeName(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function main() {
  const artists = loadJson(INPUT_ARTISTS);
  const existing = loadJson(INPUT_EXISTING);

  const seenNormalized = new Set();
  const existingNormalized = new Set();
  for (const e of existing) {
    const n = normalizeName(e.name);
    if (n) existingNormalized.add(n);
  }

  const kept = [];
  const internalDuplicates = [];
  const dbMatches = [];

  for (const a of artists) {
    const n = normalizeName(a.name);
    if (!n) {
      kept.push(a);
      continue;
    }
    if (seenNormalized.has(n)) {
      internalDuplicates.push({ id: a.id, name: a.name });
      continue;
    }
    if (existingNormalized.has(n)) {
      dbMatches.push({ id: a.id, name: a.name });
      continue;
    }
    seenNormalized.add(n);
    kept.push(a);
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));
  const report = {
    generated_at: new Date().toISOString(),
    input_total: artists.length,
    output_total: kept.length,
    removed_total: artists.length - kept.length,
    internal_duplicates_removed: internalDuplicates.length,
    db_matches_removed: dbMatches.length,
    internal_duplicates_sample: internalDuplicates.slice(0, 50),
    db_matches_sample: dbMatches.slice(0, 50),
  };
  fs.writeFileSync(LOG, JSON.stringify(report, null, 2));

  console.log("=== 1_remove_duplicates ===");
  console.log("input:", report.input_total);
  console.log("kept :", report.output_total);
  console.log("removed (internal dupes):", report.internal_duplicates_removed);
  console.log("removed (already in DB) :", report.db_matches_removed);
  console.log("output ->", OUTPUT);
  console.log("report ->", LOG);
}

main();
