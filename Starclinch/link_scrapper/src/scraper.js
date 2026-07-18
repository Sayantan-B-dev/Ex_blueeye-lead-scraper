import { readFileSync, writeFileSync, appendFileSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE = 'https://starclinch.com';
const STATE_FILE = join(ROOT, 'data', 'state.json');
const ARTISTS_FILE = join(ROOT, 'data', 'artists.json');
const LOG_FILE = join(ROOT, 'logs', 'run.log');

// Music-related categories only (per plan.txt)
const CATEGORIES = [
  'book-singer-online',
  'book-band-online',
  'book-dj-online',
  'book-instrumentalist-online',
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

const LANGUAGES = ['en-US,en;q=0.9', 'en-GB,en;q=0.8', 'en;q=0.7'];
const REFERERS = [BASE + '/', 'https://www.google.com/', 'https://duckduckgo.com/'];

// simple in-memory cookie jar (shared across requests to look like a session)
let COOKIE_JAR = '';
function randomCookie() {
  const n = randInt(8, 16);
  let s = '';
  for (let i = 0; i < n; i++) s += 'abcdef0123456789'[Math.floor(Math.random() * 16)];
  return `_sc_id=${s}`;
}
function getHeaders() {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const h = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)],
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': REFERERS[Math.floor(Math.random() * REFERERS.length)],
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  };
  if (COOKIE_JAR) h['Cookie'] = COOKIE_JAR;
  return h;
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// -- delays / limits --
const PAGE_DELAY_MIN = 2500;
const PAGE_DELAY_MAX = 6000;
const CAT_DELAY_MIN = 8000;
const CAT_DELAY_MAX = 18000;
const MAX_RETRIES = 4;

// -- big-batch cooldown (anti-ban) --
// After every BATCH_SIZE pages, take a long randomized pause so the traffic
// pattern looks human and we avoid rate-limit / IP bans.
const BATCH_SIZE = 50;
const BATCH_PAUSE_MIN = 15 * 60 * 1000; // 15 min
const BATCH_PAUSE_MAX = 30 * 60 * 1000; // 30 min

// hard page cap (per category) — raised above band's ~257 pages
const PAGE_CAP = 700;

// ============ STATE ============
function loadJSON(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf-8')); }
  catch { return fallback; }
}
function saveJSON(file, obj) {
  writeFileSync(file, JSON.stringify(obj, null, 2), 'utf-8');
}
// atomic write: write to .tmp then rename so a crash mid-write can't corrupt the file
function saveJSONAtomic(file, obj) {
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf-8');
  renameSync(tmp, file);
}

// state.json -> { category_page_done: { "book-singer-online|3": true }, links_seen: { slug: true } }
function loadState() { return loadJSON(STATE_FILE, { category_page_done: {}, links_seen: {} }); }
let _STATE = null; // kept for graceful shutdown flush
function saveState(s) { _STATE = s; saveJSON(STATE_FILE, s); }

function isPageDone(state, cat, page) { return !!state.category_page_done[`${cat}|${page}`]; }
function markPageDone(state, cat, page) { state.category_page_done[`${cat}|${page}`] = true; saveState(state); }
function isLinkSeen(state, slug) { return !!state.links_seen[slug]; }
function markLinkSeen(state, slug) { state.links_seen[slug] = true; saveState(state); }

function loadArtists() { return loadJSON(ARTISTS_FILE, []); }

