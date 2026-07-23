const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env") });

const DATA_FILE = path.join(ROOT, "output_json", "5_copyright_free.json");
const EXISTING_FILE = path.join(ROOT, "input_data", "existing_data.json");

function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function header(text) {
  const line = "=".repeat(70);
  console.log(`\n${line}`);
  console.log(`  ${text}`);
  console.log(`${line}\n`);
}

function sub(text) {
  console.log(`  >> ${text}`);
}

function divider() {
  console.log("  " + "-".repeat(50));
}

function ok(count, total) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "100.0";
  console.log(`    ✅ ${count}/${total} (${pct}%)`);
}

function warn(count, total) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
  console.log(`    ⚠️  ${count}/${total} (${pct}%)`);
}

function fail(count, total) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
  console.log(`    ❌ ${count}/${total} (${pct}%)`);
}

function info(label, val) {
  console.log(`    ${label}: ${val}`);
}

async function main() {
  const issues = [];
  const warnings = [];
  let verdict = "✅ PASS";

  // ===================================================================
  // 1. LOAD DATA
  // ===================================================================
  header("1. LOADING DATA");

  const data = loadJson(DATA_FILE);
  if (!data) {
    console.error(`  ❌ Missing: ${DATA_FILE}`);
    process.exit(1);
  }
  info("5_copyright_free.json", `${data.length} records`);

  const existing = loadJson(EXISTING_FILE);
  if (existing) info("existing_data.json", `${existing.length} records`);

  // ===================================================================
  // 2. SCHEMA ANALYSIS
  // ===================================================================
  header("2. SCHEMA ANALYSIS");

  const allKeys = new Set();
  for (const d of data) Object.keys(d).forEach((k) => allKeys.add(k));
  info("Top-level keys", [...allKeys].join(", "));

  // Extra keys not in existing DB schema
  const extraKeys = ["input_category", "input_page", "_missing_fields"];
  const foundExtra = extraKeys.filter((k) => allKeys.has(k));
  if (foundExtra.length > 0) {
    warn(foundExtra.length, extraKeys.length);
    for (const k of foundExtra) {
      const count = data.filter((d) => d[k] !== undefined).length;
      const msg = `Extra key "${k}" should be removed before upload (${count} records)`;
      console.log(`       ${msg}`);
      warnings.push(msg);
    }
  }

  // ===================================================================
  // 3. FIELD QUALITY
  // ===================================================================
  header("3. FIELD QUALITY");

  const checks = {
    id: { label: "id (number, > 0)", test: (d) => typeof d.id === "number" && d.id > 0 },
    slug: { label: "slug (string, non-empty)", test: (d) => typeof d.slug === "string" && d.slug.length > 0 },
    name: { label: "name (string, non-empty)", test: (d) => typeof d.name === "string" && d.name.length > 0 },
    category: { label: "category (string, non-empty)", test: (d) => typeof d.category === "string" && d.category.length > 0 },
    source_url: { label: "source.url (blueeye URL)", test: (d) => d.source?.url?.startsWith("https://blueeyeentertainment.in/") },
    booking_url: { label: "booking.url (blueeye URL)", test: (d) => d.booking?.url?.startsWith("https://blueeyeentertainment.in/") },
    city: { label: "location.city (non-empty)", test: (d) => d.location?.city?.length > 0 },
    country: { label: "location.country (non-empty)", test: (d) => d.location?.country?.length > 0 },
    dur_min: { label: "duration_minutes.min (number)", test: (d) => typeof d.performance?.duration_minutes?.min === "number" },
    dur_max: { label: "duration_minutes.max (number)", test: (d) => typeof d.performance?.duration_minutes?.max === "number" },
    about: { label: "about (string)", test: (d) => typeof d.about === "string" },
    faq: { label: "faq (array)", test: (d) => Array.isArray(d.faq) },
    media: { label: "media (object)", test: (d) => d.media && typeof d.media === "object" },
    videos: { label: "media.videos (array)", test: (d) => Array.isArray(d.media?.videos) },
    images: { label: "media.images (array)", test: (d) => Array.isArray(d.media?.images) },
  };

  for (const [, c] of Object.entries(checks)) {
    const pass = data.filter((d) => c.test(d)).length;
    if (pass === data.length) ok(pass, data.length);
    else if (pass >= data.length * 0.95) warn(pass, data.length);
    else fail(pass, data.length);
  }

  // Deeper null/empty checks
  divider();
  sub("Null / empty sub-fields:");

  const nullChecks = {
    "state (null)": data.filter((d) => d.location?.state === null).length,
    "genres (empty)": data.filter((d) => !d.performance?.genres || d.performance.genres.length === 0).length,
    "languages (empty)": data.filter((d) => !d.performance?.languages || d.performance.languages.length === 0).length,
    "videos (empty)": data.filter((d) => !d.media?.videos || d.media.videos.length === 0).length,
    "images (empty)": data.filter((d) => !d.media?.images || d.media.images.length === 0).length,
    "team_members.min (null)": data.filter((d) => d.performance?.team_members?.min === null).length,
    "team_members.max (null)": data.filter((d) => d.performance?.team_members?.max === null).length,
    "faq (empty)": data.filter((d) => !d.faq || d.faq.length === 0).length,
  };

  for (const [label, count] of Object.entries(nullChecks)) {
    if (count === 0) ok(count, data.length);
    else if (count <= 500) warn(count, data.length);
    else console.log(`    ℹ️  ${count}/${data.length} (${((count/data.length)*100).toFixed(1)}%)`);
    info("  " + label, `${count}/${data.length} (${((count/data.length)*100).toFixed(1)}%)`);
  }

  // ===================================================================
  // 4. DUPLICATE CHECK
  // ===================================================================
  header("4. DUPLICATE CHECK");

  const ids = data.map((d) => d.id);
  const slugs = data.map((d) => d.slug);
  const uniqueIds = new Set(ids);
  const uniqueSlugs = new Set(slugs);

  if (uniqueIds.size === ids.length) {
    ok(data.length, data.length);
    info("Duplicate IDs", "none");
  } else {
    const dups = ids.length - uniqueIds.size;
    fail(ids.length - uniqueIds.size, ids.length);
    issues.push(`${dups} duplicate IDs found`);
  }

  if (uniqueSlugs.size === slugs.length) {
    ok(data.length, data.length);
    info("Duplicate slugs", "none");
  } else {
    const dups = slugs.length - uniqueSlugs.size;
    fail(slugs.length - uniqueSlugs.size, slugs.length);
    issues.push(`${dups} duplicate slugs found`);
  }

  // ===================================================================
  // 5. CATEGORY DISTRIBUTION
  // ===================================================================
  header("5. CATEGORY DISTRIBUTION");

  const catCount = {};
  for (const d of data) {
    const c = d.category || "unknown";
    catCount[c] = (catCount[c] || 0) + 1;
  }
  for (const [c, n] of Object.entries(catCount).sort((a, b) => b[1] - a[1])) {
    info(c.padEnd(20), `${n} (${((n/data.length)*100).toFixed(1)}%)`);
  }

  // ===================================================================
  // 6. URL INTEGRITY
  // ===================================================================
  header("6. URL INTEGRITY");

  // Check for any remaining starclinch URLs across all fields
  function deepFindStarclinch(obj, path = "") {
    let found = [];
    if (!obj || typeof obj !== "object") return found;
    if (typeof obj === "string") {
      if (obj.includes("starclinch.com")) found.push(path);
      return found;
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++)
        found = found.concat(deepFindStarclinch(obj[i], `${path}[${i}]`));
      return found;
    }
    for (const [k, v] of Object.entries(obj))
      found = found.concat(deepFindStarclinch(v, path ? `${path}.${k}` : k));
    return found;
  }

  let starclinchTotal = 0;
  for (const d of data) {
    const found = deepFindStarclinch(d);
    starclinchTotal += found.length;
  }

  if (starclinchTotal === 0) {
    ok(0, "any");
    info("starclinch.com URLs", "none found");
  } else {
    fail(0, "all");
    issues.push(`${starclinchTotal} starclinch.com URLs remaining`);
  }

  // Check all images on ImageKit
  const nonImageKitImages = [];
  for (const d of data) {
    if (d.media?.images) {
      for (const img of d.media.images) {
        if (!img.includes("ik.imagekit.io")) nonImageKitImages.push({ id: d.id, url: img });
      }
    }
  }
  if (nonImageKitImages.length === 0) {
    ok(0, "any");
    info("Non-ImageKit images", "none");
  } else {
    fail(data.length - nonImageKitImages.length, data.length);
    warnings.push(`${nonImageKitImages.length} images not on ImageKit`);
    nonImageKitImages.slice(0, 5).forEach((i) => console.log(`       id=${i.id}: ${i.url}`));
  }

  // Check source.url pattern matches slug
  const sourceSlugIssues = data.filter((d) => {
    const expected = `https://blueeyeentertainment.in/artists/${d.slug}/`;
    return d.source?.url !== expected;
  });
  if (sourceSlugIssues.length === 0) ok(0, "any");
  else warn(data.length - sourceSlugIssues.length, data.length);

  // Check booking.url pattern matches name
  const bookingNameIssues = data.filter((d) => {
    const expected = `https://blueeyeentertainment.in/booking-form/?title=${d.name.trim().replace(/\s+/g, "+")}`;
    return d.booking?.url !== expected;
  });
  if (bookingNameIssues.length === 0) ok(0, "any");
  else warn(data.length - bookingNameIssues.length, data.length);

  // Check youtube URLs format
  const badYoutube = [];
  for (const d of data) {
    if (d.media?.videos) {
      for (const v of d.media.videos) {
        if (v && !v.includes("youtube.com/embed") && !v.includes("youtu.be")) badYoutube.push({ id: d.id, url: v });
      }
    }
  }
  if (badYoutube.length === 0) ok(0, "any");
  else warn(data.length - badYoutube.length, data.length);

  // ===================================================================
  // 7. MONGO DB CROSS-CHECK
  // ===================================================================
  header("7. MONGODB CROSS-CHECK");

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  const collName = process.env.MONGODB_DB_COLLECTION_NAME;

  let mongoConnected = false;
  let mongoDocCount = 0;
  let mongoCats = [];
  let existingSlugs = new Set();
  let slugOverlap = 0;
  let dbDocCount = 0;
  let mongoFields = [];

  if (uri && dbName && collName) {
    try {
      const client = new MongoClient(uri);
      await client.connect();
      const db = client.db(dbName);
      const coll = db.collection(collName);
      mongoConnected = true;

      mongoDocCount = await coll.countDocuments();
      info("MongoDB collection", `${collName} — ${mongoDocCount} documents`);

      const sample = await coll.findOne();
      if (sample) {
        mongoFields = Object.keys(sample).filter((k) => k !== "_id");
        info("Existing schema keys", mongoFields.join(", "));

        dbDocCount = mongoDocCount;

        // Categories in MongoDB
        mongoCats = await coll.distinct("category");
        info("MongoDB categories", mongoCats.join(", "));

        // Our categories vs MongoDB categories
        const ourCats = new Set(Object.keys(catCount));
        const allMongoCats = new Set(mongoCats);
        const missingInMongo = [...ourCats].filter((c) => !allMongoCats.has(c));
        if (missingInMongo.length > 0) {
          info("Categories NOT in MongoDB", missingInMongo.join(", "));
        }

        // Schema comparison
        divider();
        sub("Schema comparison (our keys vs MongoDB keys):");
        const ourKeySet = new Set(
          [...data[0] ? Object.keys(data[0]) : []].filter((k) => k !== "_missing_fields")
        );
        const mongoKeySet = new Set(mongoFields);

        const extra = [...ourKeySet].filter((k) => !mongoKeySet.has(k));
        const missing = [...mongoKeySet].filter((k) => !ourKeySet.has(k));

        if (extra.length > 0) {
          warn(extra.length, mongoFields.length);
          info("Extra keys (to remove)", extra.join(", "));
          warnings.push(`Remove top-level keys not in MongoDB: ${extra.join(", ")}`);
        }
        if (missing.length > 0) {
          info("Keys in MongoDB but missing in our data", missing.join(", "));
          warnings.push(`Missing keys that exist in MongoDB: ${missing.join(", ")}`);
        }
        if (extra.length === 0 && missing.length === 0) ok(1, 1);

        // Slug overlap check
        const allMongoSlugs = await coll
          .find({}, { projection: { slug: 1, _id: 0 } })
          .toArray();
        existingSlugs = new Set(allMongoSlugs.map((d) => d.slug));
        slugOverlap = data.filter((d) => existingSlugs.has(d.slug)).length;
        info("Slugs already in MongoDB", `${slugOverlap}/${data.length}`);
        if (slugOverlap > 0) {
          const slugList = data
            .filter((d) => existingSlugs.has(d.slug))
            .map((d) => `${d.slug} (id=${d.id})`)
            .slice(0, 10);
          console.log(`       Examples: ${slugList.join(", ")}${slugOverlap > 10 ? `... and ${slugOverlap - 10} more` : ""}`);
          warnings.push(`${slugOverlap} slugs already exist in MongoDB — upload would create duplicates`);
        }
      }

      await client.close();
      ok(1, 1);
      info("MongoDB connection", "successful");
    } catch (e) {
      fail(0, 1);
      info("MongoDB connection", `FAILED: ${e.message}`);
      warnings.push("Could not connect to MongoDB for cross-check");
    }
  } else {
    info("MongoDB", "not configured in .env — skipping cross-check");
  }

  // ===================================================================
  // 8. AGGREGATE STATS
  // ===================================================================
  header("8. AGGREGATE STATS");

  info("Total records", data.length);
  const hasVideos = data.filter((d) => d.media?.videos?.length > 0).length;
  const hasImages = data.filter((d) => d.media?.images?.length > 0).length;
  const hasCity = data.filter((d) => d.location?.city?.length > 0).length;
  const hasDur = data.filter(
    (d) =>
      typeof d.performance?.duration_minutes?.min === "number" &&
      typeof d.performance?.duration_minutes?.max === "number"
  ).length;
  const hasAbout = data.filter((d) => d.about && d.about.length > 0).length;

  divider();
  info("With videos", `${hasVideos}/${data.length} (${((hasVideos/data.length)*100).toFixed(1)}%)`);
  info("With images", `${hasImages}/${data.length} (${((hasImages/data.length)*100).toFixed(1)}%)`);
  info("With city", `${hasCity}/${data.length} (${((hasCity/data.length)*100).toFixed(1)}%)`);
  info("With duration", `${hasDur}/${data.length} (${((hasDur/data.length)*100).toFixed(1)}%)`);
  info("With rewritten about", `${hasAbout}/${data.length} (${((hasAbout/data.length)*100).toFixed(1)}%)`);

  // Images per artist
  const imgCounts = data.map((d) => d.media?.images?.length || 0).filter((c) => c > 0);
  const avgImg = imgCounts.length > 0 ? (imgCounts.reduce((a, b) => a + b, 0) / imgCounts.length).toFixed(1) : 0;
  info("Average images per artist (with images)", avgImg);
  info("Max images per artist", Math.max(...imgCounts, 0));

  // Videos per artist
  const vidCounts = data.map((d) => d.media?.videos?.length || 0).filter((c) => c > 0);
  const avgVid = vidCounts.length > 0 ? (vidCounts.reduce((a, b) => a + b, 0) / vidCounts.length).toFixed(1) : 0;
  info("Average videos per artist (with videos)", avgVid);

  // About length stats
  const aboutLens = data.map((d) => (d.about || "").length).filter((l) => l > 0);
  const avgAbout =
    aboutLens.length > 0 ? (aboutLens.reduce((a, b) => a + b, 0) / aboutLens.length).toFixed(0) : 0;
  const minAbout = aboutLens.length > 0 ? Math.min(...aboutLens) : 0;
  const maxAbout = aboutLens.length > 0 ? Math.max(...aboutLens) : 0;
  divider();
  info("About text avg length", `${avgAbout} chars`);
  info("About text min length", `${minAbout} chars`);
  info("About text max length", `${maxAbout} chars`);

  // ===================================================================
  // 9. VERDICT
  // ===================================================================
  header("9. VERDICT");

  if (issues.length > 0) {
    verdict = "❌ FAIL";
  } else if (warnings.length > 0) {
    verdict = "⚠️  PASS WITH WARNINGS";
  } else {
    verdict = "✅ PASS";
  }

  console.log(`  ${verdict}`);
  console.log();

  if (issues.length > 0) {
    sub("Blocking issues (must fix before upload):");
    for (const i of issues) console.log(`    ❌ ${i}`);
    console.log();
  }

  if (warnings.length > 0) {
    sub("Warnings (recommended to review):");
    for (const w of warnings) console.log(`    ⚠️  ${w}`);
    console.log();
  }

  if (issues.length === 0 && warnings.length === 0) {
    sub("No issues found — data is clean for upload.");
  }

  // ===================================================================
  // 10. SUMMARY TABLE
  // ===================================================================
  header("10. SUMMARY");
  console.log(`  Verdict          : ${verdict}`);
  console.log(`  Total records    : ${data.length}`);
  console.log(`  Categories       : ${Object.keys(catCount).length} (${Object.keys(catCount).sort().join(", ")})`);
  console.log(`  With videos      : ${hasVideos}/${data.length}`);
  console.log(`  With images      : ${hasImages}/${data.length}`);
  console.log(`  With city        : ${hasCity}/${data.length}`);
  console.log(`  With duration    : ${hasDur}/${data.length}`);
  console.log(`  With about       : ${hasAbout}/${data.length}`);
  console.log(`  MongoDB docs     : ${mongoDocCount || "N/A"}`);
  console.log(`  Slug overlap     : ${slugOverlap}/${data.length}`);
  console.log(`  Issues           : ${issues.length}`);
  console.log(`  Warnings         : ${warnings.length}`);
  console.log();
  console.log(`  Output file: ${DATA_FILE}`);
}

main().catch((e) => {
  console.error(`\n  ❌ Fatal: ${e.message}`);
  process.exit(1);
});
