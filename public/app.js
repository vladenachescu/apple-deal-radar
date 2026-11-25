const state = {
  data: null,
  isStaticCloud: false,
  localDismissed: new Set(JSON.parse(localStorage.getItem('appleradar_dismissed') || '[]')),
  filters: {
    category: 'all',
    productId: 'all',
    source: 'all',
    maxPrice: '',
    search: '',
    sort: 'price_asc',
    onlyAlerts: false,
  },
  pollTimer: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function fmtRon(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${Math.round(Number(n)).toLocaleString('ro-RO')} lei`;
}

function fmtTime(iso) {
  if (!iso) return 'Niciodată';
  try {
    return new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ro-RO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtRelativeAge(iso) {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  const diffHours = Math.max(0, Math.floor((Date.now() - ts) / 3600000));
  if (diffHours < 1) return 'Azi (< 1h)';
  if (diffHours < 24) return `Acum ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Ieri';
  return `Acum ${diffDays} zile`;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg, type = 'ok') {
  const container = $('#toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s ease';
    setTimeout(() => el.remove(), 260);
  }, 3600);
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// === Theme ===
function initTheme() {
  const saved = localStorage.getItem('appleradar_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  $('#btnToggleTheme').textContent = saved === 'dark' ? '☀' : '☾';
}

$('#btnToggleTheme').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('appleradar_theme', next);
  $('#btnToggleTheme').textContent = next === 'dark' ? '☀' : '☾';
});

// === Rendering ===
function renderTopbar() {
  const { scanState, settings } = state.data;
  const emailActive = Boolean(
    settings.email?.isConfigured || (settings.email?.enabled && settings.email?.to && settings.email?.hasPass)
  );
  $('#emailStatusDot').classList.toggle('active', emailActive);
  $('#btnOpenSettings').title = state.isStaticCloud
    ? emailActive
      ? 'Alerte email 24/7 active din GitHub Secrets'
      : 'Configurează GitHub Secrets pentru alerte email 24/7'
    : emailActive
      ? `Alerte email active către ${settings.email.to}`
      : 'Configurează adresa de email și parola SMTP pentru alerte';

  const strict = settings.strictBucharestOnly !== false;
  const maxAge = Number(settings.maxP2pAgeDays ?? 7);
  const ageSuffix = maxAge > 0 ? ` · ≤ ${maxAge} ${maxAge === 1 ? 'zi' : 'zile'}` : '';
  $('#bucharestBadge').textContent = (strict ? '📍 P2P: București' : '📍 P2P: Buc + Ilfov') + ageSuffix;

  const minGb = Number(settings.minIphoneStorageGb ?? 256);
  $('#storageBadge').textContent = minGb >= 1024 ? `💾 iPhone ≥ ${minGb / 1024}TB` : minGb > 0 ? `💾 iPhone ≥ ${minGb}GB` : '💾 Orice GB';

  if (state.isStaticCloud) {
    const lastTime = scanState.finishedAt ? fmtDateTime(scanState.finishedAt) : '—';
    $('#lastScanPill').textContent = `☁️ Cloud 24/7 · actualizat ${lastTime}`;
    $('#btnScanNow').disabled = false;
    $('#scanSpinner').classList.remove('spinning');
    $('#btnScanLabel').textContent = 'Reîmprospătează';
    $('#btnOpenManual').classList.add('hidden');
    $('#scanProgressBar').classList.add('hidden');
    return;
  }

  if (scanState.inProgress) {
    $('#lastScanPill').textContent = `Scanare: ${scanState.completedSources}/${scanState.totalSources} site-uri...`;
    $('#btnScanNow').disabled = true;
    $('#scanSpinner').classList.add('spinning');
    $('#btnScanLabel').textContent = 'Se scanează...';
    renderScanProgress(scanState);
  } else {
    const lastTime = scanState.finishedAt ? fmtTime(scanState.finishedAt) : '—';
    const nextStr = scanState.nextScanAt ? ` · urm. ${fmtTime(scanState.nextScanAt)}` : '';
    $('#lastScanPill').textContent = `Actualizat: ${lastTime}${nextStr}`;
    $('#btnScanNow').disabled = false;
    $('#scanSpinner').classList.remove('spinning');
    $('#btnScanLabel').textContent = 'Scanează acum';
    $('#scanProgressBar').classList.add('hidden');
  }
}

