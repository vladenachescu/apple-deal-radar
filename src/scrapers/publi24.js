import * as cheerio from 'cheerio';
import { fetchText, mapWithConcurrency, cleanImageUrl } from './http.js';
import {
  classifyProduct,
  isBucharestLocation,
  parsePriceToRon,
  extractSpecs,
  isPriceSane,
} from '../classifier.js';

// AirPods removed from P2P (too many fakes). Targeted ≥256GB queries for iPhone 16 Pro.
const PUBLI24_SEARCHES = [
  {
    url: 'https://www.publi24.ro/anunturi/electronice/telefoane-mobile/iphone/bucuresti/?q=iphone+16+pro+256&minprice=1050&sort=priceasc',
    hint: 'iphone-16-pro',
  },
  {
    url: 'https://www.publi24.ro/anunturi/electronice/telefoane-mobile/iphone/bucuresti/?q=iphone+16+pro&minprice=1050&sort=priceasc',
    hint: 'iphone-16-pro',
  },
  {
    url: 'https://www.publi24.ro/anunturi/electronice/telefoane-mobile/iphone/bucuresti/?q=iphone+16+pro+max&minprice=1100&sort=priceasc',
    hint: 'iphone-16-pro-max',
  },
  {
    url: 'https://www.publi24.ro/anunturi/electronice/telefoane-mobile/iphone/bucuresti/?q=iphone+17&minprice=1100&sort=priceasc',
    hint: 'iphone-17',
  },
  {
    url: 'https://www.publi24.ro/anunturi/electronice/telefoane-mobile/iphone/bucuresti/?q=iphone+17+pro&minprice=1300&sort=priceasc',
    hint: 'iphone-17-pro',
  },
  {
    url: 'https://www.publi24.ro/anunturi/electronice/telefoane-mobile/iphone/bucuresti/?q=iphone+17+pro+max&minprice=1400&sort=priceasc',
    hint: 'iphone-17-pro-max',
  },
];

export async function scrapePubli24(settings) {
  const strict = settings.strictBucharestOnly !== false;
  const eurToRon = settings.eurToRon || 4.98;
  const foundMap = new Map();
  let rawChecked = 0;

  await mapWithConcurrency(PUBLI24_SEARCHES, 3, async (search) => {
    const res = await fetchText(search.url, { timeoutMs: 15000 });
    if (!res.ok) return;

    const $ = cheerio.load(res.text);
    const cards = $('.article-item');
    rawChecked += cards.length;

    cards.each((_, el) => {
      const $el = $(el);
      const $titleLink = $el.find('.article-title a').first();
      const title = $titleLink.text().replace(/\s+/g, ' ').trim();
      const href = $titleLink.attr('href');
      if (!title || !href) return;

      const desc = $el.find('.article-description').text().replace(/\s+/g, ' ').trim();
      const locationText = $el.find('.article-location').text().replace(/\s+/g, ' ').trim();
      const priceText = $el.find('.article-price').text().replace(/\s+/g, ' ').trim();

      // STRICT Bucharest filter for P2P
      if (!isBucharestLocation(locationText, strict)) return;

      const productId = classifyProduct(title, search.hint);
      if (!productId) return;

      const parsed = parsePriceToRon(priceText, null, eurToRon);
      if (!parsed.priceRon || !isPriceSane(productId, parsed.priceRon)) return;

      const specs = extractSpecs(title, desc);
      const img =
        $el.find('.art-img img').attr('data-src') ||
        $el.find('.art-img img').attr('src');

      const articleId = $el.attr('data-articleid') || href.split('/').pop()?.replace('.html', '') || href;
      const id = `publi24:${articleId}`;

      const fullUrl = href.startsWith('http') ? href : `https://www.publi24.ro${href}`;
      if (!foundMap.has(id) || parsed.priceRon < foundMap.get(id).priceRon) {
        foundMap.set(id, {
          id,
          source: 'publi24',
          sourceType: 'p2p',
          productId,
          title,
          priceRon: parsed.priceRon,
          originalPrice: parsed.originalPrice,
          currency: parsed.currency,
          previousPriceRon: null,
          url: fullUrl,
          imageUrl: cleanImageUrl(img, 'https://www.publi24.ro'),
          location: locationText || 'București',
          storage: specs.storage,
          battery: specs.battery,
          condition: specs.condition,
          hasWarranty: specs.hasWarranty,
        });
      }
    });
  });

  return {
    items: [...foundMap.values()],
    rawChecked,
    message: `Verificate ${rawChecked} anunțuri, păstrate ${foundMap.size} din București`,
  };
}
