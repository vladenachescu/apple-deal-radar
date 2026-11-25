import * as cheerio from 'cheerio';
import { fetchText, cleanImageUrl } from './http.js';
import { classifyProduct, parsePriceToRon, extractSpecs, isPriceSane } from '../classifier.js';

/**
 * Fane Amanet (Sector 3, Vitan, București) — faneamanet.ro/magazin/
 */
export async function scrapeFaneAmanet(settings) {
  const eurToRon = settings.eurToRon || 4.98;
  const foundMap = new Map();
  let rawChecked = 0;

  const res = await fetchText('https://faneamanet.ro/magazin/', { timeoutMs: 15000 });
  if (!res.ok) {
    return { items: [], rawChecked: 0, message: `HTTP ${res.status}` };
  }

  const $ = cheerio.load(res.text);
  const cards = $('.fa-card-wrap, .olx-item');
  rawChecked = cards.length;

  cards.each((_, el) => {
    const $e = $(el);
    const title = $e.find('.olx-title').first().text().replace(/\s+/g, ' ').trim();
    const priceText = $e.find('.olx-price').first().text().replace(/\s+/g, ' ').trim();
    const href = $e.find('a').first().attr('href');
    if (!title || !href) return;

    const productId = classifyProduct(title);
    if (!productId) return;

    const parsed = parsePriceToRon(priceText, 'RON', eurToRon);
    if (!parsed.priceRon || !isPriceSane(productId, parsed.priceRon)) return;

    const specs = extractSpecs(title, '');
    const img = $e.find('img').first().attr('src');
    const slug = href.split('/').filter(Boolean).pop() || title;
    const id = `faneamanet:${slug}`;

    if (!foundMap.has(id) || parsed.priceRon < foundMap.get(id).priceRon) {
      foundMap.set(id, {
        id,
        source: 'faneamanet',
        sourceType: 'amanet',
        productId,
        title,
        priceRon: parsed.priceRon,
        originalPrice: parsed.originalPrice,
        currency: parsed.currency,
        previousPriceRon: null,
        url: href,
        imageUrl: cleanImageUrl(img, 'https://faneamanet.ro'),
        location: 'Fane Amanet · București (Vitan, S3)',
        storage: specs.storage,
        battery: specs.battery,
        condition: specs.condition || 'Verificat amanet',
        hasWarranty: true,
      });
    }
  });

  return {
    items: [...foundMap.values()],
    rawChecked,
    message: `Scannate ${rawChecked} produse Fane Amanet, ${foundMap.size} relevante`,
  };
}