function renderScanProgress(scanState) {
  const bar = $('#scanProgressBar');
  bar.classList.remove('hidden');
  const total = Math.max(1, scanState.totalSources || 1);
  const done = scanState.completedSources || 0;
  const pct = Math.round((done / total) * 100);
  $('#scanBarCount').textContent = `${done} / ${total}`;
  $('#scanProgressFill').style.width = `${Math.max(8, pct)}%`;

  const sourceNames = Object.fromEntries((state.data?.sources || []).map((s) => [s.id, s.name]));
  const chips = Object.entries(scanState.currentProgress || {})
    .map(([id, info]) => {
      const icon = info.status === 'ok' ? '✓' : info.status === 'error' ? '✕' : '⏳';
      const extra = info.status === 'ok' ? ` ${info.itemsFound}` : '';
      return `<span class="scan-chip ${info.status}">${escapeHtml(sourceNames[id] || id)} ${icon}${extra}</span>`;
    })
    .join('');
  $('#scanSiteChips').innerHTML = chips;
}

function renderAlertBanner() {
  const { totalSubThreshold, listings } = state.data;
  const banner = $('#alertBanner');
  if (!totalSubThreshold) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  const hits = listings.filter((l) => l.isBelowThreshold);
  const top = hits[0];
  const prodNames = Object.fromEntries(state.data.products.map((p) => [p.id, p.name]));
  $('#alertBannerTitle').textContent =
    totalSubThreshold === 1
      ? '1 ofertă activă sub pragul de alertă!'
      : `${totalSubThreshold} oferte active sub pragurile tale de alertă!`;
  $('#alertBannerSub').textContent = top
    ? `Cel mai bun: ${prodNames[top.productId]} la ${fmtRon(top.priceRon)} (${top.source.toUpperCase()}).`
    : '';
}

