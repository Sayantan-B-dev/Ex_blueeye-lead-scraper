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
  console.log('STATUS', status, 'LEN', html.length);
  console.log('Has __NEXT_DATA__', html.includes('__NEXT_DATA__'));
  console.log('Has Pranav', html.includes('Pranav') ? 'YES' : 'no');
  console.log('Has aria-hidden', html.includes('aria-hidden="true"'));
  // find artist links
  const m = html.match(/<a[^>]+href="(\/[^"]+?)"/g) || [];
  const artists = new Set();
  for (const a of m) {
    const href = a.match(/href="(\/[^"]+?)"/)[1];
    artists.add(href);
  }
  console.log('unique hrefs', artists.size);
  // look for links that look like artist profiles
  const profs = [...artists].filter(h => !h.includes('book-') && !h.includes('http'));
  console.log('sample non-book hrefs:', profs.slice(0, 20));
})();
