const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const INPUT_FILE = path.join(ROOT, "output_json", "6_final_data.json");
const OUTPUT_FILE = path.join(ROOT, "output_json", "6_100_percent_final_data.json");

function main() {
  console.log("=== Step 6.2: Final Data Cleaning ===\n");

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Missing: ${INPUT_FILE}`);
    process.exit(1);
  }

  let data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
  console.log(`Loaded: ${data.length} records from 6_final_data.json`);

  // 1. Strip top-level input_category
  const hadInputCat = data.filter((d) => d.hasOwnProperty("input_category")).length;
  for (const d of data) delete d.input_category;

  // 2. Strip top-level input_page
  const hadInputPage = data.filter((d) => d.hasOwnProperty("input_page")).length;
  for (const d of data) delete d.input_page;

  // 3. Keep _missing_fields — user wants them visible in DB
  const hadMissingFields = data.filter((d) => d.hasOwnProperty("_missing_fields")).length;

  // 4. Remove duplicate slug: paul-harmony-and-rythm (id=92620)
  const beforeDedup = data.length;
  data = data.filter((d) => !(d.slug === "paul-harmony-and-rythm" && d.id === 92620));
  const removedDup = beforeDedup - data.length;

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

  console.log("\n=== Cleaning Summary ===");
  console.log(`  Records before: ${beforeDedup}`);
  console.log(`  Records after : ${data.length}`);
  console.log(`  Removed input_category (top-level): ${hadInputCat}`);
  console.log(`  Removed input_page (top-level): ${hadInputPage}`);
  console.log(`  Kept _missing_fields (not removed): ${hadMissingFields}`);
  console.log(`  Removed duplicate slug (paul-harmony-and-rythm): ${removedDup}`);
  console.log(`\nOutput: ${OUTPUT_FILE}`);
  console.log("=== Done ===\n");
}

main();
