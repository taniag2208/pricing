// Motor de lectura de catálogos por niveles, con diagnóstico.
//   Nivel 1 — conectores oficiales: APIs públicas de Shopify, VTEX y WooCommerce.
//   Nivel 2 — extracción estructurada: sitemap + JSON-LD schema.org + etiquetas meta (Open Graph / microdatos).
//   Nivel 2b — texto de páginas de categoría, del que la IA extrae nombre y precio (solo HTML ya publicado).
//   Nivel 3 — navegador sin interfaz (Playwright) para contenido dinámico, si está disponible en el servidor.
//   Nivel 4 — recuperación: archivo CSV/Excel o conexión autenticada (server/connectors.js), fuera de este módulo.
// Toda petición pasa por net.safeFetch (protección SSRF) y respeta robots.txt. No se evaden CAPTCHAs ni bloqueos.
const TP = require('./shared');
const { sleep } = require('./util');
const { safeFetch, checkUrl, resolveHost, ipBlocked, ALLOW_PRIVATE } = require('./net');
const log = require('./log');

const UA = process.env.CRAWLER_UA || 'Mozilla/5.0 (compatible; TitaPricingBot/1.0; +https://titamedia.com)';
const DELAY = Number(process.env.CRAWLER_DELAY_MS || 900);
const MAX_PAGES = Number(process.env.CRAWLER_MAX_PAGES || 40);

/* ---------- errores clasificados ---------- */
// Códigos: invalid_url · unreachable · restricted · no_catalog · no_prices · timeout · ai_error · country_selector
class ReadError extends Error {
  constructor(code, message, extra) { super(message); Object.assign(this, { code }, extra || {}); }
}

async function get(url, accept, ms) {
  return safeFetch(url, { headers: { 'User-Agent': UA, Accept: accept || 'application/json', 'Accept-Language': 'es-CO,es;q=0.9,en;q=0.5' }, timeout: ms || 25000, retries: 1 });
}

/* ---------- robots.txt (RFC 9309: 4xx = sin restricciones; 5xx o sin respuesta = todo restringido) ---------- */
async function robots(origin) {
  let r;
  try { r = await get(origin + '/robots.txt', 'text/plain', 12000); }
  catch (e) { return Object.assign(() => false, { state: 'unreachable' }); }
  if (r.status >= 500) return Object.assign(() => false, { state: 'server_error' });
  if (!r.ok) return Object.assign(() => true, { state: 'none' });
  const groups = []; let cur = null;
  r.text.split(/\r?\n/).forEach((line) => {
    const l = line.replace(/#.*/, '').trim(); if (!l) return;
    const [k, ...v] = l.split(':'); const key = k.trim().toLowerCase(); const val = v.join(':').trim();
    if (key === 'user-agent') { if (!cur || cur.rules.length) groups.push((cur = { agents: [], rules: [] })); cur.agents.push(val.toLowerCase()); }
    else if (cur && (key === 'disallow' || key === 'allow')) cur.rules.push({ allow: key === 'allow', path: val });
  });
  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && a && UA.toLowerCase().includes(a))) || groups.find((g) => g.agents.includes('*'));
  const rules = (mine ? mine.rules : []).filter((x) => x.path);
  const toRe = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  const fn = (pathAndQuery) => {
    let best = null;
    rules.forEach((x) => { if (toRe(x.path).test(pathAndQuery) && (!best || x.path.length > best.path.length)) best = x; });
    return !best || best.allow;
  };
  return Object.assign(fn, { state: 'ok', sitemaps: (r.text.match(/^\s*sitemap:\s*(\S+)/gim) || []).map((l) => l.split(/:\s*/).slice(1).join(':').trim()) });
}

