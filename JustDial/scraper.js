import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import * as http from 'http';
import * as fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');
const CSV_DIR = join(OUTPUT_DIR, 'csv');
const STATE_FILE = join(__dirname, 'state.json');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

const ACCEPT_VALUES = [
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
];

function getHeaders() {
  return {
    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    'Accept': ACCEPT_VALUES[Math.floor(Math.random() * ACCEPT_VALUES.length)],
    'Accept-Language': Math.random() > 0.5 ? 'en-US,en;q=0.5' : 'en-GB,en;q=0.5',
    'Referer': 'https://www.google.com/'
  };
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const PAGE_DELAY_MIN = 3000;
const PAGE_DELAY_MAX = 7000;
const QUERY_DELAY_MIN = 10000;
const QUERY_DELAY_MAX = 25000;
const MAX_QUERIES_PER_SESSION = 50;
const COOLDOWN_MINUTES = 30;
const MAX_PAGES = 10;
const RESULTS_PER_PAGE = 10;

function stateKey(city, query) { return `${city}|${query}`; }

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch { return { completed: {} }; }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function isCompleted(city, query) {
  return !!loadState().completed[stateKey(city, query)];
}

function markCompleted(city, query, done = true) {
  const state = loadState();
  if (done) state.completed[stateKey(city, query)] = true;
  else delete state.completed[stateKey(city, query)];
  saveState(state);
}

function toggleCompleted(city, query) {
  const key = stateKey(city, query);
  const state = loadState();
  if (state.completed[key]) delete state.completed[key];
  else state.completed[key] = true;
  saveState(state);
  return state;
}

// -- serve mode -------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveDashboard(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // API routes
  if (path === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(loadState()));
    return;
  }

  if (path === '/api/state' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const { city, query, done } = JSON.parse(body);
      const state = toggleCompleted(city, query);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(state));
    });
    return;
  }

  if (path === '/api/stats') {
    const queries = JSON.parse(readFileSync(join(__dirname, 'queries.json'), 'utf-8'));
    const state = loadState();
    let total = 0, done = 0;
    const cities = [];
    for (const [city, qs] of Object.entries(queries)) {
      for (const q of qs) {
        total++;
        if (state.completed[stateKey(city, q)]) done++;
      }
      cities.push({ city, total: qs.length, done: qs.filter(q => state.completed[stateKey(city, q)]).length });
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ total, done, cities }));
    return;
  }

  if (path === '/api/queries') {
    const queries = JSON.parse(readFileSync(join(__dirname, 'queries.json'), 'utf-8'));
    const state = loadState();
    const enriched = {};
    for (const [city, qs] of Object.entries(queries)) {
      enriched[city] = qs.map(q => ({ query: q, done: !!state.completed[stateKey(city, q)] }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(enriched));
    return;
  }

  // Serve static files
  let filePath = path === '/' ? join(__dirname, 'dashboard.html') : join(__dirname, path);
  filePath = decodeURIComponent(filePath);

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  const content = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}

function startServer(port = 3456) {
  const server = http.createServer(serveDashboard);
  server.listen(port, () => {
    console.log(`\n  JustDial Dashboard → http://localhost:${port}`);
    console.log(`  State: ${STATE_FILE}`);
    console.log('  Press Ctrl+C to stop\n');
  });
}

// -- scraper mode -----------------------------------------

function slugify(s) {
  return s.trim().replace(/\s+/g, '-');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPageWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) return await res.text();
      if (res.status === 403 && attempt < maxRetries) {
        const delay = Math.min(30_000 * 2 ** (attempt - 1), 120_000);
        console.log(`    → 403 on attempt ${attempt}, retry in ${delay/1000}s...`);
        await sleep(delay + Math.random() * 5000);
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      if (attempt < maxRetries && !err.message.includes('HTTP 403 after')) {
        await sleep(5000 * attempt);
        continue;
      }
      throw err;
    }
  }
}

function extractNextData(html) {
  const start = html.indexOf('<script id="__NEXT_DATA__"');
  if (start === -1) return null;
  const start2 = html.indexOf('>', start) + 1;
  const end = html.indexOf('</script>', start2);
  if (end === -1) return null;
  const raw = html.slice(start2, end);
  const decoded = raw.replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return JSON.parse(decoded);
}

function parseListings(nextData) {
  const listData = nextData?.props?.pageProps?.listData;
  if (!listData?.results?.data || !listData?.results?.columns) return { listings: [], total: 0 };
  const { data, columns } = listData.results;
  const total = parseInt(listData.totalNumberofResults) || 0;

  const listings = data.map(row => {
    const item = {};
    columns.forEach((col, i) => {
      item[col] = row[i] !== undefined ? row[i] : '';
    });
    return item;
  });

  return { listings, total };
}

