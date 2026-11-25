import nodemailer from 'nodemailer';
import { PRODUCT_MAP, SOURCE_MAP } from './config.js';
import { getLowestAlertedPrice, recordAlert } from './db.js';

export function buildTransporter(emailConfig) {
  let host = emailConfig.host;
  let port = Number(emailConfig.port) || 465;
  let secure = Boolean(emailConfig.secure);

  if (emailConfig.preset === 'gmail') {
    host = 'smtp.gmail.com';
    port = 465;
    secure = true;
  } else if (emailConfig.preset === 'outlook') {
    host = 'smtp-mail.outlook.com';
    port = 587;
    secure = false;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: emailConfig.user,
      pass: emailConfig.pass,
    },
    connectionTimeout: 12000,
    greetingTimeout: 10000,
  });
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatRon(n) {
  return `${Number(n).toLocaleString('ro-RO')} RON`;
}

export function buildAlertEmailHtml(deals) {
  const rowsHtml = deals
    .map((d) => {
      const prod = PRODUCT_MAP[d.productId];
      const src = SOURCE_MAP[d.source];
      const diff = d.thresholdRon - d.priceRon;
      const tags = [d.storage, d.battery ? `Baterie ${d.battery}` : null, d.condition, d.location]
        .filter(Boolean)
        .map(
          (t) =>
            `<span style="display:inline-block;background:#1e293b;color:#cbd5e1;font-size:12px;padding:3px 8px;border-radius:999px;margin:2px 4px 2px 0;">${escapeHtml(t)}</span>`
        )
        .join('');

      return `
        <tr>
          <td style="padding:16px;border-bottom:1px solid #1e293b;">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#34d399;font-weight:700;margin-bottom:4px;">
              ${escapeHtml(prod?.name || d.productId)} · ${escapeHtml(src?.name || d.source)}
            </div>
            <div style="font-size:16px;font-weight:600;color:#f8fafc;margin-bottom:8px;">
              ${escapeHtml(d.title)}
            </div>
            <div style="margin-bottom:10px;">${tags}</div>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td>
                  <span style="font-size:22px;font-weight:800;color:#34d399;">${formatRon(d.priceRon)}</span>
                  <span style="font-size:13px;color:#94a3b8;margin-left:8px;">
                    (prag: ${formatRon(d.thresholdRon)} · economisești ${formatRon(diff)})
                  </span>
                </td>
                <td align="right">
                  <a href="${escapeHtml(d.url)}" target="_blank" style="display:inline-block;background:#10b981;color:#022c22;text-decoration:none;font-weight:700;font-size:13px;padding:9px 16px;border-radius:8px;">
                    Vezi oferta →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join('');

  return `
  <!doctype html>
  <html lang="ro">
  <body style="margin:0;padding:24px;background:#090d16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f8fafc;">
    <table cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="padding:22px 24px;background:linear-gradient(135deg,#064e3b,#0f172a);border-bottom:1px solid #1e293b;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6ee7b7;font-weight:700;">
            AppleRadar RO · Alertă Preț
          </div>
          <h1 style="margin:6px 0 0;font-size:22px;color:#ffffff;">
            🔥 ${deals.length === 1 ? '1 ofertă nouă' : `${deals.length} oferte noi`} sub pragul setat!
          </h1>
          <p style="margin:6px 0 0;font-size:13px;color:#cbd5e1;">
            Detectate la ${new Date().toLocaleString('ro-RO')} (P2P filtrat strict București + Refurbished/Amanet).
          </p>
        </td>
      </tr>
      ${rowsHtml}
      <tr>
        <td style="padding:14px 24px;font-size:12px;color:#64748b;text-align:center;">
          AppleRadar RO · Monitorizare automată oferte Apple România
        </td>
      </tr>
    </table>
  </body>
  </html>`;
}

export async function processDealAlerts(allActiveListings, settings) {
  const thresholds = settings.thresholds || {};
  const minDrop = Number(settings.email?.minDropForReAlert) || 50;
  const freshDeals = [];

  for (const item of allActiveListings) {
    const productId = item.product_id || item.productId;
    const priceRon = Number(item.price_ron ?? item.priceRon);
    const threshold = Number(thresholds[productId]);
    if (!threshold || !Number.isFinite(priceRon)) continue;

    // Strictly below threshold (user asked: "sub 2600", "sub 3200", "sub 700")
    if (priceRon >= threshold) continue;

    const prevLowest = getLowestAlertedPrice(item.id);
    if (prevLowest !== null && priceRon > prevLowest - minDrop) {
      // Already alerted for this listing at the same or lower price
      continue;
    }

    freshDeals.push({
      id: item.id,
      productId,
      source: item.source,
      title: item.title,
      priceRon,
      thresholdRon: threshold,
      url: item.url,
      location: item.location,
      storage: item.storage,
      battery: item.battery,
      condition: item.condition,
    });
  }

  if (freshDeals.length === 0) {
    return { triggered: 0, emailSent: false, deals: [] };
  }

  freshDeals.sort((a, b) => a.priceRon - b.priceRon);

  const emailCfg = settings.email || {};
  const canSendEmail = Boolean(emailCfg.enabled && emailCfg.to && emailCfg.user && emailCfg.pass);

  let emailSent = false;
  let emailError = null;

  if (canSendEmail) {
    try {
      const transporter = buildTransporter(emailCfg);
      const topDeal = freshDeals[0];
      const prodName = PRODUCT_MAP[topDeal.productId]?.name || topDeal.productId;
      const subject =
        freshDeals.length === 1
          ? `🔥 Alertă AppleRadar: ${prodName} la ${formatRon(topDeal.priceRon)} (${SOURCE_MAP[topDeal.source]?.name || topDeal.source})`
          : `🔥 ${freshDeals.length} oferte Apple sub prag! Cel mai mic: ${prodName} la ${formatRon(topDeal.priceRon)}`;

      const textSummary = freshDeals
        .map(
          (d) =>
            `- ${PRODUCT_MAP[d.productId]?.name || d.productId}: ${formatRon(d.priceRon)} (prag ${formatRon(d.thresholdRon)}) | ${d.title} | ${SOURCE_MAP[d.source]?.name || d.source} | ${d.url}`
        )
        .join('\n');

      await transporter.sendMail({
        from: `"AppleRadar RO" <${emailCfg.user}>`,
        to: emailCfg.to,
        subject,
        text: `Oferte noi sub pragul tău de preț:\n\n${textSummary}`,
        html: buildAlertEmailHtml(freshDeals),
      });
      emailSent = true;
    } catch (err) {
      emailError = err?.message || String(err);
      console.error('[Emailer] Failed to send alert email:', emailError);
    }
  } else {
    emailError = 'Email neconfigurat sau dezactivat în Setări';
  }

  for (const deal of freshDeals) {
    recordAlert({
      listingId: deal.id,
      productId: deal.productId,
      source: deal.source,
      title: deal.title,
      priceRon: deal.priceRon,
      thresholdRon: deal.thresholdRon,
      url: deal.url,
      emailSent,
      emailTo: canSendEmail ? emailCfg.to : null,
      emailError,
    });
  }

  return { triggered: freshDeals.length, emailSent, emailError, deals: freshDeals };
}

export async function sendTestEmail(emailConfig) {
  if (!emailConfig?.to || !emailConfig?.user || !emailConfig?.pass) {
    throw new Error('Completează adresa destinatarului, emailul SMTP și parola (App Password).');
  }
  const transporter = buildTransporter(emailConfig);
  await transporter.verify();

  const sampleDeal = [
    {
      productId: 'iphone-16-pro',
      source: 'olx',
      title: 'Exemplu Test · iPhone 16 Pro 256GB Natural Titanium, 96% baterie',
      priceRon: 2499,
      thresholdRon: 2600,
      url: 'https://www.olx.ro/electronice-si-electrocasnice/telefoane-mobile/bucuresti/',
      location: 'București, Sector 3',
      storage: '256GB',
      battery: '96%',
      condition: 'Ca nou / A+',
    },
  ];

  await transporter.sendMail({
    from: `"AppleRadar RO" <${emailConfig.user}>`,
    to: emailConfig.to,
    subject: '✅ Test reușit · Alertele AppleRadar RO sunt active!',
    text: 'Felicitări! Configurația ta de email pentru AppleRadar RO funcționează perfect. Vei primi automat notificări când apar oferte sub pragurile setate.',
    html: buildAlertEmailHtml(sampleDeal),
  });
}
