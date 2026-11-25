import { fetchJson, mapWithConcurrency, cleanImageUrl } from './http.js';
import { classifyProduct, extractSpecs, isPriceSane } from '../classifier.js';

const WOO_QUERIES = [
  { q: 'iphone 16 pro', hint: 'iphone-16-pro' },
  { q: 'iphone 16 pro max', hint: 'iphone-16-pro-max' },
  { q: 'iphone 17', hint: 'iphone-17' },
  { q: 'iphone 17 pro', hint: 'iphone-17-pro' },
  { q: 'airpods pro 3', hint: 'airpods-pro-3' },
  { q: 'airpods pro', hint: 'airpods-pro-3' },
];

async function scrapeWooStoreApi({ sourceId, sourceType, baseUrl, locationLabel, hasWarranty }) {
  const foundMap = new Map();
  let rawChecked = 0;

  await mapWithConcurrency(WOO_QUERIES, 3, async (query) => {
    const url = `${baseUrl}/wp-json/wc/store/v1/products?search=${encodeURIComponent(query.q)}&per_page=40`;
    const res = await fetchJson(url, { timeoutMs: 15000 });
    if (!res.ok || !Array.isArray(res.data)) return;

    rawChecked += res.data.length;

    for (const item of res.data) {
      if (!item?.name || !item?.permalink) continue;
      if (item.is_in_stock === false) continue;

      const cleanTitle = item.name
        .replace(/&amp;/g, '&')
        .replace(/&#8211;/g, '-')
        .replace(/&#8212;/g, '-')
        .replace(/&quot;/g, '"')
        .trim();

      const productId = classifyProduct(cleanTitle, query.hint);
      if (!productId) continue;

      const minorUnit = Number(item.prices?.currency_minor_unit ?? 2);
      const divisor = Math.pow(10, minorUnit);
      const rawPrice = Number(item.prices?.price) / divisor;
      const regularPrice = Number(item.prices?.regular_price) / divisor;
      const priceRon = Math.round(rawPrice);
      if (!Number.isFinite(priceRon) || !isPriceSane(productId, priceRon)) continue;

      const prevPrice =
        Number.isFinite(regularPrice) && Math.round(regularPrice) > priceRon
          ? Math.round(regularPrice)
          : null;

      const descText = (item.short_description || '').replace(/<[^>]+>/g, ' ');
      const attrText = (item.attributes || [])
        .map((a) => `${a.name || ''} ${(a.terms || []).map((t) => t.name).join(' ')}`)
        .join(' ');
      const specs = extractSpecs(cleanTitle, `${descText} ${attrText}`);

      const id = `${sourceId}:${item.id}`;
      foundMap.set(id, {
        id,
        source: sourceId,
        sourceType,
        productId,
        title: cleanTitle,
        priceRon,
        originalPrice: priceRon,
        currency: 'RON',
        previousPriceRon: prevPrice,
        url: item.permalink,
        imageUrl: cleanImageUrl(item.images?.[0]?.src, baseUrl),
        location: locationLabel,
        storage: specs.storage,
        battery: specs.battery,
        condition: specs.condition,
        hasWarranty: hasWarranty || specs.hasWarranty,
      });
    }
  });

  return {
    items: [...foundMap.values()],
    rawChecked,
    message: `Scannate ${rawChecked} produse API, ${foundMap.size} relevante`,
  };
}

export function scrapeYzzy() {
  return scrapeWooStoreApi({
    sourceId: 'yzzy',
    sourceType: 'refurbished',
    baseUrl: 'https://yzzy.ro',
    locationLabel: 'Refurbished · Garanție 24 luni',
    hasWarranty: true,
  });
}

export function scrapeAmanetOnline() {
  return scrapeWooStoreApi({
    sourceId: 'amanetonline',
    sourceType: 'amanet',
    baseUrl: 'https://amanetonline.com',
    locationLabel: 'Amanet Cashbook · România',
    hasWarranty: true,
  });
}

export function scrapeNdpMagazin() {
  return scrapeWooStoreApi({
    sourceId: 'ndpmagazin',
    sourceType: 'amanet',
    baseUrl: 'https://ndpmagazin.ro',
    locationLabel: 'NDP Amanet · București (Vitan / Moșilor)',
    hasWarranty: true,
  });
}

export function scrapeApplePlug() {
  return scrapeWooStoreApi({
    sourceId: 'appleplug',
    sourceType: 'refurbished',
    baseUrl: 'https://appleplug.ro',
    locationLabel: 'Refurbished Apple · Garanție 24 luni',
    hasWarranty: true,
  });
}

export function scrapeTrueGsm() {
  return scrapeWooStoreApi({
    sourceId: 'truegsm',
    sourceType: 'refurbished',
    baseUrl: 'https://truegsm.ro',
    locationLabel: 'TrueGSM · Verificat cu garanție',
    hasWarranty: true,
  });
}

export function scrapeGoz() {
  return scrapeWooStoreApi({
    sourceId: 'goz',
    sourceType: 'refurbished',
    baseUrl: 'https://goz.ro',
    locationLabel: 'GOZ Refurbished · Garanție',
    hasWarranty: true,
  });
}

export function scrapeTelefonulTau() {
  return scrapeWooStoreApi({
    sourceId: 'telefonultau',
    sourceType: 'refurbished',
    baseUrl: 'https://telefonultau.eu',
    locationLabel: 'TelefonulTau · România',
    hasWarranty: true,
  });
}
