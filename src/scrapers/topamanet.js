import { fetchJson, cleanImageUrl } from './http.js';
import { classifyProduct, extractSpecs, isPriceSane } from '../classifier.js';

/**
 * Top Amanet București (topamanet.shop) — Shopify storefront JSON API.
 */
export async function scrapeTopAmanet() {
  const foundMap = new Map();
  let rawChecked = 0;

  for (let page = 1; page <= 4; page++) {
    const res = await fetchJson(`https://topamanet.shop/products.json?limit=250&page=${page}`, {
      timeoutMs: 15000,
    });
    const products = res.data?.products;
    if (!res.ok || !Array.isArray(products) || products.length === 0) break;

    rawChecked += products.length;

    for (const p of products) {
      if (!p?.title || !p?.handle) continue;
      const availableVariant = (p.variants || []).find((v) => v.available !== false);
      if (!availableVariant) continue;

      const productId = classifyProduct(p.title);
      if (!productId) continue;

      const priceRon = Math.round(Number(availableVariant.price));
      if (!Number.isFinite(priceRon) || !isPriceSane(productId, priceRon)) continue;

      const compareAt = availableVariant.compare_at_price
        ? Math.round(Number(availableVariant.compare_at_price))
        : null;

      const bodyPlain = (p.body_html || '').replace(/<[^>]+>/g, ' ');
      const specs = extractSpecs(p.title, `${p.tags?.join(' ') || ''} ${bodyPlain}`);

      const id = `topamanet:${p.id}`;
      foundMap.set(id, {
        id,
        source: 'topamanet',
        sourceType: 'amanet',
        productId,
        title: p.title.trim(),
        priceRon,
        originalPrice: priceRon,
        currency: 'RON',
        previousPriceRon: compareAt && compareAt > priceRon ? compareAt : null,
        url: `https://topamanet.shop/products/${p.handle}`,
        imageUrl: cleanImageUrl(p.images?.[0]?.src, 'https://topamanet.shop'),
        location: 'Top Amanet · București',
        storage: specs.storage,
        battery: specs.battery,
        condition: specs.condition || 'Verificat amanet',
        hasWarranty: true,
      });
    }

    if (products.length < 250) break;
  }

  return {
    items: [...foundMap.values()],
    rawChecked,
    message: `Scannate ${rawChecked} produse Top Amanet, ${foundMap.size} relevante`,
  };
}
