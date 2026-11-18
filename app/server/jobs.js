// Trabajos en segundo plano: importar catálogos, proponer categorías, mapear etiquetas,
// clasificar y actualizar a diario. Se guardan en la tabla jobs y sobreviven a reinicios.
const cron = require('node-cron');
const { q } = require('./db');
const store = require('./store');
const ai = require('./ai');
const { crawl } = require('./scrape');
const { id } = require('./util');
const TP = require('./shared');
const I = TP.ingest;

const CHUNK = 150;
const BATCH = Number(process.env.CLASSIFY_BATCH || 40);
const MAX_BATCHES = Number(process.env.CLASSIFY_MAX_BATCHES || 150);
const CONCURRENCY = Number(process.env.JOB_CONCURRENCY || 2);

async function enqueue(org, type, params, by) {
  const open = await q("select id from jobs where org_id = $1 and type = $2 and status in ('queued','running') and params = $3", [org, type, params || {}]);
  if (open.rows[0]) return open.rows[0].id;
  const jid = id('j_');
  await q('insert into jobs (id, org_id, type, params, created_by) values ($1,$2,$3,$4,$5)', [jid, org, type, params || {}, by || null]);
  setImmediate(tick);
  return jid;
}
const progress = (jid, p) => q('update jobs set progress = $2, updated_at = now() where id = $1', [jid, p]);

const cfgOf = (ws) => ({ comps: [], cats: [], ...(ws.ws.config || {}) });
const catsOf = (ws) => { const c = cfgOf(ws); return Object.entries(ws.cats).map(([k, v]) => ({ ...v, id: k })).filter((x) => c.cats.includes(x.id)).sort((a, b) => (a.order || 0) - (b.order || 0)); };
const activeStores = (ws) => ['own', ...cfgOf(ws).comps.filter((s) => ws.stores[s])];

async function saveCatalog(org, sid, items, prevChunks) {
  const n = Math.ceil(items.length / CHUNK);
  for (let k = 0; k < n; k++) await store.put(org, 'catalog', sid + '-' + k, { sid, k, items: items.slice(k * CHUNK, (k + 1) * CHUNK) }, 'sistema');
  for (let k = n; k < (prevChunks || 0); k++) await store.del(org, 'catalog', sid + '-' + k, 'sistema');
  return n;
}