// ============ LOGGING ============
// live progress state (rendered as a status banner on every event)
const PROG = {
  cat: '—', page: 0, totalPages: '?', category: 0, categoryTotal: 4,
  artists: 0, added: 0, banStreak: 0, status: 'starting', phase: '',
};
function statusBanner() {
  const bar = (frac) => {
    const w = 24, n = Math.max(0, Math.min(w, Math.round(frac * w)));
    return '█'.repeat(n) + '░'.repeat(w - n);
  };
  const catFrac = PROG.categoryTotal ? (PROG.category - 1 + (PROG.page / (PROG.totalPages === '?' ? 1 : PROG.totalPages))) / PROG.categoryTotal : 0;
  return [
    `\x1b[2K\x1b[1mSTARCLINCH SCRAPER\x1b[0m  [${PROG.status}]`,
    `  cat : \x1b[36m${PROG.category}/${PROG.categoryTotal}\x1b[0m ${PROG.cat}  (page ${PROG.page}/${PROG.totalPages})`,
    `  all : ${bar(catFrac)} ${(catFrac * 100).toFixed(1)}%`,
    `  artists: \x1b[32m${PROG.artists}\x1b[0m  (+${PROG.added} this page)   ban_streak: \x1b[33m${PROG.banStreak}\x1b[0m`,
    `  ${PROG.phase}`,
  ].join('\n');
}
function logLine(msg, opts = {}) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] ${msg}`;
  // redraw live banner above the scrolling log
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[2J\x1b[1;1H' + statusBanner() + '\n\n' + line + '\n');
  } else {
    console.log(line);
  }
  try { appendFileSync(LOG_FILE, line + '\n'); } catch {}
}
function logEvent(msg) { // event without full banner redraw (keeps log readable in file)
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

// ============ FETCH ============
let BAN_STREAK = 0;
const BAN_COOLDOWN = 300000; // 5 min hard pause after repeated bans

async function fetchPage(url) {
  PROG.banStreak = BAN_STREAK;
  if (BAN_STREAK >= 3) {
    PROG.status = 'BAN-COOLDOWN';
    logLine(`  ⏸ BAN_STREAK=${BAN_STREAK} → cooling down ${(BAN_COOLDOWN/1000).toFixed(0)}s`);
    await sleep(BAN_COOLDOWN);
    BAN_STREAK = 0;
    PROG.banStreak = 0;
  }
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: getHeaders(), redirect: 'follow' });
      // capture/refresh session cookie
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) COOKIE_JAR = setCookie.split(';')[0];
      else if (!COOKIE_JAR) COOKIE_JAR = randomCookie();

      if (res.ok) { BAN_STREAK = 0; PROG.banStreak = 0; return await res.text(); }
      if (res.status === 403 || res.status === 429 || res.status === 503) {
        BAN_STREAK++;
        PROG.banStreak = BAN_STREAK;
        PROG.status = 'BAN-RETRY';
        const wait = Math.min(20000 * 2 ** (attempt - 1), 180000) + randInt(0, 6000);
        logEvent(`  ⚠ ${res.status} on ${url} (attempt ${attempt}, ban_streak=${BAN_STREAK}) → wait ${(wait/1000).toFixed(0)}s`);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const wait = 5000 * attempt + randInt(0, 3000);
        logEvent(`  ⚠ fetch error ${err.message} (attempt ${attempt}) → retry in ${(wait/1000).toFixed(0)}s`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw new Error('exhausted retries');
}

function extractNextData(html) {
  const start = html.indexOf('<script id="__NEXT_DATA__"');
  if (start === -1) return null;
  const s2 = html.indexOf('>', start) + 1;
  const end = html.indexOf('</script>', s2);
  if (end === -1) return null;
  let raw = html.slice(s2, end);
  raw = raw.replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  try { return JSON.parse(raw); }
  catch { return null; }
}

// StarClinch masks real names on profile pages by splitting them across
// visible text and <span class="invisible select-none">…</span> (obfuscated
// with a canvas overlay). Merge both parts to reconstruct the full name.
// e.g. "Avijit" + "Das" -> "Avijit Das"
function reconstructName(html) {
  const re = /<span[^>]*class="[^"]*invisible select-none[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
  const parts = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const txt = m[1].replace(/<[^>]+>/g, '').trim();
    if (txt) parts.push(txt);
  }
  if (!parts.length) return null;
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// ============ SCRAPE ONE PAGE ============
async function scrapeCategoryPage(state, cat, page) {
  const url = page === 1 ? `${BASE}/${cat}` : `${BASE}/${cat}?page=${page}`;
  PROG.cat = cat; PROG.page = page; PROG.status = 'FETCHING';
  logLine(`  ↳ ${cat} page ${page} → ${url}`);
  let html;
  try {
    html = await fetchPage(url);
  } catch (err) {
    PROG.status = 'FETCH-FAIL';
    logEvent(`    ✗ fetch failed page ${page}: ${err.message}`);
    throw err;
  }
  const nextData = extractNextData(html);
  if (!nextData) { logEvent(`    ✗ no __NEXT_DATA__ — stopping category`); return { stop: true, added: 0 }; }

  const d = nextData?.props?.pageProps?.data;
  if (!d || !Array.isArray(d.artist_list)) {
    logEvent(`    ✗ empty artist_list — stopping category`);
    return { stop: true, added: 0 };
  }
  // total pages for this category (from artist_count / 15)
  if (d.artist_count) PROG.totalPages = Math.max(PROG.totalPages === '?' ? 0 : PROG.totalPages, Math.ceil(d.artist_count / 15));

  const artists = loadArtists();
  let added = 0;
  for (const a of d.artist_list) {
    const slug = a.slug;
    if (!slug) continue;
    if (isLinkSeen(state, slug)) continue; // skip already-processed slug
    markLinkSeen(state, slug);

    const name = (a.professional_name || '').trim();
    const vids = Array.isArray(a.artist_videos) ? a.artist_videos : [];
    const artist = {
      id: a.id || null,
      slug,
      name,
      category: (d.category?.name || cat).toString().trim(),
      input_category: cat,
      input_page: page,
      source: {
        url: `${BASE}/${slug}`,
        input_category: cat,
        input_page: page,
      },
      location: {
        city: a.city || null,
        state: null,
        country: 'India',
      },
      performance: {
        duration_minutes: parseDuration(a.performance_duration),
        team_members: { min: null, max: null },
        genres: [],
        languages: (a.languages || '').split(',').map(s => s.trim()).filter(Boolean),
      },
      booking: { url: `${BASE}/cart/checkout/${slug}` },
      about: (a.usp || '').trim(),
      faq: [],
      media: {
        videos: vids
          .filter(v => v.media_name === 'YouTube' && v.media_value)
          .map(v => `https://www.youtube.com/embed/${v.media_value}`),
        images: a.profile_pic ? [a.profile_pic] : [],
      },
    };
    artists.push(artist);
    added++;
  }

  saveJSONAtomic(ARTISTS_FILE, artists);
  markPageDone(state, cat, page);
  PROG.artists = artists.length;
  PROG.added = added;
  PROG.status = 'OK';
  logLine(`    ✓ +${added} artists (total ${artists.length}, page has_next=${d.has_next})`);
  return { stop: !d.has_next, added };
}

