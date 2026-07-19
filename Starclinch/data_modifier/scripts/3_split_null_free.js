const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "output_json", "2_renamed_data.json");
const OUTPUT_NULLFREE = path.join(ROOT, "output_json", "3_null_free.json");
const OUTPUT_EXTRA = path.join(ROOT, "output_json", "extra.json");
const LOG = path.join(ROOT, "logs", "3_split_null_free_report.json");

function isMissing(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function findMissing(a) {
  const missing = [];
  const city = a.location && a.location.city;
  if (isMissing(city)) missing.push("city");

  const languages = a.performance && a.performance.languages;
  if (isMissing(languages)) missing.push("languages");

  const dur = a.performance && a.performance.duration_minutes;
  const durMissing =
    !dur ||
    isMissing(dur.min) ||
    isMissing(dur.max) ||
    (dur.min === null && dur.max === null);
  if (durMissing) missing.push("duration");

  // Missing YouTube videos also routes the record to extra (not dealt with now).
  const videos = a.media && a.media.videos;
  if (isMissing(videos)) missing.push("videos");

  return missing;
}

function main() {
  const data = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const nullFree = [];
  const extra = [];
  const missingBreakdown = { city: 0, languages: 0, duration: 0, videos: 0 };

  for (const a of data) {
    const missing = findMissing(a);
    if (missing.length === 0) {
      nullFree.push(a);
    } else {
      for (const m of missing) missingBreakdown[m]++;
      extra.push({ ...a, _missing_fields: missing });
    }
  }

  fs.writeFileSync(OUTPUT_NULLFREE, JSON.stringify(nullFree, null, 2));
  fs.writeFileSync(OUTPUT_EXTRA, JSON.stringify(extra, null, 2));

  const report = {
    generated_at: new Date().toISOString(),
    input_total: data.length,
    null_free_total: nullFree.length,
    extra_total: extra.length,
    missing_field_counts: missingBreakdown,
    extra_missing_field_breakdown: (() => {
      const d = {};
      for (const e of extra) {
        const k = e._missing_fields.join("+");
        d[k] = (d[k] || 0) + 1;
      }
      return d;
    })(),
  };
  fs.writeFileSync(LOG, JSON.stringify(report, null, 2));

  console.log("=== 3_split_null_free ===");
  console.log("input   :", report.input_total);
  console.log("nullfree:", report.null_free_total);
  console.log("extra   :", report.extra_total);
  console.log("missing counts:", JSON.stringify(report.missing_field_counts));
  console.log("nullfree ->", OUTPUT_NULLFREE);
  console.log("extra    ->", OUTPUT_EXTRA);
}

main();
