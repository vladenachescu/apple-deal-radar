export const EUR_TO_RON_DEFAULT = Number(process.env.EUR_TO_RON) || 4.98;
export const MIN_IPHONE_STORAGE_GB = 256;

// Models where Apple's minimum factory capacity is ALREADY 256GB (no 128GB SKU exists)
export const FACTORY_MIN_256_MODELS = new Set([
  'iphone-16-pro-max',
  'iphone-17',
  'iphone-17-pro',
  'iphone-17-pro-max',
]);

export const PRODUCTS = [
  {
    id: 'iphone-16-pro',
    name: 'iPhone 16 Pro',
    shortName: '16 Pro',
    category: 'phone',
    minStorageGb: 256,
    allowP2P: true,
    defaultThreshold: 2600,
    minSanityPrice: 1050,
    maxSanityPrice: 9500,
    searchQueries: ['iphone 16 pro 256', 'iphone 16 pro'],
    fbQuery: 'iPhone 16 Pro 256GB',
  },
  {
    id: 'iphone-16-pro-max',
    name: 'iPhone 16 Pro Max',
    shortName: '16 Pro Max',
    category: 'phone',
    minStorageGb: 256,
    allowP2P: true,
    defaultThreshold: 2600,
    minSanityPrice: 1100,
    maxSanityPrice: 11000,
    searchQueries: ['iphone 16 pro max'],
    fbQuery: 'iPhone 16 Pro Max',
  },
  {
    id: 'iphone-17',
    name: 'iPhone 17',
    shortName: 'iPhone 17',
    category: 'phone',
    minStorageGb: 256,
    allowP2P: true,
    defaultThreshold: 2600,
    minSanityPrice: 1100,
    maxSanityPrice: 9500,
    searchQueries: ['iphone 17'],
    fbQuery: 'iPhone 17',
  },
  {
    id: 'iphone-17-pro',
    name: 'iPhone 17 Pro',
    shortName: '17 Pro',
    category: 'phone',
    minStorageGb: 256,
    allowP2P: true,
    defaultThreshold: 3200,
    minSanityPrice: 1300,
    maxSanityPrice: 12000,
    searchQueries: ['iphone 17 pro'],
    fbQuery: 'iPhone 17 Pro',
  },
  {
    id: 'iphone-17-pro-max',
    name: 'iPhone 17 Pro Max',
    shortName: '17 Pro Max',
    category: 'phone',
    minStorageGb: 256,
    allowP2P: true,
    defaultThreshold: 3200,
    minSanityPrice: 1400,
    maxSanityPrice: 14000,
    searchQueries: ['iphone 17 pro max'],
    fbQuery: 'iPhone 17 Pro Max',
  },
  {
    id: 'airpods-pro-3',
    name: 'AirPods Pro 3',
    shortName: 'AirPods Pro 3',
    category: 'audio',
    minStorageGb: null,
    allowP2P: false, // P2P disabled for AirPods due to rampant fakes/clones
    defaultThreshold: 700,
    minSanityPrice: 350,
    maxSanityPrice: 2500,
    searchQueries: ['airpods pro 3', 'airpods 3 pro'],
    fbQuery: null,
  },
];

export const PRODUCT_MAP = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