function renderHeroGrid() {
  const { products, bestByProduct, sources } = state.data;
  const srcName = Object.fromEntries(sources.map((s) => [s.id, s.name]));

  $('#heroGrid').innerHTML = products
    .map((p) => {
      const info = bestByProduct[p.id];
      const best = info?.bestDeal;
      const isHit = Boolean(best?.isBelowThreshold);
      const isSelected = state.filters.productId === p.id;
      const delta = best ? best.priceRon - info.thresholdRon : null;

      let deltaHtml = `<div class="hero-delta neutral">Nicio ofertă momentan</div>`;
      if (best) {
        if (delta < 0) {
          deltaHtml = `<div class="hero-delta good">🔥 ${Math.abs(delta).toLocaleString('ro-RO')} lei sub prag!</div>`;
        } else {
          deltaHtml = `<div class="hero-delta neutral">+${delta.toLocaleString('ro-RO')} lei față de prag</div>`;
        }
      }

      return `
        <article class="hero-card ${isHit ? 'hit' : ''} ${isSelected ? 'selected' : ''}" data-select-product="${p.id}">
          <div class="hero-top">
            <div class="hero-name">${escapeHtml(p.name)}</div>
            <div class="hero-threshold mono">&lt; ${info.thresholdRon.toLocaleString('ro-RO')}</div>
          </div>
          <div class="hero-price mono ${best ? '' : 'hero-price--empty'}">
            ${best ? fmtRon(best.priceRon) : 'Fără oferte'}
          </div>
          ${deltaHtml}
          <div class="hero-foot">
            <span>${best ? `${escapeHtml(srcName[best.source] || best.source)} · ${info.totalCount} oferte` : '0 oferte active'}</span>
            ${
              best
                ? `<a class="hero-link" href="${escapeHtml(best.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">Deschide ↗</a>`
                : ''
            }
          </div>
        </article>
      `;
    })
    .join('');

  $$('[data-select-product]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-select-product');
      state.filters.productId = state.filters.productId === id ? 'all' : id;
      $('#filterProduct').value = state.filters.productId;
      renderHeroGrid();
      renderListings();
      if (state.filters.productId !== 'all') {
        $('#listingsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

function renderMatrix() {
  const { products, sources, matrix, bestByProduct } = state.data;
  const liveSources = sources.filter((s) => !s.manualOnly);
  const p2p = liveSources.filter((s) => s.type === 'p2p');
  const refurb = liveSources.filter((s) => s.type === 'refurbished');
  const amanet = liveSources.filter((s) => s.type === 'amanet');
  const ordered = [...p2p, ...refurb, ...amanet];

  const headerHtml = `
    <thead>
      <tr class="group-row">
        <th class="col-model">Model &amp; Prag</th>
        <th colspan="${p2p.length}" class="group-p2p">📍 Peer-to-Peer (Doar București)</th>
        <th colspan="${refurb.length}" class="group-refurb">✓ Refurbished (Garanție)</th>
        <th colspan="${amanet.length}" class="group-amanet">🏪 Amanet / SH</th>
      </tr>
      <tr>
        <th class="col-model">Produs</th>
        ${ordered.map((s) => `<th>${escapeHtml(s.name)}</th>`).join('')}
      </tr>
    </thead>
  `;

  const rowsHtml = products
    .map((p) => {
      const rowData = matrix[p.id] || {};
      const bestPrice = bestByProduct[p.id]?.bestDeal?.priceRon ?? null;
      const threshold = bestByProduct[p.id]?.thresholdRon ?? p.defaultThreshold;

      const cells = ordered
        .map((s) => {
          const cell = rowData[s.id];
          if (!cell) {
            return `<td><span class="matrix-empty">—</span></td>`;
          }
          if (cell.disabled) {
            return `<td><span class="matrix-disabled" title="AirPods Pro 3 sunt excluse de pe P2P pentru a evita fake-urile">${escapeHtml(cell.reason || 'exclus')}</span></td>`;
          }
          const isBest = bestPrice !== null && cell.lowestPriceRon === bestPrice;
          const cls = cell.isBelowThreshold ? 'is-hit' : isBest ? 'is-best' : '';
          const prefix = cell.isBelowThreshold ? '🔥 ' : isBest ? '★ ' : '';
          return `
            <td>
              <a class="matrix-cell-link ${cls}" href="${escapeHtml(cell.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(cell.title)}">
                <span class="matrix-price mono">${prefix}${cell.lowestPriceRon.toLocaleString('ro-RO')}</span>
                <span class="matrix-cnt">${cell.count} ${cell.count === 1 ? 'ofertă' : 'oferte'}</span>
              </a>
            </td>
          `;
        })
        .join('');

      return `
        <tr>
          <td class="col-model">
            <div>${escapeHtml(p.name)}</div>
            <div style="font-size:11px;color:var(--text-dim);font-weight:500;">Prag: &lt; ${threshold.toLocaleString('ro-RO')} lei</div>
          </td>
          ${cells}
        </tr>
      `;
    })
    .join('');

  $('#matrixTable').innerHTML = `${headerHtml}<tbody>${rowsHtml}</tbody>`;

  // Render Facebook Marketplace quick links (iPhones only — AirPods excluded from P2P!)
  $('#fbLinksGrid').innerHTML = products
    .filter((p) => bestByProduct[p.id]?.fbMarketplaceUrl)
    .map((p) => {
      const info = bestByProduct[p.id];
      return `
        <a class="fb-link-btn" href="${escapeHtml(info.fbMarketplaceUrl)}" target="_blank" rel="noopener noreferrer">
          <span>${escapeHtml(p.name)}</span>
          <span class="fb-link-price mono">≤ ${info.thresholdRon.toLocaleString('ro-RO')} lei ↗</span>
        </a>
      `;
    })
    .join('');
}

function populateFilterDropdowns() {
  const { products, sources } = state.data;
  const prodSel = $('#filterProduct');
  const prevProd = state.filters.productId;
  prodSel.innerHTML =
    `<option value="all">Toate modelele</option>` +
    products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  prodSel.value = prevProd;

  const srcSel = $('#filterSource');
  const prevSrc = state.filters.source;
  srcSel.innerHTML =
    `<option value="all">Toate site-urile</option>` +
    sources.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  srcSel.value = prevSrc;

  // Also populate manual modal product select
  $('#manProduct').innerHTML = products
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join('');
}

function getFilteredListings() {
  const f = state.filters;
  const q = f.search.trim().toLowerCase();
  const maxP = f.maxPrice ? Number(f.maxPrice) : null;

  let list = (state.data?.listings || []).filter((item) => {
    if (state.isStaticCloud && state.localDismissed.has(item.id)) return false;
    if (f.category !== 'all' && item.sourceType !== f.category) return false;
    if (f.productId !== 'all' && item.productId !== f.productId) return false;
    if (f.source !== 'all' && item.source !== f.source) return false;
    if (f.onlyAlerts && !item.isBelowThreshold) return false;
    if (maxP && Number.isFinite(maxP) && item.priceRon > maxP) return false;
    if (q) {
      const hay = `${item.title} ${item.location || ''} ${item.storage || ''} ${item.condition || ''} ${item.source}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (f.sort === 'price_asc') {
    list.sort((a, b) => a.priceRon - b.priceRon);
  } else if (f.sort === 'price_desc') {
    list.sort((a, b) => b.priceRon - a.priceRon);
  } else if (f.sort === 'alerts_first') {
    list.sort((a, b) => {
      if (a.isBelowThreshold !== b.isBelowThreshold) return a.isBelowThreshold ? -1 : 1;
      return a.priceRon - b.priceRon;
    });
  } else if (f.sort === 'newest') {
    list.sort((a, b) => new Date(b.postedAt || b.firstSeenAt) - new Date(a.postedAt || a.firstSeenAt));
  }

  return list;
}

function renderListings() {
  const items = getFilteredListings();
  const prodMap = Object.fromEntries(state.data.products.map((p) => [p.id, p]));
  const srcMap = Object.fromEntries(state.data.sources.map((s) => [s.id, s]));

  $('#listingsCountBadge').textContent = items.length;

  if (items.length === 0) {
    $('#listingsGrid').innerHTML = `
      <div class="empty-state">
        <strong>Nicio ofertă nu corespunde filtrelor curente.</strong>
        <p style="margin:6px 0 0;font-size:13px;">Încearcă să relaxezi filtrele sau apasă „Scanează acum” pentru date proaspete.</p>
      </div>
    `;
    return;
  }

  $('#listingsGrid').innerHTML = items
    .slice(0, 120)
    .map((item) => {
      const prod = prodMap[item.productId];
      const src = srcMap[item.source];
      const typeLabel =
        item.sourceType === 'p2p' ? 'P2P' : item.sourceType === 'refurbished' ? 'Refurbished' : 'Amanet';

      const specTags = [];
      if (item.location) {
        const isP2p = item.sourceType === 'p2p';
        specTags.push(
          `<span class="spec-tag ${isP2p ? 'spec-tag--loc' : ''}">${isP2p ? '📍 ' : ''}${escapeHtml(item.location)}</span>`
        );
      }
      if (item.sourceType === 'p2p' && item.postedAt) {
        const ageLabel = fmtRelativeAge(item.postedAt);
        if (ageLabel) specTags.push(`<span class="spec-tag" title="Postat / actualizat: ${escapeHtml(fmtDateTime(item.postedAt))}">🕒 ${escapeHtml(ageLabel)}</span>`);
      }
      if (item.storage) specTags.push(`<span class="spec-tag">${escapeHtml(item.storage)}</span>`);
      if (item.battery) specTags.push(`<span class="spec-tag">🔋 ${escapeHtml(item.battery)}</span>`);
      if (item.condition) specTags.push(`<span class="spec-tag">${escapeHtml(item.condition)}</span>`);
      if (item.hasWarranty) specTags.push(`<span class="spec-tag">🛡 Garanție</span>`);

      const eurNote =
        item.currency === 'EUR' && item.originalPrice
          ? `<span>(${item.originalPrice} €)</span>`
          : '';
      const oldPriceNote =
        item.previousPriceRon && item.previousPriceRon > item.priceRon
          ? `<span class="price-old">${item.previousPriceRon.toLocaleString('ro-RO')} lei</span>`
          : '';
      const deltaNote = item.isBelowThreshold
        ? `<span style="color:var(--emerald-bright);font-weight:700;">-${Math.abs(item.deltaRon).toLocaleString('ro-RO')} lei sub prag</span>`
        : '';

      const fallbackIcon =
        prod?.category === 'audio' ? '🎧' : '📱';
      const thumbHtml = item.imageUrl
        ? `<img src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<span style=font-size:26px>${fallbackIcon}</span>'">`
        : `<span style="font-size:26px">${fallbackIcon}</span>`;

      return `
        <article class="listing-card ${item.isBelowThreshold ? 'is-hit' : ''}">
          <div class="listing-top">
            <div class="listing-thumb">${thumbHtml}</div>
            <div class="listing-info">
              <div class="listing-badges">
                <span class="pill pill--model">${escapeHtml(prod?.shortName || item.productId)}</span>
                <span class="pill pill--${item.sourceType}">${escapeHtml(src?.name || item.source)} · ${typeLabel}</span>
                ${item.isBelowThreshold ? `<span class="pill pill--hit">🔥 SUB PRAG</span>` : ''}
              </div>
              <h3 class="listing-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
            </div>
          </div>
          <div class="listing-specs">${specTags.join('')}</div>
          <div class="listing-foot">
            <div class="price-block">
              <div class="price-main mono">${fmtRon(item.priceRon)}</div>
              <div class="price-sub mono">${oldPriceNote}${eurNote} ${deltaNote}</div>
            </div>
            <div class="listing-actions">
              <button class="btn-dismiss" data-dismiss="${escapeHtml(item.id)}" title="Ascunde acest anunț (vândut / irelevant)">✕</button>
              <a class="btn btn-primary btn-sm" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Vezi ↗</a>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  $$('[data-dismiss]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-dismiss');
      if (state.isStaticCloud) {
        state.localDismissed.add(id);
        localStorage.setItem('appleradar_dismissed', JSON.stringify([...state.localDismissed]));
        showToast('Anunțul a fost ascuns local în browser.');
        renderListings();
        return;
      }
      try {
        await api(`./api/listings/${encodeURIComponent(id)}/dismiss`, { method: 'POST' });
        showToast('Anunțul a fost ascuns.');
        await loadDashboard();
      } catch (err) {
        showToast(err.message, 'err');
      }
    });
  });
}

function renderSourceHealth() {
  const { sources } = state.data;
  $('#sourceHealthList').innerHTML = sources
    .map((s) => {
      const st = s.status;
      let badge = `<span class="pill pill--${s.type}">${escapeHtml(s.typeLabel)}</span>`;
      let statusMsg = s.manualOnly
        ? s.description
        : st
          ? `${st.message || ''} (${(st.duration_ms / 1000).toFixed(1)}s · ${fmtTime(st.last_scan_at)})`
          : 'Nu a fost scanat încă';

      const rightHtml = s.manualOnly
        ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">Deschide ↗</a>`
        : `
          <span class="mono" style="font-weight:700;color:${st?.status === 'error' ? 'var(--rose)' : 'var(--emerald-bright)'}">
            ${st ? `${st.items_found} oferte` : '—'}
          </span>
          ${state.isStaticCloud ? '' : `<button class="btn btn-ghost btn-sm" data-rescan-source="${s.id}" title="Rescanează doar ${escapeHtml(s.name)}">↻</button>`}
        `;

      return `
        <div class="source-row">
          <div class="source-row-left">
            <div class="source-row-name">${escapeHtml(s.name)} ${badge}</div>
            <div class="source-row-msg">${escapeHtml(statusMsg)}</div>
          </div>
          <div class="source-row-right">${rightHtml}</div>
        </div>
      `;
    })
    .join('');

  $$('[data-rescan-source]').forEach((btn) => {
    btn.addEventListener('click', () => triggerScan([btn.getAttribute('data-rescan-source')]));
  });
}

function renderAlertHistory() {
  const { alerts, products, sources } = state.data;
  const prodName = Object.fromEntries(products.map((p) => [p.id, p.name]));
  const srcName = Object.fromEntries(sources.map((s) => [s.id, s.name]));

  if (!alerts || alerts.length === 0) {
    $('#alertHistoryList').innerHTML = `
      <div class="empty-state" style="padding:26px 14px;">
        <strong>Nicio alertă declanșată încă.</strong>
        <p style="margin:5px 0 0;font-size:12px;">Când apare un produs sub pragurile tale (2.600 / 3.200 / 700 lei), va apărea aici și vei primi email automat.</p>
      </div>
    `;
    return;
  }

  $('#alertHistoryList').innerHTML = alerts
    .map((a) => {
      const emailTag = a.email_sent
        ? `<span style="color:var(--emerald-bright);font-weight:700;">✉ Trimis la ${escapeHtml(a.email_to)}</span>`
        : `<span style="color:var(--amber);">⚠ ${escapeHtml(a.email_error || 'Email neconfigurat')}</span>`;
      return `
        <div class="alert-row">
          <div class="alert-row-top">
            <span class="pill pill--hit mono">${fmtRon(a.price_ron)} (&lt; ${a.threshold_ron.toLocaleString('ro-RO')})</span>
            <span style="font-size:11px;color:var(--text-dim);">${fmtDateTime(a.created_at)}</span>
          </div>
          <a class="alert-row-title" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(prodName[a.product_id] || a.product_id)} · ${escapeHtml(a.title)}
          </a>
          <div class="alert-row-meta">
            <span>Sursă: ${escapeHtml(srcName[a.source] || a.source)}</span>
            ${emailTag}
          </div>
        </div>
      `;
    })
    .join('');
}

function renderAll() {
  if (!state.data) return;
  renderTopbar();
  renderAlertBanner();
  renderHeroGrid();
  renderMatrix();
  populateFilterDropdowns();
  renderListings();
  renderSourceHealth();
  renderAlertHistory();
}

// === Data Loading & Live Polling ===
async function loadDashboard() {
  try {
    let payload = null;
    if (!state.isStaticCloud) {
      try {
        const res = await fetch('./api/dashboard', { cache: 'no-store' });
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          payload = await res.json();
        }
      } catch {
        // Fallback to static GitHub Pages snapshot
      }
    }

    if (!payload) {
      state.isStaticCloud = true;
      const res = await fetch(`./data/dashboard.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Nu s-a putut încărca snapshot-ul cloud (HTTP ${res.status})`);
      payload = await res.json();
    }

    state.data = payload;
    renderAll();

    if (!state.isStaticCloud && state.data.scanState?.inProgress) {
      startScanPolling();
    } else {
      stopScanPolling();
    }
  } catch (err) {
    showToast(`Eroare încărcare date: ${err.message}`, 'err');
  }
}

function startScanPolling() {
  if (state.pollTimer || state.isStaticCloud) return;
  state.pollTimer = setInterval(async () => {
    try {
      const status = await api('./api/scan/status');
      if (state.data) {
        state.data.scanState = status;
        renderTopbar();
      }
      if (!status.inProgress) {
        stopScanPolling();
        await loadDashboard();
        showToast('Scanarea s-a încheiat! Ofertele au fost actualizate.');
      }
    } catch {
      // ignore transient poll glitch
    }
  }, 1500);
}

function stopScanPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function triggerScan(sources = null) {
  if (state.isStaticCloud) {
    showToast('Reîmprospătez datele din ultima scanare cloud (rulează automat la fiecare 20 min)...');
    await loadDashboard();
    return;
  }
  try {
    const body = sources ? { sources } : {};
    const res = await api('./api/scan', { method: 'POST', body: JSON.stringify(body) });
    if (res.alreadyRunning) {
      showToast('O scanare este deja în desfășurare.');
    } else {
      showToast(sources ? `Rescanez ${sources.join(', ')}...` : 'Scanare live pornită pe toate site-urile active!');
    }
    if (state.data) {
      state.data.scanState = { ...res.scanState, inProgress: true };
      renderTopbar();
    }
    startScanPolling();
  } catch (err) {
    showToast(err.message, 'err');
  }
}

// === Filters Wiring ===
$('#btnScanNow').addEventListener('click', () => triggerScan(null));

$('#btnClearModelFilter').addEventListener('click', () => {
  state.filters.productId = 'all';
  $('#filterProduct').value = 'all';
  renderHeroGrid();
  renderListings();
});

$('#btnFilterOnlyAlerts').addEventListener('click', () => {
  state.filters.onlyAlerts = true;
  $('#filterOnlyAlerts').checked = true;
  renderListings();
  $('#listingsSection').scrollIntoView({ behavior: 'smooth' });
});

$$('#categoryTabs .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#categoryTabs .seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.filters.category = btn.getAttribute('data-cat');
    renderListings();
  });
});