/* ---------- plataforma, moneda y país ---------- */
const SIGNS = [
  ['Shopify', /cdn\.shopify\.com|Shopify\.theme|shopify-section/i], ['VTEX', /vtex(img|assets)?\.com|vtex\.render|__RUNTIME__|vteximg/i],
  ['WooCommerce', /woocommerce|wp-content\/plugins\/woocommerce/i], ['Magento', /Magento_|mage\/cookies|\/static\/version\d+\//i],
  ['PrestaShop', /prestashop/i], ['Tiendanube', /tiendanube|nuvemshop/i], ['Wix', /wix\.com|wixstatic/i],
  ['Salesforce Commerce', /demandware|dwanalytics|\/on\/demandware/i], ['Jumpseller', /jumpseller/i], ['BigCommerce', /bigcommerce/i],
];
const detectPlatform = (html) => (SIGNS.find(([, re]) => re.test(html || '')) || [null])[0];
const CUR_RE = [/"currencyCode"\s*:\s*"([A-Z]{3})"/, /Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"/, /"priceCurrency"\s*:\s*"([A-Z]{3})"/, /product:price:currency"\s+content="([A-Z]{3})"/i, /"currency"\s*:\s*"([A-Z]{3})"/, /data-currency=["']([A-Z]{3})["']/];
function detectCurrency(html) { for (const re of CUR_RE) { const m = (html || '').match(re); if (m) return m[1].toUpperCase(); } return null; }
const CUR_COUNTRY = { COP: 'CO', MXN: 'MX', PEN: 'PE', CLP: 'CL', ARS: 'AR', BRL: 'BR', UYU: 'UY', GTQ: 'GT', CRC: 'CR', BOB: 'BO', PYG: 'PY', DOP: 'DO', EUR: null, USD: null };
const TLD_COUNTRY = { co: 'CO', mx: 'MX', pe: 'PE', cl: 'CL', ar: 'AR', br: 'BR', ec: 'EC', uy: 'UY', pa: 'PA', gt: 'GT', cr: 'CR', bo: 'BO', py: 'PY', do: 'DO', es: 'ES', us: 'US' };
function detectCountry(host, currency, lang, prefix) {
  const tld = (host.match(/\.(?:com\.|net\.|org\.)?([a-z]{2})$/) || [])[1];
  const pre = prefix && prefix.slice(1, 3).toLowerCase();
  const fromLang = (lang.match(/^[a-z]{2}-([a-z]{2})$/i) || [])[1];
  return (currency && CUR_COUNTRY[currency]) || (pre && TLD_COUNTRY[pre]) || (tld && TLD_COUNTRY[tld]) || (fromLang && fromLang.toUpperCase()) || null;
}

/* ---------- conectores oficiales (nivel 1) ---------- */
const PLATFORMS = {
  Shopify: { first: (o) => o + '/products.json?limit=250&page=1', page: (o, n) => o + '/products.json?limit=250&page=' + n, count: (j) => (j && Array.isArray(j.products) ? j.products.length : -1) },
  VTEX: { first: (o) => o + '/api/catalog_system/pub/products/search?_from=0&_to=49', page: (o, n) => o + '/api/catalog_system/pub/products/search?_from=' + (n - 1) * 50 + '&_to=' + ((n - 1) * 50 + 49), count: (j) => (Array.isArray(j) && (!j.length || j[0].productName) ? j.length : -1) },
  WooCommerce: { first: (o) => o + '/wp-json/wc/store/v1/products?per_page=100&page=1', page: (o, n) => o + '/wp-json/wc/store/v1/products?per_page=100&page=' + n, count: (j) => (Array.isArray(j) && (!j.length || j[0].prices) ? j.length : -1), currency: (j) => (Array.isArray(j) && j[0] && j[0].prices && j[0].prices.currency_code) || null },
};

// Relevancia: con palabras clave, solo entran productos cuyo nombre, categoría o URL contiene alguna.
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const relevant = (kw) => (txt) => { if (!kw || !kw.length) return true; const t = norm(txt); return kw.some((k) => t.includes(k)); };

/* ---------- extracción estructurada (nivel 2) ---------- */
function ldProduct(html, url) {
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  let prod = null, crumbs = null;
  const visit = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(visit);
    const t = [].concat(o['@type'] || []).map(String);
    if (!prod && (t.includes('Product') || t.includes('ProductGroup'))) prod = o;
    if (!crumbs && t.includes('BreadcrumbList')) crumbs = o;
    if (o['@graph']) visit(o['@graph']);
  };
  blocks.forEach((b) => { try { visit(JSON.parse(b.replace(/<[^>]+>/g, '').trim())); } catch (e) { /* bloque inválido */ } });
  if (!prod || !prod.name) return null;
  const variants = [].concat(prod.hasVariant || []);
  const offers = [...[].concat(prod.offers || []), ...variants.flatMap((v) => [].concat(v.offers || []))].flatMap((o) => (o && o.offers ? [].concat(o.offers) : [o])).filter(Boolean);
  const agg = [].concat(prod.offers || [])[0] || {};
  const prices = offers.map((o) => Number(o.price || o.lowPrice)).filter((x) => x > 0);
  const price = prices.length ? Math.min(...prices) : Number(agg.lowPrice || agg.price) || null;
  const cur = String((offers.find((o) => o.priceCurrency) || agg).priceCurrency || '').toUpperCase() || null;
  let list = null;
  offers.forEach((o) => [].concat(o.priceSpecification || []).forEach((ps) => { if (/ListPrice|StrikethroughPrice/i.test(String(ps.priceType || '')) && Number(ps.price) > price) list = Number(ps.price); }));
  const crumbNames = crumbs ? [].concat(crumbs.itemListElement || []).map((x) => x && (x.name || (x.item && x.item.name))).filter(Boolean) : [];
  const label = (typeof prod.category === 'string' && prod.category.split(/[>/]/).filter(Boolean).pop()) || (crumbNames.length >= 2 ? crumbNames[crumbNames.length - 2] : null);
  const avail = offers.some((o) => /InStock/i.test(String(o.availability || '')));
  const brand = prod.brand && (typeof prod.brand === 'string' ? prod.brand : prod.brand.name);
  return { id: 'l:' + (prod.sku || prod.productID || url.split('/').filter(Boolean).slice(-2).join('-')), name: String(prod.name).trim(), label: label ? String(label).trim() : null, price: price > 0 ? list || price : null, promo: list ? price : null, url, desc: String(prod.description || ''), sku: prod.sku ? String(prod.sku) : null, avail, cur, brand: brand ? String(brand) : null };
}

function metaProduct(html, url) {
  const meta = (k) => { const m = html.match(new RegExp('<meta[^>]+(?:property|name|itemprop)=["\']' + k + '["\'][^>]*>', 'i')); if (!m) return null; const c = m[0].match(/content=["\']([^"\']*)["\']/i); return c ? c[1] : null; };
  const ip = (html.match(/itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i) || html.match(/content=["']([\d.,]+)["'][^>]*itemprop=["']price["']/i) || [])[1];
  const raw = meta('product:price:amount') || meta('og:price:amount') || ip;
  const price = TP.ingest.parseMoney(raw);
  const name = meta('og:title') || (html.match(/<title>([^<]+)<\/title>/i) || [])[1];
  const isProduct = /og:type["'][^>]*content=["'](product|og:product)/i.test(html) || raw;
  if (!name || !isProduct) return null;
  const list = TP.ingest.parseMoney(meta('product:original_price:amount') || meta('og:original_price:amount'));
  return { id: 'm:' + url.split('/').filter(Boolean).slice(-2).join('-').slice(0, 100), name: String(name).replace(/\s*[|–-]\s*[^|–-]+$/, '').trim(), label: meta('product:category') || null, price: price > 0 ? (list > price ? list : price) : null, promo: price > 0 && list > price ? price : null, url, desc: meta('og:description') || meta('description') || '', sku: meta('product:retailer_item_id'), cur: (meta('product:price:currency') || meta('og:price:currency') || '').toUpperCase() || null };
}

async function sitemapUrls(origin, allowed, want, prefix) {
  const seen = new Set(), maps = [...(allowed.sitemaps || [])];
  maps.push(origin + '/sitemap.xml', origin + '/sitemap_index.xml', origin + '/sitemap_products_1.xml');
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
  const same = (o) => o.replace('://www.', '://') === origin.replace('://www.', '://');
  return urls.filter((u) => { try { const x = new URL(u); return same(x.origin) && allowed(x.pathname + x.search) && (!prefix || x.pathname.toLowerCase().startsWith(prefix)) && /\/p$|\/p\/|\/products?\/|\/producto|\.html$|-\d+$|\/item\//i.test(x.pathname); } catch (e) { return false; } });
}

async function crawlSitemap(origin, allowed, opts, attempt) {
  const want = opts.sitemapMax || 60;
  let urls = await sitemapUrls(origin, allowed, want, opts.prefix);
  attempt.detail = urls.length + ' fichas de producto en el sitemap';
  if (!urls.length) return null;
  const keep = relevant(opts.keywords);
  const rel = urls.filter((u) => keep(decodeURIComponent(u).replace(/[-_/]/g, ' ')));
  if (rel.length >= 10) urls = rel;
  if (urls.length > want) { const st = urls.length / want; urls = Array.from({ length: want }, (_, i) => urls[Math.floor(i * st)]); }
  const items = []; let pages = 0, failed = 0, priceless = 0;
  for (let i = 0; i < urls.length; i += 6) {
    if (opts.deadline && Date.now() > opts.deadline) { attempt.cut = 'tiempo'; break; }
    const got = await Promise.all(urls.slice(i, i + 6).map((u) => get(u, 'text/html', 15000).then((r) => (r.ok ? ldProduct(r.text, u) || metaProduct(r.text, u) : (failed++, null)), () => (failed++, null))));
    pages += got.length;
    got.forEach((p) => { if (!p) return; if (!(p.price > 0)) { priceless++; return; } items.push({ ...TP.ingest.mkItem(p), cur: p.cur || null, brand: p.brand || null }); });
    await sleep(Math.min(DELAY, 300));
  }
  attempt.detail += ' · ' + pages + ' leídas · ' + items.length + ' con precio' + (priceless ? ' · ' + priceless + ' sin precio' : '') + (failed ? ' · ' + failed + ' con error' : '');
  return { method: 'sitemap', items, found: items.length + priceless, pages, partial: failed > pages / 3 || !!attempt.cut };
}

/* ---------- texto de páginas con IA (nivel 2b) y navegador (nivel 3) ---------- */
const SKIP = /cuenta|account|login|registro|carrito|cart|checkout|blog|ayuda|help|contact|politica|policy|terminos|terms|faq|nosotros|about|tiendas|stores|garantia|devoluc|envios|pqr|trabaja|wishlist|favorit|search|buscar|\.(jpg|png|pdf)$/i;
function categoryLinks(html, origin, allowed, opts) {
  const links = [];
  const re = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(html)) && links.length < 400) {
    let u; try { u = new URL(m[1], origin); } catch (e) { continue; }
    const txt = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (u.origin !== origin || (opts.prefix && !u.pathname.toLowerCase().startsWith(opts.prefix)) || SKIP.test(u.pathname) || u.pathname === '/' || u.pathname.split('/').filter(Boolean).length > 3 || !txt || txt.length > 40) continue;
    if (!allowed(u.pathname + u.search) || links.some((l) => l.url === u.href)) continue;
    links.push({ url: u.href, txt });
  }
  const keep = relevant(opts.keywords);
  return links.map((l) => ({ ...l, score: (keep(l.txt + ' ' + l.url) && opts.keywords ? 2 : 0) + (/\/(c|categoria|category|collections?|productos?|shop|tienda)\//i.test(l.url) ? 1 : 0) })).sort((a, b) => b.score - a.score);
}
const PRICE_TXT = /\$\s?\d{1,3}([.,]\d{3})+|\$\s?\d{4,}|S\/\s?\d|\d{1,3}([.,]\d{3})+\s?(COP|MXN|CLP|PEN)/g;
async function aiFromText(text, origin, label, opts, items) {
  try { const got = await TP.ingest.extractFromText(opts.ai, text.slice(0, 40000), origin); got.forEach((p) => { if (!p.label || p.label === 'Sin categoría') p.label = label; items.push(p); }); }
  catch (e) { if (e && ['billing', 'ai_limit'].includes(e.code)) throw e; throw new ReadError('ai_error', 'La IA no pudo extraer productos del texto', { cause: e }); }
}
async function crawlText(origin, allowed, opts, homeHtml, attempt) {
  if (!opts.ai) { attempt.status = 'skip'; attempt.detail = 'sin IA disponible'; return null; }
  const items = []; let pages = 0, aiErr = null;
  for (const l of categoryLinks(homeHtml, origin, allowed, opts).slice(0, 8)) {
    if (items.length >= (opts.textMax || 60) || (opts.deadline && Date.now() > opts.deadline)) break;
    let page; try { page = await get(l.url, 'text/html', 15000); } catch (e) { continue; }
    if (!page.ok) continue;
    const text = page.text.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    if ((text.match(PRICE_TXT) || []).length < 5) continue;
    pages++;
    try { await aiFromText(text, origin, l.txt, opts, items); } catch (e) { if (['billing', 'ai_limit'].includes(e.code)) throw e; aiErr = e; }
  }
  attempt.detail = pages + ' páginas con precios visibles · ' + items.length + ' productos';
  if (!items.length && aiErr) throw aiErr;
  return items.length >= 5 ? { method: 'ai_text', items, found: items.length, pages } : null;
}

// Nivel 3: navegador sin interfaz. Solo si Playwright está instalado en el servidor (HEADLESS=off lo desactiva) o hay un navegador remoto (BROWSER_WS_ENDPOINT).
let pw = null;
function browserAvailable() {
  if (process.env.HEADLESS === 'off') return false;
  if (process.env.BROWSER_WS_ENDPOINT) return true;
  if (pw === null) { try { pw = require('playwright'); } catch (e) { pw = false; } }
  return !!pw;
}
async function crawlBrowser(origin, allowed, opts, attempt) {
  if (!browserAvailable()) { attempt.status = 'skip'; attempt.detail = 'navegador no disponible en este servidor'; return null; }
  const chromium = (pw || require('playwright')).chromium;
  const browser = process.env.BROWSER_WS_ENDPOINT ? await chromium.connect(process.env.BROWSER_WS_ENDPOINT) : await chromium.launch({ args: ['--no-sandbox'] });
  const items = []; let pages = 0;
  try {
    const ctx = await browser.newContext({ userAgent: UA, javaScriptEnabled: true });
    // cada petición del navegador pasa por la misma validación de destino; sin imágenes, fuentes ni video
    await ctx.route('**/*', async (route) => {
      const req = route.request();
      if (['image', 'font', 'media'].includes(req.resourceType())) return route.abort();
      try {
        const u = checkUrl(req.url());
        if (!ALLOW_PRIVATE) { const h = await resolveHost(u.hostname); if (!h.ok) return route.abort(); }
        return route.continue();
      } catch (e) { return route.abort(); }
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const start = origin + (opts.prefix || '') + '/';
    await page.goto(start, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
    const html = await page.content();
    const links = categoryLinks(html, origin, allowed, opts).slice(0, 8);
    for (const l of [{ url: start, txt: null }, ...links]) {
      if (items.length >= (opts.textMax || 60) || (opts.deadline && Date.now() > opts.deadline)) break;
      if (l.url !== start) await page.goto(l.url, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
      pages++;
      const dom = await page.content();
      const ld = ldProduct(dom, page.url());
      if (ld && ld.price > 0) items.push(TP.ingest.mkItem(ld));
      const text = await page.evaluate(() => document.body.innerText).catch(() => '');
      if ((text.match(PRICE_TXT) || []).length >= 5 && opts.ai) await aiFromText(text.replace(/\s+/g, ' '), origin, l.txt, opts, items).catch((e) => { if (['billing', 'ai_limit'].includes(e.code)) throw e; });
    }
  } finally { await browser.close().catch(() => {}); }
  attempt.detail = pages + ' páginas renderizadas · ' + items.length + ' productos';
  return items.length >= 5 ? { method: 'headless', items, found: items.length, pages } : null;
}

/* ---------- página de inicio ---------- */
async function homeInfo(origin, prefix) {
  const r = await get(origin + (prefix || '') + '/', 'text/html', 15000);
  const fin = new URL(r.url || origin + '/');
  const html = r.text || '';
  const lang = ((html.match(/<html[^>]*\slang=["']?([a-zA-Z-]+)/i) || [])[1] || '').toLowerCase();
  let countries = null;
  const plain = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (/en qu[eé] pa[ií]s|selecciona tu (pa[ií]s|ubicaci)|elige tu pa[ií]s|choose your (country|location)|select your (country|region)/i.test(plain) && plain.length < 6000) {
    const re = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m; const seen = new Set(); countries = [];
    while ((m = re.exec(html))) {
      const label = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!/colombia|m[eé]xico|chile|per[uú]|panam[aá]|ecuador|argentina|costa rica|guatemala|usa|estados unidos|españa|espana/i.test(label) || label.length > 30) continue;
      let u; try { u = new URL(m[1], fin.href); } catch (e) { continue; }
      if (seen.has(u.href)) continue; seen.add(u.href);
      countries.push({ label, url: u.origin + (u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : '') });
    }
    if (!countries.length) countries = null;
  }
  const waf = [401, 403, 429, 503].includes(r.status) && /captcha|cloudflare|access denied|attention required|incapsula|akamai|perimeterx|forbidden/i.test(html + ' ' + (r.headers.get('server') || '') + (r.headers.get('cf-ray') ? ' cloudflare' : ''));
  const login = /\/(login|account\/login|cuenta\/ingresar|auth)/i.test(fin.pathname);
  return { origin: fin.origin, path: fin.pathname, status: r.status, lang, html, countries, waf, login, platform: detectPlatform(html), currency: detectCurrency(html), redirects: r.redirects };
}

/* ---------- pipeline ---------- */
const STAGE = { connect: 'Conectando', platform: 'Identificando plataforma', catalog: 'Leyendo catálogo', validate: 'Validando productos', categories: 'Analizando categorías' };

async function readOrigin(origin, opts, diag, home, onProgress) {
  const allowed = await robots(origin);
  diag.robots = allowed.state;
  const keep = relevant(opts.keywords);
  const order = Object.keys(PLATFORMS).sort((a, b) => (b === home.platform) - (a === home.platform));
  let http = { blocked: 0, robots: 0, net: 0 };
  let best = null;
  const tryAt = (method, label) => { const a = { level: method.startsWith('api') ? 1 : method === 'headless' ? 3 : 2, method, label, status: 'fail', detail: '' , t0: Date.now() }; diag.attempts.push(a); onProgress && onProgress({ stage: 'catalog', diag }); return a; };
  const close = (a, status) => { a.status = status || a.status; a.ms = Date.now() - a.t0; delete a.t0; };
  // nivel 1
  for (const name of order) {
    const P = PLATFORMS[name];
    const a = tryAt('api_' + name.toLowerCase(), 'API pública de ' + name);
    const u = new URL(P.first(origin));
    if (!allowed(u.pathname + u.search)) { http.robots++; a.detail = 'robots.txt no lo permite'; close(a, 'blocked'); continue; }
    let r;
    try { r = await get(u.href); } catch (e) { http.net++; a.detail = e.code === 'timeout' ? 'tiempo agotado' : 'sin conexión (' + e.code + ')'; close(a); continue; }
    if ([401, 403, 429].includes(r.status)) { http.blocked++; a.detail = 'acceso restringido (HTTP ' + r.status + ')'; close(a, 'blocked'); continue; }
    let j; try { j = JSON.parse(r.text); } catch (e) { a.detail = 'no disponible (HTTP ' + r.status + ')'; close(a); continue; }
    if (P.count(j) < 0) { a.detail = 'formato distinto'; close(a); continue; }
    const by = {}; let raw = 0, parsed = 0;
    const add = (json) => { raw += P.count(json); TP.ingest.parseText(JSON.stringify(json), origin).items.forEach((p) => { parsed++; if (keep(p.name + ' ' + p.label + ' ' + (p.url || ''))) by[p.id] = p; }); };
    add(j);
    const cur = P.currency ? P.currency(j) : null;
    let n = 1, last = P.count(j), cut = null;
    while (last > 0 && n < (opts.maxPages || MAX_PAGES) && !(opts.enough && Object.keys(by).length >= opts.enough)) {
      if (opts.deadline && Date.now() > opts.deadline) { cut = 'tiempo'; break; }
      n++;
      const pu = new URL(P.page(origin, n));
      if (!allowed(pu.pathname + pu.search)) { cut = 'robots'; break; }
      await sleep(DELAY);
      let jj; try { const rr = await get(pu.href); if (!rr.ok && rr.status !== 206) { cut = 'HTTP ' + rr.status; break; } jj = JSON.parse(rr.text); } catch (e) { cut = e.code || 'error'; break; }
      last = P.count(jj);
      if (last <= 0) break;
      add(jj);
    }
    const items = Object.values(by);
    a.detail = n + ' páginas · ' + raw + ' productos publicados · ' + parsed + ' con precio' + (opts.keywords ? ' · ' + items.length + ' relacionados' : '') + (cut && cut !== 'tiempo' ? ' · lectura cortada (' + cut + ')' : '');
    if (!raw) { a.detail = 'catálogo vacío'; close(a); continue; }
    close(a, items.length ? 'ok' : 'empty');
    const res = { method: a.method, platform: name, items, found: raw, priced: parsed, pages: n, partial: !!(cut && cut !== 'tiempo' && n === 1) || (cut && cut !== 'tiempo'), currency: cur };
    if (items.length) return res;
    if (!best) best = res;
    if (!parsed) best = { ...res, noPrices: true };
  }
  // nivel 2
  const a2 = tryAt('sitemap', 'Sitemap y datos estructurados (schema.org)');
  const sm = await crawlSitemap(origin, allowed, opts, a2).catch((e) => { a2.detail = 'error: ' + (e.code || e.message); return null; });
  close(a2, sm && sm.items.length ? 'ok' : sm && sm.found ? 'empty' : 'fail');
  if (sm && sm.items.length >= 3) return sm;
  if (sm && sm.found && !sm.items.length) best = { ...sm, noPrices: true };
  // nivel 2b
  const a3 = tryAt('ai_text', 'Texto de páginas de categoría (IA)');
  let tx = null, aiErr = null;
  try { tx = await crawlText(origin, allowed, opts, home.html, a3); } catch (e) { if (['billing', 'ai_limit'].includes(e.code)) throw e; aiErr = e; a3.detail = 'la IA falló al extraer'; }
  close(a3, tx ? 'ok' : a3.status === 'skip' ? 'skip' : 'fail');
  if (tx) return tx;
  // nivel 3
  const a4 = tryAt('headless', 'Navegador para contenido dinámico');
  let hb = null;
  try { hb = await crawlBrowser(origin, allowed, opts, a4); } catch (e) { if (['billing', 'ai_limit'].includes(e.code)) throw e; a4.detail = 'error del navegador: ' + String(e.message).slice(0, 80); }
  close(a4, hb ? 'ok' : a4.status === 'skip' ? 'skip' : 'fail');
  if (hb) return hb;
  // sin catálogo: causa principal
  if (best && best.noPrices) throw new ReadError('no_prices', 'Encontramos productos pero sin precios visibles', { found: best.found });
  if (best) return best;
  if (http.net >= 2 && !http.blocked) throw new ReadError('unreachable', 'La tienda no respondió');
  if (allowed.state !== 'ok' && allowed.state !== 'none') throw new ReadError('restricted', 'El archivo robots.txt no respondió; por norma no leemos el sitio', { reason: 'robots_unavailable' });
  if (http.blocked >= 2 || home.waf) throw new ReadError('restricted', 'La tienda bloquea las lecturas automáticas', { reason: 'waf' });
  if (http.robots >= 2) throw new ReadError('restricted', 'El robots.txt de la tienda no permite leer el catálogo', { reason: 'robots' });
  if (aiErr) throw aiErr;
  throw new ReadError('no_catalog', 'No encontramos un catálogo público legible');
}

// Lee una tienda y devuelve { platform, method, origin, items, found, pages, partial, currency, country, home, diag }.
// Si falla lanza ReadError con .diag. onProgress recibe el diagnóstico en cada etapa.
async function crawl(storeUrl, onProgress, opts = {}) {
  const t0 = Date.now();
  const diag = { input: String(storeUrl || '').slice(0, 300), stage: 'connect', attempts: [], warnings: [], startedAt: new Date().toISOString() };
  const fail = (e) => { diag.stage = 'failed'; diag.code = e.code; diag.reason = e.reason || null; diag.ms = Date.now() - t0; e.diag = diag; log.info('crawl_fail', { input: diag.input, origin: diag.origin, code: e.code, reason: e.reason, ms: diag.ms, attempts: diag.attempts.map((a) => a.method + ':' + a.status) }); return e; };
  const step = (stage) => { diag.stage = stage; onProgress && onProgress({ stage, diag }); };
  let origin = TP.ingest.origin(storeUrl);
  if (!origin) throw fail(new ReadError('invalid_url', 'La dirección no es válida'));
  try {
    const u0 = checkUrl(origin);
    if (!ALLOW_PRIVATE) { const h = await resolveHost(u0.hostname); if (!h.ok) throw new ReadError(h.code === 'blocked_destination' ? 'invalid_url' : 'unreachable', h.code === 'blocked_destination' ? 'Esa dirección no está permitida' : 'El dominio no existe o no se puede resolver', { reason: h.code }); }
  } catch (e) { throw fail(e instanceof ReadError ? e : new ReadError('invalid_url', 'Esa dirección no está permitida')); }
  try { const m = new URL(/^https?:/i.test(storeUrl) ? storeUrl : 'https://' + storeUrl).pathname.match(/^\/([a-z]{2})(\/(es|es-[a-z]{2}|es_[a-z]{2}))?(\/|$)/i); if (m) opts = { ...opts, prefix: '/' + m[1].toLowerCase() + (m[2] || '') }; } catch (e) { /* sin ruta */ }
  step('connect');
  let home;
  try { home = await homeInfo(origin, opts.prefix); }
  catch (e) {
    const u = new URL(origin);
    const alt = u.protocol + '//' + (u.hostname.startsWith('www.') ? u.hostname.slice(4) : 'www.' + u.hostname) + (u.port ? ':' + u.port : '');
    try { home = await homeInfo(alt, opts.prefix); origin = alt; }
    catch (e2) { throw fail(e.code === 'timeout' ? new ReadError('timeout', 'La tienda tardó demasiado en responder') : e.code === 'blocked_destination' ? new ReadError('invalid_url', 'Esa dirección no está permitida') : new ReadError('unreachable', 'No pudimos conectarnos con la tienda', { reason: e.code })); }
  }
  if (home.origin !== origin) { diag.warnings.push('La dirección redirige a ' + home.origin.replace(/^https?:\/\//, '')); origin = home.origin; }
  diag.origin = origin; diag.httpStatus = home.status; diag.redirects = home.redirects;
  if (home.countries) throw fail(new ReadError('country_selector', 'La dirección es una página para elegir país', { countries: home.countries, reason: 'country_selector' }));
  if (home.login) throw fail(new ReadError('restricted', 'La tienda pide iniciar sesión para ver productos', { reason: 'login' }));
  step('platform');
  diag.platform = home.platform;
  diag.currency = home.currency;
  diag.lang = home.lang;
  step('catalog');
  let res;
  try { res = await readOrigin(origin, opts, diag, home, onProgress); }
  catch (e) {
    if (['billing', 'ai_limit'].includes(e.code)) throw e;
    // la variante con o sin www solo se intenta si la primera no respondió
    if (e.code === 'unreachable') {
      const u = new URL(origin);
      const alt = u.protocol + '//' + (u.hostname.startsWith('www.') ? u.hostname.slice(4) : 'www.' + u.hostname) + (u.port ? ':' + u.port : '');
      try { res = await readOrigin(alt, opts, diag, home, onProgress); origin = alt; } catch (e2) { throw fail(e); }
    } else throw fail(e instanceof ReadError ? e : new ReadError('no_catalog', 'Error al leer el catálogo', { cause: e }));
  }
  step('validate');
  const now = new Date().toISOString();
  const curItems = res.items.map((it) => it.cur).filter(Boolean);
  const currency = res.currency || (curItems.length ? curItems.sort((a, b) => curItems.filter((x) => x === b).length - curItems.filter((x) => x === a).length)[0] : null) || home.currency || null;
  res.items.forEach((it) => { it.src = res.method; it.cur = it.cur || currency; it.at = now; });
  const mixed = new Set(curItems).size > 1;
  if (mixed) diag.warnings.push('El catálogo tiene precios en más de una moneda');
  const country = detectCountry(new URL(origin).hostname, currency, home.lang, opts.prefix);
  step('categories');
  const labels = new Set(res.items.map((it) => it.label).filter((l) => l && l !== 'Sin categoría'));
  const priced = res.items.filter((it) => it.price > 0).length;
  Object.assign(diag, {
    stage: res.partial ? 'partial' : 'done', method: res.method, platform: res.platform || home.platform || null, currency, country,
    found: res.found || res.items.length, priced, categories: labels.size, pages: res.pages, ms: Date.now() - t0, finishedAt: now,
    status: res.partial || (res.found && priced < res.found * 0.5) ? 'partial' : 'ok',
  });
  if (res.partial) diag.warnings.push('La lectura se cortó antes de terminar; se conservan los productos leídos');
  if (!currency) diag.warnings.push('No pudimos confirmar la moneda de los precios');
  log.info('crawl_ok', { origin, method: res.method, found: diag.found, priced, ms: diag.ms, status: diag.status });
  return { ...res, platform: diag.platform, origin, currency, country, home: { origin: home.origin, path: home.path, lang: home.lang }, diag };
}

const METHOD_LABEL = { api_shopify: 'API pública de Shopify', api_vtex: 'API pública de VTEX', api_woocommerce: 'API pública de WooCommerce', sitemap: 'Sitemap y datos estructurados', ai_text: 'Texto de la página (extraído con IA)', headless: 'Navegador (contenido dinámico)', file: 'Archivo CSV o Excel', auth_shopify: 'Conexión autenticada Shopify', auth_vtex: 'Conexión autenticada VTEX', auth_woocommerce: 'Conexión autenticada WooCommerce' };

// Mensaje para el usuario por código (sin datos técnicos sensibles)
const USER_MSG = {
  invalid_url: 'La dirección no es válida o no está permitida.',
  unreachable: 'No pudimos conectarnos: el dominio no existe o no responde.',
  restricted: 'La tienda no permite la lectura automática de su catálogo.',
  no_catalog: 'No encontramos un catálogo público que podamos leer.',
  no_prices: 'Encontramos productos, pero sin precios visibles.',
  timeout: 'La tienda tardó demasiado en responder.',
  ai_error: 'La IA no pudo extraer los productos de las páginas.',
  country_selector: 'La dirección es una página para elegir país, no una tienda.',
};
const REASON_MSG = { robots: 'Su archivo robots.txt no permite leer el catálogo y respetamos esa decisión.', robots_unavailable: 'Su archivo robots.txt no respondió; por norma no leemos sitios en ese caso.', waf: 'Tiene una protección contra lecturas automáticas que no intentamos evadir.', login: 'Pide iniciar sesión para ver los productos.', dns_not_found: 'El dominio no existe.', blocked_destination: 'La dirección apunta a una red privada.' };

module.exports = { METHOD_LABEL, crawl, robots, UA, ldProduct, metaProduct, detectPlatform, detectCurrency, detectCountry, ReadError, USER_MSG, REASON_MSG, browserAvailable, STAGE };
