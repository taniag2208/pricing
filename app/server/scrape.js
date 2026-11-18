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

// Respaldo: etiquetas meta (Open Graph / microdatos) de la ficha de producto.
function metaProduct(html, url) {
  const meta = (k) => { const m = html.match(new RegExp('<meta[^>]+(?:property|name|itemprop)=["\']' + k + '["\'][^>]*>', 'i')); if (!m) return null; const c = m[0].match(/content=["\']([^"\']*)["\']/i); return c ? c[1] : null; };
  const ip = (html.match(/itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i) || html.match(/content=["']([\d.,]+)["'][^>]*itemprop=["']price["']/i) || [])[1];
  const raw = meta('product:price:amount') || meta('og:price:amount') || meta('twitter:data1') || ip;
  const price = TP.ingest.parseMoney(raw);
  const name = meta('og:title') || (html.match(/<title>([^<]+)<\/title>/i) || [])[1];
  if (!(price > 0) || !name) return null;
  const list = TP.ingest.parseMoney(meta('product:original_price:amount') || meta('og:original_price:amount'));
  return { id: 'm:' + url.split('/').filter(Boolean).slice(-2).join('-').slice(0, 100), name: String(name).replace(/\s*[|–-]\s*[^|–-]+$/, '').trim(), label: meta('product:category') || null, price: list > price ? list : price, promo: list > price ? price : null, url, desc: meta('og:description') || meta('description') || '', sku: meta('product:retailer_item_id') };
}

// Último respaldo: texto de las páginas de categoría, del que la IA extrae nombre y precio (para tiendas sin catálogo ni datos estructurados).
const SKIP = /cuenta|account|login|registro|carrito|cart|checkout|blog|ayuda|help|contact|politica|policy|terminos|terms|faq|nosotros|about|tiendas|stores|garantia|devoluc|envios|pqr|trabaja|wishlist|favorit|search|buscar|\.(jpg|png|pdf)$/i;
async function crawlText(origin, allowed, opts) {
  if (!opts.ai) return null;
  let home; try { home = await get(origin + '/', 'text/html', 15000); } catch (e) { return null; }
  if (!home.ok) return null;
  const links = [];
  const re = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(home.text)) && links.length < 400) {
    let u; try { u = new URL(m[1], origin); } catch (e) { continue; }
    const txt = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (u.origin !== origin || SKIP.test(u.pathname) || u.pathname === '/' || u.pathname.split('/').filter(Boolean).length > 3 || !txt || txt.length > 40) continue;
    if (!allowed(u.pathname + u.search) || links.some((l) => l.url === u.href)) continue;
    links.push({ url: u.href, txt });
  }
  const keep = relevant(opts.keywords);
  const ranked = links.map((l) => ({ ...l, score: (keep(l.txt + ' ' + l.url) && opts.keywords ? 2 : 0) + (/\/(c|categoria|category|collections?|productos?|shop|tienda)\//i.test(l.url) ? 1 : 0) })).sort((a, b) => b.score - a.score);
  const items = [];
  for (const l of ranked.slice(0, 8)) {
    if (items.length >= (opts.textMax || 60) || (opts.deadline && Date.now() > opts.deadline)) break;
    let page; try { page = await get(l.url, 'text/html', 15000); } catch (e) { continue; }
    if (!page.ok) continue;
    const text = page.text.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    if ((text.match(/\$\s?\d{1,3}([.,]\d{3})+|\$\s?\d{4,}/g) || []).length < 5) continue;
    try { const got = await TP.ingest.extractFromText(opts.ai, text.slice(0, 40000), origin); got.forEach((p) => { if (!p.label || p.label === 'Sin categoría') p.label = l.txt; items.push(p); }); } catch (e) { if (e && e.code === 'billing') throw e; }
  }
  return items.length >= 5 ? { platform: 'Texto de la página (extraído con IA)', origin, items, pages: items.length } : null;
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
    const got = await Promise.all(urls.slice(i, i + 6).map((u) => get(u, 'text/html', 15000).then((r) => (r.ok ? ldProduct(r.text, u) || metaProduct(r.text, u) : null), () => null)));
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
  let net = 0, robotsBlocked = 0, httpBlocked = 0;
  for (const [name, P] of Object.entries(PLATFORMS)) {
    const u = new URL(P.first(origin));
    if (!allowed(u.pathname + u.search)) { robotsBlocked++; tried.push(name + ': bloqueado por robots.txt'); continue; }
    let r;
    try { r = await get(u.href); } catch (e) { net++; tried.push(name + ': ' + ((e.cause && e.cause.code) || e.message)); continue; }
    if ([401, 403, 429, 503].includes(r.status)) httpBlocked++;
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
  const tx = await crawlText(origin, allowed, opts);
  if (tx) return tx;
  if (opts.ai) tried.push('Texto: sin precios legibles');
  const e = new Error('No se encontró un catálogo público (' + tried.join(' · ') + '). Usa la importación por archivo o por texto.');
  e.code = 'no_catalog';
  // causa principal, para explicarla al usuario y medir la cobertura
  e.reason = httpBlocked >= 2 ? 'blocked' : robotsBlocked >= 2 ? 'robots' : 'no_data';
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

module.exports = { crawl, robots, UA, ldProduct, metaProduct };
