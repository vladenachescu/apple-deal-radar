import * as cheerio from 'cheerio';
import { fetchText, mapWithConcurrency, cleanImageUrl } from './http.js';
import { classifyProduct, parsePriceToRon, extractSpecs, isPriceSane } from '../classifier.js';

const KLAP_QUERIES = [
  { url: 'https://klap.ro/?s=iphone+16+pro&post_type=product', hint: 'iphone-16-pro' },
  { url: 'https://klap.ro/?s=iphone+16+pro+max&post_type=product', hint: 'iphone-16-pro-max' },
  { url: 'https://klap.ro/?s=iphone+17&post_type=product', hint: 'iphone-17' },
  { url: 'https://klap.ro/?s=iphone+17+pro&post_type=product', hint: 'iphone-17-pro' },
  { url: 'https://klap.ro/?s=airpods+pro+3&post_type=product', hint: 'airpods-pro-3' },
];

export async function scrapeKlap(settings) {
  const eurToRon = settings.eurToRon || 4.98;
  const foundMap = new Map();
  let rawChecked = 0;

  await mapWithConcurrency(KLAP_QUERIES, 3, async (search) => {
    const res = await fetchText(search.url, { timeoutMs: 15000 });
    if (!res.ok) return;

    const $ = cheerio.load(res.text);
    const products = $('li.product');
    rawChecked += products.length;

    products.each((_, el) => {
      const $el = $(el);
      if ($el.hasClass('outofstock')) return;

      const title = $el.find('.woocommerce-loop-product__title').first().text().replace(/\s+/g, ' ').trim();
      const href = $el.find('a.woocommerce-LoopProduct-link, a').first().attr('href');
      if (!title || !href) return;

      const productId = classifyProduct(title, search.hint);
      if (!productId) return;

      // Current price prefers <ins>, falls back to plain .woocommerce-Price-amount
      const insPriceText = $el.find('.produs-price-redesign ins .woocommerce-Price-amount, ins .woocommerce-Price-amount').first().text().trim();
      const delPriceText = $el.find('.produs-price-redesign del .woocommerce-Price-amount, del .woocommerce-Price-amount').first().text().trim();
      const fallbackPriceText = $el.find('.produs-price-redesign .woocommerce-Price-amount, .price .woocommerce-Price-amount').first().text().trim();

      const parsed = parsePriceToRon(insPriceText || fallbackPriceText, 'RON', eurToRon);
      if (!parsed.priceRon || !isPriceSane(productId, parsed.priceRon)) return;

      const prevParsed = delPriceText ? parsePriceToRon(delPriceText, 'RON', eurToRon) : { priceRon: null };

      const storageText = $el.find('.produs-col-capacitate').text().trim();
      const colorText = $el.find('.produs-col-culoare').text().trim();
      const gradeText = $el.find('.produs-col-grad').text().replace(/\s+/g, ' ').trim();
      const fullTitle = [title, storageText, colorText, gradeText].filter(Boolean).join(' · ');

      const specs = extractSpecs(fullTitle, gradeText);
      const img =
        $el.find('img').first().attr('data-src') ||
        $el.find('img').first().attr('src');

      const prodIdAttr = $el.find('[data-product-id], [data-product_id]').first().attr('data-product-id') ||
        $el.find('[data-product_id]').first().attr('data-product_id') ||
        href.split('/').filter(Boolean).pop();
      const id = `klap:${prodIdAttr}`;

      if (!foundMap.has(id) || parsed.priceRon < foundMap.get(id).priceRon) {
        foundMap.set(id, {
          id,
          source: 'klap',
          sourceType: 'refurbished',
          productId,
          title: fullTitle,
          priceRon: parsed.priceRon,
          originalPrice: parsed.originalPrice,
          currency: 'RON',
          previousPriceRon: prevParsed.priceRon && prevParsed.priceRon > parsed.priceRon ? prevParsed.priceRon : null,
          url: href,
          imageUrl: cleanImageUrl(img, 'https://klap.ro'),
          location: 'Refurbished · Garanție 24 luni',
          storage: storageText || specs.storage,
          battery: specs.battery,
          condition: gradeText || specs.condition,
          hasWarranty: true,
        });
      }
    });
  });

  return {
    items: [...foundMap.values()],
    rawChecked,
    message: `Scannate ${rawChecked} produse Klap, ${foundMap.size} în stoc`,
  };
}
