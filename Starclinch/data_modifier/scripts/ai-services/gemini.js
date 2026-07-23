/*
 * ai-services/gemini.js — Gemini provider for 5_anti_copyright.js
 *
 * Exports: rewrite(abouts) -> Promise<[{ id, modified_about, error? }]>
 *
 * Uses raw HTTPS (no SDK) so no extra dependencies.
 * Reads GEMINI_API_KEY from process.env.
 * Override model via GEMINI_MODEL env (default gemini-2.0-flash).
 */

const https = require("https");
const ROOT = require("path").resolve(__dirname, "..", "..");
require("dotenv").config({ path: require("path").join(ROOT, ".env") });

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const API_KEY = process.env.GEMINI_API_KEY;
const BASE = "generativelanguage.googleapis.com";

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    };
    const req = https.request(opts, (res) => {
      let chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = null; }
        resolve({ status: res.statusCode, body: parsed, raw });
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/*
 * Prompts Gemini to rewrite 10 about texts at once.
 * abouths: array of { id, slug, category, about }
 * Returns: array of { id, modified_about } in the same order.
 * If an individual rewrite fails (Gemini doesn't return it), that entry gets error set.
 */
async function rewrite(abouts) {
  if (!abouts || abouts.length === 0) return [];
  if (!API_KEY) throw new Error("GEMINI_API_KEY not set in .env");

  // Build a structured prompt
  const items = abouts
    .map((a, i) => `${i + 1}. [id:${a.id}] Category: ${a.category} | Slug: ${a.slug} | About: ${a.about}`)
    .join("\n");

  const prompt = `You are a professional copywriter. Rewrite the following ${abouts.length} artist descriptions to be COMPLETELY ORIGINAL wording while preserving EVERY factual detail — genre, style, instruments, achievements, mood, origin. Do NOT invent facts. Do NOT make them generic. Each rewrite must still sound specific to that exact artist.

Return exactly ${abouts.length} rewritten descriptions, numbered 1–${abouts.length}, with the id in brackets like: 1. [id:12345] Rewritten text here.

Input:
${items}`;

  const url = `https://${BASE}/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  };

  const res = await post(url, payload);

  if (res.status !== 200) {
    const errMsg = res.body?.error?.message || res.raw?.slice(0, 300) || `HTTP ${res.status}`;
    throw new Error(`Gemini API error (${res.status}): ${errMsg}`);
  }

  // Parse response
  const candidates = res.body?.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error("Gemini returned empty candidates");
  }
  const responseText = candidates[0].content?.parts?.[0]?.text || "";

  // Parse numbered lines: look for "N. [id:XXXXX] ..."
  const results = [];
  const pattern = /(\d+)\.\s*\[id:(\d+)\]\s*([\s\S]*?)(?=\n\s*\d+\.\s*\[id:|$)/g;
  let match;
  let parsedCount = 0;
  while ((match = pattern.exec(responseText)) !== null) {
    const idx = parseInt(match[1], 10);
    const id = parseInt(match[2], 10);
    const text = match[3].trim();
    // Remove trailing newline artifacts
    const clean = text.replace(/\n{2,}/g, "\n").trim();
    if (clean) {
      parsedCount++;
      results.push({ id, modified_about: clean });
    }
  }

  // Fallback: if regex didn't match enough, try line-by-line
  if (parsedCount < abouts.length) {
    const fallback = responseText.split("\n").filter((l) => l.trim());
    for (let i = 0; i < abouts.length && i < fallback.length; i++) {
      const line = fallback[i].trim();
      // Remove leading number + dot
      const clean = line.replace(/^\d+\.\s*/, "").trim();
      if (clean && !results.find((r) => r.id === abouts[i].id)) {
        results.push({ id: abouts[i].id, modified_about: clean });
      }
    }
  }

  // If still missing some, fill with error marker
  for (const a of abouts) {
    if (!results.find((r) => r.id === a.id)) {
      results.push({ id: a.id, modified_about: null, error: "Gemini did not return a rewrite for this entry" });
    }
  }

  return results;
}

module.exports = { rewrite };
