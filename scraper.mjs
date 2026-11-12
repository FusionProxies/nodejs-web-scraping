// Web scraping with Node.js: axios + cheerio, end to end.
// Scrapes https://books.toscrape.com (a sandbox built for scraping practice): follows the
// pagination, extracts every book, retries failures, and saves CSV and JSON.
//
//   npm install
//   node scraper.mjs --pages 3
//   FUSION_USER=... FUSION_PASS=... node scraper.mjs --pages 3     # through a residential proxy
import { writeFile } from 'node:fs/promises';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';

const START = 'https://books.toscrape.com/catalogue/page-1.html';
const RATINGS = { One: 1, Two: 2, Three: 3, Four: 4, Five: 5 };
const pages = Number(process.argv[process.argv.indexOf('--pages') + 1]) || 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeClient() {
  const config = {
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  };
  const { FUSION_USER, FUSION_PASS, FUSION_COUNTRY = 'us' } = process.env;
  if (FUSION_USER && FUSION_PASS) {
    // one sticky residential IP for the whole run
    const user = `${FUSION_USER}-country-${FUSION_COUNTRY}-sessid-${Math.floor(Math.random() * 9e6) + 1e6}-sessTime-1800s`;
    const agent = new HttpsProxyAgent(`http://${encodeURIComponent(user)}:${encodeURIComponent(FUSION_PASS)}@resi.fusionproxy.net:12286`);
    Object.assign(config, { httpsAgent: agent, httpAgent: agent, proxy: false });
  }
  return axios.create(config);
}

async function get(client, url, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return (await client.get(url)).data;
    } catch (err) {
      const status = err.response?.status;
      const retryable = !status || status === 429 || status >= 500;
      if (!retryable || i === attempts) throw err;
      await sleep(1000 * 2 ** i); // 2 s, 4 s
    }
  }
}

function parse(html, pageUrl) {
  const $ = cheerio.load(html);
  const books = $('article.product_pod').map((_, el) => {
    const card = $(el);
    const link = card.find('h3 a');
    const rating = (card.find('p.star-rating').attr('class') || '').split(' ').find((c) => RATINGS[c]);
    return {
      title: link.attr('title'),
      price: Number(card.find('p.price_color').text().replace(/[^0-9.]/g, '')),
      rating: RATINGS[rating] ?? null,
      inStock: card.find('p.availability').text().includes('In stock'),
      url: new URL(link.attr('href'), pageUrl).href,
    };
  }).get();
  const next = $('li.next a').attr('href');
  return { books, next: next ? new URL(next, pageUrl).href : null };
}

const client = makeClient();
if (process.env.FUSION_USER) console.log('exit IP:', (await get(client, 'https://ipinfo.io/ip')).trim());

const all = [];
let url = START;
for (let page = 1; url && page <= pages; page++) {
  const { books, next } = parse(await get(client, url), url);
  all.push(...books);
  console.log(`page ${page}: ${books.length} books`);
  url = next;
  if (url) await sleep(1000); // be polite
}

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;
const csv = ['title,price,rating,inStock,url', ...all.map((b) => [b.title, b.price, b.rating, b.inStock, b.url].map(csvCell).join(','))].join('\n');
await writeFile('books.csv', csv + '\n');
await writeFile('books.json', JSON.stringify(all, null, 2));
console.log(`saved ${all.length} books to books.csv and books.json`);
