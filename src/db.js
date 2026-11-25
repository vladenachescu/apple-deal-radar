import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { getDefaultSettings } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'radar.sqlite');
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_type TEXT NOT NULL,
    product_id TEXT NOT NULL,
    title TEXT NOT NULL,
    price_ron INTEGER NOT NULL,
    original_price INTEGER,
    currency TEXT DEFAULT 'RON',
    previous_price_ron INTEGER,
    url TEXT NOT NULL,
    image_url TEXT,
    location TEXT,
    storage TEXT,
    battery TEXT,
    condition TEXT,
    has_warranty INTEGER DEFAULT 0,
    is_manual INTEGER DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    is_active INTEGER DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_listings_product_price ON listings(product_id, is_active, price_ron);
  CREATE INDEX IF NOT EXISTS idx_listings_source ON listings(source, is_active);

  CREATE TABLE IF NOT EXISTS dismissed_listings (
    listing_id TEXT PRIMARY KEY,
    dismissed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alert_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    price_ron INTEGER NOT NULL,
    threshold_ron INTEGER NOT NULL,
    url TEXT NOT NULL,
    email_sent INTEGER DEFAULT 0,
    email_to TEXT,
    email_error TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_alerts_listing ON alert_history(listing_id, price_ron);

  CREATE TABLE IF NOT EXISTS source_status (
    source TEXT PRIMARY KEY,
    last_scan_at TEXT,
    status TEXT,
    items_found INTEGER DEFAULT 0,
    raw_checked INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    message TEXT
  );

  CREATE TABLE IF NOT EXISTS vinted_sellers (
    member_id TEXT PRIMARY KEY,
    location TEXT,
    is_bucharest INTEGER DEFAULT 0,
    checked_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export function getSettings() {
  const defaults = getDefaultSettings();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('main');
  if (!row) return defaults;
  try {
    const saved = JSON.parse(row.value);
    return {
      ...defaults,
      ...saved,
      thresholds: { ...defaults.thresholds, ...(saved.thresholds || {}) },
      enabledSources: { ...defaults.enabledSources, ...(saved.enabledSources || {}) },
      email: { ...defaults.email, ...(saved.email || {}) },
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(partial) {
  const current = getSettings();
  const next = {
    ...current,
    ...partial,
    thresholds: { ...current.thresholds, ...(partial.thresholds || {}) },
    enabledSources: { ...current.enabledSources, ...(partial.enabledSources || {}) },
    email: { ...current.email, ...(partial.email || {}) },
  };
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('main', JSON.stringify(next));
  return next;
}

export function getDismissedSet() {
  const rows = db.prepare('SELECT listing_id FROM dismissed_listings').all();
  return new Set(rows.map((r) => r.listing_id));
}

export function dismissListing(listingId) {
  db.prepare('INSERT OR REPLACE INTO dismissed_listings (listing_id, dismissed_at) VALUES (?, ?)')
    .run(listingId, new Date().toISOString());
}

export function restoreDismissedListings() {
  db.prepare('DELETE FROM dismissed_listings').run();
}

export function upsertSourceListings(sourceId, items) {
  const now = new Date().toISOString();
  const seenIds = new Set();

  const existingStmt = db.prepare('SELECT id, price_ron, first_seen_at FROM listings WHERE id = ?');
  const upsertStmt = db.prepare(`
    INSERT INTO listings (
      id, source, source_type, product_id, title, price_ron, original_price, currency,
      previous_price_ron, url, image_url, location, storage, battery, condition, has_warranty,
      is_manual, first_seen_at, last_seen_at, is_active
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, 1
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      price_ron = excluded.price_ron,
      original_price = excluded.original_price,
      currency = excluded.currency,
      previous_price_ron = CASE
        WHEN excluded.previous_price_ron IS NOT NULL THEN excluded.previous_price_ron
        WHEN listings.price_ron != excluded.price_ron THEN listings.price_ron
        ELSE listings.previous_price_ron
      END,
      url = excluded.url,
      image_url = COALESCE(excluded.image_url, listings.image_url),
      location = COALESCE(excluded.location, listings.location),
      storage = COALESCE(excluded.storage, listings.storage),
      battery = COALESCE(excluded.battery, listings.battery),
      condition = COALESCE(excluded.condition, listings.condition),
      has_warranty = excluded.has_warranty,
      last_seen_at = excluded.last_seen_at,
      is_active = 1
  `);

  db.exec('BEGIN');
  try {
    // Mark previous non-manual listings from this source inactive before reactivating current ones
    db.prepare('UPDATE listings SET is_active = 0 WHERE source = ? AND is_manual = 0').run(sourceId);

    for (const item of items) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      const existing = existingStmt.get(item.id);
      upsertStmt.run(
        item.id,
        item.source,
        item.sourceType,
        item.productId,
        item.title,
        Math.round(item.priceRon),
        item.originalPrice != null ? Math.round(item.originalPrice) : Math.round(item.priceRon),
        item.currency || 'RON',
        item.previousPriceRon != null ? Math.round(item.previousPriceRon) : null,
        item.url,
        item.imageUrl || null,
        item.location || null,
        item.storage || null,
        item.battery || null,
        item.condition || null,
        item.hasWarranty ? 1 : 0,
        item.isManual ? 1 : 0,
        existing?.first_seen_at || now,
        now
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function addManualListing(item) {
  const now = new Date().toISOString();
  const id = `manual:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
  db.prepare(`
    INSERT INTO listings (
      id, source, source_type, product_id, title, price_ron, original_price, currency,
      previous_price_ron, url, image_url, location, storage, battery, condition, has_warranty,
      is_manual, first_seen_at, last_seen_at, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'RON', NULL, ?, NULL, ?, ?, ?, ?, ?, 1, ?, ?, 1)
  `).run(
    id,
    item.source || 'facebook',
    item.sourceType || 'p2p',
    item.productId,
    item.title,
    Math.round(item.priceRon),
    Math.round(item.priceRon),
    item.url,
    item.location || 'București',
    item.storage || null,
    item.battery || null,
    item.condition || null,
    item.hasWarranty ? 1 : 0,
    now,
    now
  );
  return id;
}

export function getActiveListings() {
  const dismissed = getDismissedSet();
  const rows = db.prepare(`
    SELECT * FROM listings
    WHERE is_active = 1
    ORDER BY price_ron ASC, last_seen_at DESC
  `).all();
  return rows.filter((r) => !dismissed.has(r.id));
}

export function updateSourceStatus(source, { status, itemsFound = 0, rawChecked = 0, durationMs = 0, message = '' }) {
  db.prepare(`
    INSERT INTO source_status (source, last_scan_at, status, items_found, raw_checked, duration_ms, message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source) DO UPDATE SET
      last_scan_at = excluded.last_scan_at,
      status = excluded.status,
      items_found = excluded.items_found,
      raw_checked = excluded.raw_checked,
      duration_ms = excluded.duration_ms,
      message = excluded.message
  `).run(source, new Date().toISOString(), status, itemsFound, rawChecked, durationMs, message);
}

export function getAllSourceStatuses() {
  return db.prepare('SELECT * FROM source_status').all();
}

export function getCachedVintedSeller(memberId) {
  const row = db.prepare('SELECT * FROM vinted_sellers WHERE member_id = ?').get(String(memberId));
  if (!row) return null;
  // Cache seller city for 14 days
  const ageMs = Date.now() - new Date(row.checked_at).getTime();
  if (ageMs > 14 * 24 * 3600 * 1000) return null;
  return {
    memberId: row.member_id,
    location: row.location,
    isBucharest: Boolean(row.is_bucharest),
  };
}

export function cacheVintedSeller(memberId, location, isBucharest) {
  db.prepare(`
    INSERT INTO vinted_sellers (member_id, location, is_bucharest, checked_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(member_id) DO UPDATE SET
      location = excluded.location,
      is_bucharest = excluded.is_bucharest,
      checked_at = excluded.checked_at
  `).run(String(memberId), location || '', isBucharest ? 1 : 0, new Date().toISOString());
}

export function getLowestAlertedPrice(listingId) {
  const row = db.prepare('SELECT MIN(price_ron) as min_price FROM alert_history WHERE listing_id = ?').get(listingId);
  return row?.min_price ?? null;
}

export function recordAlert({ listingId, productId, source, title, priceRon, thresholdRon, url, emailSent, emailTo, emailError }) {
  db.prepare(`
    INSERT INTO alert_history (
      listing_id, product_id, source, title, price_ron, threshold_ron, url,
      email_sent, email_to, email_error, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    listingId,
    productId,
    source,
    title,
    Math.round(priceRon),
    Math.round(thresholdRon),
    url,
    emailSent ? 1 : 0,
    emailTo || null,
    emailError || null,
    new Date().toISOString()
  );
}

export function getAlertHistory(limit = 50) {
  return db.prepare('SELECT * FROM alert_history ORDER BY id DESC LIMIT ?').all(limit);
}