function parseDuration(s) {
  if (!s) return { min: null, max: null };
  const nums = String(s).match(/\d+/g);
  if (!nums) return { min: null, max: null };
  const n = nums.map(Number);
  if (n.length === 1) return { min: n[0], max: n[0] };
  return { min: Math.min(...n), max: Math.max(...n) };
}

// ============ RUN ============
function printBanner() {
  console.log('\n' + '='.repeat(64));
  console.log('  StarClinch Artist Scraper');
  console.log('  Categories: ' + CATEGORIES.join(', '));
  console.log('='.repeat(64) + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  printBanner();

  let onlyCat = null;
  let startPageOverride = 1;
  if (args[0] === '--cat') {
    onlyCat = args[1];
    if (!CATEGORIES.includes(onlyCat)) {
      logEvent(`Unknown category "${onlyCat}". Valid: ${CATEGORIES.join(', ')}`);
      process.exit(1);
    }
    if (args[2]) startPageOverride = parseInt(args[2]) || 1;
  }

  const state = loadState();
  const cats = onlyCat ? [onlyCat] : CATEGORIES;
  const sessionStart = Date.now();

  let batchCounter = 0;
  let currentCat = null, currentPage = 0;
  PROG.categoryTotal = cats.length;
  PROG.status = 'STARTING';

  for (let ci = 0; ci < cats.length; ci++) {
    const cat = cats[ci];
    let page = startPageOverride;
    currentCat = cat;
    PROG.category = ci + 1;
    PROG.cat = cat;
    PROG.totalPages = '?';
    PROG.status = 'SCRAPING';
    logEvent(`▶ Category ${PROG.category}/${PROG.categoryTotal}: ${cat}`);
    while (true) {
      currentPage = page;
      PROG.page = page;
      if (isPageDone(state, cat, page)) {
        logEvent(`  ⊙ page ${page} already done — skip`);
      } else {
        // pre-fetch jitter so requests don't arrive on a fixed cadence
        const pre = randInt(500, 2500);
        await sleep(pre);
        try {
          const r = await scrapeCategoryPage(state, cat, page);
          if (r.stop) { logEvent(`  ⏹ ${cat} finished (no more pages)`); break; }
        } catch (err) {
          PROG.status = 'ERROR';
          logEvent(`  ✗ ERROR page ${page}: ${err.message} — will retry on next run`);
          break;
        }
        batchCounter++;
        const delay = randInt(PAGE_DELAY_MIN, PAGE_DELAY_MAX);
        PROG.phase = `next page in ${(delay/1000).toFixed(1)}s`;
        logEvent(`  ~ next page in ${(delay/1000).toFixed(1)}s`);
        await sleep(delay);

        // big-batch anti-ban cooldown
        if (batchCounter >= BATCH_SIZE) {
          batchCounter = 0;
          const bp = randInt(BATCH_PAUSE_MIN, BATCH_PAUSE_MAX);
          PROG.status = 'BATCH-PAUSE';
          PROG.phase = `long cooldown ${(bp/60000).toFixed(1)}min`;
          logEvent(`  💤 BATCH ${BATCH_SIZE} pages done → long cooldown ${(bp/60000).toFixed(1)}min`);
          await sleep(bp);
          PROG.status = 'SCRAPING';
        }
      }
      page++;
      // safety: hard cap to avoid infinite loops
      if (page > PAGE_CAP) { logEvent(`  ⚠ reached page cap ${PAGE_CAP} for ${cat}`); break; }
    }

    const cd = randInt(CAT_DELAY_MIN, CAT_DELAY_MAX);
    if (cat !== cats[cats.length - 1]) {
      PROG.status = 'CAT-PAUSE';
      PROG.phase = `next category in ${(cd/1000).toFixed(1)}s`;
      logEvent(`  ~ next category in ${(cd/1000).toFixed(1)}s\n`);
      await sleep(cd);
    }
  }

  const artists = loadArtists();
  const elapsed = ((Date.now() - sessionStart) / 1000).toFixed(0);
  PROG.status = 'DONE';
  PROG.artists = artists.length;
  logEvent(`\n✅ SESSION COMPLETE — ${artists.length} total artists in ${ARTISTS_FILE}`);
  logEvent(`   Runtime: ${elapsed}s`);
}

// ============ GRACEFUL SHUTDOWN (disaster-proof resume) ============
// On Ctrl+C / SIGTERM / uncaught crash, flush state + artists so a restart
// resumes cleanly from the last completed page. Already-saved pages/artists
// are on disk; this just guarantees the in-memory state is persisted.
let _SHUTTING = false;
function gracefulShutdown(signal) {
  if (_SHUTTING) return;
  _SHUTTING = true;
  logLine(`\n⏻ ${signal} received — flushing state (resume safe)`);
  if (_STATE) saveJSON(STATE_FILE, _STATE);
  const a = loadArtists();
  if (Array.isArray(a)) saveJSONAtomic(ARTISTS_FILE, a);
  logLine(`  ✓ flushed. Re-run node src/scraper.js to resume.`);
  process.exit(0);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (err) => { logLine(`‼ uncaught: ${err.message}`); gracefulShutdown('uncaughtException'); });
process.on('unhandledRejection', (err) => { logLine(`‼ unhandledRejection: ${err?.message || err}`); gracefulShutdown('unhandledRejection'); });

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
