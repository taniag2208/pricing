// Prueba de experiencia: responsive (móvil, tablet, escritorio) y accesibilidad básica sobre el flujo real del análisis rápido.
// Revisa en cada pantalla: desbordamiento horizontal, controles sin nombre accesible, imágenes sin alt y contraste de texto (WCAG AA).
const { spawn } = require('child_process');
const path = require('path'); const fs = require('fs'); const os = require('os');
const { chromium } = require('playwright');
const mocks = require('./mocks');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'tita-ux'); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWS = [['movil', 390, 844], ['tablet', 820, 1180], ['escritorio', 1440, 900]];

async function audit(page) {
  return page.evaluate(() => {
    const out = { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, unnamed: [], noAlt: 0, lowContrast: [] };
    const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || (el.labels && [...el.labels].map((l) => l.textContent).join(' ')) || el.getAttribute('placeholder') || '').trim();
    document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea').forEach((el) => {
      const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden') return;
      if (el.type === 'file' || el.closest('label')) { if (name(el.closest('label') || el)) return; }
      if (!name(el)) out.unnamed.push(el.outerHTML.slice(0, 90));
    });
    out.noAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length;
    const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b, a] = m.map(Number); if (a === 0) return null; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; const m = c.match(/[\d.]+/g); if (m && (m[3] === undefined || Number(m[3]) > 0.9)) return c; } return 'rgb(255,255,255)'; };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement; if (!el || seen.has(el) || !n.textContent.trim()) continue; seen.add(el);
      const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (el.closest('svg') || el.closest('button:disabled') || el.closest('[aria-hidden=true]')) continue;
      const fg = lum(st.color), bg = lum(bgOf(el)); if (fg == null || bg == null) continue;
      const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      const big = parseFloat(st.fontSize) >= 24 || (parseFloat(st.fontSize) >= 18.66 && Number(st.fontWeight) >= 700);
      if (ratio < (big ? 3 : 4.5)) out.lowContrast.push(n.textContent.trim().slice(0, 40) + ' (' + ratio.toFixed(2) + ')');
    }
    out.lowContrast = out.lowContrast.slice(0, 8);
    return out;
  });
}

(async () => {
  const EP = (await import('embedded-postgres')).default;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pgu-')); fs.chmodSync(parent, 0o777);
  const pg = new EP({ databaseDir: path.join(parent, 'd'), user: 't', password: 't', port: 54334, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start(); await pg.createDatabase('t');
  const stores = [await mocks.store(4101, 'Propia', 40, -0.08, 0.2), await mocks.store(4102, 'Alfa', 45, 0.05, 0.4), await mocks.store(4103, 'Beta', 40, -0.05, -0.3), await mocks.store(4104, 'Gama', 38, 0.1, 0.8)];
  const api = await mocks.anthropic(4199, []);
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '4320', DATABASE_URL: 'postgres://t:t@localhost:54334/t', ANTHROPIC_API_KEY: 'test', ANTHROPIC_BASE_URL: 'http://127.0.0.1:4199', SESSION_SECRET: 'u'.repeat(40), REFRESH_CRON: 'off', ALLOW_PRIVATE_NETWORK: '1', LOG_SILENT: '1', CRAWLER_DELAY_MS: '10', QUICK_PER_IP_DAY: '9', QUICK_COMP_TIMEOUT_MS: '4000' } });
  await sleep(2500);
  const b = await chromium.launch();
  const results = [];
  const record = async (page, screen, view) => { const a = await audit(page); await page.screenshot({ path: path.join(OUT, screen + '-' + view + '.png') }); results.push({ screen, view, ...a }); };
  // flujo completo una vez en escritorio, capturando cada pantalla en los tres tamaños
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const all = async (screen) => { for (const [v, w, h] of VIEWS) { await page.setViewportSize({ width: w, height: h }); await sleep(250); await record(page, screen, v); } await page.setViewportSize({ width: 1440, height: 900 }); };
  await page.goto('http://localhost:4320/'); await page.waitForSelector('#q-url');
  await all('1-landing');
  await page.fill('#q-url', 'http://127.0.0.1:4101'); await page.click('button:has-text("Analizar")');
  await page.waitForSelector('text=Confirma tu mercado', { timeout: 60000 });
  await all('2-confirmar');
  await page.click('button:has-text("Analizar con")');
  await page.waitForSelector('.procrow.run', { timeout: 60000 });
  await page.waitForSelector('text=Configura tu estrategia', { timeout: 90000 }).catch(() => {});
  await all('3-fases');
  await page.waitForSelector('text=¿Qué está pasando con tus precios?', { timeout: 120000 });
  await all('4-overview');
  await page.click('.side >> text=Pricing Advisor'); await page.waitForSelector('.advgrid tbody tr'); await page.click('.advgrid tbody tr >> nth=0'); await page.waitForSelector('.decision');
  await all('5-advisor');
  console.log(JSON.stringify(results.map((r) => ({ pantalla: r.screen, vista: r.view, desborde: r.overflow, sinNombre: r.unnamed.length, sinAlt: r.noAlt, bajoContraste: r.lowContrast.length, ejemplos: [...r.unnamed.slice(0, 2), ...r.lowContrast.slice(0, 3)] }))));
  console.log('errores de página: ' + errs.length + (errs.length ? ' · ' + errs[0] : ''));
  await b.close(); srv.kill(); stores.forEach((s) => s.close()); api.close(); await pg.stop(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
