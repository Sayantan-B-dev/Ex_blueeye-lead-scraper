const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const INPUT_FILE = path.join(ROOT, "output_json", "4_imaged_migration_final.json");
const ABOUTS_FILE = path.join(ROOT, "logs", "5_modified_abouts.json");
const EXISTING_FILE = path.join(ROOT, "input_data", "existing_data.json");
const OUTPUT_FILE = path.join(ROOT, "output_json", "5_copyright_free.json");

function loadJson(p, label) {
  if (!fs.existsSync(p)) {
    console.error(`Missing ${label}: ${p}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  console.log(`Loaded ${label}: ${data.length} records`);
  return data;
}

function slugifyName(name) {
  return name.trim().replace(/\s+/g, "+");
}

function main() {
  console.log("=== Step 5.2: Data Preparation / Merge ===\n");

  const artists = loadJson(INPUT_FILE, "4_imaged_migration_final.json");
  const rewrittenAbouts = loadJson(ABOUTS_FILE, "5_modified_abouts.json");
  const existing = loadJson(EXISTING_FILE, "existing_data.json");

  // Build lookups
  const aboutMap = new Map();
  for (const a of rewrittenAbouts) {
    if (a.modified_about) {
      aboutMap.set(a.id, a.modified_about);
    }
  }

  const existingBySlug = new Map();
  for (const e of existing) {
    if (e.slug && e.source?.url) {
      existingBySlug.set(e.slug, e.source.url);
    }
  }

  console.log(`Rewritten abouts available: ${aboutMap.size}`);
  console.log(`Existing DB slugs with source URLs: ${existingBySlug.size}\n`);

  // Transform
  let aboutReplaced = 0;
  let sourceUrlsTransformed = 0;
  let bookingUrlsTransformed = 0;
  let sourceUrlFromExisting = 0;
  let sourceUrlFallback = 0;
  let slugMatches = 0;
  let slugMismatches = 0;

  for (const artist of artists) {
    // 1. Replace about text
    if (aboutMap.has(artist.id)) {
      artist.about = aboutMap.get(artist.id);
      aboutReplaced++;
    }

    // 2. Transform source.url - use exact from existing_data by slug, else fallback
    if (artist.source && artist.source.url && artist.source.url.includes("starclinch.com")) {
      if (existingBySlug.has(artist.slug)) {
        artist.source.url = existingBySlug.get(artist.slug);
        sourceUrlFromExisting++;
      } else {
        artist.source.url = `https://blueeyeentertainment.in/artists/${artist.slug}/`;
        sourceUrlFallback++;
      }
      sourceUrlsTransformed++;
    }

    // 3. Transform booking.url
    if (artist.booking && artist.booking.url && artist.booking.url.includes("starclinch.com")) {
      artist.booking.url = `https://blueeyeentertainment.in/booking-form/?title=${slugifyName(artist.name)}`;
      bookingUrlsTransformed++;
    }

    // 4. Validate against existing DB by slug
    if (existingBySlug.has(artist.slug)) {
      slugMatches++;
    } else {
      slugMismatches++;
    }
  }

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artists, null, 2));
  console.log(`\nOutput written to: ${OUTPUT_FILE}\n`);

  // Summary
  console.log("=== Summary ===");
  console.log(`Total artists: ${artists.length}`);
  console.log(`About texts replaced: ${aboutReplaced}`);
  console.log(`Source URLs transformed: ${sourceUrlsTransformed} (from existing: ${sourceUrlFromExisting}, fallback: ${sourceUrlFallback})`);
  console.log(`Booking URLs transformed: ${bookingUrlsTransformed}`);
  console.log(`Slug matches in existing DB: ${slugMatches}`);
  console.log(`Slug NOT in existing DB: ${slugMismatches}`);
  console.log(`Missing abouts: ${artists.length - aboutReplaced}`);
  console.log("\n=== Done ===");
}

main();