export const SOURCES = [
  // === Peer-to-Peer (Strict București, iPhones ≥ 256GB ONLY — no AirPods!) ===
  {
    id: 'olx',
    name: 'OLX.ro',
    type: 'p2p',
    typeLabel: 'P2P · București',
    url: 'https://www.olx.ro',
    description: 'Anunțuri directe iPhone ≥ 256GB — strict vânzători București (fără AirPods P2P)',
    supportsAudio: false,
    enabledByDefault: true,
  },
  {
    id: 'publi24',
    name: 'Publi24.ro',
    type: 'p2p',
    typeLabel: 'P2P · București',
    url: 'https://www.publi24.ro',
    description: 'Anunțuri directe iPhone ≥ 256GB — strict vânzători București (fără AirPods P2P)',
    supportsAudio: false,
    enabledByDefault: true,
  },
  {
    id: 'vinted',
    name: 'Vinted.ro',
    type: 'p2p',
    typeLabel: 'P2P · București',
    url: 'https://www.vinted.ro',
    description: 'iPhone ≥ 256GB cu verificare pe profilul vânzătorului: doar București',
    supportsAudio: false,
    enabledByDefault: true,
  },

  // === Refurbished / SH cu Garanție ===
  {
    id: 'flip',
    name: 'Flip.ro',
    type: 'refurbished',
    typeLabel: 'Refurbished',
    url: 'https://flip.ro',
    description: 'Telefoane recondiționate verificate, garanție 24 luni',
    supportsAudio: false,
    enabledByDefault: true,
  },
  {
    id: 'yzzy',
    name: 'YZZY.ro',
    type: 'refurbished',
    typeLabel: 'Refurbished',
    url: 'https://yzzy.ro',
    description: 'Telefoane și dispozitive Apple recondiționate, garanție 24 luni',
    supportsAudio: true,
    enabledByDefault: true,
  },
  {
    id: 'klap',
    name: 'Klap.ro',
    type: 'refurbished',
    typeLabel: 'Refurbished',
    url: 'https://klap.ro',
    description: 'Telefoane recondiționate pe grade (A+, A, B), garanție 24 luni',
    supportsAudio: true,
    enabledByDefault: true,
  },
  {
    id: 'appleplug',
    name: 'ApplePlug.ro',
    type: 'refurbished',
    typeLabel: 'Refurbished',
    url: 'https://appleplug.ro',
    description: 'Magazin specializat Apple recondiționat & SH cu garanție 24 luni',
    supportsAudio: true,
    enabledByDefault: true,
  },
  {
    id: 'truegsm',
    name: 'TrueGSM.ro',
    type: 'refurbished',
    typeLabel: 'Refurbished / SH',
    url: 'https://truegsm.ro',
    description: 'Telefoane iPhone & AirPods verificate, garanție magazin',
    supportsAudio: true,
    enabledByDefault: true,
  },
  {
    id: 'goz',
    name: 'GOZ.ro',
    type: 'refurbished',
    typeLabel: 'Refurbished',
    url: 'https://goz.ro',
    description: 'Dispozitive și căști Apple AirPods Pro recondiționate cu garanție',
    supportsAudio: true,
    enabledByDefault: true,
  },
  {
    id: 'telefonultau',
    name: 'TelefonulTau',
    type: 'refurbished',
    typeLabel: 'Refurbished / SH',
    url: 'https://telefonultau.eu',
    description: 'Telefoane și căști Apple verificate online în România',
    supportsAudio: true,
    enabledByDefault: true,
  },

  // === Case de Amanet (București & Național) ===
  {
    id: 'totalconvert',
    name: 'TotalConvert',
    type: 'amanet',
    typeLabel: 'Amanet · București',
    url: 'https://totalconvert.ro',
    description: 'Amanet & SH cu magazine fizice în București (Dristor, Griviței) + garanție 24 luni',
    supportsAudio: true,
    enabledByDefault: true,
  },
  {
    id: 'bsgmag',
    name: 'BSGmag',
    type: 'amanet',
    typeLabel: 'Amanet · București',
    url: 'https://bsgmag.ro',
    description: 'Magazinul online BSG Amanet (rețea națională + agenții București)',
    supportsAudio: true,
    enabledByDefault: true,
  },
  {
    id: 'topamanet',
    name: 'Top Amanet',
    type: 'amanet',
    typeLabel: 'Amanet · București',
    url: 'https://topamanet.shop',
    description: 'Case de amanet din București — afișează direct capacitatea și % bateriei',
    supportsAudio: true,
    enabledByDefault: true,
  },
  {
    id: 'ndpmagazin',
    name: 'NDP Amanet',
    type: 'amanet',
    typeLabel: 'Amanet · București',
    url: 'https://ndpmagazin.ro',
    description: 'NDP Amanet București (Calea Vitan & Calea Moșilor) — iPhone & AirPods verificate',
    supportsAudio: true,
    enabledByDefault: true,
  },
  {
    id: 'amanetberceni',
    name: 'Amanet Berceni',
    type: 'amanet',
    typeLabel: 'Amanet · București',
    url: 'https://www.amanetberceni.ro/telefoane',
    description: 'Amanet Sector 4 București — stoc actualizat zilnic cu % baterie',
    supportsAudio: true,
    enabledByDefault: true,
  },
  {
    id: 'faneamanet',
    name: 'Fane Amanet',
    type: 'amanet',
    typeLabel: 'Amanet · București',
    url: 'https://faneamanet.ro/magazin/',
    description: 'Amanet Sector 3 București (zona Vitan) — electronice și telefoane verificate',
    supportsAudio: true,
    enabledByDefault: true,
  },
  {
    id: 'amanetonline',
    name: 'AmanetOnline',
    type: 'amanet',
    typeLabel: 'Amanet · Cashbook',
    url: 'https://amanetonline.com',
    description: 'Rețea Cashbook / Amanet Online — electronice testate cu livrare',
    supportsAudio: true,
    enabledByDefault: true,
  },

  // === Manual-only P2P ===
  {
    id: 'facebook',
    name: 'Facebook Marketplace',
    type: 'p2p',
    typeLabel: 'P2P · Link direct București',
    url: 'https://www.facebook.com/marketplace/bucharest/',
    description: 'Necesită login Facebook — link-uri pre-filtrate București pentru iPhone ≥ 256GB (fără AirPods)',
    supportsAudio: false,
    enabledByDefault: false,
    manualOnly: true,
  },
];

