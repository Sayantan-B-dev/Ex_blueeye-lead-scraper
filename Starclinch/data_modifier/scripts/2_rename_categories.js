const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "output_json", "no_duplicate_artists.json");
const OUTPUT = path.join(ROOT, "output_json", "2_renamed_data.json");
const LOG = path.join(ROOT, "logs", "2_rename_categories_report.json");

const CATEGORY_MAP = {
  SINGER: "Singer",
  "LIVE BAND": "Band",
  INSTRUMENTALIST: "Instrumentalist",
  DJ: "DJ",
};

function titleCase(s) {
  return String(s)
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function mapCategory(cat) {
  if (!cat) return cat;
  const key = String(cat).trim();
  if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
  return titleCase(key);
}

function main() {
  const data = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const changes = [];
  const unmapped = new Set();

  const out = data.map((a) => {
    const original = a.category;
    const mapped = mapCategory(original);
    if (mapped !== original) {
      changes.push({ id: a.id, name: a.name, from: original, to: mapped });
    }
    if (original && !CATEGORY_MAP[String(original).trim()]) {
      unmapped.add(original);
    }
    return { ...a, category: mapped };
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));
  const report = {
    generated_at: new Date().toISOString(),
    input_total: data.length,
    output_total: out.length,
    categories_changed: changes.length,
    changes_sample: changes.slice(0, 50),
    unmapped_original_categories: [...unmapped],
    final_category_distribution: (() => {
      const d = {};
      for (const a of out) d[a.category] = (d[a.category] || 0) + 1;
      return d;
    })(),
  };
  fs.writeFileSync(LOG, JSON.stringify(report, null, 2));

  console.log("=== 2_rename_categories ===");
  console.log("input :", report.input_total);
  console.log("changed:", report.categories_changed);
  console.log("unmapped originals:", report.unmapped_original_categories);
  console.log("distribution:", JSON.stringify(report.final_category_distribution));
  console.log("output ->", OUTPUT);
}

main();