$('#filterProduct').addEventListener('change', (e) => {
  state.filters.productId = e.target.value;
  renderHeroGrid();
  renderListings();
});
$('#filterSource').addEventListener('change', (e) => {
  state.filters.source = e.target.value;
  renderListings();
});
$('#filterMaxPrice').addEventListener('input', (e) => {
  state.filters.maxPrice = e.target.value;
  renderListings();
});
$('#filterSearch').addEventListener('input', (e) => {
  state.filters.search = e.target.value;
  renderListings();
});
$('#filterSort').addEventListener('change', (e) => {
  state.filters.sort = e.target.value;
  renderListings();
});
$('#filterOnlyAlerts').addEventListener('change', (e) => {
  state.filters.onlyAlerts = e.target.checked;
  renderListings();
});

// === Modals ===
function openModal(id) {
  $(`#${id}`).classList.remove('hidden');
}
function closeModal(id) {
  $(`#${id}`).classList.add('hidden');
}

$$('[data-close-modal]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close-modal')));
});
$$('.modal-backdrop').forEach((bg) => {
  bg.addEventListener('click', (e) => {
    if (e.target === bg) bg.classList.add('hidden');
  });
});

// Settings Tabs
$$('#settingsTabs .modal-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-tab');
    $$('#settingsTabs .modal-tab').forEach((t) => t.classList.toggle('active', t === tab));
    $$('#settingsForm .tab-pane').forEach((p) => p.classList.toggle('active', p.getAttribute('data-pane') === target));
  });
});

