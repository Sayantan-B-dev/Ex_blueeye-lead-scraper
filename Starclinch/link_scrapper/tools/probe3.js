const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };
    https.get(url, { headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, html: d }));
    }).on('error', reject);
  });
}

(async () => {
  const { html } = await get('https://starclinch.com/book-instrumentalist-online');
  const start = html.indexOf('<script id="__NEXT_DATA__"');
  const s2 = html.indexOf('>', start) + 1;
  const end = html.indexOf('</script>', s2);
  const data = JSON.parse(html.slice(s2, end));
  const d = data.props.pageProps.data;
  console.log('data type', typeof d, Array.isArray(d) ? 'array len ' + d.length : '');
  if (Array.isArray(d)) {
    console.log('item0 keys', Object.keys(d[0]).slice(0, 40));
    console.log('item0 sample:', JSON.stringify(d[0], null, 2).slice(0, 1500));
  } else if (d && typeof d === 'object') {
    console.log('data keys', Object.keys(d).slice(0, 40));
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (Array.isArray(v)) console.log('  ARRAY', k, v.length);
    }
  }

  // hidden name sample
  const idx = html.indexOf('invisible select-none');
  if (idx !== -1) {
    console.log('--- hidden name region ---');
    console.log(html.slice(idx - 400, idx + 200));
  } else {
    console.log('no invisible select-none found');
  }
})();