function encodeCSV(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).replace(/"/g, '""');
  return /[,\n"]/.test(s) ? `"${s}"` : s;
}

function listingToRow(item) {
  const phone = item.VNumber || '';
  const wp = Array.isArray(item.wpnumber) ? item.wpnumber.join(';') : (item.wpnumber || '');
  const categories = item.type || '';
  const dimages = Array.isArray(item.dimages) ? item.dimages.join(';') : (item.dimages || '');
  return [
    item.name || '', phone, wp, item.NewAddress || '', item.area || '',
    item.city || '', item.compRating || '', item.totalReviews || '', categories,
    item.lat || '', item.lon || '', item.pincode || '', item.docid || '',
    item.weburl || '', item.compRatingln || '', dimages, item.verified || '', item.paidStatus || '',
  ].map(encodeCSV).join(',');
}

const CSV_HEADER = [
  'name', 'phone', 'whatsapp', 'address', 'area', 'city',
  'rating', 'reviews', 'categories', 'lat', 'lon', 'pincode',
  'docid', 'weburl', 'rating_ln', 'images', 'verified', 'paid_status'
].join(',');

async function scrapeQuery(city, query) {
  const slug = slugify(query);
  const baseUrl = `https://www.justdial.com/${encodeURIComponent(city)}/${slug}`;
  const allListings = [];

  const filename = `${city.replace(/[^a-zA-Z0-9]/g, '_')}_${slug}.csv`.toLowerCase();
  const filepath = join(CSV_DIR, filename);

  console.log(`  ${city} / ${query}`);

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? baseUrl : `${baseUrl}/page-${page}`;
    try {
      const html = await fetchPageWithRetry(url);
      const nextData = extractNextData(html);
      if (!nextData) { console.log(`    → no data page ${page}, stopping`); break; }
      const { listings } = parseListings(nextData);
      if (listings.length === 0) { console.log(`    → empty page ${page}, stopping`); break; }
      allListings.push(...listings);
      if (listings.length < RESULTS_PER_PAGE) break;
      await sleep(randInt(PAGE_DELAY_MIN, PAGE_DELAY_MAX));
    } catch (err) {
      console.log(`    → error page ${page}: ${err.message}`);
      if (allListings.length === 0) throw err; // propagate if nothing scraped yet
      break;
    }
  }

  if (allListings.length === 0) {
    console.log(`    → 0 listings (failed)`);
    return { city, query, listings: 0, filepath: null, error: 'no data' };
  }

  if (!existsSync(CSV_DIR)) mkdirSync(CSV_DIR, { recursive: true });
  const lines = [CSV_HEADER, ...allListings.map(listingToRow)];
  writeFileSync(filepath, lines.join('\n'), 'utf-8');

  markCompleted(city, query, true);
  console.log(`    → ${allListings.length} listings ✓`);
  return { city, query, listings: allListings.length, filepath };
}

function printUsage() {
  console.log('Usage:');
  console.log('  node scraper.js --serve [port]         Start dashboard server (default port 3456)');
  console.log('  node scraper.js <city> <query>         Scrape a single city-query');
  console.log('  node scraper.js --all [--max-queries N]  Scrape all incomplete (N queries before cooldown, default 50)');
  console.log('  node scraper.js --city <name>            Scrape incomplete queries for a specific city');
  console.log('  node scraper.js --list-done              List completed queries');
  console.log('  node scraper.js --list-pending           List pending queries');
  console.log('  node scraper.js --reset-state            Clear all completed state');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) { printUsage(); process.exit(0); }

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  if (args[0] === '--serve') {
    startServer(args[1] ? parseInt(args[1]) : 3456);
    return;
  }

  if (args[0] === '--reset-state') {
    saveState({ completed: {} });
    console.log('State cleared.');
    return;
  }

  if (args[0] === '--list-done' || args[0] === '--list-pending') {
    const data = JSON.parse(readFileSync(join(__dirname, 'queries.json'), 'utf-8'));
    const state = loadState();
    const showDone = args[0] === '--list-done';
    for (const [city, qs] of Object.entries(data)) {
      for (const q of qs) {
        const done = !!state.completed[stateKey(city, q)];
        if (done === showDone) console.log(`${city} | ${q}`);
      }
    }
    return;
  }

  if (args[0] === '--all' || args[0] === '--city') {
    const data = JSON.parse(readFileSync(join(__dirname, 'queries.json'), 'utf-8'));
    let entries = Object.entries(data);

    let maxQueries = MAX_QUERIES_PER_SESSION;
    const maxIdx = args.indexOf('--max-queries');
    if (maxIdx !== -1 && args[maxIdx + 1]) {
      maxQueries = parseInt(args[maxIdx + 1]);
    }

    if (args[0] === '--city' && args[1]) {
      const filter = args.slice(1).join(' ');
      entries = entries.filter(([city]) => city.toLowerCase() === filter.toLowerCase());
      if (entries.length === 0) { console.log(`City "${filter}" not found`); process.exit(1); }
    }

    const pending = [];
    for (const [city, qs] of entries) {
      for (const q of qs) {
        if (!isCompleted(city, q)) pending.push({ city, query: q });
      }
    }

    if (pending.length === 0) { console.log('All queries completed!'); return; }
    console.log(`\nPending: ${pending.length} queries (max ${maxQueries} per session)\n`);

    let queriesRun = 0;
    for (const { city, query } of pending) {
      queriesRun++;
      if (queriesRun > maxQueries) {
        const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;
        console.log(`\n  Hit limit of ${maxQueries} queries. Cooldown ${COOLDOWN_MINUTES}min (until ${new Date(Date.now() + cooldownMs).toLocaleTimeString()})...\n`);
        await sleep(cooldownMs);
        queriesRun = 1;
      }

      try {
        await scrapeQuery(city, query);
      } catch (err) {
        console.log(`  ✗ ${city} / ${query}: ${err.message}`);
      }

      const delay = randInt(QUERY_DELAY_MIN, QUERY_DELAY_MAX);
      console.log(`  ~ next in ${(delay / 1000).toFixed(1)}s`);
      await sleep(delay);
    }

    const state = loadState();
    const totalDone = Object.keys(state.completed).length;
    const total = entries.reduce((sum, [, qs]) => sum + qs.length, 0);
    console.log(`\nDone: ${totalDone}/${total}`);
    return;
  }

  // Single: node scraper.js <city> <query>
  const city = args[0];
  const query = args.slice(1).join(' ');
  await scrapeQuery(city, query);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