function updateSmtpPresetVisibility() {
  const isCustom = $('#cfgSmtpPreset').value === 'custom';
  $$('.custom-smtp-only').forEach((el) => el.classList.toggle('hidden', !isCustom));
}
$('#cfgSmtpPreset').addEventListener('change', updateSmtpPresetVisibility);

function populateSettingsForm() {
  if (!state.data) return;
  const { settings, products, sources } = state.data;

  $('#cfgEmailEnabled').checked = Boolean(settings.email?.enabled);
  $('#cfgEmailTo').value = settings.email?.to || '';
  $('#cfgSmtpPreset').value = settings.email?.preset || 'gmail';
  $('#cfgSmtpUser').value = settings.email?.user || '';
  $('#cfgSmtpPass').value = '';
  $('#passSavedTag').classList.toggle('hidden', !settings.email?.hasPass);
  $('#cfgSmtpHost').value = settings.email?.host || 'smtp.gmail.com';
  $('#cfgSmtpPort').value = settings.email?.port || 465;
  $('#testEmailFeedback').textContent = '';
  updateSmtpPresetVisibility();

  // Thresholds
  $('#thresholdsInputs').innerHTML = products
    .map(
      (p) => `
      <div class="threshold-item">
        <label for="thr_${p.id}">${escapeHtml(p.name)} (RON)</label>
        <input type="number" class="input-ctrl mono" id="thr_${p.id}" data-threshold-id="${p.id}" value="${settings.thresholds?.[p.id] ?? p.defaultThreshold}" min="100" step="50" required />
      </div>
    `
    )
    .join('');

  $('#cfgMinDrop').value = settings.email?.minDropForReAlert ?? 50;
  $('#cfgEurToRon').value = settings.eurToRon ?? 4.98;
  $('#cfgStrictBucharest').checked = settings.strictBucharestOnly !== false;
  $('#cfgExcludeP2pAirpods').checked = settings.excludeP2pAirpods !== false;
  $('#cfgMinStorage').value = String(settings.minIphoneStorageGb ?? 256);
  $('#cfgMaxP2pAge').value = String(settings.maxP2pAgeDays ?? 7);
  $('#cfgAutoScan').checked = settings.autoScanEnabled !== false;
  $('#cfgScanInterval').value = String(settings.scanIntervalMinutes || 15);

  $('#sourcesCheckGrid').innerHTML = sources
    .filter((s) => !s.manualOnly)
    .map(
      (s) => `
      <label class="source-check-card">
        <input type="checkbox" data-source-toggle="${s.id}" ${s.enabled ? 'checked' : ''} />
        <span>${escapeHtml(s.name)} <small style="color:var(--text-dim);">(${escapeHtml(s.typeLabel)})</small></span>
      </label>
    `
    )
    .join('');
}

