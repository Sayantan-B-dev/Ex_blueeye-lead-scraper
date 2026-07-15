// ==UserScript==
// @name         JustDial Scraper
// @namespace    https://justdial.com
// @version      1.0
// @description  Adds floating scrape button on JustDial pages to extract listings as CSV
// @author       You
// @match        https://www.justdial.com/*
// @exclude      https://www.justdial.com/
// @icon         https://www.justdial.com/favicon.ico
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const STYLE = `
    #jd-scraper-btn {
      position: fixed; bottom: 20px; right: 20px; z-index: 999999;
      background: #1a73e8; color: #fff; border: none; border-radius: 8px;
      padding: 10px 18px; font-size: 14px; font-family: sans-serif;
      cursor: pointer; box-shadow: 0 2px 12px rgba(0,0,0,0.3);
      display: flex; align-items: center; gap: 6px; transition: transform 0.15s;
    }
    #jd-scraper-btn:hover { transform: scale(1.05); background: #1557b0; }
    #jd-scraper-btn:active { transform: scale(0.95); }
    #jd-scraper-btn svg { width: 16px; height: 16px; fill: #fff; }
    #jd-scraper-status {
      position: fixed; bottom: 70px; right: 20px; z-index: 999999;
      background: #333; color: #fff; padding: 8px 14px; border-radius: 6px;
      font-size: 13px; font-family: sans-serif; display: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2); max-width: 300px;
    }
  `;

  function injectCSS() {
    const s = document.createElement('style');
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function extractCSV() {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return null;

    let data;
    try { data = JSON.parse(el.textContent); } catch(e) { return null; }

    const listData = data?.props?.pageProps?.listData;
    if (!listData?.results?.data || !listData?.results?.columns) return null;

    const { data: rows, columns } = listData.results;
    const colIndex = {};
    columns.forEach((c, i) => colIndex[c] = i);

    const fields = ['name','VNumber','NewAddress','compRating','totalReviews','type','area','city','lat','lon','pincode','weburl'];
    const header = ['name','phone','address','rating','reviews','categories','area','city','lat','lon','pincode','link'];

    const csvRows = [header.join(',')];
    for (const row of rows) {
      const get = (name) => {
        const i = colIndex[name];
        return i !== undefined ? (row[i] ?? '') : '';
      };
      const link = get('weburl') ? 'https://www.justdial.com/' + get('weburl') : '';
      const vals = fields.slice(0, -1).map(f => get(f)).concat(link);
      csvRows.push(vals.map(v => {
        const s = String(v).replace(/"/g, '""');
        return /[,\n"]/.test(s) ? '"' + s + '"' : s;
      }).join(','));
    }
    return csvRows.join('\n');
  }

  function downloadCSV(csv) {
    const parts = window.location.pathname.replace(/\/page-\d+/, '').split('/');
    const city = parts[1] || 'unknown';
    const query = (parts[2] || 'search').replace(/-/g, '_');
    const p = window.location.pathname.match(/page-(\d+)/);
    const filename = city + '_' + query + (p ? '_p' + p[1] : '') + '.csv';

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    return csv.split('\n').length - 1;
  }

  function scrape() {
    const status = document.getElementById('jd-scraper-status');
    const csv = extractCSV();
    if (!csv) {
      status.textContent = 'No listing data found on this page.';
      status.style.display = 'block';
      setTimeout(() => status.style.display = 'none', 3000);
      return;
    }
    status.textContent = 'Scraping...';
    status.style.display = 'block';
    setTimeout(() => {
      const count = downloadCSV(csv);
      status.textContent = 'Saved ' + count + ' listings ✓';
      setTimeout(() => status.style.display = 'none', 3000);
    }, 100);
  }

  // Wait for page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Only show on listing pages (not homepage)
    if (window.location.pathname === '/' || window.location.pathname === '') return;

    injectCSS();

    const btn = document.createElement('button');
    btn.id = 'jd-scraper-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg> Scrape';
    btn.title = 'Extract all listings from this page as CSV';
    btn.addEventListener('click', scrape);
    document.body.appendChild(btn);

    const status = document.createElement('div');
    status.id = 'jd-scraper-status';
    document.body.appendChild(status);

    // Show listing count on page load
    const csv = extractCSV();
    if (csv) {
      const count = csv.split('\n').length - 1;
      status.textContent = count + ' listings found on this page';
      status.style.display = 'block';
      setTimeout(() => status.style.display = 'none', 4000);
    }
  }
})();
