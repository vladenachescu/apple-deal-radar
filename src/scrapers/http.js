export const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
  'Cache-Control': 'no-cache',
};

export async function fetchText(url, { timeoutMs = 15000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text };
  } catch (err) {
    return { ok: false, status: 0, url, text: '', error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts = {}) {
  const res = await fetchText(url, {
    ...opts,
    headers: { Accept: 'application/json,text/plain,*/*', ...(opts.headers || {}) },
  });
  if (!res.ok) return { ...res, data: null };
  try {
    return { ...res, data: JSON.parse(res.text) };
  } catch (err) {
    return { ...res, ok: false, data: null, error: `JSON parse error: ${err.message}` };
  }
}

export async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current], current);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export function cleanImageUrl(url, baseUrl = '') {
  if (!url || typeof url !== 'string') return null;
  let u = url.trim();
  if (!u || u.startsWith('data:') || u.includes('placeholder') || u.includes('no_image')) return null;
  if (u.startsWith('//')) u = 'https:' + u;
  else if (u.startsWith('/') && baseUrl) u = baseUrl.replace(/\/$/, '') + u;
  return u;
}
