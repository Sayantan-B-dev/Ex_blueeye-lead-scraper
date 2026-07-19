/*
 * 4_image_migrate.js  (consolidated, single-file migration)
 *
 * Migrates artist images from both source sets into ImageKit and exports ONE
 * final JSON. No foreign (b-cdn / starclinch / s3) URLs remain.
 *
 *   Inputs :
 *     output_json/3_null_free.json   (main set,  5406)
 *     output_json/extra.json         (extra set, 3606)  -- disjoint ids
 *   Per-set resume state (progress):
 *     logs/4_image_migrate_progress.json
 *     logs/4_image_migrate_extra_progress.json
 *   Single export output:
 *     output_json/4_imaged_migration_final.json
 *   Per-set reports (derived from progress files):
 *     logs/4_image_migrate_report.json
 *     logs/4_image_migrate_extra_report.json
 *
 * Behaviour:
 *   - Already an ImageKit URL  -> keep as-is (no re-upload / duplicate).
 *   - Target file ALREADY exists in ImageKit (folder/name) -> reuse its URL
 *     (no re-upload). e.g. if singers/dino-rock/dino-rock.jpg exists, use it.
 *   - Otherwise upload the remote source URL into folder/name.
 *   - Resume: an artist is considered "done" ONLY if every stored URL is a
 *     real ImageKit URL. Corrupted entries (originals left in progress) are
 *     automatically re-queued and re-migrated. Failed (dead-link) artists are
 *     retried every run.
 *
 * Disaster-proof: progress persisted every PROGRESS_SAVE_EVERY artists and at
 * the end. Re-running resumes exactly where it stopped.
 *
 * Env overrides:
 *   IMG_CONCURRENCY = 8    (max in-flight uploads)
 *   IMG_RETRIES     = 3    (retry attempts per image)
 *   IMG_DELAY_MS    = 100  (delay between artists, ms)
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const ImageKit = require("imagekit");
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

process.on("uncaughtException", (e) => { console.error("UNCAUGHT", e); process.exit(2); });
process.on("unhandledRejection", (e) => { console.error("UNHANDLED", e); process.exit(3); });

// Host of your ImageKit URL endpoint (so already-migrated URLs aren't re-uploaded).
const IK_HOST = (() => {
  try { return new URL(process.env.IMAGEKIT_URL_ENDPOINT || "").hostname.toLowerCase(); }
  catch { return ""; }
})();
const IK_MARK = "ik.imagekit.io";

// ---- Configuration: the two source sets + their progress files ----
const SETS = [
  {
    key: "main",
    input: path.join(ROOT, "output_json", "3_null_free.json"),
    progress: path.join(ROOT, "logs", "4_image_migrate_progress.json"),
    report: path.join(ROOT, "logs", "4_image_migrate_report.json"),
  },
  {
    key: "extra",
    input: path.join(ROOT, "output_json", "extra.json"),
    progress: path.join(ROOT, "logs", "4_image_migrate_extra_progress.json"),
    report: path.join(ROOT, "logs", "4_image_migrate_extra_report.json"),
  },
];

const OUTPUT = path.join(ROOT, "output_json", "4_imaged_migration_final.json");

const RETRIES = parseInt(process.env.IMG_RETRIES || "3", 10);
const DELAY_MS = parseInt(process.env.IMG_DELAY_MS || "100", 10);
const CONCURRENCY = parseInt(process.env.IMG_CONCURRENCY || "8", 10);
const PROGRESS_SAVE_EVERY = 10;

const CATEGORY_FOLDER = {
  SINGER: "singers",
  "LIVE BAND": "bands",
  DJ: "djs",
  INSTRUMENTALIST: "instrumentalists",
};

function ts() {
  // Local time (not UTC) for log timestamps (user is UTC+05:30).
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function isIK(u) {
  return typeof u === "string" && u.includes(IK_MARK);
}

// Semaphore: bounds the number of in-flight async operations (uploads/API calls).
function makeSemaphore(max) {
  let active = 0;
  const queue = [];
  const take = () => new Promise((res) => {
    if (active < max) { active++; res(); }
    else queue.push(res);
  });
  const release = () => {
    if (queue.length) { active++; queue.shift()(); }
    else active--;
  };
  return async function run(fn) {
    await take();
    try { return await fn(); }
    finally { release(); }
  };
}

// Bounded pool: at most `limit` items ever in flight.
async function mapPool(items, worker, limit) {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function catFolder(cat) {
  if (CATEGORY_FOLDER[cat]) return CATEGORY_FOLDER[cat];
  const s = String(cat || "other").toLowerCase().replace(/\s+/g, "-");
  return s.endsWith("s") ? s : s + "s";
}
function extFromUrl(url) {
  const m = String(url || "").match(/\.([a-z0-9]+)(?:\?.*)?$/i);
  const ext = m ? m[1].toLowerCase() : "jpg";
  const VALID = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"];
  return VALID.includes(ext) ? ext : "jpg";
}
function slugifyName(name) {
  return String(name || "artist")
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artist";
}
// Filename from artist name: "gippy-grewal.jpg", "gippy-grewal-2.jpg", ...
function fileNameFor(artist, i, ext) {
  const base = slugifyName(artist.name);
  return i === 0 ? `${base}.${ext}` : `${base}-${i + 1}.${ext}`;
}

// ---- ImageKit helpers ----
const apiThrough = makeSemaphore(CONCURRENCY);

// Cache of existing files per folder: folder -> Map<fileName, url>
const folderCache = new Map();

async function existingUrlInFolder(folder, fileName) {
  return apiThrough(async () => {
    if (!folderCache.has(folder)) {
      const map = new Map();      // exact name -> url
      const baseMap = new Map();  // base (before first _) -> url  (covers prior unique-name uploads)
      try {
        const res = await imagekit.listFiles({ path: "/" + folder, limit: 1000 });
        const files = Array.isArray(res) ? res : (res && res.data) || [];
        for (const f of files) {
          if (f && f.type !== "folder" && f.name) {
            // Strip the "?updatedAt=..." query ImageKit appends so stored URLs are clean.
            const u = (f.url || f.filePath || "").split("?")[0];
            map.set(f.name, u);
            const base = f.name.split("_")[0].split(".")[0];
            if (!baseMap.has(base)) baseMap.set(base, u);
          }
        }
      } catch (e) {
        // If listing fails, treat as "not found" and let upload attempt proceed.
        console.log(`[${ts()}] WARN listFiles failed for ${folder}: ${e.message || e}`);
      }
      folderCache.set(folder, { map, baseMap });
    }
    const { map, baseMap } = folderCache.get(folder);
    if (map.get(fileName)) return map.get(fileName);
    const base = fileName.split("_")[0].split(".")[0];
    return baseMap.get(base) || null;
  });
}

async function uploadOne(url, folder, fileName) {
  // Reuse if the file already exists in ImageKit under the same folder/name
  // (exact match, or any file sharing the base name from a prior run).
  // NOTE: this check is done OUTSIDE the upload semaphore to avoid a nested
  // semaphore deadlock (existingUrlInFolder also uses apiThrough).
  const existing = await existingUrlInFolder(folder, fileName);
  if (existing) return { ok: true, url: existing, reused: true };

  return apiThrough(async () => {
    let lastErr;
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      try {
        const res = await imagekit.upload({
          file: url, // remote URL -> ImageKit fetches it
          fileName,
          folder,
          useUniqueFileName: false, // keep exact fileName so reuse-by-name is reliable & idempotent
        });
        // Strip the "?updatedAt=..." query ImageKit appends.
        const clean = (res.url || "").split("?")[0];
        return { ok: true, url: clean, reused: false };
      } catch (e) {
        lastErr = e;
        await sleep(500 * attempt);
      }
    }
    return { ok: false, error: String(lastErr && lastErr.message ? lastErr.message : lastErr) };
  });
}

async function migrateArtist(artist) {
  const folder = `${catFolder(artist.category)}/${artist.slug}`;
  const imgs = (artist.media && artist.media.images) || [];
  const tasks = imgs.map((original, i) => {
    let host = "";
    try { host = new URL(original).hostname.toLowerCase(); } catch { /* non-url */ }
    // Already an ImageKit URL -> keep as-is (avoid re-upload / duplicate).
    if (IK_HOST && host === IK_HOST) return Promise.resolve({ ok: true, url: original, index: i + 1, reused: true, original });
    const ext = extFromUrl(original);
    const fileName = fileNameFor(artist, i, ext);
    return uploadOne(original, folder, fileName).then((r) => ({ ...r, index: i + 1, original }));
  });
  const results = await Promise.all(tasks);
  const newUrls = [];
  let imgFailed = 0;
  const errors = [];
  for (const r of results) {
    if (r.ok) newUrls.push(r.url);
    else {
      // Upload failed: drop the image rather than keep the foreign URL.
      imgFailed++;
      errors.push({ index: r.index, url: r.original || r.url, error: r.error });
    }
  }
  return { newUrls, imgFailed, errors };
}

