import { PRODUCT_MAP, EUR_TO_RON_DEFAULT, FACTORY_MIN_256_MODELS } from './config.js';

export function normalizeText(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[„”"'`´’‘]/g, ' ')
    .replace(/[^\p{L}\p{N}+.:/%-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GLOBAL_BLOCK_PATTERNS = [
  /\bhus[ae]\b/,
  /\bfoli[ei]\b/,
  /\bcarcas[ae]\b/,
  /\bbumper\b/,
  /\btempered\b/,
  /\bsticla\s*(?:de\s*)?(?:protectie|camera|spate|securizata|ecran)\b/,
  /\bprotectie\s*(?:ecran|camera|lentile)\b/,
  /\betui\b/,
  /\bcase\b(?!\s*(?:cu|with|si|and|charging|mag\s*safe))/,
  /\bcover\b/,
  /\bkryt\b/,
  /\bobaly?\b/,
  /\bpouzdro\b/,
  /\btok\b/,
  /\bportfel\b/,
  /\blanyard\b/,
  /\bsnur\b/,
  /\bcurea\b/,
  /\bdisplay\b/,
  /\becran\b/,
  /\blcd\b/,
  /\boled\s*(?:original|compatibil|montaj|display|super\s*retina)\b/,
  /\bmontaj\b/,
  /\breparat(?:ie|ii)?\b/,
  /\brepar\b/,
  /\bservice\s*gsm\b/,
  /\bdecodare\b/,
  /\binlocuire\b/,
  /\bgeam\s*(?:spart|camera|fata|spate)\b/,
  /\bcapac\s*spate\b/,
  /\bplaca\s*(?:de\s*)?baza\b/,
  /\bcamera\s*(?:spate|fata|principala|modul)\b/,
  /\bmodul\s*camera\b/,
  /\bflex\b/,
  /\bmufa\b/,
  /\bdifuzor\b/,
  /\bpentru\s*piese\b/,
  /\bde\s*piese\b/,
  /\bdezmembrez\b/,
  /\bdefect[ae]?\b/,
  /\bnu\s*porneste\b/,
  /\bblocat\s*(?:in\s*)?icloud\b/,
  /\bicloud\s*(?:blocat|activ|locked|on)\b/,
  /\bmdm\b/,
  /\breplic[ae]\b/,
  /\bclon[ae]\b/,
  /\bsuperclon[ae]\b/,
  /\b1\s*:\s*1\b/,
  /\bcopi[ei]\b/,
  /\bfake\b/,
  /\bimitat(?:ie|ii)\b/,
  /\bcutie\s*goala\b/,
  /\bdoar\s*cutie\b/,
  /\bcutie\s*(?:originala\s*)?(?:de\s*)?iphone\b/,
  /\bincarcator\b/,
  /\bcablu\b(?!.*(?:iphone|cutie))/,
  /\badaptor\b/,
  /\bsuport\s*(?:auto|telefon|birou|magsafe)\b/,
  /\btrepied\b/,
  /\bgimbal\b/,
  /\blentil[ae]\b/,
  /^\s*(?:cumpar|achizitionez|caut\s*sa\s*cumpar|inchiriez|amanetez|kupie|koupim)\b/,
  /^\s*schimb\s+(?!display)/,
  /\bofer\s*la\s*schimb\b/,
  /\bavem\s*pe\s*stoc\s*toata\s*gama\b/,
  /\bpiese\s*(?:de\s*)?schimb\b/,
];

const PHONE_ONLY_BLOCK_PATTERNS = [
  /\b(?:doar|vand)\s*(?:spate|capac|rama|sasiu|carcasa|baterie)\b/,
  /\bsticla\s*sparta\b/,
  /\bdisplay\s*spart\b/,
  /\becran\s*spart\b/,
  /\bspart\s*(?:fata|spate|ecran|display)\b/,
  /\bpower\s*bank\b/,
  /\bbaterie\s*externa\b/,
  /\bsmartwatch\b/,
  /\bapple\s*watch\b/,
  /\bipad\b/,
  /\bmacbook\b/,
  /\bairpods\b/,
];

const AUDIO_ONLY_BLOCK_PATTERNS = [
  /\bdoar\s*(?:casca|carcasa|cutia|cutie|stanga|dreapta)\b/,
  /\bcasca\s*(?:stanga|dreapta|individuala|singura)\b/,
  /\b(?:stanga|dreapta)\s*(?:doar|separat|individual)\b/,
  /\bcarcasa\s*(?:de\s*)?incarcare\b/,
  /\bcutie\s*(?:de\s*)?incarcare\b/,
  /\bdopuri\b/,
  /\bpernite\b/,
  /\bear\s*tips\b/,
  /\bsilicon\b/,
  /\bhusa\s*airpods\b/,
  /\bairpods\s*max\b/,
  /\bairpods\s*4\b/,
  /\bairpods\s*2\b/,
  /\bairpods\s*1\b/,
  /\bairpods\s*pro\s*(?:1|2|ii)\b/,
  /\bgeneratia\s*(?:1|2)\b/,
  /\bgen\s*(?:1|2)\b/,
  /\b2nd\s*gen\b/,
  /\boem\b/,
  /\bcalitate\s*premium\b/,
  /\bcalitate\s*aaa\b/,
  /\bchip\s*airoha\b/,
  /\bairoha\b/,
  /\breplic/,
];

export function isJunkTitle(rawTitle, category = 'phone') {
  const t = normalizeText(rawTitle);
  if (!t || t.length < 6) return true;

  for (const rx of GLOBAL_BLOCK_PATTERNS) {
    if (rx.test(t)) return true;
  }

  if (
    /\b(?:husa|case|cover)\b/.test(t) &&
    !/\b(?:cu\s+husa|bonus\s+husa|\+\s*husa|si\s+husa|charging\s+case|carcasa\s+magsafe\s+inclusa)\b/.test(t)
  ) {
    return true;
  }

  if (category === 'phone') {
    for (const rx of PHONE_ONLY_BLOCK_PATTERNS) {
      if (rx.test(t)) return true;
    }
  } else if (category === 'audio') {
    for (const rx of AUDIO_ONLY_BLOCK_PATTERNS) {
      if (rx.test(t)) return true;
    }
  }

  return false;
}

export function classifyProduct(rawTitle, hintProductId = null) {
  const t = normalizeText(rawTitle);
  if (!t) return null;

  const isAirPods = /\bair\s*pods?\b/.test(t);
  if (isAirPods) {
    if (isJunkTitle(rawTitle, 'audio')) return null;
    const isPro3 =
      /\bair\s*pods?\s*pro\s*3\b/.test(t) ||
      /\bair\s*pods?\s*3\s*pro\b/.test(t) ||
      /\bair\s*pods?\s*pro\s*(?:\(?\s*)?(?:gen(?:eratia)?\.?\s*3|3(?:rd)?\s*gen|iii)\b/.test(t);
    if (isPro3 && !/\bpro\s*2\b|\bgen(?:eratia)?\.?\s*2\b/.test(t)) {
      return 'airpods-pro-3';
    }
    return null;
  }

  if (!/\biphone\b/.test(t)) return null;
  if (isJunkTitle(rawTitle, 'phone')) return null;

  const genHits = t.match(/\b1[1-8]\b/g) || [];
  if (new Set(genHits).size >= 3) return null;

  if (/\biphone\s*17\s*pro\s*max\b|\biphone\s*17\s*promax\b/.test(t)) {
    return 'iphone-17-pro-max';
  }
  if (/\biphone\s*17\s*pro\b/.test(t) && !/\bmax\b/.test(t)) {
    return 'iphone-17-pro';
  }
  if (
    /\biphone\s*17\b/.test(t) &&
    !/\biphone\s*17\s*(?:pro|air|plus|mini|e\b|se)\b/.test(t) &&
    !/\b17\s*pro\b/.test(t) &&
    !/\b(?:pro\s*max|17\s*air|17e)\b/.test(t)
  ) {
    return 'iphone-17';
  }
  if (/\biphone\s*16\s*pro\s*max\b|\biphone\s*16\s*promax\b/.test(t)) {
    return 'iphone-16-pro-max';
  }
  if (/\biphone\s*16\s*pro\b/.test(t) && !/\bmax\b/.test(t)) {
    return 'iphone-16-pro';
  }

  if (hintProductId && PRODUCT_MAP[hintProductId]) {
    return null;
  }
  return null;
}

/**
 * Parses storage capacity in GB from title + extra text (e.g. "256GB" -> 256, "1TB" -> 1024).
 */
export function parseStorageGb(text = '') {
  const s = String(text);
  // Explicit GB / TB first
  const tbMatch = s.match(/\b(1|2)\s*tb\b/i);
  if (tbMatch) return Number(tbMatch[1]) * 1024;

  const gbMatch = s.match(/\b(64|128|256|512)\s*gb\b/i);
  if (gbMatch) return Number(gbMatch[1]);

  // Compact seller style like "iPhone 16 Pro 256" or "iPhone 16 Pro 128 Natural"
  const compactMatch = s.match(
    /(?:iphone\s*1[67](?:\s*pro(?:\s*max)?)?|memorie|stocare|capacitate)\s*[:,-/]?\s*(128|256|512)\b/i
  );
  if (compactMatch) return Number(compactMatch[1]);

  return null;
}

export function formatStorageLabel(gb) {
  if (!gb) return null;
  if (gb >= 1024) return `${Math.round(gb / 1024)}TB`;
  return `${gb}GB`;
}

/**
 * Enforces the user's minimum storage requirement (default ≥ 256GB) for all iPhones.
 * - Any listing with explicitly detected storage < minGb (e.g. 128GB) is ALWAYS rejected.
 * - For iPhone 16 Pro (which shipped in a 128GB base variant), requires explicit ≥ 256GB.
 * - For iPhone 16 Pro Max, 17, 17 Pro, 17 Pro Max (Apple minimum factory capacity is 256GB),
 *   if no capacity is written, allows it as ≥256GB (factory minimum).
 */
export function meetsMinStorage(productId, title = '', extraText = '', storageLabel = null, minGb = 256) {
  const product = PRODUCT_MAP[productId];
  if (!product || product.category !== 'phone' || !minGb) return { ok: true, storageGb: null, label: storageLabel };

  const detected =
    parseStorageGb(storageLabel || '') ||
    parseStorageGb(title) ||
    parseStorageGb(extraText);

  if (detected !== null) {
    if (detected < minGb) {
      return { ok: false, storageGb: detected, label: formatStorageLabel(detected) };
    }
    return { ok: true, storageGb: detected, label: formatStorageLabel(detected) };
  }

  // Storage was not explicitly written in title/specs
  if (FACTORY_MIN_256_MODELS.has(productId) && minGb <= 256) {
    return { ok: true, storageGb: 256, label: '≥256GB' };
  }

  // For iPhone 16 Pro (or if user raises minGb to 512+), reject unknown storage so 128GB can never sneak in
  return { ok: false, storageGb: null, label: null };
}

export function isBucharestLocation(locationStr = '', strictOnly = true) {
  const loc = normalizeText(locationStr);
  if (!loc) return false;

  if (
    /\b(polonia|poland|ungaria|hungary|cehia|czech|slovacia|grecia|greece|lituan|bulgaria|italia|franta|germania|spania)\b/.test(
      loc
    )
  ) {
    return false;
  }

  if (loc.includes('bucuresti - ilfov')) {
    const afterRegion = loc.replace(/bucuresti\s*-\s*ilfov\s*,?\s*/, '').trim();
    if (!afterRegion) return !strictOnly;
    if (/\bbucuresti\b|\bsector(?:ul)?\s*[1-6]\b/.test(afterRegion)) {
      return true;
    }
    return !strictOnly;
  }

  if (/\bbucuresti\b|\bbucharest\b|\bsector(?:ul)?\s*[1-6]\b/.test(loc)) {
    return true;
  }

  return false;
}

export function parsePriceToRon(rawPrice, rawCurrency = null, eurToRon = EUR_TO_RON_DEFAULT) {
  if (rawPrice == null) return { priceRon: null, originalPrice: null, currency: 'RON' };

  const text = String(rawPrice).trim();
  const isEur = (rawCurrency && /eur|€/i.test(rawCurrency)) || /€|\beur\b|\beuro\b/i.test(text);

  const numMatch = text.match(/(\d{1,3}(?:[\s.]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (!numMatch) return { priceRon: null, originalPrice: null, currency: isEur ? 'EUR' : 'RON' };

  let numStr = numMatch[1].replace(/\s+/g, '');

  if (numStr.includes('.') && numStr.includes(',')) {
    numStr = numStr.replace(/\./g, '').replace(',', '.');
  } else if (numStr.includes(',')) {
    const parts = numStr.split(',');
    if (parts[1].length === 3) {
      numStr = numStr.replace(/,/g, '');
    } else {
      numStr = numStr.replace(',', '.');
    }
  } else if (numStr.includes('.')) {
    const parts = numStr.split('.');
    if (parts.length > 2 || parts[parts.length - 1].length === 3) {
      numStr = numStr.replace(/\./g, '');
    }
  }

  const originalPrice = Number(numStr);
  if (!Number.isFinite(originalPrice) || originalPrice <= 0) {
    return { priceRon: null, originalPrice: null, currency: isEur ? 'EUR' : 'RON' };
  }

  const priceRon = isEur ? Math.round(originalPrice * eurToRon) : Math.round(originalPrice);
  return {
    priceRon,
    originalPrice: Math.round(originalPrice),
    currency: isEur ? 'EUR' : 'RON',
  };
}

export function extractSpecs(title = '', extraText = '') {
  const full = `${title} ${extraText}`;
  const norm = normalizeText(full);

  const storageGb = parseStorageGb(full);
  const storage = formatStorageLabel(storageGb);

  let battery = null;
  const batMatch =
    full.match(/(?:baterie|battery|sanatate|bh|bat)\s*[:=-]?\s*(\d{2,3})\s*%/i) ||
    full.match(/\b(8[0-9]|9[0-9]|100)\s*%\s*(?:baterie|battery|bh)?/i);
  if (batMatch) {
    const pct = Number(batMatch[1]);
    if (pct >= 70 && pct <= 100) battery = `${pct}%`;
  }

  let condition = null;
  if (/\bsigilat|nou\s*sigilat|new\s*sealed\b/.test(norm)) condition = 'Sigilat';
  else if (/\bca\s*nou|grad\s*a\+|impecabil|10\/10\b/.test(norm)) condition = 'Ca nou / A+';
  else if (/\bexcelent|foarte\s*bun|grad\s*a\b/.test(norm)) condition = 'Excelent / A';
  else if (/\bstare\s*buna|bun|grad\s*b\b/.test(norm)) condition = 'Bun / B';
  else if (/\bacceptabil|satisfacator|grad\s*c\b/.test(norm)) condition = 'Acceptabil';

  const hasWarranty = /\bgarantie|factura|24\s*luni|12\s*luni\b/.test(norm);

  return { storage, storageGb, battery, condition, hasWarranty };
}

export function isPriceSane(productId, priceRon) {
  const product = PRODUCT_MAP[productId];
  if (!product || !Number.isFinite(priceRon)) return false;
  return priceRon >= product.minSanityPrice && priceRon <= product.maxSanityPrice;
}

const RO_MONTHS = {
  ian: 0, ianuarie: 0,
  feb: 1, februarie: 1,
  mar: 2, martie: 2,
  apr: 3, aprilie: 3,
  mai: 4,
  iun: 5, iunie: 5,
  iul: 6, iulie: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, septembrie: 8,
  oct: 9, octombrie: 9,
  noi: 10, nov: 10, noiembrie: 10,
  dec: 11, decembrie: 11,
};

/**
 * Parses ISO timestamps, Romanian relative strings ("azi", "ieri", "acum 3 zile", "acum o zi",
 * "acum 12 ore", "acum 2 saptamani") and Romanian day-month strings ("24 noiembrie") into ISO date strings.
 */
export function parseRomanianDate(raw, fallbackYyyymmdd = null, nowMs = Date.now()) {
  if (raw) {
    const str = String(raw).trim();

    // 1. ISO-8601 / native Date string (e.g. OLX "2026-11-24T12:41:55+02:00")
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const ts = Date.parse(str);
      if (Number.isFinite(ts)) return new Date(ts).toISOString();
    }

    const norm = normalizeText(str);

    // Publi24 promoted placeholder "1 ianuarie" -> prefer S3 fallback if available
    if (norm === '1 ianuarie' && fallbackYyyymmdd) {
      return parseYyyymmdd(fallbackYyyymmdd);
    }

    // 2. "azi" / "astazi"
    if (/\b(?:azi|astazi)\b/.test(norm)) {
      const d = new Date(nowMs);
      const hm = norm.match(/(\d{1,2}):(\d{2})/);
      if (hm) d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
      return d.toISOString();
    }

    // 3. "ieri"
    if (/\bieri\b/.test(norm)) {
      const d = new Date(nowMs - 24 * 3600 * 1000);
      const hm = norm.match(/(\d{1,2}):(\d{2})/);
      if (hm) d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
      return d.toISOString();
    }

    // 4. Relative Romanian phrases ("acum 12 ore", "acum o zi", "acum 3 zile", "acum 2 saptamani", "acum o luna")
    const relMatch = norm.match(
      /acum\s+(un|o|\d+)\s+(secund|minut|or|zi|zile|saptaman|lun|an)/
    );
    if (relMatch) {
      const qty = relMatch[1] === 'un' || relMatch[1] === 'o' ? 1 : Number(relMatch[1]);
      const unit = relMatch[2];
      let deltaMs = 0;
      if (unit.startsWith('secund')) deltaMs = qty * 1000;
      else if (unit.startsWith('minut')) deltaMs = qty * 60 * 1000;
      else if (unit.startsWith('or')) deltaMs = qty * 3600 * 1000;
      else if (unit.startsWith('zi')) deltaMs = qty * 24 * 3600 * 1000;
      else if (unit.startsWith('saptaman')) deltaMs = qty * 7 * 24 * 3600 * 1000;
      else if (unit.startsWith('lun')) deltaMs = qty * 30 * 24 * 3600 * 1000;
      else if (unit.startsWith('an')) deltaMs = qty * 365 * 24 * 3600 * 1000;
      return new Date(nowMs - deltaMs).toISOString();
    }

    // 5. Day + Romanian month ("24 noiembrie", "3 octombrie 2026")
    const dmMatch = norm.match(/\b(\d{1,2})\s+([a-z]{3,12})(?:\s+(20\d{2}))?\b/);
    if (dmMatch && RO_MONTHS[dmMatch[2]] !== undefined) {
      const day = Number(dmMatch[1]);
      const month = RO_MONTHS[dmMatch[2]];
      const now = new Date(nowMs);
      let year = dmMatch[3] ? Number(dmMatch[3]) : now.getFullYear();
      let candidate = new Date(year, month, day, 12, 0, 0);
      // If date is > 2 days in the future without explicit year, it was last year
      if (!dmMatch[3] && candidate.getTime() > nowMs + 2 * 24 * 3600 * 1000) {
        candidate = new Date(year - 1, month, day, 12, 0, 0);
      }
      if (!Number.isNaN(candidate.getTime())) return candidate.toISOString();
    }
  }

  if (fallbackYyyymmdd) {
    return parseYyyymmdd(fallbackYyyymmdd);
  }
  return null;
}

function parseYyyymmdd(str) {
  const m = String(str).match(/^(20\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isWithinMaxAgeDays(postedAtIso, maxDays = 7, nowMs = Date.now()) {
  if (!maxDays || maxDays <= 0) return true;
  if (!postedAtIso) return true; // Only reject when we have a date proving it's stale
  const ts = Date.parse(postedAtIso);
  if (!Number.isFinite(ts)) return true;
  const ageMs = nowMs - ts;
  return ageMs <= maxDays * 24 * 3600 * 1000;
}
