const https = require("https");
const ROOT = require("path").resolve(__dirname, "..", "..");
require("dotenv").config({ path: require("path").join(ROOT, ".env") });

const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const BASE = "openrouter.ai";
const ROTATE_MODE = (process.env.OPENROUTER_ROTATE || "random").toLowerCase();

// Load all available API keys
const apiKeys = [];
for (let i = 1; i <= 10; i++) {
  const key = process.env[`OPENROUTER_API_KEY_${i}`];
  if (key) apiKeys.push(key);
}
// Fallback to single key for backward compatibility
if (apiKeys.length === 0 && process.env.OPENROUTER_API_KEY) {
  apiKeys.push(process.env.OPENROUTER_API_KEY);
}

if (apiKeys.length === 0) {
  throw new Error("No OpenRouter API key found. Set OPENROUTER_API_KEY or OPENROUTER_API_KEY_1...");
}

let roundRobinIndex = 0;

function pickKey() {
  if (ROTATE_MODE === "roundrobin") {
    const key = apiKeys[roundRobinIndex % apiKeys.length];
    roundRobinIndex++;
    return key;
  }
  // random (default)
  return apiKeys[Math.floor(Math.random() * apiKeys.length)];
}

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function post(url, body, apiKey) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        Authorization: `Bearer ${apiKey}`,
      },
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

async function rewrite(abouts) {
  if (!abouts || abouts.length === 0) return [];

  const items = abouts
    .map((a, i) => `${i + 1}. [id:${a.id}] Category: ${a.category} | About: ${a.about}`)
    .join("\n");

  const systemPrompt = `You are a professional copywriter. Rewrite artist descriptions to be COMPLETELY ORIGINAL wording while preserving EVERY factual detail — genre, style, instruments, achievements, mood, origin. Do NOT invent facts. Do NOT make them generic. Each rewrite must still sound specific to that exact artist.`;

  const userPrompt = `Rewrite the following ${abouts.length} artist descriptions. Return exactly ${abouts.length} rewritten descriptions, numbered 1–${abouts.length}, with the id in brackets like: 1. [id:12345] Rewritten text here.

Input:
${items}`;

  const url = `https://${BASE}/api/v1/chat/completions`;
  const payload = {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 2048,
  };

  // Try keys in rotation order, fallback on 429
  const keyOrder = [...apiKeys];
  if (ROTATE_MODE === "random") {
    // Shuffle for random fallback order
    for (let i = keyOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [keyOrder[i], keyOrder[j]] = [keyOrder[j], keyOrder[i]];
    }
  }

  let lastError;
  for (const apiKey of keyOrder) {
    try {
      const res = await post(url, payload, apiKey);

      if (res.status === 429) {
        lastError = new Error(`Rate limited (429) on key ${apiKeys.indexOf(apiKey) + 1}`);
        continue; // Try next key
      }

      if (res.status !== 200) {
        const errMsg = res.body?.error?.message || res.body?.error || res.raw?.slice(0, 300) || `HTTP ${res.status}`;
        throw new Error(`OpenRouter API error (${res.status}): ${JSON.stringify(errMsg)}`);
      }

      const responseText = res.body?.choices?.[0]?.message?.content || "";
      if (!responseText) {
        throw new Error("OpenRouter returned empty response");
      }

      const results = [];
      const pattern = /(\d+)\.\s*\[id:(\d+)\]\s*([\s\S]*?)(?=\n\s*\d+\.\s*\[id:|$)/g;
      let match;
      let parsedCount = 0;
      while ((match = pattern.exec(responseText)) !== null) {
        const id = parseInt(match[2], 10);
        const text = match[3].trim().replace(/\n{2,}/g, "\n").trim();
        if (text) {
          parsedCount++;
          results.push({ id, modified_about: text });
        }
      }

      if (parsedCount < abouts.length) {
        const fallback = responseText.split("\n").filter((l) => l.trim());
        for (let i = 0; i < abouts.length && i < fallback.length; i++) {
          const clean = fallback[i].trim().replace(/^\d+\.\s*/, "").trim();
          if (clean && !results.find((r) => r.id === abouts[i].id)) {
            results.push({ id: abouts[i].id, modified_about: clean });
          }
        }
      }

      for (const a of abouts) {
        if (!results.find((r) => r.id === a.id)) {
          results.push({ id: a.id, modified_about: null, error: "OpenRouter did not return a rewrite for this entry" });
        }
      }

      return results;
    } catch (e) {
      lastError = e;
      if (e.message?.includes("Rate limited")) continue;
      throw e;
    }
  }

  throw lastError || new Error("All OpenRouter keys exhausted (rate limited)");
}

module.exports = { rewrite };