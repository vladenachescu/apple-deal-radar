import * as cheerio from 'cheerio';
import { fetchText, mapWithConcurrency, cleanImageUrl } from './http.js';
import {
  classifyProduct,
  isBucharestLocation,
  parsePriceToRon,
  extractSpecs,
  isPriceSane,
  normalizeText,
  parseRomanianDate,
} from '../classifier.js';
import { getCachedVintedSeller, cacheVintedSeller } from '../db.js';

// Note: Vinted.ro mixes sellers from RO, PL, HU, CZ, SK, GR.
// We pre-filter obvious non-Romanian language titles, then verify the seller's exact
// city on /member/<id> (cached in SQLite!) and ONLY keep sellers from București!
const FOREIGN_TITLE_RE =
  /\b(sprzedam|uzywany|nowy|stan|bardzo|dobry|idealny|gwarancja|kupie|bateria|igla|kolor|pudelko|etui|szklo|oryginalny|elado|hasznalt|uj|karcmentes|doboz|garancia|prodam|pouzity|stav|zaruka|pouzdro|kryt|obal|polska|warszawa|krakow|budapest|praha|vymena|predam|pouzivany|sluchatka|sluchawki)\b/i;

// AirPods removed from P2P (too many fakes). Focused on iPhones ≥ 256GB.
const VINTED_SEARCHES = [
  {
    url: 'https://www.vinted.ro/catalog?search_text=iphone+16+pro+256&brand_ids[]=54661&price_from=1200&order=price_low_to_high',
    hint: 'iphone-16-pro',
  },
  {
    url: 'https://www.vinted.ro/catalog?search_text=iphone+16+pro+max&brand_ids[]=54661&price_from=1300&order=price_low_to_high',
    hint: 'iphone-16-pro-max',
  },
  {
    url: 'https://www.vinted.ro/catalog?search_text=iphone+17&brand_ids[]=54661&price_from=1400&order=price_low_to_high',
    hint: 'iphone-17',
  },
  {
    url: 'https://www.vinted.ro/catalog?search_text=iphone+17+pro&brand_ids[]=54661&price_from=1600&order=price_low_to_high',
    hint: 'iphone-17-pro',
  },
];

async function verifyVintedItemBucharest(itemUrl, strict) {
  const itemRes = await fetchText(itemUrl, { timeoutMs: 12000 });
  if (!itemRes.ok) return { isBucharest: false, location: null, postedAt: null, extraStorage: null };

  // Extract upload age ("Încărcat acum o zi" / "acum 3 zile") and storage from item details
  const $i = cheerio.load(itemRes.text);
  $i('script, style').remove();
  const detailsText = $i('[data-testid*="item-details"], [class*="details-list"]').text().replace(/\s+/g, ' ');
  const agoMatch =
    detailsText.match(/Încărcat\s*(acum\s+(?:un|o|\d+)\s+\S+)/i) ||
    detailsText.match(/(acum\s+(?:un|o|\d+)\s+(?:minut\w*|or\w*|zi\w*|săptămân\w*|lun\w*))/i);
  const postedAt = agoMatch ? parseRomanianDate(agoMatch[1]) : null;
  const storMatch = detailsText.match(/Capacitate\s*de\s*stocare\s*(\d{3,4}\s*GB|\d\s*TB)/i);
  const extraStorage = storMatch ? storMatch[1].replace(/\s+/g, '').toUpperCase() : null;

  // Extract member profile link from item HTML
  const memberMatch = itemRes.text.match(/\/member\/(\d+)/);
  if (!memberMatch) return { isBucharest: false, location: null, postedAt, extraStorage };
  const memberId = memberMatch[1];

  // Check SQLite cache first so we don't repeatedly hit the same seller profile
  const cached = getCachedVintedSeller(memberId);
  if (cached) {
    return {
      isBucharest: strict ? isBucharestLocation(cached.location, true) : cached.isBucharest,
      location: cached.location,
      postedAt,
      extraStorage,
    };
  }

  const profileRes = await fetchText(`https://www.vinted.ro/member/${memberId}`, { timeoutMs: 12000 });
  if (!profileRes.ok) return { isBucharest: false, location: null, postedAt, extraStorage };

  const $p = cheerio.load(profileRes.text);
  let loc = $p('[data-testid="profile-location-info--content"]').first().text().replace(/\s+/g, ' ').trim();
  if (!loc) {
    const m = profileRes.text.match(/profile-location-info--content[^>]*>([^<]+)</);
    if (m) loc = m[1].trim();
  }

  const okBuc = isBucharestLocation(loc, true);
  cacheVintedSeller(memberId, loc, okBuc);
  return { isBucharest: strict ? okBuc : isBucharestLocation(loc, false), location: loc, postedAt, extraStorage };
}

