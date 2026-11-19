// Registro de tiendas ya verificadas como legibles (por la medición semanal y por cada competidor leído con éxito).
// Complementa la búsqueda web: sugiere tiendas del mismo país que venden el mismo tipo de producto.
const { q } = require('./db');
const { keywordsOf } = require('./util');

const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return ''; } };
async function remember({ url, market, sector, platform, items, ok }) {
  const host = hostOf(url); if (!host) return;
  await q(`insert into stores_registry (host, url, market, sector, keywords, platform, n, ok, updated_at) values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8, now())
    on conflict (host) do update set url = excluded.url, market = coalesce(excluded.market, stores_registry.market), sector = coalesce(excluded.sector, stores_registry.sector),
    keywords = case when jsonb_array_length(excluded.keywords) > 0 then excluded.keywords else stores_registry.keywords end, platform = excluded.platform, n = excluded.n, ok = excluded.ok, updated_at = now()`,
  [host, url, market || null, sector || null, JSON.stringify(items ? keywordsOf(items) : []), platform || null, items ? items.length : 0, !!ok]).catch(() => {});
}
// Tiendas legibles del mismo mercado con más palabras de producto en común con la tienda propia.
async function suggest(market, ownKeywords, exclude, limit) {
  const rows = (await q('select host, url, sector, keywords from stores_registry where ok and market = $1', [market])).rows;
  const kw = new Set(ownKeywords || []);
  return rows.filter((r) => !exclude.has(r.host)).map((r) => ({ r, score: (r.keywords || []).filter((w) => kw.has(w)).length }))
    .filter((x) => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, limit || 6)
    .map(({ r }) => ({ name: r.host.split('.')[0].replace(/^\w/, (c) => c.toUpperCase()), url: r.url, category: r.sector || 'Ya verificada en otros análisis', source: 'registro' }));
}
module.exports = { remember, suggest, hostOf };