const RUN = {
  async ingest(job) {
    const org = job.org_id, sid = job.params.sid;
    const s = await store.get(org, 'stores', sid);
    if (!s || !s.url) throw new Error('La tienda no tiene URL.');
    const res = await crawl(s.url, (p) => progress(job.id, p));
    const ws = await store.snapshot(org);
    const prev = Object.fromEntries(Object.values(ws.catalog).filter((c) => c.sid === sid).flatMap((c) => c.items || []).map((p) => [p.id, p]));
    const at = new Date().toISOString();
    const changes = [];
    res.items.forEach((p) => { const o = prev[p.id]; if (o && (o.price !== p.price || (o.promo || null) !== (p.promo || null))) changes.push({ id: p.id, name: p.name, at, from: o.price, to: p.price, promoFrom: o.promo || null, promoTo: p.promo || null }); });
    const chunks = await saveCatalog(org, sid, res.items, s.chunks || 0);
    await store.put(org, 'stores', sid, { ...s, n: res.items.length, chunks, platform: res.platform, importedAt: at, lastError: null, newItems: res.items.filter((p) => !prev[p.id]).length, formats: [...new Set([...(s.formats || []), res.platform + ' (automático)'])] }, 'sistema');
    if (changes.length) { const h = (await store.get(org, 'history', sid)) || { changes: [] }; await store.put(org, 'history', sid, { changes: [...changes, ...h.changes].slice(0, 800) }, 'sistema'); }
    return { platform: res.platform, items: res.items.length, pages: res.pages, priceChanges: changes.length };
  },
  async propose(job) {
    const org = job.org_id;
    const ws = await store.snapshot(org);
    const own = Object.values(ws.catalog).filter((c) => c.sid === 'own').flatMap((c) => c.items || []);
    if (!own.length) throw new Error('Primero importa el catálogo de la tienda propia.');
    const comps = Object.values(ws.catalog).filter((c) => c.sid !== 'own').flatMap((c) => c.items || []).slice(0, 1500);
    const cats = await I.proposeCategories(ai.facade({ orgId: org, userId: job.created_by, kind: 'propose' }), own, comps, { storeName: (ws.stores.own || {}).name || '' });
    await store.put(org, 'drafts', 'categories', { at: new Date().toISOString(), cats }, job.created_by);
    return { categories: cats.length };
  },
  async map(job) {
    const org = job.org_id;
    const ws = await store.snapshot(org);
    const cats = catsOf(ws);
    if (!cats.length) throw new Error('No hay categorías activas.');
    const active = activeStores(ws), lm = I.labelMap(ws), items = I.allItems(ws);
    const g = {};
    Object.values(items).forEach((it) => { if (!active.includes(it.sid)) return; const k = it.sid + '|' + it.label; if (k in lm) return; (g[k] = g[k] || { key: k, store: (ws.stores[it.sid] || {}).name, label: it.label, n: 0, examples: [] }); g[k].n++; if (g[k].examples.length < 4) g[k].examples.push(it.name); });
    const groups = Object.values(g);
    let done = 0;
    for (let i = 0; i < groups.length; i += 120) {
      const part = groups.slice(i, i + 120);
      const m = await I.mapLabels(ai.facade({ orgId: org, userId: job.created_by, kind: 'map' }), part, cats);
      part.forEach((x) => { if (!(x.key in m)) m[x.key] = 'mixed'; });
      await store.put(org, 'labelmap', 'ia-' + Date.now(), { at: new Date().toISOString(), items: m }, 'sistema');
      done += part.length; await progress(job.id, { labels: done, total: groups.length });
    }
    return { labels: groups.length };
  },
  async classify(job) {
    const org = job.org_id;
    let ws = await store.snapshot(org);
    const cats = catsOf(ws);
    if (!cats.length) throw new Error('No hay categorías activas.');
    await RUN.map({ ...job, params: {} });
    let batches = 0, total = 0, low = 0, none = 0;
    for (;;) {
      ws = await store.snapshot(org);
      const active = activeStores(ws), lm = I.labelMap(ws), cm = I.classMap(ws), items = I.allItems(ws);
      const queue = Object.values(items).filter((it) => active.includes(it.sid) && !cm[it.pid] && lm[it.sid + '|' + it.label] != null);
      if (!queue.length || batches >= (job.params.maxBatches || MAX_BATCHES)) { await progress(job.id, { done: total, left: queue.length, batches, low, none }); break; }
      const own = queue.filter((it) => it.sid === 'own');
      const batch = (own.length ? own : queue).slice(0, BATCH);
      let res;
      const keyed = batch.map((p) => ({ ...p, id: p.pid }));
      try { res = await I.classifyBatch(ai.facade({ orgId: org, userId: job.created_by, kind: 'classify' }), cats, keyed); }
      catch (e) { if (e.code === 'invalid_json' && keyed.length > 5) { res = await I.classifyBatch(ai.facade({ orgId: org, userId: job.created_by, kind: 'classify' }), cats, keyed.slice(0, Math.ceil(keyed.length / 2))); } else throw e; }
      const out = {};
      batch.forEach((p) => { if (res[p.pid]) out[p.pid] = res[p.pid]; });
      if (!Object.keys(out).length) throw new Error('Claude no devolvió clasificaciones para el lote.');
      await store.put(org, 'cls', 'b-' + Date.now(), { at: new Date().toISOString(), by: 'sistema', items: out }, 'sistema');
      batches++; total += Object.keys(out).length; low += Object.values(out).filter((x) => x.conf === 'baja').length; none += Object.values(out).filter((x) => !x.cat).length;
      await progress(job.id, { done: total, left: queue.length - Object.keys(out).length, batches, low, none });
    }
    return { classified: total, batches, low, none };
  },
  async refresh(job) {
    const org = job.org_id;
    const ws = await store.snapshot(org);
    const out = { stores: 0, errors: [] };
    for (const sid of activeStores(ws)) {
      if (!(ws.stores[sid] || {}).url) continue;
      try { await RUN.ingest({ ...job, params: { sid } }); out.stores++; }
      catch (e) { out.errors.push(sid + ': ' + e.message); const s = await store.get(org, 'stores', sid); if (s) await store.put(org, 'stores', sid, { ...s, lastError: e.message, lastAttempt: new Date().toISOString() }, 'sistema'); }
      await progress(job.id, out);
    }
    if (catsOf(await store.snapshot(org)).length) out.classify = await RUN.classify({ ...job, params: {} });
    return out;
  },
};

let running = 0;
async function tick() {
  if (running >= CONCURRENCY) return;
  const r = await q(`update jobs set status = 'running', updated_at = now() where id = (
      select id from jobs j where status = 'queued' and not exists (select 1 from jobs k where k.org_id = j.org_id and k.status = 'running')
      order by created_at limit 1 for update skip locked) returning *`).catch(() => ({ rows: [] }));
  const job = r.rows[0];
  if (!job) return;
  running++;
  (async () => {
    try {
      const result = await RUN[job.type](job);
      await q("update jobs set status = 'done', progress = progress || $2, updated_at = now() where id = $1", [job.id, { result }]);
    } catch (e) {
      await q("update jobs set status = 'failed', error = $2, updated_at = now() where id = $1", [job.id, String((e && (e.message || e.code)) || e).slice(0, 500)]);
      if (job.type === 'ingest' && job.params.sid) { const s = await store.get(job.org_id, 'stores', job.params.sid).catch(() => null); if (s) await store.put(job.org_id, 'stores', job.params.sid, { ...s, lastError: e.message, lastAttempt: new Date().toISOString() }, 'sistema').catch(() => {}); }
    } finally { running--; setImmediate(tick); }
  })();
  setImmediate(tick);
}

function start() {
  q("update jobs set status = 'queued' where status = 'running'").catch(() => {});
  setInterval(tick, 3000);
  const when = process.env.REFRESH_CRON || '17 5 * * *';
  if (when !== 'off') cron.schedule(when, async () => {
    const r = await q('select id from orgs where published');
    for (const o of r.rows) await enqueue(o.id, 'refresh', {}, 'sistema');
  }, { timezone: process.env.TZ || 'America/Bogota' });
}

module.exports = { enqueue, start, RUN };
