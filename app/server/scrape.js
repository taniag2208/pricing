// Lectura de catálogos públicos (Shopify, WooCommerce, VTEX) respetando robots.txt.
const TP = require('./shared');
const { sleep } = require('./util');

const UA = process.env.CRAWLER_UA || 'Mozilla/5.0 (compatible; TitaPricingBot/1.0; +https://titamedia.com)';
const DELAY = Number(process.env.CRAWLER_DELAY_MS || 900);
const MAX_PAGES = Number(process.env.CRAWLER_MAX_PAGES || 40);

async function get(url, accept, ms) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept || 'application/json', 'Accept-Language': 'es-CO,es;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(ms || 25000) });
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

// Relevancia: un producto de la competencia entra si su nombre, categoría o URL contiene alguna palabra del catálogo propio.
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const relevant = (kw) => (txt) => { if (!kw || !kw.length) return true; const t = norm(txt); return kw.some((k) => t.includes(k)); };

// Datos estructurados schema.org (JSON-LD) de una página de producto: funciona en casi cualquier plataforma.
function ldProduct(html, url) {
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  let prod = null, crumbs = null;
  const visit = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(visit);
    const t = [].concat(o['@type'] || []).map(String);
    if (!prod && t.includes('Product')) prod = o;
    if (!crumbs && t.includes('BreadcrumbList')) crumbs = o;
    if (o['@graph']) visit(o['@graph']);
  };
  blocks.forEach((b) => { try { visit(JSON.parse(b.replace(/<[^>]+>/g, '').trim())); } catch (e) { /* bloque inválido */ } });
  if (!prod || !prod.name) return null;
  const offers = [].concat(prod.offers || []).flatMap((o) => (o && o.offers ? [].concat(o.offers) : [o])).filter(Boolean);
  const agg = [].concat(prod.offers || [])[0] || {};
  const prices = offers.map((o) => Number(o.price || o.lowPrice)).filter((x) => x > 0);
  const price = prices.length ? Math.min(...prices) : Number(agg.lowPrice || agg.price) || null;
  if (!(price > 0)) return null;
  let list = null;
  offers.forEach((o) => [].concat(o.priceSpecification || []).forEach((ps) => { if (/ListPrice|StrikethroughPrice/i.test(String(ps.priceType || '')) && Number(ps.price) > price) list = Number(ps.price); }));
  const crumbNames = crumbs ? [].concat(crumbs.itemListElement || []).map((x) => x && (x.name || (x.item && x.item.name))).filter(Boolean) : [];
  const label = (typeof prod.category === 'string' && prod.category.split(/[>/]/).filter(Boolean).pop()) || (crumbNames.length >= 2 ? crumbNames[crumbNames.length - 2] : null);
  const avail = offers.some((o) => /InStock/i.test(String(o.availability || '')));
  return { id: 'l:' + (prod.sku || prod.productID || url.split('/').filter(Boolean).slice(-2).join('-')), name: String(prod.name).trim(), label: label ? String(label).trim() : null, price: list || price, promo: list ? price : null, url, desc: String(prod.description || ''), sku: prod.sku ? String(prod.sku) : null, avail };
}

