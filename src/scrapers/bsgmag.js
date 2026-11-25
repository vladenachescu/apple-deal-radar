import * as cheerio from 'cheerio';
import { fetchText, mapWithConcurrency, cleanImageUrl } from './http.js';
import { classifyProduct, parsePriceToRon, extractSpecs, isPriceSane } from '../classifier.js';

const BSG_QUERIES = [
  { url: 'https://bsgmag.ro/catalog/q/iphone%2016%20pro', hint: 'iphone-16-pro' },
  { url: 'https://bsgmag.ro/catalog/q/iphone%2016%20pro%20max', hint: 'iphone-16-pro-max' },
  { url: 'https://bsgmag.ro/catalog/q/iphone%2017', hint: 'iphone-17' },
  { url: 'https://bsgmag.ro/catalog/q/iphone%2017%20pro', hint: 'iphone-17-pro' },
  { url: 'https://bsgmag.ro/catalog/q/airpods%20pro%203', hint: 'airpods-pro-3' },
  { url: 'https://bsgmag.ro/catalog/q/airpods%20pro', hint: 'airpods-pro-3' },
];

export async function scrapeBsgmag(settings) {
  const eurToRon = settings.eurToRon || 4.98;
  const foundMap = new Map();
  let rawChecked = 0;

  await mapWithConcurrency(BSG_QUERIES, 3, async (search) => {
    const res = await fetchText(search.url, { timeoutMs: 15000 });
    if (!res.ok) return;

    const $ = cheerio.load(res.text);
    const cards = $('.product--grid');
    rawChecked += cards.length;

    cards.each((_, el) => {
      const $el = $(el);
      const $nameLink = $el.find('a.product__name').first();
      const title = $nameLink.text().replace(/\s+/g, ' ').trim();
      const href = $nameLink.attr('href') || $el.find('a.grid-image__link').attr('href');
      if (!title || !href) return;

      // Skip out-of-stock cards if marked
      const stateText = $el.find('.product__state, .product__actions').text().toLowerCase();
      if (/stoc epuizat|indisponibil/.test(stateText)) return;

      const productId = classifyProduct(title, search.hint);
      if (!productId) return;

      const priceText = $el.find('.product__info--price-gross').first().text().replace(/\s+/g, ' ').trim();
      const oldPriceText = $el.find('.product__info--price-old, .product__info--price-discount').first().text().replace(/\s+/g, ' ').trim();
      const parsed = parsePriceToRon(priceText, 'RON', eurToRon);
      if (!parsed.priceRon || !isPriceSane(productId, parsed.priceRon)) return;

      const prevParsed = oldPriceText ? parsePriceToRon(oldPriceText, 'RON', eurToRon) : { priceRon: null };
      const specs = extractSpecs(title, stateText);
      const img =
        $el.find('img.grid-image__image').attr('data-src') ||
        $el.find('img.grid-image__image').attr('src');

      const slugId = href.split('/').filter(Boolean).pop() || href;
      const id = `bsgmag:${slugId}`;
      const fullUrl = href.startsWith('http') ? href : `https://bsgmag.ro${href}`;

      if (!foundMap.has(id) || parsed.priceRon < foundMap.get(id).priceRon) {
        foundMap.set(id, {
          id,
          source: 'bsgmag',
          sourceType: 'amanet',
          productId,
          title,
          priceRon: parsed.priceRon,
          originalPrice: parsed.originalPrice,
          currency: 'RON',
          previousPriceRon: prevParsed.priceRon && prevParsed.priceRon > parsed.priceRon ? prevParsed.priceRon : null,
          url: fullUrl,
          imageUrl: cleanImageUrl(img, 'https://bsgmag.ro'),
          location: 'BSG Amanet · Produs verificat',
          storage: specs.storage,
          battery: specs.battery,
          condition: specs.condition || 'Verificat amanet',
          hasWarranty: true,
        });
      }
    });
  });

  return {
    items: [...foundMap.values()],
    rawChecked,
    message: `Scannate ${rawChecked} produse BSGmag, ${foundMap.size} relevante`,
  };
}
