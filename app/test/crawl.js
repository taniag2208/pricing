// Prueba del lector de catálogos: API de Shopify, y sitemap + datos estructurados cuando robots.txt bloquea la API.
const mocks = require('./mocks');
process.env.CRAWLER_DELAY_MS = '5';
const { crawl } = require('../server/scrape');
(async () => {
  const a = await mocks.store(4401, 'Api', 30, 0, 0), b = await mocks.store(4402, 'Ld', 30, 0, 0, 'ld');
  const ra = await crawl('http://127.0.0.1:4401');
  const rb = await crawl('http://127.0.0.1:4402');
  const promo = rb.items.filter((x) => x.promo).length;
  const rk = await crawl('http://127.0.0.1:4402', null, { keywords: ['llavero'] });
  const ok = ra.platform === 'Shopify' && ra.items.length === 31 && /Sitemap/.test(rb.platform) && rb.items.length === 31 && rb.items.every((x) => x.price > 0 && x.label) && promo > 0 && rk.items.length === 31;
  console.log('api:', ra.platform, ra.items.length, '· sitemap:', rb.platform, rb.items.length, 'promos', promo, 'label', rb.items[0].label, '· filtro por palabra (<10 coincidencias → muestra completa):', rk.items.length);
  const rk2 = await crawl('http://127.0.0.1:4401', null, { keywords: ['tote'] });
  console.log('filtro API "tote":', rk2.items.length, 'de 31');
  const red = require('http').createServer((q, r) => { r.statusCode = 301; r.setHeader('Location', 'http://127.0.0.1:4401' + q.url); r.end(); }); await new Promise((r) => red.listen(4403, r));
  const rr = await crawl('http://127.0.0.1:4403');
  console.log('redirección 4403 → 4401:', rr.platform, rr.items.length, rr.origin);
  red.close();
  const sel = require('http').createServer((q, r) => { r.setHeader('Content-Type', 'text/html'); r.end('<html lang="es"><body><h1>¿En qué país quieres comprar?</h1><a href="http://127.0.0.1:4401/">COLOMBIA</a> <a href="http://127.0.0.1:4402/">MÉXICO</a></body></html>'); }); await new Promise((r) => sel.listen(4404, r));
  let selE = {}; try { await crawl('http://127.0.0.1:4404'); } catch (e) { selE = e; }
  console.log('selector de país:', selE.reason, (selE.countries || []).map((c) => c.label + ' ' + c.url).join(' | '));
  sel.close();
  let dead = ''; try { await crawl('http://127.0.0.1:4998'); } catch (e) { dead = e.code; }
  console.log('tienda inexistente:', dead);
  console.log(ok && rk2.items.length === 10 && dead === 'unreachable' && rr.items.length === 31 && rr.origin === 'http://127.0.0.1:4401' && selE.reason === 'country_selector' && selE.countries.length === 2 ? 'OK' : 'FALLÓ');
  a.close(); b.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
