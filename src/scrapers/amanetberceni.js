import * as cheerio from 'cheerio';
import { fetchText, mapWithConcurrency, cleanImageUrl } from './http.js';
import { classifyProduct, parsePriceToRon, extractSpecs, isPriceSane } from '../classifier.js';

const PAGES = [
  'https://www.amanetberceni.ro/telefoane',
  'https://www.amanetberceni.ro/telefoane?page=2',
  'https://www.amanetberceni.ro/telefoane?page=3',
  'https://www.amanetberceni.ro/telefoane?page=4',
  'https://www.amanetberceni.ro/itgaming',
  'https://www.amanetberceni.ro/magazinamanet',
];

/**
 * Amanet Berceni (Sector 4, București) — Wix SSR catalog.
 */
export async function scrapeAmanetBerceni(settings) {
  const eurToRon = settings.eurToRon || 4.98;
  const foundMap = new Map();
  let rawChecked = 0;

  await mapWithConcurrency(PAGES, 3, async (url) => {
    const res = await fetchText(url, { timeoutMs: 16000 });
    if (!res.ok) return;

    const $ = cheerio.load(res.text);
    const items = $('[data-hook="product-item-root"]');
    rawChecked += items.length;

    items.each((_, el) => {
      const $e = $(el);
      const title = $e.find('[data-hook="product-item-name"]').first().text().replace(/\s+/g, ' ').trim();
      const priceText = $e.find('[data-hook="product-item-price-to-pay"]').first().text().replace(/\s+/g, ' ').trim();
      const oldPriceText = $e.find('[data-hook="product-item-price-before-discount"]').first().text().replace(/\s+/g, ' ').trim();
      const href = $e.find('a[href*="/product-page/"]').first().attr('href');
      if (!title || !href) return;

      // Skip explicitly out of stock items
      if (/stoc epuizat|epuizat|vandut/i.test($e.text())) return;

      const productId = classifyProduct(title);
      if (!productId) return;

      const parsed = parsePriceToRon(priceText, 'RON', eurToRon);
      if (!parsed.priceRon || !isPriceSane(productId, parsed.priceRon)) return;

      const prevParsed = oldPriceText ? parsePriceToRon(oldPriceText, 'RON', eurToRon) : { priceRon: null };
      const specs = extractSpecs(title, '');
      const img = $e.find('img').first().attr('src');
      const slug = $e.attr('data-slug') || href.split('/').filter(Boolean).pop();
      const id = `amanetberceni:${slug}`;
      const fullUrl = href.startsWith('http') ? href : `https://www.amanetberceni.ro${href}`;

      if (!foundMap.has(id) || parsed.priceRon < foundMap.get(id).priceRon) {
        foundMap.set(id, {
          id,
          source: 'amanetberceni',
          sourceType: 'amanet',
          productId,
          title,
          priceRon: parsed.priceRon,
          originalPrice: parsed.originalPrice,
          currency: 'RON',
          previousPriceRon: prevParsed.priceRon && prevParsed.priceRon > parsed.priceRon ? prevParsed.priceRon : null,
          url: fullUrl,
          imageUrl: cleanImageUrl(img, 'https://www.amanetberceni.ro'),
          location: 'Amanet Berceni · București (Sector 4)',
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
    message: `Scannate ${rawChecked} produse Amanet Berceni, ${foundMap.size} relevante`,
  };
}
