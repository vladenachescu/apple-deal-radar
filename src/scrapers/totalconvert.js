import * as cheerio from 'cheerio';
import { fetchText, mapWithConcurrency, cleanImageUrl } from './http.js';
import { classifyProduct, parsePriceToRon, extractSpecs, isPriceSane } from '../classifier.js';

const TOTALCONVERT_PAGES = [
  { url: 'https://totalconvert.ro/telefoane-second-hand/apple/iphone-16-pro/', hint: 'iphone-16-pro' },
  { url: 'https://totalconvert.ro/telefoane-second-hand/apple/iphone-16-pro-max/', hint: 'iphone-16-pro-max' },
  { url: 'https://totalconvert.ro/telefoane-second-hand/apple/iphone-17/', hint: 'iphone-17' },
  { url: 'https://totalconvert.ro/telefoane-second-hand/apple/iphone-17-pro/', hint: 'iphone-17-pro' },
  { url: 'https://totalconvert.ro/telefoane-second-hand/apple/iphone-17-pro-max/', hint: 'iphone-17-pro-max' },
  { url: 'https://totalconvert.ro/index.php?route=product/search&search=airpods+pro+3', hint: 'airpods-pro-3' },
  { url: 'https://totalconvert.ro/index.php?route=product/search&search=airpods+pro', hint: 'airpods-pro-3' },
];

export async function scrapeTotalConvert(settings) {
  const eurToRon = settings.eurToRon || 4.98;
  const foundMap = new Map();
  let rawChecked = 0;

  await mapWithConcurrency(TOTALCONVERT_PAGES, 3, async (page) => {
    const res = await fetchText(page.url, { timeoutMs: 15000 });
    if (!res.ok) return;

    const $ = cheerio.load(res.text);

    // Map product URL -> real thumbnail from DOM (ld+json uses placeholder on OpenCart)
    const imgByUrl = new Map();
    $('a[href*="totalconvert.ro/"]').each((_, el) => {
      const href = $(el).attr('href');
      const $img = $(el).find('img').first();
      const src = $img.attr('data-src') || $img.attr('src');
      const clean = cleanImageUrl(src, 'https://totalconvert.ro');
      if (href && clean) imgByUrl.set(href, clean);
    });

    // Extract structured Product items from JSON-LD ItemList
    const ldScripts = $('script[type="application/ld+json"]');
    ldScripts.each((_, el) => {
      let json;
      try {
        json = JSON.parse($(el).text());
      } catch {
        return;
      }
      const list = Array.isArray(json?.itemListElement) ? json.itemListElement : [];
      rawChecked += list.length;

      for (const prod of list) {
        if (!prod?.name || !prod?.url) continue;
        const productId = classifyProduct(prod.name, page.hint);
        if (!productId) continue;

        const offerPrice = prod.offers?.price ?? prod.offers?.[0]?.price;
        const parsed = parsePriceToRon(offerPrice, prod.offers?.priceCurrency || 'RON', eurToRon);
        if (!parsed.priceRon || !isPriceSane(productId, parsed.priceRon)) continue;

        // Infer grade from TotalConvert URL slug suffix (-a-12345, -b-12345, -c-12345)
        let slugGrade = null;
        const gradeMatch = prod.url.match(/-([abc])-\d+$/i);
        if (gradeMatch) {
          const g = gradeMatch[1].toUpperCase();
          slugGrade = g === 'A' ? 'Grad A (Ca nou/Excelent)' : g === 'B' ? 'Grad B (Foarte bun)' : 'Grad C (Bun)';
        }

        const specs = extractSpecs(prod.name, slugGrade || '');
        const slugId = prod.url.split('/').filter(Boolean).pop() || prod.url;
        const id = `totalconvert:${slugId}`;

        if (!foundMap.has(id) || parsed.priceRon < foundMap.get(id).priceRon) {
          foundMap.set(id, {
            id,
            source: 'totalconvert',
            sourceType: 'amanet',
            productId,
            title: prod.name.trim(),
            priceRon: parsed.priceRon,
            originalPrice: parsed.originalPrice,
            currency: parsed.currency,
            previousPriceRon: null,
            url: prod.url,
            imageUrl: imgByUrl.get(prod.url) || cleanImageUrl(prod.image, 'https://totalconvert.ro'),
            location: 'Amanet · Magazine București & Livrare',
            storage: specs.storage,
            battery: specs.battery,
            condition: slugGrade || specs.condition,
            hasWarranty: true,
          });
        }
      }
    });
  });

  return {
    items: [...foundMap.values()],
    rawChecked,
    message: `Scannate ${rawChecked} produse TotalConvert, ${foundMap.size} relevante`,
  };
}
