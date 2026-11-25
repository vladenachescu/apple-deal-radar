import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { PRODUCT_MAP } from './config.js';
import {
  getSettings,
  saveSettings,
  getActiveListings,
  dismissListing,
  restoreDismissedListings,
  addManualListing,
} from './db.js';
import { runFullScan, scanState } from './scrapers/index.js';
import { sendTestEmail, processDealAlerts } from './emailer.js';
import { extractSpecs } from './classifier.js';
import {
  computeDashboardPayload,
  filterValidListings,
  sanitizeSettingsForClient,
} from './snapshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');

// Minimal .env loader
const envPath = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

const PORT = Number(process.env.PORT) || 3456;
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT_DIR, 'public')));

let schedulerTimer = null;
let nextScanAt = null;

function rescheduleBackgroundScanner() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  const settings = getSettings();
  if (!settings.autoScanEnabled) {
    nextScanAt = null;
    return;
  }
  const minutes = Math.max(5, Math.min(240, Number(settings.scanIntervalMinutes) || 15));
  const ms = minutes * 60 * 1000;
  nextScanAt = new Date(Date.now() + ms).toISOString();

  schedulerTimer = setInterval(async () => {
    nextScanAt = new Date(Date.now() + ms).toISOString();
    if (!scanState.inProgress) {
      console.log(`[Scheduler] Starting automatic scan (${new Date().toLocaleTimeString('ro-RO')})...`);
      await runFullScan().catch((e) => console.error('[Scheduler] Scan error:', e));
    }
  }, ms);
}

// === API Routes ===
app.get('/health', (_req, res) => {
  res.json({ ok: true, uptimeSec: Math.round(process.uptime()), time: new Date().toISOString() });
});

app.get('/api/dashboard', (_req, res) => {
  res.json(computeDashboardPayload({ scanState, nextScanAt, publicSafe: false }));
});

app.get('/api/scan/status', (_req, res) => {
  res.json({
    ...scanState,
    nextScanAt,
  });
});

app.post('/api/scan', (req, res) => {
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : null;
  if (scanState.inProgress) {
    return res.json({ started: false, alreadyRunning: true, scanState });
  }
  runFullScan(sources).catch((err) => console.error('[API /api/scan] error:', err));
  res.json({ started: true, scanState });
});

app.put('/api/settings', async (req, res) => {
  try {
    const body = req.body || {};
    const current = getSettings();

    const incomingEmail = body.email || {};
    const nextEmail = {
      ...current.email,
      ...incomingEmail,
      pass:
        incomingEmail.pass && incomingEmail.pass.trim().length > 0
          ? incomingEmail.pass.trim()
          : current.email.pass,
    };

    const updated = saveSettings({
      ...body,
      email: nextEmail,
    });

    rescheduleBackgroundScanner();

    const validActive = filterValidListings(getActiveListings(), updated);
    const alertCheck = await processDealAlerts(validActive, updated);

    res.json({
      ok: true,
      settings: sanitizeSettingsForClient(updated),
      alertCheck,
      nextScanAt,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/email/test', async (req, res) => {
  try {
    const current = getSettings();
    const incoming = req.body || {};
    const emailConfig = {
      ...current.email,
      ...incoming,
      pass:
        incoming.pass && incoming.pass.trim().length > 0
          ? incoming.pass.trim()
          : current.email.pass,
    };
    await sendTestEmail(emailConfig);
    res.json({ ok: true, message: `Emailul de test a fost trimis cu succes către ${emailConfig.to}!` });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err?.message || 'Eroare la trimiterea emailului de test.',
    });
  }
});

app.post('/api/listings/manual', async (req, res) => {
  try {
    const { productId, title, priceRon, url, source, location } = req.body || {};
    if (!PRODUCT_MAP[productId]) {
      return res.status(400).json({ ok: false, error: 'Model invalid.' });
    }
    const price = Number(priceRon);
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ ok: false, error: 'Preț invalid.' });
    }
    if (!title || !url) {
      return res.status(400).json({ ok: false, error: 'Titlul și link-ul sunt obligatorii.' });
    }
    const specs = extractSpecs(title, '');
    const id = addManualListing({
      productId,
      title: String(title).trim(),
      priceRon: price,
      url: String(url).trim(),
      source: source || 'facebook',
      sourceType: source === 'facebook' || source === 'olx' || source === 'vinted' ? 'p2p' : 'amanet',
      location: location || 'București',
      ...specs,
    });

    const settings = getSettings();
    await processDealAlerts(filterValidListings(getActiveListings(), settings), settings);
    res.json({ ok: true, id });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/listings/:id/dismiss', (req, res) => {
  dismissListing(req.params.id);
  res.json({ ok: true });
});

app.post('/api/listings/restore-dismissed', (_req, res) => {
  restoreDismissedListings();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n🚀 AppleRadar RO rulează pe http://localhost:${PORT}`);
  rescheduleBackgroundScanner();

  const existing = getActiveListings();
  if (existing.length === 0) {
    console.log('[Startup] Baza de date este goală — pornesc prima scanare automată...');
    runFullScan().catch((err) => console.error('[Startup Scan] Error:', err));
  }
});