$('#btnOpenSettings').addEventListener('click', () => {
  populateSettingsForm();
  if (state.isStaticCloud) {
    $('#btnSaveSettings').disabled = true;
    $('#btnSaveSettings').textContent = 'Mod Cloud (editează în GitHub Secrets/Variables)';
    $('#btnSendTestEmail').disabled = true;
    $('#testEmailFeedback').className = 'feedback-text';
    $('#testEmailFeedback').textContent =
      'Pe GitHub Pages, credențialele SMTP sunt stocate securizat în GitHub Repo → Settings → Secrets → Actions (ALERT_EMAIL_TO, SMTP_USER, SMTP_PASS).';
  }
  openModal('settingsModal');
});

$('#btnOpenManual').addEventListener('click', () => {
  openModal('manualModal');
});

function collectEmailFormValues() {
  const preset = $('#cfgSmtpPreset').value;
  return {
    enabled: $('#cfgEmailEnabled').checked,
    to: $('#cfgEmailTo').value.trim(),
    preset,
    user: $('#cfgSmtpUser').value.trim(),
    pass: $('#cfgSmtpPass').value,
    host: $('#cfgSmtpHost').value.trim(),
    port: Number($('#cfgSmtpPort').value) || 465,
    secure: Number($('#cfgSmtpPort').value) === 465,
    minDropForReAlert: Number($('#cfgMinDrop').value) || 50,
  };
}

