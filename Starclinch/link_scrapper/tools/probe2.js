const fs = require('fs');
const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    };
    https.get(url, { headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, html: d }));
    }).on('error', reject);
  });
}

(async () => {
  const { status, html } = await get('https://starclinch.com/book-instrumentalist-online');
  const start = html.indexOf('<script id="__NEXT_DATA__"');
  const s2 = html.indexOf('>', start) + 1;
  const end = html.indexOf('</script>', s2);
  let data;
  try {
    data = JSON.parse(html.slice(s2, end));
  } catch (e) {
    console.log('JSON parse fail', e.message);
    return;
  }
  const props = data.props || {};
  console.log('top keys', Object.keys(props));
  const pp = props.pageProps || {};
  console.log('pageProps keys', Object.keys(pp));
  // look for arrays
  for (const k of Object.keys(pp)) {
    const v = pp[k];
    if (Array.isArray(v)) console.log('ARRAY', k, 'len', v.length, 'sample keys', v[0] && typeof v[0] === 'object' ? Object.keys(v[0]).slice(0, 20) : typeof v[0]);
  }
  // search for a hidden name snippet
  const hi = html.indexOf('aria-hidden="true"');
  console.log('--- snippet around aria-hidden ---');
  console.log(html.slice(hi - 200, hi + 300));
})();
