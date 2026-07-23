/*
 * 5_anti_copyright.js — AI-powered about text rewriter
 *
 * Reads logs/5_abouts.json, batches through an AI provider (Gemini by default)
 * to rewrite every about text with original wording, preserving all facts.
 *
 * Input : logs/5_abouts.json
 * Output: logs/5_modified_abouts.json
 * Progress: logs/5_gemini_progress.json
 * Failed log: logs/5_gemini_failed.json
 * Log  : logs/5_anti_copyright.log
 *
 * Disaster-proof:
 *   - Progress saved after EVERY batch (resume loses at most BATCH_SIZE records)
 *   - Failed ids logged separately, never re-tried (you can manually re-run them)
 *   - Originals in 5_abouts.json never touched
 *   - Fully idempotent re-runs
 *
 * Env overrides:
 *   BATCH_SIZE      = 10   (number of abouts per Gemini call)
 *   BATCH_DELAY_MS  = 1500 (delay between batches, ms)
 *   AI_PROVIDER     = gemini (swap to openai / claude in future)
 *   GEMINI_MODEL    = gemini-2.0-flash
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env") });

const aiProvider = require("./ai-services/index.js");

const ABOUTS_FILE = path.join(ROOT, "logs", "5_abouts.json");
const OUTPUT_FILE = path.join(ROOT, "logs", "5_modified_abouts.json");
const PROGRESS_FILE = path.join(ROOT, "logs", "5_gemini_progress.json");
const FAILED_FILE = path.join(ROOT, "logs", "5_gemini_failed.json");
const LOG_FILE = path.join(ROOT, "logs", "5_anti_copyright.log");

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "10", 10);
const BATCH_DELAY_MS = parseInt(process.env.BATCH_DELAY_MS || "1500", 10);
const MAX_RETRIES = 3;

// ---- helpers ----

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}
function warn(msg) {
  const line = `[${ts()}] WARN ${msg}`;
  console.warn(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}
function loadJson(p, def) {
  if (!fs.existsSync(p)) return def || null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return def || null; }
}

// ---- progress management ----

function loadProgress() {
  const p = loadJson(PROGRESS_FILE);
  if (p && Array.isArray(p.doneIds) && Array.isArray(p.failedIds)) return p;
  return { doneIds: [], failedIds: [], lastProcessed: 0 };
}
function saveProgress(state) {
  state.last_processed = state.doneIds.length + state.failedIds.length;
  state.last_updated = ts();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(state, null, 2));
}

// ---- main ----

async function main() {
  const startTime = Date.now();

  // 1. Load abouts
  if (!fs.existsSync(ABOUTS_FILE)) {
    log(`ERROR: ${ABOUTS_FILE} not found. Run extraction first.`);
    process.exit(1);
  }
  const all = loadJson(ABOUTS_FILE, []);
  log(`loaded ${all.length} about records from 5_abouts.json`);

  // 2. Load progress
  const state = loadProgress();
  const doneSet = new Set(state.doneIds.map(String));
  const failedSet = new Set(state.failedIds.map(String));

  // Determine need: skip done or already-failed ids
  const need = all.filter((a) => !doneSet.has(String(a.id)) && !failedSet.has(String(a.id)));
  log(`progress: done=${state.doneIds.length} failed=${state.failedIds.length} need=${need.length}`);

  if (need.length === 0) {
    log("nothing to do. exiting.");
    return;
  }

  // 3. Load existing output (so we don't lose prior batches' work)
  let output = loadJson(OUTPUT_FILE, []);
  const outputIds = new Set(output.map((r) => String(r.id)));

  // 4. Batch loop
  const totalBatches = Math.ceil(need.length / BATCH_SIZE);
  let batchSuccess = 0;
  let batchFail = 0;
  let batchRetries = 0;
  let processedInThisRun = 0;

  for (let b = 0; b < need.length; b += BATCH_SIZE) {
    const batch = need.slice(b, b + BATCH_SIZE);
    const batchNum = Math.floor(b / BATCH_SIZE) + 1;
    const ids = batch.map((a) => a.id).join(",");
    const idStart = batch[0].id;
    const idEnd = batch[batch.length - 1].id;

    let attempt = 0;
    let success = false;

    while (attempt < MAX_RETRIES && !success) {
      attempt++;
      try {
        const t0 = Date.now();
        const results = await aiProvider.rewrite(batch);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        // Classify results
        let ok = 0,
          err = 0;
        for (const r of results) {
          if (r.modified_about) {
            // Append/replace in output
            const idx = output.findIndex((o) => String(o.id) === String(r.id));
            if (idx >= 0) output[idx] = r;
            else output.push(r);
            ok++;
          } else {
            err++;
            failedSet.add(String(r.id));
            state.failedIds.push(r.id);
            const failEntry = { id: r.id, error: r.error || "unknown", batch: batchNum };
            const failLog = loadJson(FAILED_FILE, []);
            if (!failLog.find((f) => f.id === r.id)) failLog.push(failEntry);
            fs.writeFileSync(FAILED_FILE, JSON.stringify(failLog, null, 2));
          }
        }

        // Update done set
        for (const r of results) {
          if (r.modified_about) {
            doneSet.add(String(r.id));
            state.doneIds.push(r.id);
          }
        }

        // Persist
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
        saveProgress(state);

        processedInThisRun += batch.length;
        batchSuccess++;

        log(
          `batch ${batchNum}/${totalBatches} | ids ${idStart}..${idEnd} | sent=${
            batch.length
          } ok=${ok} err=${err} | ${elapsed}s | done=${state.doneIds.length} failed=${
            state.failedIds.length
          } | total_processed=${processedInThisRun}`
        );

        success = true;
      } catch (e) {
        const errMsg = e.message || String(e);
        if (attempt < MAX_RETRIES) {
          const backoff = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
          warn(
            `batch ${batchNum}/${totalBatches} | ids ${idStart}..${idEnd} | attempt ${attempt}/${MAX_RETRIES} | ${errMsg} | retrying in ${backoff}ms`
          );
          batchRetries++;
          await sleep(backoff);
        } else {
          warn(
            `batch ${batchNum}/${totalBatches} | ids ${idStart}..${idEnd} | FAILED after ${MAX_RETRIES} attempts | ${errMsg}`
          );
          // Mark all ids in this batch as permanently failed
          for (const a of batch) {
            if (!doneSet.has(String(a.id)) && !failedSet.has(String(a.id))) {
              failedSet.add(String(a.id));
              state.failedIds.push(a.id);
              const failEntry = { id: a.id, error: errMsg, batch: batchNum };
              const failLog = loadJson(FAILED_FILE, []);
              if (!failLog.find((f) => f.id === a.id)) failLog.push(failEntry);
              fs.writeFileSync(FAILED_FILE, JSON.stringify(failLog, null, 2));
            }
          }
          saveProgress(state);
          batchFail++;
          processedInThisRun += batch.length;
        }
      }
    }

    // Delay between batches (not after the last one)
    if (b + BATCH_SIZE < need.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // 5. Final summary
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  log("=== done ===");
  log(
    `total=${all.length} | succeeded=${state.doneIds.length} | failed=${state.failedIds.length} | batches_ok=${batchSuccess} batches_fail=${batchFail} retries=${batchRetries} | ${elapsed}min`
  );
  log(`output -> ${OUTPUT_FILE}`);
  log(`failed  -> ${FAILED_FILE}`);
}

main().catch((e) => {
  console.error(`[${ts()}] FATAL`, e);
  process.exit(1);
});