$('#btnSendTestEmail').addEventListener('click', async () => {
  const fb = $('#testEmailFeedback');
  fb.className = 'feedback-text';
  fb.textContent = 'Se trimite emailul de test...';
  $('#btnSendTestEmail').disabled = true;
  try {
    const res = await api('./api/email/test', {
      method: 'POST',
      body: JSON.stringify(collectEmailFormValues()),
    });
    fb.className = 'feedback-text ok';
    fb.textContent = `✓ ${res.message}`;
  } catch (err) {
    fb.className = 'feedback-text err';
    fb.textContent = `✕ ${err.message}`;
  } finally {
    $('#btnSendTestEmail').disabled = false;
  }
});

$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const thresholds = {};
  $$('[data-threshold-id]').forEach((inp) => {
    thresholds[inp.getAttribute('data-threshold-id')] = Number(inp.value);
  });
  const enabledSources = {};
  $$('[data-source-toggle]').forEach((cb) => {
    enabledSources[cb.getAttribute('data-source-toggle')] = cb.checked;
  });

  try {
    await api('./api/settings', {
      method: 'PUT',
      body: JSON.stringify({
        thresholds,
        enabledSources,
        strictBucharestOnly: $('#cfgStrictBucharest').checked,
        excludeP2pAirpods: $('#cfgExcludeP2pAirpods').checked,
        minIphoneStorageGb: Number($('#cfgMinStorage').value),
        maxP2pAgeDays: Number($('#cfgMaxP2pAge').value),
        autoScanEnabled: $('#cfgAutoScan').checked,
        scanIntervalMinutes: Number($('#cfgScanInterval').value) || 15,
        eurToRon: Number($('#cfgEurToRon').value) || 4.98,
        email: collectEmailFormValues(),
      }),
    });
    closeModal('settingsModal');
    showToast('Setările și pragurile au fost salvate!');
    await loadDashboard();
  } catch (err) {
    showToast(err.message, 'err');
  }
});

$('#btnRestoreDismissed').addEventListener('click', async () => {
  if (state.isStaticCloud) {
    state.localDismissed.clear();
    localStorage.removeItem('appleradar_dismissed');
    showToast('Toate anunțurile ascunse local au fost restaurate.');
    renderListings();
    return;
  }
  try {
    await api('./api/listings/restore-dismissed', { method: 'POST' });
    showToast('Toate anunțurile ascunse au fost restaurate.');
    await loadDashboard();
  } catch (err) {
    showToast(err.message, 'err');
  }
});

$('#manualForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('./api/listings/manual', {
      method: 'POST',
      body: JSON.stringify({
        productId: $('#manProduct').value,
        title: $('#manTitle').value.trim(),
        priceRon: Number($('#manPrice').value),
        source: $('#manSource').value,
        location: $('#manLocation').value.trim(),
        url: $('#manUrl').value.trim(),
      }),
    });
    $('#manualForm').reset();
    $('#manLocation').value = 'București';
    closeModal('manualModal');
    showToast('Oferta manuală a fost adăugată!');
    await loadDashboard();
  } catch (err) {
    showToast(err.message, 'err');
  }
});

// Boot
initTheme();
loadDashboard();