async function sitemapUrls(origin, allowed, want) {
  const seen = new Set(), maps = [];
  try { const r = await get(origin + '/robots.txt', 'text/plain', 12000); (r.text.match(/^\s*sitemap:\s*(\S+)/gim) || []).forEach((l) => maps.push(l.split(/:\s*/).slice(1).join(':').trim())); } catch (e) { /* sin robots */ }
  maps.push(origin + '/sitemap.xml', origin + '/sitemap_index.xml');
  const urls = [];
  let budget = 12;
  while (maps.length && budget-- > 0 && urls.length < want * 20) {
    const m = maps.shift(); if (seen.has(m)) continue; seen.add(m);
    let t; try { const r = await get(m, 'application/xml,text/xml', 15000); if (!r.ok) continue; t = r.text; } catch (e) { continue; }
    const locs = (t.match(/<loc>\s*([^<\s]+)\s*<\/loc>/g) || []).map((x) => x.replace(/<\/?loc>/g, '').trim().replace(/&amp;/g, '&'));
    if (/<sitemapindex/i.test(t)) {
      const prodFirst = locs.filter((u) => /product/i.test(u));
      [...prodFirst, ...locs.filter((u) => !prodFirst.includes(u) && !/brand|marca|categor|collection|blog|page|post|custom/i.test(u))].forEach((u) => maps.push(u));
    } else locs.forEach((u) => urls.push(u));
  }
  return urls.filter((u) => { try { const x = new URL(u); return x.origin.replace('://www.', '://') === origin.replace('://www.', '://') && allowed(x.pathname + x.search) && /\/p$|\/p\/|\/products?\/|\/producto|\.html$|-\d+$|\/item\//i.test(x.pathname); } catch (e) { return false; } });
}

async function crawlSitemap(origin, allowed, opts, onProgress) {
  const want = opts.sitemapMax || 60;
  let urls = await sitemapUrls(origin, allowed, want);
  if (!urls.length) return null;
  const keep = relevant(opts.keywords);
  const rel = urls.filter((u) => keep(decodeURIComponent(u).replace(/[-_/]/g, ' ')));
  if (rel.length >= 10) urls = rel;
  if (urls.length > want) { const st = urls.length / want; urls = Array.from({ length: want }, (_, i) => urls[Math.floor(i * st)]); }
  const items = [];
  for (let i = 0; i < urls.length; i += 6) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    const got = await Promise.all(urls.slice(i, i + 6).map((u) => get(u, 'text/html', 15000).then((r) => (r.ok ? ldProduct(r.text, u) : null), () => null)));
    got.forEach((p) => p && items.push(TP.ingest.mkItem(p)));
    onProgress && onProgress({ platform: 'Sitemap', pages: i + 6, items: items.length });
    await sleep(Math.min(DELAY, 300));
  }
  return items.length ? { platform: 'Sitemap (datos estructurados)', origin, items, pages: urls.length } : null;
}

async function crawlOrigin(origin, onProgress, opts) {
  const maxPages = opts.maxPages || MAX_PAGES;
  const allowed = await robots(origin);
  const keep = relevant(opts.keywords);
  const tried = [];
  let net = 0;
  for (const [name, P] of Object.entries(PLATFORMS)) {
    const u = new URL(P.first(origin));
    if (!allowed(u.pathname + u.search)) { tried.push(name + ': bloqueado por robots.txt'); continue; }
    let r;
    try { r = await get(u.href); } catch (e) { net++; tried.push(name + ': ' + ((e.cause && e.cause.code) || e.message)); continue; }
    let j; try { j = JSON.parse(r.text); } catch (e) { tried.push(name + ': sin JSON (' + r.status + ')'); continue; }
    if (P.count(j) < 0) { tried.push(name + ': formato distinto'); continue; }
    const by = {};
    const add = (json) => TP.ingest.parseText(JSON.stringify(json), origin).items.forEach((p) => { if (keep(p.name + ' ' + p.label + ' ' + (p.url || ''))) by[p.id] = p; });
    add(j);
    let n = 1, last = P.count(j);
    while (last > 0 && n < maxPages && !(opts.enough && Object.keys(by).length >= opts.enough)) {
      if (opts.deadline && Date.now() > opts.deadline) break;
      n++;
      const pu = new URL(P.page(origin, n));
      if (!allowed(pu.pathname + pu.search)) break;
      await sleep(DELAY);
      let jj; try { const rr = await get(pu.href); if (!rr.ok && rr.status !== 206) break; jj = JSON.parse(rr.text); } catch (e) { break; }
      last = P.count(jj);
      if (last <= 0) break;
      add(jj);
      onProgress && onProgress({ platform: name, pages: n, items: Object.keys(by).length });
    }
    if (Object.keys(by).length || !opts.keywords) return { platform: name, origin, items: Object.values(by), pages: n };
    tried.push(name + ': sin productos relacionados');
  }
  if (net >= 3) { const e = new Error('No se pudo conectar con ' + origin); e.code = 'unreachable'; throw e; }
  const sm = await crawlSitemap(origin, allowed, opts, onProgress).catch(() => null);
  if (sm) return sm;
  tried.push('Sitemap: sin productos con datos estructurados');
  const e = new Error('No se encontró un catálogo público (' + tried.join(' · ') + '). Usa la importación por archivo o por texto.');
  e.code = 'no_catalog';
  throw e;
}

// Intenta el dominio tal cual y su variante con o sin www.
async function crawl(storeUrl, onProgress, opts = {}) {
  const origin = TP.ingest.origin(storeUrl);
  if (!origin) throw new Error('URL inválida');
  const u = new URL(origin);
  const alt = u.protocol + '//' + (u.hostname.startsWith('www.') ? u.hostname.slice(4) : 'www.' + u.hostname) + (u.port ? ':' + u.port : '');
  try { return await crawlOrigin(origin, onProgress, opts); }
  catch (e) { if (e.code !== 'unreachable' && e.code !== 'no_catalog') throw e; try { return await crawlOrigin(alt, onProgress, opts); } catch (e2) { throw e.code === 'unreachable' && e2.code === 'no_catalog' ? e2 : e; } }
}

module.exports = { crawl, robots, UA, ldProduct };
