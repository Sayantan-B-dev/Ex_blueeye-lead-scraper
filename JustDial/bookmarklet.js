// JustDial Scraper Bookmarklet
// Minified version for bookmark bar:
// Copy the output of: node -e "const m = require('fs').readFileSync('bookmarklet.js','utf-8').replace(/\/\/.*/gm,'').trim().replace(/\s+/g,' '); console.log('javascript:' + encodeURIComponent(m))"

(function() {
  function getCSV() {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return alert('No __NEXT_DATA__ found on this page.');

    let data;
    try { data = JSON.parse(el.textContent); } catch(e) { return alert('Failed to parse page data.'); }

    const listData = data?.props?.pageProps?.listData;
    if (!listData?.results?.data || !listData?.results?.columns) return alert('No listing data found on this page.');

    const { data: rows, columns } = listData.results;
    const keyFields = ['name', 'VNumber', 'NewAddress', 'compRating', 'totalReviews', 'type', 'area', 'city', 'lat', 'lon', 'pincode', 'docid', 'weburl'];

    const colIndex = {};
    columns.forEach((c, i) => colIndex[c] = i);

    const header = ['name', 'phone', 'address', 'rating', 'reviews', 'categories', 'area', 'city', 'lat', 'lon', 'pincode', 'url', 'link'];
    const csvRows = [header.join(',')];

    for (const row of rows) {
      const get = (name) => {
        const i = colIndex[name];
        return i !== undefined ? (row[i] !== undefined && row[i] !== null ? String(row[i]) : '') : '';
      };
      const name = get('name');
      const phone = get('VNumber');
      const address = get('NewAddress');
      const rating = get('compRating');
      const reviews = get('totalReviews');
      const categories = get('type');
      const area = get('area');
      const city = get('city');
      const lat = get('lat');
      const lon = get('lon');
      const pincode = get('pincode');
      const weburl = get('weburl');
      const link = weburl ? 'https://www.justdial.com/' + weburl : '';

      const vals = [name, phone, address, rating, reviews, categories, area, city, lat, lon, pincode, link.startsWith('http') ? link : ''];
      csvRows.push(vals.map(v => {
        const s = String(v).replace(/"/g, '""');
        return /[,\n"]/.test(s) ? '"' + s + '"' : s;
      }).join(','));
    }

    return csvRows.join('\n');
  }

  const csv = getCSV();
  if (!csv) return;

  // Generate filename from page URL
  const parts = window.location.pathname.replace(/\/page-\d+/, '').split('/');
  const city = parts[1] || 'unknown';
  const query = (parts[2] || 'search').replace(/-/g, '_');
  const page = window.location.pathname.match(/page-(\d+)/);
  const pageNum = page ? '_p' + page[1] : '';
  const filename = city + '_' + query + pageNum + '.csv';

  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);

  const count = csv.split('\n').length - 1;
  alert('Scraped ' + count + ' listings → ' + filename);
})();
