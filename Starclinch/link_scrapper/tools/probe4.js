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
  const item = d.artist_list[0];
  console.log('artist_list[0] keys:', Object.keys(item));
  console.log(JSON.stringify(item, null, 2).slice(0, 2000));
  console.log('artist_count', d.artist_count, 'has_next', d.has_next, 'next_page', d.next_page);
  console.log('category', d.category);

  // check pagination URL
  const p2 = await get('https://starclinch.com/book-instrumentalist-online?page=2');
  const s2b = p2.html.indexOf('<script id="__NEXT_DATA__"');
  const s3 = p2.html.indexOf('>', s2b) + 1;
  const e3 = p2.html.indexOf('</script>', s3);
  const d2 = JSON.parse(p2.html.slice(s3, e3)).props.pageProps.data;
  console.log('PAGE2 artist_count', d2.artist_count, 'len', d2.artist_list.length, 'has_next', d2.has_next);
  console.log('PAGE2 first slug', d2.artist_list[0] && d2.artist_list[0].slug || '-');
})();
