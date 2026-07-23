/*
 * ai-services/index.js — Provider factory
 *
 * Reads AI_PROVIDER env var (default "gemini").
 * Returns { rewrite(abouts) } for the chosen provider.
 * All providers share the same interface:
 *   rewrite(abouts: [{ id, slug, category, about }])
 *     -> Promise<[{ id, modified_about, error? }]>
 *
 * To add a new provider:
 *   1. Create ai-services/<name>.js exporting { rewrite }
 *   2. Set AI_PROVIDER=<name> in .env or at runtime
 */

const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
require("dotenv").config({ path: path.join(ROOT, ".env") });

const PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();

let provider;
try {
  provider = require(`./${PROVIDER}`);
} catch (e) {
  console.error(`[ai-services] Failed to load provider "${PROVIDER}": ${e.message}`);
  console.error(`[ai-services] Available providers: gemini, openrouter`);
  process.exit(1);
}

if (typeof provider.rewrite !== "function") {
  console.error(`[ai-services] Provider "${PROVIDER}" must export a rewrite() function`);
  process.exit(1);
}

module.exports = provider;
