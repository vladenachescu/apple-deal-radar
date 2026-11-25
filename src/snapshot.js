import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, SOURCES, buildFacebookMarketplaceUrl } from './config.js';
import {
  getSettings,
  getActiveListings,
  getAllSourceStatuses,
  getAlertHistory,
} from './db.js';
import { meetsMinStorage, isWithinMaxAgeDays } from './classifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');

export function filterValidListings(rows, settings) {
  const minGb = Number(settings.minIphoneStorageGb ?? 256);
  const excludeP2pAirpods = settings.excludeP2pAirpods !== false;
  const maxP2pAgeDays = Number(settings.maxP2pAgeDays ?? 7);

  return rows.filter((row) => {
    if (excludeP2pAirpods && row.product_id === 'airpods-pro-3' && row.source_type === 'p2p') {
      return false;
    }
    if (row.source_type === 'p2p' && maxP2pAgeDays > 0 && !isWithinMaxAgeDays(row.posted_at, maxP2pAgeDays)) {
      return false;
    }
    const check = meetsMinStorage(
      row.product_id,
      row.title,
      `${row.condition || ''} ${row.url || ''}`,
      row.storage,
      minGb
    );
    return check.ok;
  });
}

export function sanitizeSettingsForClient(settings, { publicSafe = false } = {}) {
  const emailActive = Boolean(settings.email?.enabled && settings.email?.to && settings.email?.pass);
  return {
    ...settings,
    email: {
      enabled: Boolean(settings.email?.enabled),
      preset: settings.email?.preset || 'gmail',
      host: publicSafe ? '' : settings.email?.host || 'smtp.gmail.com',
      port: settings.email?.port || 465,
      secure: Boolean(settings.email?.secure),
      to: publicSafe ? '' : settings.email?.to || '',
      user: publicSafe ? '' : settings.email?.user || '',
      pass: '',
      hasPass: Boolean(settings.email?.pass),
      isConfigured: emailActive,
      minDropForReAlert: settings.email?.minDropForReAlert ?? 50,
    },
  };
}

export function computeDashboardPayload({ scanState = {}, nextScanAt = null, publicSafe = false } = {}) {
  const settings = getSettings();
  const listings = filterValidListings(getActiveListings(), settings);
  const thresholds = settings.thresholds || {};

  const enriched = listings.map((row) => {
    const threshold = Number(thresholds[row.product_id]) || 0;
    const isBelowThreshold = threshold > 0 && row.price_ron < threshold;
    return {
      id: row.id,
      source: row.source,
      sourceType: row.source_type,
      productId: row.product_id,
      title: row.title,
      priceRon: row.price_ron,
      originalPrice: row.original_price,
      currency: row.currency,
      previousPriceRon: row.previous_price_ron,
      url: row.url,
      imageUrl: row.image_url,
      location: row.location,
      storage: row.storage,
      battery: row.battery,
      condition: row.condition,
      hasWarranty: Boolean(row.has_warranty),
      isManual: Boolean(row.is_manual),
      postedAt: row.posted_at || null,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      thresholdRon: threshold,
      isBelowThreshold,
      deltaRon: threshold ? row.price_ron - threshold : null,
    };
  });

  const bestByProduct = {};
  const matrix = {};
  for (const p of PRODUCTS) {
    const prodListings = enriched.filter((l) => l.productId === p.id);
    const threshold = Number(thresholds[p.id]) || p.defaultThreshold;
    const best = prodListings[0] || null;
    const subThresholdCount = prodListings.filter((l) => l.isBelowThreshold).length;

    bestByProduct[p.id] = {
      productId: p.id,
      name: p.name,
      shortName: p.shortName,
      category: p.category,
      allowP2P: p.allowP2P !== false,
      thresholdRon: threshold,
      totalCount: prodListings.length,
      subThresholdCount,
      bestDeal: best,
      fbMarketplaceUrl: buildFacebookMarketplaceUrl(p, threshold),
    };

    matrix[p.id] = {};
    for (const s of SOURCES) {
      if (s.manualOnly) continue;
      if (p.id === 'airpods-pro-3' && s.type === 'p2p' && settings.excludeP2pAirpods !== false) {
        matrix[p.id][s.id] = { disabled: true, reason: 'fără P2P' };
        continue;
      }
      const siteItems = prodListings.filter((l) => l.source === s.id);
      if (siteItems.length > 0) {
        matrix[p.id][s.id] = {
          count: siteItems.length,
          lowestPriceRon: siteItems[0].priceRon,
          isBelowThreshold: siteItems[0].isBelowThreshold,
          url: siteItems[0].url,
          title: siteItems[0].title,
          location: siteItems[0].location,
          id: siteItems[0].id,
        };
      } else {
        matrix[p.id][s.id] = null;
      }
    }
  }

  const statusesMap = Object.fromEntries(getAllSourceStatuses().map((r) => [r.source, r]));
  const sourcesWithStatus = SOURCES.map((s) => ({
    ...s,
    enabled: s.manualOnly ? false : settings.enabledSources?.[s.id] !== false,
    status: statusesMap[s.id] || null,
  }));

  const persistedLastScan =
    Object.values(statusesMap)
      .map((s) => s.last_scan_at)
      .filter(Boolean)
      .sort()
      .pop() || null;

  // Strip personal recipient email address when exporting for public GitHub Pages!
  const rawAlerts = getAlertHistory(40);
  const alerts = publicSafe
    ? rawAlerts.map((a) => ({
        ...a,
        email_to: a.email_sent ? 'email configurat (privat)' : null,
        email_error: a.email_sent ? null : a.email_error ? 'Email neconfigurat în GitHub Secrets' : null,
      }))
    : rawAlerts;

  return {
    mode: publicSafe ? 'cloud-static' : 'local-server',
    products: PRODUCTS,
    sources: sourcesWithStatus,
    settings: sanitizeSettingsForClient(settings, { publicSafe }),
    bestByProduct,
    matrix,
    listings: enriched,
    totalSubThreshold: enriched.filter((l) => l.isBelowThreshold).length,
    alerts,
    scanState: {
      inProgress: false,
      ...scanState,
      finishedAt: scanState.finishedAt || persistedLastScan,
      nextScanAt,
    },
    serverTime: new Date().toISOString(),
  };
}

/**
 * Exports a complete, privacy-safe static web bundle into `dist/` ready for GitHub Pages.
 */
export function buildStaticSiteBundle(outDir = path.join(ROOT_DIR, 'dist')) {
  const publicDir = path.join(ROOT_DIR, 'public');
  const dataOutDir = path.join(outDir, 'data');
  fs.mkdirSync(dataOutDir, { recursive: true });

  for (const file of ['index.html', 'styles.css', 'app.js']) {
    fs.copyFileSync(path.join(publicDir, file), path.join(outDir, file));
  }

  // Ensure GitHub Pages serves everything cleanly without Jekyll processing
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

  const payload = computeDashboardPayload({
    scanState: {
      inProgress: false,
      finishedAt: new Date().toISOString(),
    },
    nextScanAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    publicSafe: true,
  });

  fs.writeFileSync(path.join(dataOutDir, 'dashboard.json'), JSON.stringify(payload, null, 2), 'utf8');
  return { outDir, totalListings: payload.listings.length, subThreshold: payload.totalSubThreshold };
}