export const SOURCE_MAP = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

export function buildFacebookMarketplaceUrl(product, maxPriceRon) {
  if (!product.allowP2P || !product.fbQuery) return null;
  const params = new URLSearchParams({
    query: product.fbQuery,
    sortBy: 'price_ascend',
    exact: 'false',
  });
  if (maxPriceRon && Number.isFinite(Number(maxPriceRon))) {
    params.set('maxPrice', String(Math.round(Number(maxPriceRon))));
  }
  return `https://www.facebook.com/marketplace/bucharest/search?${params.toString()}`;
}

export function getDefaultSettings() {
  const envThresholds = {
    'iphone-16-pro': Number(process.env.THRESHOLD_IPHONE_16_PRO) || 2600,
    'iphone-16-pro-max': Number(process.env.THRESHOLD_IPHONE_16_PRO_MAX) || 2600,
    'iphone-17': Number(process.env.THRESHOLD_IPHONE_17) || 2600,
    'iphone-17-pro': Number(process.env.THRESHOLD_IPHONE_17_PRO) || 3200,
    'iphone-17-pro-max': Number(process.env.THRESHOLD_IPHONE_17_PRO_MAX) || 3200,
    'airpods-pro-3': Number(process.env.THRESHOLD_AIRPODS_PRO_3) || 700,
  };
  const thresholds = {};
  for (const p of PRODUCTS) {
    thresholds[p.id] = envThresholds[p.id] || p.defaultThreshold;
  }
  const enabledSources = {};
  for (const s of SOURCES) {
    if (!s.manualOnly) enabledSources[s.id] = s.enabledByDefault;
  }

  return {
    thresholds,
    enabledSources,
    minIphoneStorageGb:
      process.env.MIN_IPHONE_STORAGE_GB !== undefined
        ? Number(process.env.MIN_IPHONE_STORAGE_GB)
        : MIN_IPHONE_STORAGE_GB,
    strictBucharestOnly: true,
    excludeP2pAirpods: true,
    scanIntervalMinutes: 15,
    autoScanEnabled: true,
    eurToRon: EUR_TO_RON_DEFAULT,
    email: {
      enabled: Boolean(process.env.ALERT_EMAIL_TO && process.env.SMTP_USER && process.env.SMTP_PASS),
      to: process.env.ALERT_EMAIL_TO || '',
      preset: process.env.SMTP_PRESET || 'gmail',
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: process.env.SMTP_SECURE !== 'false',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      minDropForReAlert: 50,
    },
  };
}
