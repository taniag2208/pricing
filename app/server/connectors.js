// Nivel 4 de recuperación: conexión autenticada a la tienda propia.
// Las credenciales se usan una sola vez para leer el catálogo: no se guardan en la base de datos, no se registran en logs
// y nunca vuelven al navegador. Todas las peticiones pasan por net.safeFetch (protección SSRF).
const TP = require('./shared');
const { safeFetch, checkUrl } = require('./net');
const log = require('./log');

const err = (code, message) => Object.assign(new Error(message), { code });
const clean = (s, max) => String(s || '').trim().slice(0, max || 300);
const MAX_PAGES = 12;

async function getJson(url, headers) {
  const r = await safeFetch(url, { headers: { Accept: 'application/json', ...headers }, timeout: 25000, retries: 1 });
  if (r.status === 401 || r.status === 403) throw err('auth_failed', 'La tienda rechazó las credenciales (HTTP ' + r.status + ').');
  if (!r.ok) throw err('http_' + r.status, 'La tienda respondió con un error (HTTP ' + r.status + ').');
  try { return { json: JSON.parse(r.text), headers: r.headers }; } catch (e) { throw err('bad_response', 'La respuesta no es JSON.'); }
}

const CONNECTORS = {
  // Shopify Admin API: token de una app personalizada con permiso read_products.
  async shopify({ store, token }) {
    const shop = clean(store).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) throw err('invalid_input', 'Escribe el dominio de administración de Shopify, por ejemplo mitienda.myshopify.com.');
    if (!/^shpat_[a-f0-9]{20,}$/i.test(clean(token))) throw err('invalid_input', 'El token de Shopify empieza por shpat_.');
    const origin = 'https://' + shop;
    let url = origin + '/admin/api/2024-10/products.json?limit=250&status=active';
    const products = [];
    for (let i = 0; url && i < MAX_PAGES; i++) {
      const { json, headers } = await getJson(url, { 'X-Shopify-Access-Token': clean(token) });
      products.push(...(json.products || []));
      const next = ((headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/) || [])[1];
      url = next ? checkUrl(next).href : null;
      if (next && new URL(next).host !== shop) url = null;
    }
    return { origin, items: TP.ingest.parseText(JSON.stringify({ products }), null).items };
  },
  // WooCommerce REST API v3: clave y secreto de consumidor con permiso de lectura.
  async woocommerce({ store, key, secret }) {
    const origin = TP.ingest.origin(clean(store));
    if (!origin) throw err('invalid_input', 'Escribe la dirección de la tienda.');
    if (!/^ck_[a-f0-9]{20,}$/i.test(clean(key)) || !/^cs_[a-f0-9]{20,}$/i.test(clean(secret))) throw err('invalid_input', 'La clave empieza por ck_ y el secreto por cs_.');
    const auth = 'Basic ' + Buffer.from(clean(key) + ':' + clean(secret)).toString('base64');
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { json } = await getJson(origin + '/wp-json/wc/v3/products?status=publish&per_page=100&page=' + page, { Authorization: auth });
      if (!Array.isArray(json) || !json.length) break;
      json.forEach((p) => {
        const reg = TP.ingest.parseMoney(p.regular_price), sale = TP.ingest.parseMoney(p.sale_price) || TP.ingest.parseMoney(p.price);
        const price = reg || sale; if (!(price > 0)) return;
        items.push(TP.ingest.mkItem({ id: 'w:' + p.id, name: p.name, label: p.categories && p.categories[0] && p.categories[0].name, price, promo: reg && sale && sale < reg ? sale : null, url: p.permalink, desc: p.short_description || p.description, sku: p.sku, avail: p.stock_status === 'instock' }));
      });
      if (json.length < 100) break;
    }
    return { origin, items };
  },
  // VTEX: cuenta y par AppKey/AppToken con permiso de lectura de catálogo.
  async vtex({ account, appKey, appToken }) {
    const acc = clean(account, 60).toLowerCase();
    if (!/^[a-z0-9]+$/.test(acc)) throw err('invalid_input', 'Escribe el nombre de la cuenta VTEX (solo letras y números).');
    if (!clean(appKey) || !clean(appToken)) throw err('invalid_input', 'Faltan AppKey o AppToken.');
    const origin = 'https://' + acc + '.vtexcommercestable.com.br';
    const all = [];
    for (let i = 0; i < MAX_PAGES; i++) {
      const { json } = await getJson(origin + '/api/catalog_system/pub/products/search?_from=' + i * 50 + '&_to=' + (i * 50 + 49), { 'X-VTEX-API-AppKey': clean(appKey), 'X-VTEX-API-AppToken': clean(appToken) });
      if (!Array.isArray(json) || !json.length) break;
      all.push(...json);
      if (json.length < 50) break;
    }
    return { origin, items: TP.ingest.parseText(JSON.stringify(all), origin).items };
  },
};

async function readAuthenticated(platform, creds) {
  const fn = CONNECTORS[platform];
  if (!fn) throw err('invalid_input', 'Plataforma no soportada.');
  const t0 = Date.now();
  try {
    const res = await fn(creds || {});
    const now = new Date().toISOString();
    res.items.forEach((it) => { it.src = 'auth_' + platform; it.at = now; });
    log.info('connector_ok', { platform, items: res.items.length, ms: Date.now() - t0 });
    return { ...res, method: 'auth_' + platform };
  } catch (e) {
    log.warn('connector_fail', { platform, code: e.code, ms: Date.now() - t0 });
    if (e.code === 'blocked_destination' || e.code === 'invalid_url') throw err('invalid_input', 'Esa dirección no está permitida.');
    throw e.code ? e : err('error', 'No se pudo leer la tienda con esas credenciales.');
  }
}

module.exports = { readAuthenticated, PLATFORMS: Object.keys(CONNECTORS) };
