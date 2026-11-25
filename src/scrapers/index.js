import { scrapeOlx } from './olx.js';
import { scrapePubli24 } from './publi24.js';
import { scrapeVinted } from './vinted.js';
import { scrapeFlip } from './flip.js';
import { scrapeTotalConvert } from './totalconvert.js';
import {
  scrapeYzzy,
  scrapeAmanetOnline,
  scrapeNdpMagazin,
  scrapeApplePlug,
  scrapeTrueGsm,
  scrapeGoz,
  scrapeTelefonulTau,
} from './wooApi.js';
import { scrapeKlap } from './klap.js';
import { scrapeBsgmag } from './bsgmag.js';
import { scrapeTopAmanet } from './topamanet.js';
import { scrapeAmanetBerceni } from './amanetberceni.js';
import { scrapeFaneAmanet } from './faneamanet.js';
import { meetsMinStorage, isWithinMaxAgeDays } from '../classifier.js';
import {
  getSettings,
  upsertSourceListings,
  updateSourceStatus,
  getActiveListings,
} from '../db.js';
import { processDealAlerts } from '../emailer.js';

export const SCRAPER_REGISTRY = {
  olx: scrapeOlx,
  publi24: scrapePubli24,
  vinted: scrapeVinted,
  flip: scrapeFlip,
  yzzy: scrapeYzzy,
  klap: scrapeKlap,
  appleplug: scrapeApplePlug,
  truegsm: scrapeTrueGsm,
  goz: scrapeGoz,
  telefonultau: scrapeTelefonulTau,
  totalconvert: scrapeTotalConvert,
  bsgmag: scrapeBsgmag,
  topamanet: scrapeTopAmanet,
  ndpmagazin: scrapeNdpMagazin,
  amanetberceni: scrapeAmanetBerceni,
  faneamanet: scrapeFaneAmanet,
  amanetonline: scrapeAmanetOnline,
};

export const scanState = {
  inProgress: false,
  startedAt: null,
  finishedAt: null,
  completedSources: 0,
  totalSources: 0,
  currentProgress: {},
  lastAlertSummary: null,
};

function applyGlobalQualityRules(items, settings) {
  const minGb = Number(settings.minIphoneStorageGb ?? 256);
  const excludeP2pAirpods = settings.excludeP2pAirpods !== false;
  const maxP2pAgeDays = Number(settings.maxP2pAgeDays ?? 7);

  const filtered = [];
  let droppedStorage = 0;
  let droppedP2pAirpods = 0;
  let droppedStaleP2p = 0;

  for (const item of items) {
    // 1. Block P2P AirPods Pro 3 (too many fake clones on OLX/Publi24/Vinted/FB)
    if (excludeP2pAirpods && item.productId === 'airpods-pro-3' && item.sourceType === 'p2p') {
      droppedP2pAirpods++;
      continue;
    }

    // 2. Enforce freshness filter on P2P listings (default ≤ 7 days since posted/refreshed)
    if (item.sourceType === 'p2p' && maxP2pAgeDays > 0 && !isWithinMaxAgeDays(item.postedAt, maxP2pAgeDays)) {
      droppedStaleP2p++;
      continue;
    }

    // 3. Enforce minimum iPhone storage (default ≥ 256GB)
    const storageCheck = meetsMinStorage(
      item.productId,
      item.title,
      `${item.condition || ''} ${item.url || ''}`,
      item.storage,
      minGb
    );
    if (!storageCheck.ok) {
      droppedStorage++;
      continue;
    }

    filtered.push({
      ...item,
      storage: item.storage || storageCheck.label || null,
    });
  }

  return { filtered, droppedStorage, droppedP2pAirpods, droppedStaleP2p };
}

export async function runFullScan(requestedSources = null) {
  if (scanState.inProgress) {
    return { alreadyRunning: true, scanState };
  }

  const settings = getSettings();
  const enabledList = Object.keys(SCRAPER_REGISTRY).filter((id) => {
    if (requestedSources && Array.isArray(requestedSources) && requestedSources.length > 0) {
      return requestedSources.includes(id);
    }
    return settings.enabledSources?.[id] !== false;
  });

  scanState.inProgress = true;
  scanState.startedAt = new Date().toISOString();
  scanState.completedSources = 0;
  scanState.totalSources = enabledList.length;
  scanState.currentProgress = Object.fromEntries(
    enabledList.map((id) => [id, { status: 'running', itemsFound: 0 }])
  );

  try {
    await Promise.all(
      enabledList.map(async (sourceId) => {
        const start = Date.now();
        try {
          const fn = SCRAPER_REGISTRY[sourceId];
          const result = await fn(settings);
          const { filtered, droppedStorage, droppedStaleP2p } = applyGlobalQualityRules(result.items || [], settings);
          const durationMs = Date.now() - start;

          upsertSourceListings(sourceId, filtered);

          const notes = [];
          if (droppedStorage > 0) notes.push(`${droppedStorage} sub 256GB`);
          if (droppedStaleP2p > 0) notes.push(`${droppedStaleP2p} > ${settings.maxP2pAgeDays ?? 7} zile`);
          const extraNote = notes.length > 0 ? ` (excluse: ${notes.join(', ')})` : '';
          const msg = `${result.message || 'Scanare completă'}${extraNote}`;

          updateSourceStatus(sourceId, {
            status: 'ok',
            itemsFound: filtered.length,
            rawChecked: result.rawChecked || 0,
            durationMs,
            message: msg,
          });
          scanState.currentProgress[sourceId] = {
            status: 'ok',
            itemsFound: filtered.length,
            durationMs,
            message: msg,
          };
        } catch (err) {
          const durationMs = Date.now() - start;
          const msg = err?.message || String(err);
          console.error(`[Scraper:${sourceId}] Error:`, msg);
          updateSourceStatus(sourceId, {
            status: 'error',
            itemsFound: 0,
            rawChecked: 0,
            durationMs,
            message: msg,
          });
          scanState.currentProgress[sourceId] = {
            status: 'error',
            itemsFound: 0,
            durationMs,
            message: msg,
          };
        } finally {
          scanState.completedSources++;
        }
      })
    );

    const activeListings = getActiveListings();
    const alertSummary = await processDealAlerts(activeListings, settings);
    scanState.lastAlertSummary = {
      at: new Date().toISOString(),
      triggered: alertSummary.triggered,
      emailSent: alertSummary.emailSent,
      emailError: alertSummary.emailError || null,
    };

    return {
      ok: true,
      totalListings: activeListings.length,
      alerts: scanState.lastAlertSummary,
      progress: scanState.currentProgress,
    };
  } finally {
    scanState.inProgress = false;
    scanState.finishedAt = new Date().toISOString();
  }
}