function loadProgress(file) {
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { /* ignore corrupt */ }
  }
  return { migrated: {}, failed: [], failedDetails: {}, counts: { migrated: 0, failedImages: 0, skipped: 0 } };
}
function saveProgress(file, state) {
  state.last_updated = ts();
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

// Run one source set: migrate, persist progress, return the migrated array.
async function runSet(set) {
  const data = JSON.parse(fs.readFileSync(set.input, "utf8"));
  const state = loadProgress(set.progress);
  const migrated = state.migrated || {};
  const failedSet = new Set(state.failed || []);
  const failedDetails = state.failedDetails || {};
  let failedImagesTotal = state.counts.failedImages || 0;

  // Resume correctly: only skip if EVERY stored URL is a real ImageKit URL.
  // Corrupted entries (originals) are re-queued automatically.
  const need = data.filter((a) => {
    const m = migrated[String(a.id)];
    if (!m) return true;
    const arr = Array.isArray(m) ? m : [m];
    return !(arr.length > 0 && arr.every(isIK));
  });
  failedSet.clear(); // repopulated this run for artists that fail again

  console.log(`[${ts()}] === set: ${set.key} ===`);
  console.log(`[${ts()}] total=${data.length} alreadyMigrated=${Object.keys(migrated).length} need=${need.length}`);

  const results = {};
  for (const a of data) results[a.id] = a;
  for (const aid in migrated) {
    if (results[aid] && Array.isArray(migrated[aid]) && migrated[aid].every(isIK)) {
      results[aid].media = results[aid].media || {};
      results[aid].media.images = migrated[aid];
    }
  }

  let done = 0;
  let failedArtists = 0;
  let reusedCount = 0;
  let sinceSave = 0;

  const processOne = async (artist) => {
    const r = await migrateArtist(artist);
    if (r.imgFailed > 0) {
      failedImagesTotal += r.imgFailed;
      failedArtists++;
      failedSet.add(artist.id);
      failedDetails[String(artist.id)] = {
        name: artist.name,
        slug: artist.slug,
        category: artist.category,
        failed_count: r.imgFailed,
        errors: r.errors,
      };
      console.log(`[${ts()}] x FAIL id=${artist.id} (${artist.name}) ${r.imgFailed} img(s):`);
      for (const e of r.errors) {
        console.log(`        [${e.index}] ${e.url}`);
        console.log(`                 -> ${e.error}`);
      }
    } else {
      migrated[String(artist.id)] = r.newUrls;
      results[artist.id].media = results[artist.id].media || {};
      results[artist.id].media.images = r.newUrls;
    }
    if (r.newUrls) reusedCount += r.newUrls.filter((u) => u && u !== undefined).length; // approx

    done++;
    sinceSave++;
    if (sinceSave >= PROGRESS_SAVE_EVERY) {
      state.migrated = migrated;
      state.failed = [...failedSet];
      state.failedDetails = failedDetails;
      state.counts = { migrated: Object.keys(migrated).length, failedImages: failedImagesTotal, skipped: 0 };
      saveProgress(set.progress, state);
      sinceSave = 0;
      console.log(`[${ts()}] [${set.key}] progress ${done}/${need.length} migrated=${Object.keys(migrated).length} failedArtists=${failedArtists}`);
    }
    if (DELAY_MS) await sleep(DELAY_MS);
  };

  console.log(`[${ts()}] [${set.key}] starting pool need=${need.length} concurrency=${CONCURRENCY}`);
  await mapPool(need, processOne, CONCURRENCY);
  console.log(`[${ts()}] [${set.key}] pool finished`);

  // Final save for this set.
  state.migrated = migrated;
  state.failed = [...failedSet];
  state.failedDetails = failedDetails;
  state.counts = { migrated: Object.keys(migrated).length, failedImages: failedImagesTotal, skipped: 0 };
  saveProgress(set.progress, state);

  // Build this set's array with migrated images applied (failed -> blank).
  const failedIds = new Set([...failedSet].map(String));
  const out = data.map((a) => {
    const rec = results[a.id] || a;
    if (failedIds.has(String(a.id))) {
      rec.media = rec.media || {};
      rec.media.images = [];
    }
    return rec;
  });

  // Report derived from progress file.
  let realIk = 0, corrupted = 0;
  for (const k in migrated) {
    const arr = Array.isArray(migrated[k]) ? migrated[k] : [migrated[k]];
    if (arr.length && arr.every(isIK)) realIk++;
    else corrupted++;
  }
  const report = {
    generated_at: ts(),
    set: set.key,
    input_total: data.length,
    migrated_real_ik: realIk,
    migrated_corrupted_dropped: corrupted,
    failed_artists: failedSet.size,
    failed_images: failedImagesTotal,
    failed_ids_sample: [...failedSet].slice(0, 50),
  };
  fs.writeFileSync(set.report, JSON.stringify(report, null, 2));

  console.log(`[${ts()}] [${set.key}] === done ===`);
  console.log(JSON.stringify(report, null, 2));
  return out;
}

async function main() {
  const allSets = [];
  for (const set of SETS) {
    const arr = await runSet(set);
    allSets.push(arr);
  }

  // Merge all sets (disjoint ids) into ONE export.
  const merged = allSets.flat();

  // Final safety sweep: drop any media.images entry that is NOT an ImageKit URL.
  let foreignLeft = 0;
  for (const a of merged) {
    const imgs = a.media && a.media.images;
    if (Array.isArray(imgs) && imgs.length) {
      const cleaned = imgs.filter(isIK);
      foreignLeft += imgs.length - cleaned.length;
      a.media.images = cleaned;
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(merged, null, 2));
  console.log(`[${ts()}] === FINAL ===`);
  console.log(`merged_total=${merged.length} foreign_links_stripped_in_final_sweep=${foreignLeft}`);
  console.log(`output -> ${OUTPUT}`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
