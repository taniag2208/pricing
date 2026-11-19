// Prueba de punta a punta: Postgres embebido + servidor real + tiendas y API de Claude simuladas.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EmbeddedPostgres = require('embedded-postgres').default;
const { chromium } = require('playwright');
const mocks = require('./mocks');

const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'tita-e2e');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const errs = []; const log = [];
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-')); fs.chmodSync(parent, 0o777); const dir = path.join(parent, 'data');
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'tita', password: 'tita', port: 54329, persistent: false });
  await pg.initialise(); await pg.start(); await pg.createDatabase('tita');
  const stores = [await mocks.store(4101, 'Propia', 40, -0.08, 0.2), await mocks.store(4102, 'Alfa', 45, 0.05, 0.4), await mocks.store(4103, 'Beta', 40, -0.05, -0.3), await mocks.store(4104, 'Gama', 38, 0.1, 0.8)];
  const api = await mocks.anthropic(4199, log);
  const env = { ...process.env, PORT: '4300', DATABASE_URL: 'postgres://tita:tita@localhost:54329/tita', ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://127.0.0.1:4199', ADMIN_EMAIL: 'admin@titamedia.com', ADMIN_PASSWORD: 'Inicial12345', SESSION_SECRET: 'x'.repeat(40), REFRESH_CRON: 'off', ALLOW_PRIVATE_NETWORK: '1', LOG_SILENT: '1', CRAWLER_DELAY_MS: '20' };
  const srv = spawn(process.execPath, ['server/index.js'], { env, cwd: path.join(__dirname, '..') });
  srv.stdout.on('data', (d) => process.stdout.write('[srv] ' + d));
  srv.stderr.on('data', (d) => { process.stdout.write('[srv!] ' + d); });
  await sleep(2500);
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript(() => { for (const k of ['overview', 'market', 'advisor']) localStorage.setItem('tita-tour-' + k, '1'); }); const page = await ctx.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts|401/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  const step = async (name, fn) => { try { await fn(); } catch (e) { errs.push('STEP ' + name + ': ' + e.message.split('\n')[0]); await page.screenshot({ path: path.join(OUT, 'fail-' + name.replace(/\W+/g, '_') + '.png') }).catch(() => {}); } };
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const B = 'http://localhost:4300';

  await page.goto(B);
  await step('login admin', async () => { await page.click('text=Ingreso equipo Tita'); await page.fill('#lg-e', 'admin@titamedia.com'); await page.fill('#lg-p', 'Inicial12345'); await page.click('button:has-text("Entrar")'); });
  await step('pw admin', async () => { await page.fill('#cp-1', 'AdminTita2026!'); await page.fill('#cp-2', 'AdminTita2026!'); await page.click('button:has-text("Guardar y continuar")'); });
  await step('create org', async () => { await page.fill('#no-n', 'Cliente Demo'); await page.click('button:has-text("Crear y configurar")'); });
  await step('s0', async () => { await page.fill('#su-n', 'Marca Propia'); await page.fill('#su-u', 'http://127.0.0.1:4101'); await page.click('button:has-text("Continuar")'); });
  await step('own import', async () => { await page.waitForSelector('text=41 productos', { timeout: 30000 }); });
  await shot('a1-own');
  await step('s1', () => page.click('button:has-text("Continuar")'));
  for (const [n, port] of [['Alfa', 4102], ['Beta', 4103], ['Gama', 4104]]) await step('comp ' + n, async () => { await page.fill('#as-n', n); await page.fill('#as-u', 'http://127.0.0.1:' + port); await page.click('button:has-text("Agregar")'); await page.waitForTimeout(400); });
  await step('comps imported', () => page.waitForFunction(() => document.body.innerText.match(/Importación desde la URL · terminado/g)?.length >= 3, null, { timeout: 40000 }));
  await shot('a2-comps');
  await step('s2', () => page.click('button:has-text("Continuar")'));
  await step('propose', async () => { await page.click('button:has-text("Proponer categorías y rúbricas")'); await page.waitForSelector('button:has-text("Guardar categorías seleccionadas")', { timeout: 30000 }); await page.click('button:has-text("Guardar categorías seleccionadas")'); await page.waitForTimeout(600); });
  await shot('a3-cats');
  await step('s3', () => page.click('button:has-text("Continuar")'));
  await step('classify', async () => { await page.click('button:has-text("Clasificar todo")'); await page.waitForSelector('text=Clasificación · terminado', { timeout: 60000 }); await page.waitForSelector('text=163 de 163', { timeout: 20000 }); });
  await shot('a4-classified');
  await step('panel', () => page.click('button:has-text("Ir al panel")'));
  await page.waitForTimeout(1500); await shot('a5-overview');
  await step('users', async () => { await page.click('.side >> text=Usuarios'); await page.fill('#nu-n', 'Laura Cliente'); await page.fill('#nu-e', 'laura@cliente.com'); await page.click('button:has-text("Crear acceso")'); await page.waitForSelector('text=Contraseña temporal'); });
  const temp = await page.locator('.note .sel').first().textContent().catch(() => '');
  await step('viewer', async () => { await page.fill('#nu-n', 'Pedro Lector'); await page.fill('#nu-e', 'pedro@cliente.com'); await page.selectOption('#nu-r', 'viewer'); await page.click('button:has-text("Crear acceso")'); await page.waitForTimeout(500); });
  const tempV = await page.locator('.note .sel').first().textContent().catch(() => '');
  await shot('a6-users');
  await step('publish', async () => { await page.click('button:has-text("Publicar para el cliente")'); await page.click('.adminbar button:has-text("Confirmar")'); await page.waitForSelector('text=Publicada: el cliente la ve'); });
  await step('market admin', async () => { await page.click('.side >> text=Market Intelligence'); await page.waitForTimeout(500); });
  await shot('a7-market');
  // cliente
  const c2 = await b.newContext({ viewport: { width: 1440, height: 900 } }); await c2.addInitScript(() => { for (const k of ['overview', 'market', 'advisor']) localStorage.setItem('tita-tour-' + k, '1'); }); const cp = await c2.newPage(); cp.setDefaultTimeout(15000);
  cp.on('pageerror', (e) => errs.push('CLIENT PAGEERR ' + e.message));
  await cp.goto(B);
  await step('login client', async () => { await cp.click('text=Ingreso equipo Tita'); await cp.fill('#lg-e', 'laura@cliente.com'); await cp.fill('#lg-p', temp.trim()); await cp.click('button:has-text("Entrar")'); await cp.fill('#cp-1', 'ClienteSeguro2026'); await cp.fill('#cp-2', 'ClienteSeguro2026'); await cp.click('button:has-text("Guardar y continuar")'); await cp.waitForSelector('text=¿Qué está pasando con tus precios?'); });
  await cp.screenshot({ path: path.join(OUT, 'c1-overview.png') });
  const nav = await cp.locator('.side nav').innerText().catch(() => '');
  errs.push('client nav has admin items: ' + /Catálogo y clasificación|Configuración|Usuarios/.test(nav));
  await step('client advisor', async () => { await cp.click('.side >> text=Pricing Advisor'); await cp.click('.advgrid tbody tr >> nth=0'); await cp.locator('#sc-price').fill(String(await cp.locator('#sc-price').getAttribute('max'))); await cp.click('button:has-text("Enviar a aprobación")'); await cp.waitForTimeout(500); await cp.click('.tabs >> text=Bandeja de aprobación'); await cp.click('button:has-text("Aprobar")'); await cp.waitForSelector('text=aprobado'); });
  await cp.screenshot({ path: path.join(OUT, 'c2-approved.png') });
  await step('client copilot', async () => { await cp.click('.cpbtn'); await cp.fill('#cp-q', '¿Cómo vamos?'); await cp.press('#cp-q', 'Enter'); await cp.waitForSelector('text=Resumen recibido', { timeout: 15000 }); });
  await cp.screenshot({ path: path.join(OUT, 'c3-copilot.png') });
  // permisos por API
  const apiCheck = await cp.evaluate(async () => {
    const r1 = await fetch('/api/orgs/cliente-demo/docs/cats/x', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });
    const r2 = await fetch('/api/admin/orgs'); const r3 = await fetch('/api/orgs/otra/docs');
    const r4 = await fetch('/api/orgs/cliente-demo/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"type":"refresh"}' });
    return [r1.status, r2.status, r3.status, r4.status];
  });
  errs.push('client forbidden checks (cats PUT, admin list, other org, jobs) = ' + apiCheck.join(','));
  const c3 = await b.newContext(); await c3.addInitScript(() => { for (const k of ['overview', 'market', 'advisor']) localStorage.setItem('tita-tour-' + k, '1'); }); const vp = await c3.newPage(); vp.setDefaultTimeout(15000);
  await step('viewer login', async () => { await vp.goto(B); await vp.click('text=Ingreso equipo Tita'); await vp.fill('#lg-e', 'pedro@cliente.com'); await vp.fill('#lg-p', tempV.trim()); await vp.click('button:has-text("Entrar")'); await vp.fill('#cp-1', 'LectorSeguro2026'); await vp.fill('#cp-2', 'LectorSeguro2026'); await vp.click('button:has-text("Guardar y continuar")'); await vp.waitForTimeout(1500); });
  await vp.screenshot({ path: path.join(OUT, 'v1-viewer.png') });
  const vcheck = await vp.evaluate(async () => { const r = await (await fetch('/api/orgs/cliente-demo/docs')).json(); const colls = [...new Set(r.docs.map((d) => d.coll))]; const w = await fetch('/api/orgs/cliente-demo/docs/approvals/zz', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"name":"x"}' }); return { colls, write: w.status }; });
  errs.push('viewer sees colls: ' + vcheck.colls.join(',') + ' · viewer write approval: ' + vcheck.write);
  errs.push('anthropic calls: ' + log.length + ' · sample: ' + JSON.stringify(log[0]));
  console.log('\n' + errs.join('\n'));
  await b.close(); srv.kill(); stores.forEach((s) => s.close()); api.close(); await pg.stop();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
