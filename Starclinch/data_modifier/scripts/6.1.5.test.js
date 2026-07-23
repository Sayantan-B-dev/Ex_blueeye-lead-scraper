const path = require("path");
const { MongoClient } = require("mongodb");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env") });

const DATA_FILE = path.join(ROOT, "output_json", "6_100_percent_final_data.json");
const fs = require("fs");

async function main() {
  console.log("=== Step 6.1.5: Test Insert (Single Artist) ===\n");

  // Check MongoDB env
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  const collName = process.env.MONGODB_DB_COLLECTION_NAME;

  if (!uri || !dbName || !collName) {
    console.error("Missing MongoDB env vars (MONGODB_URI, MONGODB_DB_NAME, MONGODB_DB_COLLECTION_NAME)");
    process.exit(1);
  }

  // Load cleaned data
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Missing cleaned data file. Run 6.2_final_data_cleaning.js first.\n  Expected: ${DATA_FILE}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  console.log(`Loaded ${data.length} records from 6_100_percent_final_data.json`);

  // Find test artist: hardy-sandhu (id=55934)
  const testArtist = data.find((d) => d.id === 55934 && d.slug === "hardy-sandhu");
  if (!testArtist) {
    console.error("Test artist hardy-sandhu (id=55934) not found in cleaned data.");
    process.exit(1);
  }

  console.log("Test artist selected:");
  console.log(`  id:       ${testArtist.id}`);
  console.log(`  slug:     ${testArtist.slug}`);
  console.log(`  name:     ${testArtist.name}`);
  console.log(`  category: ${testArtist.category}`);
  console.log(`  source:   ${testArtist.source?.url}`);
  console.log(`  booking:  ${testArtist.booking?.url}`);
  console.log(`  images:   ${testArtist.media?.images?.length || 0}`);
  console.log(`  videos:   ${testArtist.media?.videos?.length || 0}`);
  console.log(`  about:    ${(testArtist.about || "").substring(0, 80)}...`);

  // Connect and check first
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const coll = db.collection(collName);

  const existing = await coll.findOne({ slug: "hardy-sandhu" });
  if (existing) {
    console.log(`\n⚠️  hardy-sandhu already exists in MongoDB (id=${existing.id}). Test insert skipped.`);
    console.log("  If you want to re-test, remove it from the DB first.");
    await client.close();
    return;
  }

  // Insert the test artist
  const result = await coll.insertOne(testArtist);
  console.log(`\n✅ Test insert successful!`);
  console.log(`  MongoDB _id: ${result.insertedId}`);
  console.log(`  Document:   ${testArtist.slug} (id=${testArtist.id})`);
  console.log(`\n👉 Check your app at:`);
  console.log(`     https://blueeyeentertainment.in/artists/${testArtist.slug}/`);
  console.log(`\n  Verify: image loads, booking link, about text, category, videos.`);
  console.log(`  Then give the signal to proceed with full upload.\n`);

  await client.close();
}

main().catch((e) => {
  console.error(`\n❌ Error: ${e.message}`);
  process.exit(1);
});
