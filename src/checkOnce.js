import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFullScan } from './scrapers/index.js';
import { getAllSourceStatuses } from './db.js';
import { buildStaticSiteBundle } from './snapshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');

// Load .env if present
const envPath = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

const skipScan = process.argv.includes('--export-only');

if (!skipScan) {
  console.log(`[AppleRadar RO] Starting scheduled scan at ${new Date().toISOString()}...`);
  const result = await runFullScan();
  const statuses = getAllSourceStatuses();
  console.log(`[AppleRadar RO] Scan done! Active listings: ${result.totalListings}`);
  for (const s of statuses) {
    console.log(`  - ${s.source.padEnd(14)}: ${s.status} (${s.items_found} items) ${s.message}`);
  }
  console.log('[AppleRadar RO] Alerts:', JSON.stringify(result.alerts));
}

const exported = buildStaticSiteBundle();
console.log(
  `[AppleRadar RO] Static GitHub Pages bundle exported to ${exported.outDir} (${exported.totalListings} listings, ${exported.subThreshold} sub-threshold).`
);
process.exit(0);