export async function scrapeVinted(settings) {
  const strict = settings.strictBucharestOnly !== false;
  const eurToRon = settings.eurToRon || 4.98;
  const candidates = new Map();
  let rawChecked = 0;

  // Step 1: Collect candidate items from Vinted catalog pages
  await mapWithConcurrency(VINTED_SEARCHES, 2, async (search) => {
    const res = await fetchText(search.url, { timeoutMs: 15000 });
    if (!res.ok) return;

    const $ = cheerio.load(res.text);
    const links = $('a[href*="/items/"]');
    rawChecked += links.length;

    links.each((_, el) => {
      const $link = $(el);
      const href = $link.attr('href');
      const $card = $link.closest('[data-testid^="product-item-id-"]').length
        ? $link.closest('[data-testid^="product-item-id-"]')
        : $link.parent();
      const fullTitleAttr = $link.attr('title') || $card.find('img').attr('alt') || '';
      if (!href || !fullTitleAttr) return;

      // Vinted title attr format:
      // "iPhone 16 Pro 128GB, Brand: Apple, Model: iPhone 16 Pro, Stare: Foarte bună, 3100.00 lei, 3260.00 lei"
      const parts = fullTitleAttr.split(/,\s*(?=Brand:|Model:|Stare:|\d)/);
      const itemTitle = (parts[0] || '').trim();
      if (!itemTitle) return;

      // Skip obvious non-Romanian Polish/Czech/Hungarian/Slovak listings early
      if (FOREIGN_TITLE_RE.test(normalizeText(itemTitle))) return;

      // Also check Polish/Czech/Hungarian diacritics in original title
      if (/[łńśźżćęąőűčřěůžšýáéíóú]/i.test(itemTitle)) return;

      // If Vinted explicitly tags Model: iPhone 12 Pro while title says "iPhone 16 pro", skip!
      const vintedModelMatch = fullTitleAttr.match(/Model:\s*([^,]+)/i);
      const vintedModel = vintedModelMatch ? vintedModelMatch[1].trim() : '';

      const productId = classifyProduct(itemTitle, search.hint);
      if (!productId) return;

      if (vintedModel && /\biphone\s*1[0-5]\b/i.test(vintedModel)) return;

      // Extract the item base price (first price in lei) before buyer protection fee
      const leiMatches = [...fullTitleAttr.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*lei/gi)];
      const rawPrice = leiMatches[0]?.[1];
      const parsed = parsePriceToRon(rawPrice, 'RON', eurToRon);
      if (!parsed.priceRon || !isPriceSane(productId, parsed.priceRon)) return;

      const idMatch = href.match(/\/items\/(\d+)/);
      if (!idMatch) return;
      const itemId = idMatch[1];
      const cleanHref = href.split('?')[0];
      const url = cleanHref.startsWith('http') ? cleanHref : `https://www.vinted.ro${cleanHref}`;
      const img = $card.find('img').first().attr('src');

      const stateMatch = fullTitleAttr.match(/Stare:\s*([^,]+)/i);
      const specs = extractSpecs(itemTitle, stateMatch?.[1] || '');

      if (!candidates.has(itemId) || parsed.priceRon < candidates.get(itemId).priceRon) {
        candidates.set(itemId, {
          id: `vinted:${itemId}`,
          source: 'vinted',
          sourceType: 'p2p',
          productId,
          title: itemTitle,
          priceRon: parsed.priceRon,
          originalPrice: parsed.originalPrice,
          currency: 'RON',
          previousPriceRon: null,
          url,
          imageUrl: cleanImageUrl(img, 'https://www.vinted.ro'),
          storage: specs.storage,
          battery: specs.battery,
          condition: specs.condition || stateMatch?.[1]?.trim() || null,
          hasWarranty: specs.hasWarranty,
        });
      }
    });
  });

  // Step 2: Sort candidates by lowest price per product and verify seller city on Vinted profile!
  // Cap verification to top 8 cheapest candidates per product to stay fast and polite.
  const byProduct = new Map();
  for (const c of candidates.values()) {
    if (!byProduct.has(c.productId)) byProduct.set(c.productId, []);
    byProduct.get(c.productId).push(c);
  }
  const toVerify = [];
  for (const list of byProduct.values()) {
    list.sort((a, b) => a.priceRon - b.priceRon);
    toVerify.push(...list.slice(0, 8));
  }

  const verifiedItems = [];
  let checkedSellers = 0;
  await mapWithConcurrency(toVerify, 3, async (cand) => {
    checkedSellers++;
    const check = await verifyVintedItemBucharest(cand.url, strict);
    if (check.isBucharest) {
      verifiedItems.push({
        ...cand,
        storage: cand.storage || check.extraStorage || null,
        location: check.location || 'București, România',
        postedAt: check.postedAt || null,
      });
    }
  });

  return {
    items: verifiedItems,
    rawChecked,
    message: `Scannate ${rawChecked} listări, verificate ${checkedSellers} profiluri, ${verifiedItems.length} confirmate în București`,
  };
}
