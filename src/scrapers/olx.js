import { fetchText, mapWithConcurrency, cleanImageUrl } from './http.js';
import {
  classifyProduct,
  isBucharestLocation,
  parsePriceToRon,
  extractSpecs,
  isPriceSane,
  parseRomanianDate,
} from '../classifier.js';

// AirPods removed from P2P (too many fakes). Added dedicated 256GB/512GB queries for iPhone 16 Pro!
const OLX_SEARCHES = [
  {
    url: 'https://www.olx.ro/electronice-si-electrocasnice/telefoane-mobile/bucuresti/q-iphone-16-pro-256/?search%5Border%5D=filter_float_price:asc&search%5Bfilter_float_price:from%5D=1050',
    hint: 'iphone-16-pro',
  },
  {
    url: 'https://www.olx.ro/electronice-si-electrocasnice/telefoane-mobile/bucuresti/q-iphone-16-pro-512/?search%5Border%5D=filter_float_price:asc&search%5Bfilter_float_price:from%5D=1050',
    hint: 'iphone-16-pro',
  },
  {
    url: 'https://www.olx.ro/electronice-si-electrocasnice/telefoane-mobile/bucuresti/q-iphone-16-pro-max/?search%5Border%5D=filter_float_price:asc&search%5Bfilter_float_price:from%5D=1100',
    hint: 'iphone-16-pro-max',
  },
  {
    url: 'https://www.olx.ro/electronice-si-electrocasnice/telefoane-mobile/bucuresti/q-iphone-17/?search%5Border%5D=filter_float_price:asc&search%5Bfilter_float_price:from%5D=1100',
    hint: 'iphone-17',
  },
  {
    url: 'https://www.olx.ro/electronice-si-electrocasnice/telefoane-mobile/bucuresti/q-iphone-17-pro/?search%5Border%5D=filter_float_price:asc&search%5Bfilter_float_price:from%5D=1300',
    hint: 'iphone-17-pro',
  },
  {
    url: 'https://www.olx.ro/electronice-si-electrocasnice/telefoane-mobile/bucuresti/q-iphone-17-pro-max/?search%5Border%5D=filter_float_price:asc&search%5Bfilter_float_price:from%5D=1400',
    hint: 'iphone-17-pro-max',
  },
];

function extractPrerenderedAds(html) {
  const m = html.match(/window\.__PRERENDERED_STATE__\s*=\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return [];
  try {
    const unescaped = JSON.parse('"' + m[1] + '"');
    const state = JSON.parse(unescaped);
    return state?.listing?.listing?.ads || [];
  } catch {
    return [];
  }
}

export async function scrapeOlx(settings) {
  const strict = settings.strictBucharestOnly !== false;
  const eurToRon = settings.eurToRon || 4.98;
  const foundMap = new Map();
  let rawChecked = 0;

  await mapWithConcurrency(OLX_SEARCHES, 3, async (search) => {
    const res = await fetchText(search.url, { timeoutMs: 16000 });
    if (!res.ok) return;
    const ads = extractPrerenderedAds(res.text);
    rawChecked += ads.length;

    for (const ad of ads) {
      if (!ad?.title || !ad?.url) continue;

      // Build complete location string from OLX metadata
      const locPath =
        ad.location?.pathName ||
        [ad.location?.regionName, ad.location?.cityName, ad.location?.districtName]
          .filter(Boolean)
          .join(', ');

      // STRICT Bucharest filter for P2P
      if (!isBucharestLocation(locPath, strict)) continue;

      // Classify exact model & filter out cases/displays/reparatii/clones
      const productId = classifyProduct(ad.title, search.hint);
      if (!productId) continue;

      // Parse price (handle RON and EUR cleanly)
      const regular = ad.price?.regularPrice;
      const rawVal = regular?.value ?? ad.price?.displayValue;
      const rawCur = regular?.currencyCode || ad.price?.displayValue;
      const parsed = parsePriceToRon(rawVal, rawCur, eurToRon);
      if (!parsed.priceRon || !isPriceSane(productId, parsed.priceRon)) continue;

      // Extra specs from OLX params
      const paramText = (ad.params || [])
        .map((p) => `${p.name || ''} ${p.normalizedValue || p.value || ''}`)
        .join(' ');
      const specs = extractSpecs(ad.title, paramText);

      const cityDisplay = [ad.location?.cityName, ad.location?.districtName]
        .filter(Boolean)
        .join(', ') || locPath;

      // Most recent activity timestamp: lastRefreshTime / pushupTime / createdTime
      const candidateDates = [ad.lastRefreshTime, ad.pushupTime, ad.createdTime]
        .map((d) => parseRomanianDate(d))
        .filter(Boolean)
        .sort();
      const postedAt = candidateDates.pop() || null;

      const id = `olx:${ad.id}`;
      const existing = foundMap.get(id);
      if (!existing || parsed.priceRon < existing.priceRon) {
        foundMap.set(id, {
          id,
          source: 'olx',
          sourceType: 'p2p',
          productId,
          title: ad.title.trim(),
          priceRon: parsed.priceRon,
          originalPrice: parsed.originalPrice,
          currency: parsed.currency,
          previousPriceRon: null,
          url: ad.url.startsWith('http') ? ad.url : `https://www.olx.ro${ad.url}`,
          imageUrl: cleanImageUrl(ad.photos?.[0], 'https://www.olx.ro'),
          location: cityDisplay.replace(/Bucuresti/gi, 'București'),
          storage: specs.storage,
          battery: specs.battery,
          condition: specs.condition,
          hasWarranty: specs.hasWarranty,
          postedAt,
        });
      }
    }
  });

  return {
    items: [...foundMap.values()],
    rawChecked,
    message: `Verificate ${rawChecked} anunțuri, păstrate ${foundMap.size} din București`,
  };
}
