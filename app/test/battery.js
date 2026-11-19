// Batería reproducible de casos del motor de lectura e inteligencia competitiva (servidores de prueba controlados).
// Para cada caso registra: esperado, obtenido, método, productos válidos, motivo, tiempo, consumo de IA y aprobación.
// Uso: node test/battery.js   (escribe docs/QA-RESULTADOS.md y test/battery-results.json)
process.env.ALLOW_PRIVATE_NETWORK = '1'; process.env.LOG_SILENT = '1'; process.env.CRAWLER_DELAY_MS = '5';
const { spawn, execFileSync } = require('child_process');
const path = require('path'); const fs = require('fs'); const os = require('os');
const mocks = require('./mocks');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const add = (r) => { results.push(r); console.log((r.ok ? 'APROBADO ' : 'FALLÓ    ') + r.id + ' · ' + r.caso + ' · ' + r.obtenido); };

(async () => {
  const { crawl } = require('../server/scrape');
  const jobs = require('../server/jobs');
  const S = {};
  for (const [port, name, mode, n, eff] of [[4501, 'Shop', null, 31, 0], [4502, 'Vtex', 'vtex', 40, 0], [4503, 'Woo', 'woo', 40, 0], [4504, 'Dyn', 'dynamic', 12, 0], [4505, 'Parcial', 'partial', 40, 0], [4506, 'Waf', 'waf', 10, 0], [4508, 'Sinprecio', 'noprice', 12, 0], [4509, 'Usd', 'woo_usd', 30, 0], [4511, 'Premium', null, 30, 0.9]]) S[port] = await mocks.store(port, name, n, eff, 0, mode || undefined);
  const red = require('http').createServer((q, r) => { r.statusCode = 301; r.setHeader('Location', 'http://127.0.0.1:4501' + q.url); r.end(); }); await new Promise((r) => red.listen(4507, r));
  const read = async (id, caso, url, expect, check, opts) => {
    const t0 = Date.now(); let res = null, err = null;
    try { res = await crawl(url, null, opts || { maxPages: 4 }); } catch (e) { err = e; }
    const ms = Date.now() - t0;
    const ok = check(res, err);
    add({ id, caso, esperado: expect, obtenido: res ? 'lectura ' + res.diag.status + ' · ' + res.method + (res.currency ? ' · ' + res.currency : '') : 'error ' + err.code + (err.reason ? ' (' + err.reason + ')' : ''), metodo: res ? res.method : (err.diag && err.diag.attempts || []).map((a) => a.method + ':' + a.status).join(', '), productos: res ? res.items.filter((x) => x.price > 0).length : 0, motivo: err ? err.message : (res.diag.warnings || []).join(' · ') || '—', ms, ia: 0, ok });
    return res;
  };
  /* ---------- A. motor de lectura ---------- */
  await read('L01', 'Tienda Shopify', 'http://127.0.0.1:4501', 'lectura completa por API de Shopify, 32 productos', (r) => r && r.method === 'api_shopify' && r.items.length === 32 && r.diag.status === 'ok');
  await read('L02', 'Tienda VTEX', 'http://127.0.0.1:4502', 'API de VTEX, moneda COP detectada en la página', (r) => r && r.method === 'api_vtex' && r.items.length === 41 && r.currency === 'COP' && r.platform === 'VTEX');
  await read('L03', 'Tienda WooCommerce', 'http://127.0.0.1:4503', 'API de WooCommerce con moneda de la API', (r) => r && r.method === 'api_woocommerce' && r.items.length === 41 && r.currency === 'COP');
  await read('L04', 'Ecommerce con contenido dinámico (JavaScript)', 'http://127.0.0.1:4504', 'nivel 3: navegador sin interfaz, productos desde JSON-LD inyectado', (r) => r && r.method === 'headless' && r.items.length >= 5, { maxPages: 2, textMax: 60 });
  await read('L05', 'Catálogo parcial (la página 2 responde 500)', 'http://127.0.0.1:4505', 'lectura parcial: se conservan los 25 productos de la página 1 y se advierte', (r) => r && r.diag.status === 'partial' && r.items.length === 25 && r.diag.warnings.some((w) => /cortó/.test(w)));
  await read('L06', 'Acceso restringido (WAF 403)', 'http://127.0.0.1:4506', 'restricted / waf, sin intentar evadir', (r, e) => !r && e.code === 'restricted' && e.reason === 'waf');
  await read('L07', 'URL inválida', 'esto no es una url', 'invalid_url', (r, e) => !r && e.code === 'invalid_url');
  await read('L08', 'Sitio con redirecciones (301 a otro dominio)', 'http://127.0.0.1:4507', 'sigue la redirección y lee el destino', (r) => r && r.origin === 'http://127.0.0.1:4501' && r.items.length === 32 && r.diag.warnings.some((w) => /redirige/.test(w)));
  await read('L12', 'Productos sin precios', 'http://127.0.0.1:4508', 'no_prices (productos encontrados sin precio visible)', (r, e) => !r && e.code === 'no_prices');
  {
    const { readAuthenticated } = require('../server/connectors');
    S[4513] = await mocks.store(4513, 'Auth', 30, 0, 0, 'woo_auth');
    const t0 = Date.now(); let r = null, bad = null;
    try { r = await readAuthenticated('woocommerce', { store: 'http://127.0.0.1:4513', key: 'ck_' + 'a'.repeat(24), secret: 'cs_' + 'b'.repeat(24) }); } catch (e) { r = { err: e.code }; }
    try { await readAuthenticated('woocommerce', { store: 'http://127.0.0.1:4513', key: 'ck_' + 'c'.repeat(24), secret: 'cs_' + 'd'.repeat(24) }); } catch (e) { bad = e.code; }
    add({ id: 'L13', caso: 'Conexión autenticada de la tienda propia (WooCommerce REST)', esperado: 'lee el catálogo con credenciales válidas; con credenciales inválidas responde auth_failed; no guarda credenciales', obtenido: (r.items ? r.items.length + ' productos · ' + r.method : 'error ' + r.err) + ' · credenciales inválidas: ' + bad, metodo: r.method || '—', productos: r.items ? r.items.length : 0, motivo: 'credenciales de un solo uso', ms: Date.now() - t0, ia: 0, ok: !!(r.items && r.items.length === 31 && r.method === 'auth_woocommerce' && bad === 'auth_failed') });
  }
  {
    // regresión: VTEX devuelve ~9 MB por 50 productos; el límite de descarga cortaba el JSON
    const big = 'x'.repeat(4000);
    const body = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ productId: String(i), productName: 'Tenis ' + i, description: big, link: 'http://x/' + i + '/p', categories: ['/Calzado/Tenis/'], items: [{ itemId: String(i), images: Array.from({ length: 60 }, () => ({ url: big })), sellers: [{ commertialOffer: { Price: 100000 + i, ListPrice: 120000, AvailableQuantity: 3 } }] }] })));
    const bs = require('http').createServer((q, r) => { if (q.url.startsWith('/api/catalog_system')) { r.statusCode = 206; r.setHeader('Content-Type', 'application/json'); return r.end(q.url.includes('_from=0') ? body : '[]'); } if (q.url === '/robots.txt') return r.end('User-agent: *\n'); r.setHeader('Content-Type', 'text/html'); r.end('<html>vtexassets</html>'); });
    await new Promise((r) => bs.listen(4514, r));
    await read('L14', 'Respuesta de API muy pesada (VTEX, ' + (body.length / 1048576).toFixed(1) + ' MB por página, HTTP 206)', 'http://127.0.0.1:4514', 'se lee completa por la API de VTEX', (r) => r && r.method === 'api_vtex' && r.items.length === 50, { maxPages: 2 });
    bs.close();
  }
  // SSRF: en un proceso sin la excepción de pruebas, las direcciones internas se bloquean
  {
    const t0 = Date.now();
    const out = execFileSync(process.execPath, ['-e', `process.env.LOG_SILENT='1';const {crawl}=require('./server/scrape');(async()=>{const r=[];for(const u of ['http://127.0.0.1:4501','http://169.254.169.254/latest/meta-data/','http://10.0.0.5','http://localhost:4501','file:///etc/passwd','http://[::1]:4501']){try{await crawl(u);r.push('LEÍDO')}catch(e){r.push(e.code)}}console.log(r.join(','))})()`], { cwd: path.join(__dirname, '..'), env: { ...process.env, ALLOW_PRIVATE_NETWORK: '0' } }).toString().trim();
    add({ id: 'L07b', caso: 'Protección SSRF (destinos internos y metadatos de nube)', esperado: 'todas bloqueadas como invalid_url', obtenido: out, metodo: '—', productos: 0, motivo: 'net.safeFetch + validación de DNS y de cada redirección', ms: Date.now() - t0, ia: 0, ok: out.split(',').every((x) => x === 'invalid_url') });
  }
  /* ---------- B. evaluación de competidores ---------- */
  const own = await crawl('http://127.0.0.1:4501');
  const st = { keywords: require('../server/util').keywordsOf(own.items), ownMed: 0, currency: 'COP', country: 'CO' };
  st.ownMed = own.items.map((p) => (p.promo && p.promo < p.price ? p.promo : p.price)).sort((a, b) => a - b)[Math.floor(own.items.length / 2)];
  const evalCase = (id, caso, expect, res, check, why) => { const ev = jobs.evaluateCompetitor(st, { verified: 'ok' }, res); add({ id, caso, esperado: expect, obtenido: 'tipo ' + ev.type + ' · comparabilidad ' + ev.comparability + ' · en análisis: ' + (ev.include ? 'sí' : 'no') + ' · evidencia ' + ev.confidence, metodo: res.method, productos: res.items.length, motivo: why || ev.note || ev.evidence.slice(-1)[0], ms: 0, ia: 0, ok: check(ev) }); };
  const shop = await crawl('http://127.0.0.1:4501', null, { keywords: st.keywords });
  const few = { ...shop, currency: 'COP', country: 'CO', items: shop.items.slice(0, 6), found: 6 };
  evalCase('C09', 'Competidor con menos de 10 productos', 'se incluye con comparabilidad baja (no se rechaza)', few, (e) => e.include && e.comparability === 'baja');
  const prem = await crawl('http://127.0.0.1:4511', null, { keywords: st.keywords });
  evalCase('C10', 'Competidor premium (precios ~2,5 veces)', 'aspiracional, incluido', { ...prem, currency: 'COP', country: 'CO' }, (e) => e.type === 'aspiracional' && e.include);
  evalCase('C11', 'Competidor de otro país', 'referente, se conserva fuera de la comparación de precios', { ...shop, currency: 'COP', country: 'MX' }, (e) => e.type === 'referente' && !e.include);
  const usd = await crawl('http://127.0.0.1:4509', null, { keywords: st.keywords });
  evalCase('C13', 'Monedas diferentes (USD frente a COP)', 'no comparable sin tasa de cambio, se conserva como referencia', { ...usd, country: 'CO' }, (e) => e.comparability === 'no_comparable' && !e.include && usd.currency === 'USD');
  /* ---------- C. trabajos de punta a punta (servidor real + base de datos) ---------- */
  const EP = (await import('embedded-postgres')).default;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pgb-')); fs.chmodSync(parent, 0o777);
  const pg = new EP({ databaseDir: path.join(parent, 'd'), user: 't', password: 't', port: 54335, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start(); await pg.createDatabase('t');
  const log = []; const api = await mocks.anthropic(4199, log);
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '4330', DATABASE_URL: 'postgres://t:t@localhost:54335/t', ANTHROPIC_API_KEY: 'test', ANTHROPIC_BASE_URL: 'http://127.0.0.1:4199', SESSION_SECRET: 'b'.repeat(40), REFRESH_CRON: 'off', QUICK_PER_IP_DAY: '20', QUICK_COMP_TIMEOUT_MS: '8000' } });
  await sleep(2500);
  const { Client } = require('pg'); const db = new Client({ connectionString: 'postgres://t:t@localhost:54335/t' }); await db.connect();
  const B = 'http://localhost:4330/api';
  const start = async (url) => { const r = await fetch(B + '/quick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }); const j = await r.json(); return { org: j.org, cookie: (r.headers.get('set-cookie') || '').split(';')[0] }; };
  const call = (s, m, p, body) => fetch(B + '/quick/' + s.org + p, { method: m, headers: { cookie: s.cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
  const until = async (s, ok, max = 120) => { for (let i = 0; i < max; i++) { const st2 = await call(s, 'GET', '/status'); if (ok(st2)) return st2; if (['queued', 'running'].includes(st2.status)) await call(s, 'POST', '/pump').catch(() => {}); await sleep(300); } return call(s, 'GET', '/status'); };
  // C14: trabajo interrumpido
  {
    const t0 = Date.now(), ia0 = log.length;
    S[4512] = await mocks.store(4512, 'Caida', 30, 0, 0, 'waf');
    const s = await start('http://127.0.0.1:4501');
    await until(s, (x) => x.status === 'waiting');
    await call(s, 'POST', '/comps', { urls: ['http://127.0.0.1:4502', 'http://127.0.0.1:4503', 'http://127.0.0.1:4512'] });
    // simulamos que el proceso murió a mitad de una lectura: el trabajo quedó "running" con la concesión vencida y un competidor "leyendo"
    const j = (await db.query("select id, progress from tita.jobs where org_id = $1", [s.org]).catch(() => db.query("select id, progress from jobs where org_id = $1", [s.org]))).rows[0];
    j.progress.comps[0].read = { status: 'reading', at: new Date(Date.now() - 10 * 60e3).toISOString() };
    await db.query("update jobs set status = 'running', lease_until = now() - interval '1 minute', progress = $2 where id = $1", [j.id, j.progress]);
    const fin = await until(s, (x) => x.status === 'done' || x.status === 'failed', 200);
    const comps = (fin.progress || {}).comps || [];
    const ok = fin.status === 'done' && comps[0].read.status === 'failed' && /interrump/.test(comps[0].read.why) && comps[1].read.status !== 'failed';
    add({ id: 'J14', caso: 'Trabajo interrumpido', esperado: 'otro proceso retoma el trabajo vencido; la lectura cortada queda como pendiente y el análisis termina', obtenido: 'estado ' + fin.status + ' · ' + comps.map((c) => c.name + ': ' + c.read.status).join(', '), metodo: 'lease vencido + claim', productos: comps.filter((c) => c.include).length, motivo: comps[0].read.why || '—', ms: Date.now() - t0, ia: log.length - ia0, ok });
    // C15: reintento solo de lecturas fallidas
    const t1 = Date.now(), ia1 = log.length;
    S[4512].close(); S[4512] = await mocks.store(4512, 'Caida', 30, 0, 0);
    const r = await call(s, 'POST', '/retry', {});
    const fin2 = await until(s, (x) => x.status === 'done' || x.status === 'failed', 200);
    const c2 = (fin2.progress || {}).comps || [];
    add({ id: 'J15', caso: 'Reintento de lectura (solo las fallidas)', esperado: 'se reintentan solo las fallidas; las que ahora responden entran al análisis', obtenido: 'reintentadas ' + r.n + ' · ' + c2.map((c) => c.name + ': ' + c.read.status).join(', ') + ' · estado ' + fin2.status, metodo: '/retry', productos: c2.filter((c) => c.include).length, motivo: '—', ms: Date.now() - t1, ia: log.length - ia1, ok: r.n === 2 && fin2.status === 'done' && c2.filter((c) => c.include).length === 3 && c2.find((c) => /4512/.test(c.url)).read.status === 'ok' });
  }
  // C16: error de la API de IA
  {
    const t0 = Date.now(), ia0 = log.length;
    mocks.anthropic.failAll = true;
    const s = await start('http://127.0.0.1:4503');
    const st3 = await until(s, (x) => x.status !== 'queued' && x.status !== 'running', 200);
    mocks.anthropic.failAll = false;
    const p = st3.progress || {};
    add({ id: 'J16', caso: 'Error de API de IA (sobrecarga en todas las llamadas)', esperado: 'el catálogo se lee igual (no usa IA); la búsqueda web informa el error y el análisis espera al usuario con lo que hay (registro de tiendas verificadas o competidores a mano), sin caerse', obtenido: 'estado ' + st3.status + ' · fase ' + p.phase + ' · ' + (p.discoverError || st3.error || ''), metodo: (p.ownDiag || {}).method, productos: p.own || 0, motivo: p.discoverError || st3.error, ms: Date.now() - t0, ia: log.length - ia0, ok: st3.status === 'waiting' && ['need_comps', 'confirm_comps'].includes(p.phase) && /falló|no respondió/.test(p.discoverError || '') && p.own > 0 });
  }
  await db.end(); srv.kill(); api.close(); red.close(); Object.values(S).forEach((x) => x.close());
  await pg.stop();
  /* ---------- informe ---------- */
  fs.writeFileSync(path.join(__dirname, 'battery-results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  const md = ['# Resultados de la batería de QA', '', 'Generado por `node test/battery.js` el ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC, con servidores de prueba controlados (no tiendas reales).', '', '| Id | Caso | Esperado | Obtenido | Método | Productos válidos | Motivo o limitación | Tiempo | Llamadas a IA | Estado |', '|---|---|---|---|---|---|---|---|---|---|',
    ...results.map((r) => `| ${r.id} | ${r.caso} | ${r.esperado} | ${String(r.obtenido).replace(/\|/g, '/')} | ${String(r.metodo || '—').replace(/\|/g, '/')} | ${r.productos} | ${String(r.motivo || '—').replace(/\|/g, '/').slice(0, 160)} | ${(r.ms / 1000).toFixed(1)} s | ${r.ia} | ${r.ok ? 'Aprobado' : '**Falló**'} |`), '', `**${results.filter((r) => r.ok).length} de ${results.length} casos aprobados.**`, '',
    '## Otras suites', '', '- `test/math.js`: el modelo hedónico, el conjoint L18, Van Westendorp, diferencias en diferencias y la homologación por tamaño recuperan parámetros conocidos.', '- `test/crawl.js`: API de Shopify, sitemap + JSON-LD con robots.txt que bloquea la API, filtro por palabras, redirección, selector de país y dominio inexistente.', '- `test/e2e.js`: consola Tita, cuentas, roles, permisos (403 cruzados entre cuentas), publicación, aprobaciones y copiloto.', '- `test/quick.js`: análisis rápido completo en navegador: confirmación con verificación de dominios, referencias pendientes con motivo, competidores escritos a mano, catálogo por archivo, selector de país, registro de tiendas y límite por IP.', '- `test/ux.js`: 5 pantallas × 3 tamaños (390, 820 y 1440 px): sin desbordamiento horizontal, sin controles sin nombre, sin imágenes sin alt y sin texto con contraste menor a WCAG AA.', '',
    '## Pendiente: validación con tiendas reales', '', 'Estos casos se probaron con servidores controlados. La lectura de tiendas reales nuevas (contenido dinámico real, WAF reales, conectores autenticados con credenciales reales) requiere ejecutar la medición de cobertura (`server/bench.js`) en un despliegue con acceso a internet. No se declara aprobado lo que no se probó.', ''];
  fs.mkdirSync(path.join(__dirname, '..', '..', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', '..', 'docs', 'QA-RESULTADOS.md'), md.join('\n'));
  console.log(results.filter((r) => r.ok).length + '/' + results.length + ' aprobados');
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
