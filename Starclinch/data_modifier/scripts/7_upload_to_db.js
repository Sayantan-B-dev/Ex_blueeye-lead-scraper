const path = require("path");
const fs = require("fs");
const { MongoClient } = require("mongodb");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env") });

const DATA_FILE = path.join(ROOT, "output_json", "6_100_percent_final_data.json");
const LOG_FILE = path.join(ROOT, "logs", "7_upload_to_db.log");
const BATCH_SIZE = 500;
const BATCH_DELAY_MS = 1000;

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}
function logError(msg) {
  const line = `[${ts()}] ERROR ${msg}`;
  console.error(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

async function main() {
  log("=== Step 7: Upload to MongoDB ===\n");

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  const collName = process.env.MONGODB_DB_COLLECTION_NAME;

  if (!uri || !dbName || !collName) {
    logError("Missing MongoDB env vars in .env");
    process.exit(1);
  }

  if (!fs.existsSync(DATA_FILE)) {
    logError(`Missing: ${DATA_FILE}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  log(`Loaded ${data.length} records`);

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const coll = db.collection(collName);

  // Get existing slugs from MongoDB
  const existingDocs = await coll.find({}, { projection: { slug: 1, _id: 0 } }).toArray();
  const existingSlugs = new Set(existingDocs.map((d) => d.slug));
  log(`Existing slugs in MongoDB: ${existingSlugs.size}`);

  const toInsert = data.filter((d) => !existingSlugs.has(d.slug));
  const skipped = data.length - toInsert.length;
  log(`To insert: ${toInsert.length}, Skipped (already exist): ${skipped}\n`);

  if (toInsert.length === 0) {
    log("Nothing to insert. Done.");
    await client.close();
    return;
  }

  // Batch insert
  const totalBatches = Math.ceil(toInsert.length / BATCH_SIZE);
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    try {
      const result = await coll.insertMany(batch, { ordered: false });
      inserted += result.insertedCount;
      log(`Batch ${batchNum}/${totalBatches} | inserted ${result.insertedCount}/${batch.length} | total ${inserted}/${toInsert.length}`);
    } catch (e) {
      // insertMany with ordered:false still throws but partial writes succeed
      const writeErrors = e.writeErrors?.length || 0;
      const insertedCount = e.insertedCount || 0;
      inserted += insertedCount;
      errors += writeErrors;
      log(`Batch ${batchNum}/${totalBatches} | inserted ${insertedCount}/${batch.length} | errors ${writeErrors} | total ${inserted}/${toInsert.length}`);
    }

    if (batchNum < totalBatches) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  const finalTotal = await coll.countDocuments();
  log("=== Upload Complete ===");
  log(`Total inserted this run: ${inserted}`);
  log(`Total errors: ${errors}`);
  log(`MongoDB collection count now: ${finalTotal}`);
  log(`Source: ${DATA_FILE}`);
  log(`Log: ${LOG_FILE}`);

  await client.close();
}

main().catch((e) => {
  logError(`Fatal: ${e.message}`);
  process.exit(1);
});
