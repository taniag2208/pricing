// Medición de cobertura: intenta leer el catálogo de una lista fija de tiendas reales y guarda el resultado.
// Corre cada lunes (cron semanal /api/cron?bench=1) y a pedido desde la consola de Tita.
const { q } = require('./db');
const { crawl } = require('./scrape');
const ai = require('./ai');

const STORES = [
  ['bosi.com.co', 'Calzado y marroquinería', 'CO'], ['mariohernandez.com.co', 'Calzado y marroquinería', 'CO'], ['velez.com.co', 'Calzado y marroquinería', 'CO'],
  ['stivali.com.co', 'Calzado y marroquinería', 'CO'], ['hushpuppies.com.co', 'Calzado y marroquinería', 'CO'], ['totto.com', 'Morrales y accesorios', 'CO'],
  ['arturocalle.com', 'Moda', 'CO'], ['studiof.com.co', 'Moda', 'CO'], ['offcorss.com', 'Moda infantil', 'CO'], ['tennis.com.co', 'Moda', 'CO'],
  ['gef.com.co', 'Moda', 'CO'], ['chevignon.com.co', 'Moda', 'CO'], ['americanino.com', 'Moda', 'CO'], ['koaj.co', 'Moda', 'CO'], ['leonisa.com', 'Ropa interior', 'CO'],
  ['adidas.co', 'Deportes', 'CO'], ['pepeganga.com', 'Juguetería', 'CO'], ['comodisimos.com', 'Colchones y descanso', 'CO'], ['colchonesparaiso.com', 'Colchones y descanso', 'CO'],
  ['colchoneseldorado.com', 'Colchones y descanso', 'CO'], ['jamar.com', 'Muebles y hogar', 'CO'], ['homecenter.com.co', 'Hogar y construcción', 'CO'], ['alkosto.com', 'Tecnología', 'CO'],
  ['ktronix.com', 'Tecnología', 'CO'], ['panamericana.com.co', 'Papelería y libros', 'CO'], ['exito.com', 'Tiendas por departamentos', 'CO'], ['falabella.com.co', 'Tiendas por departamentos', 'CO'],
  ['liverpool.com.mx', 'Tiendas por departamentos', 'MX'], ['coppel.com', 'Tiendas por departamentos', 'MX'], ['andrea.com', 'Calzado', 'MX'], ['flexi.com.mx', 'Calzado', 'MX'],
  ['cklass.com', 'Calzado', 'MX'], ['sanborns.com.mx', 'Tiendas por departamentos', 'MX'], ['elpalaciodehierro.com', 'Tiendas por departamentos', 'MX'], ['suburbia.com.mx', 'Moda', 'MX'],
  ['ripley.com.pe', 'Tiendas por departamentos', 'PE'], ['oechsle.pe', 'Tiendas por departamentos', 'PE'], ['platanitos.com', 'Calzado', 'PE'], ['promart.pe', 'Hogar y construcción', 'PE'],
  ['paris.cl', 'Tiendas por departamentos', 'CL'], ['ripley.cl', 'Tiendas por departamentos', 'CL'], ['hites.com', 'Tiendas por departamentos', 'CL'], ['falabella.com', 'Tiendas por departamentos', 'CL'],
];

async function run(budgetMs) {
  const t0 = Date.now(), end = t0 + (budgetMs || 260000);
  const results = [];
  const queue = [...STORES];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const [host, sector, market] = s, a = Date.now();
      const r = { host, sector, market };
      try {
        const res = await crawl('https://' + host, null, { maxPages: 1, sitemapMax: 12, textMax: 15, deadline: Math.min(end, a + 50000), ai: ai.configured() ? ai.facade({ kind: 'bench' }) : null });
        Object.assign(r, { ok: res.items.length >= 5, method: res.platform, n: res.items.length, reason: res.items.length >= 5 ? null : 'no_data' });
      } catch (e) { Object.assign(r, { ok: false, reason: e.code === 'unreachable' ? 'unreachable' : e.code === 'billing' ? 'ia_sin_saldo' : e.reason || 'error', detail: String(e.message).slice(0, 240) }); }
      r.ms = Date.now() - a;
      results.push(r);
      if (Date.now() > end) break;
    }
  };
  await Promise.all(Array.from({ length: 10 }, worker));
  const reach = results.filter((r) => r.reason !== 'unreachable');
  const summary = { tested: results.length, reachable: reach.length, ok: reach.filter((r) => r.ok).length, byMethod: {}, byReason: {} };
  reach.forEach((r) => { if (r.ok) summary.byMethod[r.method] = (summary.byMethod[r.method] || 0) + 1; else summary.byReason[r.reason] = (summary.byReason[r.reason] || 0) + 1; });
  summary.rate = reach.length ? summary.ok / reach.length : 0;
  await q('insert into bench_runs (summary, results) values ($1, $2::jsonb)', [summary, JSON.stringify(results)]);
  return { summary, results };
}
const latest = async () => (await q('select at, summary, results from bench_runs order by at desc limit 1')).rows[0] || null;
module.exports = { run, latest, STORES };
