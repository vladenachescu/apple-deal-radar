import { fetchText, mapWithConcurrency, cleanImageUrl } from './http.js';
import { classifyProduct, extractSpecs, isPriceSane } from '../classifier.js';

const FLIP_MODEL_PAGES = [
  { url: 'https://flip.ro/telefoane/apple/iphone-16-pro/', productId: 'iphone-16-pro' },
  { url: 'https://flip.ro/telefoane/apple/iphone-16-pro-max/', productId: 'iphone-16-pro-max' },
  { url: 'https://flip.ro/telefoane/apple/iphone-17/', productId: 'iphone-17' },
  { url: 'https://flip.ro/telefoane/apple/iphone-17-pro/', productId: 'iphone-17-pro' },
  { url: 'https://flip.ro/telefoane/apple/iphone-17-pro-max/', productId: 'iphone-17-pro-max' },
];

const SHAPE_LABELS = {
  CA_NOU: 'Ca nou',
  EXCELENT: 'Excelent',
  FOARTE_BUN: 'Foarte bun',
  BUN: 'Bun',
  ACCEPTABIL: 'Acceptabil',
};

export async function scrapeFlip() {
  const foundMap = new Map();
  let rawChecked = 0;

  await mapWithConcurrency(FLIP_MODEL_PAGES, 3, async (page) => {
    const res = await fetchText(page.url, { timeoutMs: 15000 });
    if (!res.ok) return;

    const match = res.text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return;

    let nextData;
    try {
      nextData = JSON.parse(match[1]);
    } catch {
      return;
    }

    const queries = nextData?.props?.pageProps?.dehydratedState?.queries || [];
    const prodQuery = queries.find((q) => q?.state?.data?.data?.productsPage || q?.state?.data?.productsPage);
    const products = prodQuery?.state?.data?.data?.productsPage || prodQuery?.state?.data?.productsPage || [];
    rawChecked += products.length;

    for (const p of products) {
      if (!p || p.stock === 0 || p.isDiscontinued) continue;
      const title = p.naming?.title || `${p.brandName || 'Apple'} ${p.modelName || ''}`.trim();
      const productId = classifyProduct(p.modelName || title, page.productId) || page.productId;
      const priceRon = Math.round(Number(p.price));
      if (!Number.isFinite(priceRon) || !isPriceSane(productId, priceRon)) continue;

      const prevPrice = p.previousPrice ? Math.round(Number(p.previousPrice)) : null;
      const shape = SHAPE_LABELS[p.spec?.shape] || p.spec?.shape || null;
      const specs = extractSpecs(title, `${p.spec?.storage || ''} ${shape || ''}`);
      const url = p.pdpUrl || page.url;

      const id = `flip:${p.id}`;
      foundMap.set(id, {
        id,
        source: 'flip',
        sourceType: 'refurbished',
        productId,
        title,
        priceRon,
        originalPrice: priceRon,
        currency: 'RON',
        previousPriceRon: prevPrice && prevPrice > priceRon ? prevPrice : null,
        url,
        imageUrl: cleanImageUrl(p.imagePath, 'https://flip.ro'),
        location: 'Refurbished · Livrare 24-48h',
        storage: p.spec?.storage?.replace(/\s+/g, '') || specs.storage,
        battery: specs.battery,
        condition: shape || specs.condition,
        hasWarranty: true,
      });
    }
  });

  return {
    items: [...foundMap.values()],
    rawChecked,
    message: `Scannate ${rawChecked} variante Flip, ${foundMap.size} în stoc`,
  };
}
