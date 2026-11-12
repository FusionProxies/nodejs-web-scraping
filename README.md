<p align="center">
  <a href="https://fusionproxy.net/?utm_source=github&utm_medium=nodejs-web-scraping">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/FusionProxies/.github/main/assets/logo-on-dark.png">
      <img src="https://raw.githubusercontent.com/FusionProxies/.github/main/assets/logo-on-light.png" alt="Fusion Proxy" height="52">
    </picture>
  </a>
</p>

# Web scraping with Node.js: axios and cheerio

A complete Node.js web scraper in one file: download pages with axios, extract data with cheerio (jQuery-style selectors on the server), follow pagination, retry failures, stay polite, use a proxy, and save CSV and JSON.

The example scrapes [books.toscrape.com](https://books.toscrape.com), a sandbox site built for scraping practice.

```bash
npm install
node scraper.mjs --pages 3
```

```
page 1: 20 books
page 2: 20 books
page 3: 20 books
saved 60 books to books.csv and books.json
```

## 1. Download a page

```js
import axios from 'axios';

const client = axios.create({
  timeout: 30000,
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
});
const html = (await client.get('https://books.toscrape.com/catalogue/page-1.html')).data;
```

Set a timeout and a normal browser User-Agent; the default axios one is blocked by many sites.

## 2. Parse with cheerio

cheerio loads HTML and gives you the jQuery API without a browser:

```js
import * as cheerio from 'cheerio';

const $ = cheerio.load(html);
const books = $('article.product_pod').map((_, el) => ({
  title: $(el).find('h3 a').attr('title'),
  price: Number($(el).find('p.price_color').text().replace(/[^0-9.]/g, '')),
})).get();
```

To find selectors, open the page, right-click an item and choose **Inspect**. `.find()`, `.attr()`, `.text()` and `.map(...).get()` cover most scrapers.

## 3. Follow pagination

```js
const next = $('li.next a').attr('href');
const nextUrl = next ? new URL(next, pageUrl).href : null;
```

`new URL(relative, base)` turns `page-2.html` into a full URL.

## 4. Retry temporary failures

```js
async function get(client, url, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return (await client.get(url)).data;
    } catch (err) {
      const status = err.response?.status;
      if ((status && status !== 429 && status < 500) || i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));   // 2 s, 4 s
    }
  }
}
```

Retry network errors, `429` and `5xx`; a `404` will not get better.

## 5. Use a proxy

When `FUSION_USER` and `FUSION_PASS` are set, the scraper sends everything through a residential proxy with one sticky IP for the run:

```js
import { HttpsProxyAgent } from 'https-proxy-agent';

const user = `${FUSION_USER}-country-us-sessid-4821937-sessTime-1800s`;   // one US IP for 30 minutes
const agent = new HttpsProxyAgent(`http://${encodeURIComponent(user)}:${encodeURIComponent(FUSION_PASS)}@resi.fusionproxy.net:12286`);
const client = axios.create({ httpsAgent: agent, httpAgent: agent, proxy: false });
```

`proxy: false` matters: axios' own proxy option does not tunnel HTTPS correctly. More options (fetch, SOCKS5, environment variables) in [nodejs-proxy](https://github.com/FusionProxies/nodejs-proxy).

```bash
export FUSION_USER="your_username" FUSION_PASS="your_password"
node scraper.mjs --pages 3
```

## 6. Save the results

The script writes `books.csv` (quoted cells, safe for Excel) and `books.json` with `title`, `price`, `rating`, `inStock` and `url`.

## Be polite

Read `robots.txt` and the site's terms, scrape only public data, and keep a delay between requests (the script waits one second per page).

## When cheerio is not enough

cheerio sees the HTML the server sends. If the data appears only after JavaScript runs, first look for the JSON the page loads ([scrape-javascript-website](https://github.com/FusionProxies/scrape-javascript-website)), and if there is none use a headless browser: [puppeteer-proxy](https://github.com/FusionProxies/puppeteer-proxy) or [playwright-proxy](https://github.com/FusionProxies/playwright-proxy).

## Related

- [python-web-scraping](https://github.com/FusionProxies/python-web-scraping): the same scraper in Python
- [golang-web-scraping](https://github.com/FusionProxies/golang-web-scraping): the same scraper in Go with Colly
- [nodejs-proxy](https://github.com/FusionProxies/nodejs-proxy): every way to use a proxy in Node.js

[Fusion Proxy residential proxies](https://fusionproxy.net/proxies/residential?utm_source=github&utm_medium=nodejs-web-scraping) from $2.95/GB, with a [free trial](https://fusionproxy.net/free-trial?utm_source=github&utm_medium=nodejs-web-scraping).

## License

MIT, see [LICENSE](LICENSE).
