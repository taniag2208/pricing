// Lectura de catálogos públicos (Shopify, WooCommerce, VTEX) respetando robots.txt.
const TP = require('./shared');
const { sleep } = require('./util');

const UA = process.env.CRAWLER_UA || 'TitaPricingBot/1.0 (+https://titamedia.com)';
const DELAY = Number(process.env.CRAWLER_DELAY_MS || 900);
const MAX_PAGES = Number(process.env.CRAWLER_MAX_PAGES || 40);

async function get(url, accept) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept || 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  return { ok: r.ok, status: r.status, text: await r.text() };
}

async function robots(origin) {
  try {
    const r = await get(origin + '/robots.txt', 'text/plain');
    if (!r.ok) return () => true;
    const groups = []; let cur = null;
    r.text.split(/\r?\n/).forEach((line) => {
      const l = line.replace(/#.*/, '').trim(); if (!l) return;
      const [k, ...v] = l.split(':'); const key = k.trim().toLowerCase(); const val = v.join(':').trim();
      if (key === 'user-agent') { if (!cur || cur.rules.length) groups.push((cur = { agents: [], rules: [] })); cur.agents.push(val.toLowerCase()); }
      else if (cur && (key === 'disallow' || key === 'allow')) cur.rules.push({ allow: key === 'allow', path: val });
    });
    const mine = groups.find((g) => g.agents.some((a) => a !== '*' && UA.toLowerCase().includes(a))) || groups.find((g) => g.agents.includes('*'));
    const rules = (mine ? mine.rules : []).filter((x) => x.path);
    const toRe = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    return (pathAndQuery) => {
      let best = null;
      rules.forEach((x) => { if (toRe(x.path).test(pathAndQuery) && (!best || x.path.length > best.path.length)) best = x; });
      return !best || best.allow;
    };
  } catch (e) { return () => true; }
}

const PLATFORMS = {
  Shopify: { first: (o) => o + '/products.json?limit=250&page=1', page: (o, n) => o + '/products.json?limit=250&page=' + n, count: (j) => (j && Array.isArray(j.products) ? j.products.length : -1) },
  WooCommerce: { first: (o) => o + '/wp-json/wc/store/v1/products?per_page=100&page=1', page: (o, n) => o + '/wp-json/wc/store/v1/products?per_page=100&page=' + n, count: (j) => (Array.isArray(j) && (!j.length || j[0].prices) ? j.length : -1) },
  VTEX: { first: (o) => o + '/api/catalog_system/pub/products/search?_from=0&_to=49', page: (o, n) => o + '/api/catalog_system/pub/products/search?_from=' + (n - 1) * 50 + '&_to=' + ((n - 1) * 50 + 49), count: (j) => (Array.isArray(j) && (!j.length || j[0].productName) ? j.length : -1) },
};

async function crawl(storeUrl, onProgress, opts = {}) {
  const maxPages = opts.maxPages || MAX_PAGES;
  const origin = TP.ingest.origin(storeUrl);
  if (!origin) throw new Error('URL inválida');
  const allowed = await robots(origin);
  const tried = [];
  for (const [name, P] of Object.entries(PLATFORMS)) {
    const u = new URL(P.first(origin));
    if (!allowed(u.pathname + u.search)) { tried.push(name + ': bloqueado por robots.txt'); continue; }
    let r;
    try { r = await get(u.href); } catch (e) { tried.push(name + ': ' + e.message); continue; }
    let j; try { j = JSON.parse(r.text); } catch (e) { tried.push(name + ': sin JSON (' + r.status + ')'); continue; }
    if (P.count(j) < 0) { tried.push(name + ': formato distinto'); continue; }
    const by = {};
    const add = (json) => TP.ingest.parseText(JSON.stringify(json), origin).items.forEach((p) => { by[p.id] = p; });
    add(j);
    let n = 1, last = P.count(j);
    while (last > 0 && n < maxPages) {
      n++;
      const pu = new URL(P.page(origin, n));
      if (!allowed(pu.pathname + pu.search)) break;
      await sleep(DELAY);
      let jj; try { const rr = await get(pu.href); if (!rr.ok) break; jj = JSON.parse(rr.text); } catch (e) { break; }
      last = P.count(jj);
      if (last <= 0) break;
      add(jj);
      onProgress && onProgress({ platform: name, pages: n, items: Object.keys(by).length });
    }
    return { platform: name, origin, items: Object.values(by), pages: n };
  }
  const e = new Error('No se encontró un catálogo público (' + tried.join(' · ') + '). Usa la importación por archivo o por texto.');
  e.code = 'no_catalog';
  throw e;
}

module.exports = { crawl, robots, UA };
