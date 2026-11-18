// Trabajos en segundo plano: importar catálogos, proponer categorías, mapear etiquetas,
// clasificar y actualizar a diario. Se guardan en la tabla jobs y sobreviven a reinicios.
const cron = require('node-cron');
const { q } = require('./db');
const store = require('./store');
const ai = require('./ai');
const { crawl } = require('./scrape');
const { id, slug } = require('./util');
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
    await RUN.map({ ...job, id: job.id, params: {} });
    const prev = job.progress || {};
    let batches = prev.batches || 0, total = prev.done || 0, low = prev.low || 0, none = prev.none || 0;
    for (;;) {
      if (job.deadline && Date.now() > job.deadline - 110000) { await progress(job.id, { done: total, batches, low, none }); return { partial: true }; }
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
  // Análisis rápido desde un link: tienda → competidores (búsqueda web) → categorías → clasificación.
  async quick(job) {
    const org = job.org_id;
    const st = { ...(job.progress || {}) };
    const save = (patch) => { Object.assign(st, patch); return progress(job.id, st); };
    const phase = st.phase || 'own';
    const cap = (items, n) => (items.length <= n ? items : items.filter((_, i) => i % Math.ceil(items.length / n) === 0).slice(0, n));
    const owner = { orgId: org, userId: 'invitado' };
    if (phase === 'own') {
      const s = await store.get(org, 'stores', 'own');
      let res;
      try { res = await crawl(s.url, null, { maxPages: Number(process.env.QUICK_OWN_PAGES || 3) }); }
      catch (e) { throw new Error('No pudimos leer el catálogo público de ' + s.url + '. El análisis funciona con tiendas Shopify, WooCommerce o VTEX que publican su catálogo.'); }
      const items = cap(res.items, Number(process.env.QUICK_OWN_MAX || 90));
      if (items.length < 8) throw new Error('La tienda publica muy pocos productos (' + items.length + ') para analizar.');
      const chunks = await saveCatalog(org, 'own', items, 0);
      await store.put(org, 'stores', 'own', { ...s, n: items.length, total: res.items.length, chunks, platform: res.platform, importedAt: new Date().toISOString() }, 'sistema');
      await save({ phase: 'discover', own: items.length, ownTotal: res.items.length, platform: res.platform });
      return { partial: true };
    }
    if (phase === 'discover') {
      const s = await store.get(org, 'stores', 'own');
      const ws = await store.snapshot(org);
      const own = Object.values(ws.catalog).flatMap((c) => c.items || []);
      const labels = {}; own.forEach((p) => (labels[p.label] = (labels[p.label] || 0) + 1));
      const tld = (new URL(s.url).hostname.split('.').pop() || '').toLowerCase();
      const out = await ai.research('Eres analista de pricing de retail en Latinoamérica. Usa la búsqueda web para encontrar las tiendas online que compiten directamente con esta tienda.\n\n' +
        'Tienda: ' + s.url + ' (dominio .' + tld + ')\nCategorías del catálogo: ' + Object.entries(labels).sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x[0]).join(', ') + '\nEjemplos de productos y precios: ' + own.slice(0, 15).map((p) => p.name + ' (' + p.price + ')').join('; ') + '\n\n' +
        'Busca 6 a 8 marcas o tiendas competidoras directas: mismo país de venta, mismo tipo de producto y rango de precio parecido, con tienda online propia. Excluye marketplaces y tiendas por departamentos (Mercado Libre, Amazon, Falabella, Linio, Dafiti, Éxito, Liverpool, Ripley, Paris, Walmart, Shein) y la propia tienda.\n' +
        'Responde solo JSON: {"country": "CO"|"MX"|"PE"|"CL"|otro código ISO, "storeName": "nombre comercial de la tienda", "competitors": [{"name": "Marca", "url": "https://dominio-de-su-tienda"}]}', { ...owner, kind: 'quick-competitors', maxUses: 6 });
      const comps = (out.competitors || []).filter((c) => c && c.url && /^https?:\/\//.test(c.url)).slice(0, 8);
      if (!comps.length) throw new Error('No encontramos competidores para comparar.');
      const market = ['CO', 'MX', 'PE', 'CL'].includes(out.country) ? out.country : 'CO';
      await store.put(org, 'stores', 'own', { ...s, name: out.storeName || s.name }, 'sistema');
      await save({ phase: 'comps', candidates: comps, market, storeName: out.storeName || s.name });
      return { partial: true };
    }
    if (phase === 'comps') {
      const found = st.found || [], tried = st.tried || [];
      for (const c of st.candidates) {
        if (found.length >= Number(process.env.QUICK_COMPS || 5) || Date.now() > job.deadline - 40000) break;
        if (tried.includes(c.url)) continue;
        tried.push(c.url);
        try {
          const res = await crawl(c.url, null, { maxPages: 1 });
          if (res.items.length < 10) continue;
          let sid = slug(c.name); if (sid === 'own' || found.some((f) => f.sid === sid)) sid += '-' + found.length;
          const items = cap(res.items, Number(process.env.QUICK_COMP_MAX || 55));
          const chunks = await saveCatalog(org, sid, items, 0);
          await store.put(org, 'stores', sid, { name: c.name, url: res.origin, role: 'comp', n: items.length, chunks, platform: res.platform, importedAt: new Date().toISOString() }, 'sistema');
          found.push({ sid, name: c.name, n: items.length });
        } catch (e) { /* sin catálogo público: se omite */ }
        await save({ found, tried });
      }
      const pending = st.candidates.some((c) => !tried.includes(c.url)) && found.length < Number(process.env.QUICK_COMPS || 5);
      if (pending) return { partial: true };
      if (!found.length) throw new Error('Ninguno de los competidores encontrados publica un catálogo que podamos leer. Prueba con otra tienda.');
      await save({ phase: 'cats' });
      return { partial: true };
    }
    if (phase === 'cats') {
      const ws = await store.snapshot(org);
      const own = Object.values(ws.catalog).filter((c) => c.sid === 'own').flatMap((c) => c.items || []);
      const comps = Object.values(ws.catalog).filter((c) => c.sid !== 'own').flatMap((c) => c.items || []);
      const cats = (await I.proposeCategories(ai.facade({ ...owner, kind: 'quick-categories' }), own, comps, { storeName: st.storeName || '' })).slice(0, Number(process.env.QUICK_CATS || 3));
      for (const c of cats) await store.put(org, 'cats', c.id, { ...c, origin: 'ia', createdAt: new Date().toISOString() }, 'sistema');
      await store.put(org, 'ws', 'config', { storeName: st.storeName || '', market: st.market || 'CO', objective: 'competitividad', comps: (st.found || []).map((f) => f.sid), cats: cats.map((c) => c.id), attrsOff: {}, franjas: {}, policy: { minMargin: 0.55, promoMinMargin: 0.35, rounding: 'psico', maxChange: 0.12 }, setupDone: false, step: 4, measured: null }, 'sistema');
      await save({ phase: 'classify', cats: cats.map((c) => c.name) });
      return { partial: true };
    }
    if (phase === 'classify') {
      await RUN.map({ ...job, id: 'sin-progreso', params: {} });
      for (;;) {
        const ws = await store.snapshot(org);
        const cats = catsOf(ws);
        const active = activeStores(ws), lm = I.labelMap(ws), cm = I.classMap(ws), items = I.allItems(ws);
        const queue = Object.values(items).filter((it) => active.includes(it.sid) && !cm[it.pid] && lm[it.sid + '|' + it.label] != null);
        const done = Object.values(items).filter((it) => cm[it.pid]).length;
        await save({ classified: done, left: queue.length });
        if (!queue.length) break;
        if (Date.now() > job.deadline - 120000) return { partial: true };
        const batches = [];
        for (let i = 0; i < Math.min(3, Math.ceil(queue.length / BATCH)); i++) batches.push(queue.slice(i * BATCH, (i + 1) * BATCH).map((p) => ({ ...p, id: p.pid })));
        const results = await Promise.allSettled(batches.map((b) => I.classifyBatch(ai.facade({ ...owner, kind: 'quick-classify' }), cats, b)));
        let wrote = 0;
        for (let i = 0; i < batches.length; i++) {
          if (results[i].status !== 'fulfilled') continue;
          const out = {}; batches[i].forEach((p) => { if (results[i].value[p.id]) out[p.id] = results[i].value[p.id]; });
          if (Object.keys(out).length) { await store.put(org, 'cls', 'b-' + Date.now() + '-' + i, { at: new Date().toISOString(), by: 'sistema', items: out }, 'sistema'); wrote++; }
        }
        if (!wrote) throw new Error('Claude no pudo clasificar los productos. Intenta de nuevo en unos minutos.');
      }
      const cfg = await store.get(org, 'ws', 'config');
      await store.put(org, 'ws', 'config', { ...cfg, setupDone: true }, 'sistema');
      await save({ phase: 'done' });
      return { done: true };
    }
    return { done: true };
  },
  async refresh(job) {
    const org = job.org_id;
    const ws = await store.snapshot(org);
    let n = 0;
    for (const sid of activeStores(ws)) { if ((ws.stores[sid] || {}).url) { await enqueue(org, 'ingest', { sid }, 'sistema'); n++; } }
    if (catsOf(ws).length) await enqueue(org, 'classify', {}, 'sistema');
    return { stores: n, queued: true };
  },
};

// Ejecución por pasos con candado: sirve igual en un servidor encendido y en funciones serverless.
const BUDGET = Number(process.env.JOB_BUDGET_MS || (process.env.VERCEL ? 240000 : 3600000));
async function claim(org) {
  const r = await q(`update jobs set status = 'running', lease_until = now() + ($2 || ' milliseconds')::interval, updated_at = now() where id = (
      select id from jobs j where (status = 'queued' or (status = 'running' and lease_until < now()))
        and ($1::text is null or org_id = $1)
        and not exists (select 1 from jobs k where k.org_id = j.org_id and k.id <> j.id and k.status = 'running' and k.lease_until >= now())
      order by created_at limit 1 for update skip locked) returning *`, [org || null, String(BUDGET + 60000)]);
  return r.rows[0];
}
async function step(org) {
  const job = await claim(org);
  if (!job) return null;
  job.deadline = Date.now() + BUDGET;
  try {
    const result = await RUN[job.type](job);
    if (result && result.partial) await q("update jobs set status = 'queued', lease_until = null, updated_at = now() where id = $1", [job.id]);
    else await q("update jobs set status = 'done', lease_until = null, progress = progress || $2, updated_at = now() where id = $1", [job.id, { result }]);
  } catch (e) {
    const msg = e && e.code === 'billing' ? 'El análisis no pudo usar Claude: la cuenta de Anthropic de Tita no tiene saldo. Avísale al equipo de Tita.' : String((e && (e.message || e.code)) || e);
    await q("update jobs set status = 'failed', lease_until = null, error = $2, updated_at = now() where id = $1", [job.id, msg.slice(0, 500)]);
    if (job.type === 'ingest' && job.params.sid) { const s = await store.get(job.org_id, 'stores', job.params.sid).catch(() => null); if (s) await store.put(job.org_id, 'stores', job.params.sid, { ...s, lastError: e.message, lastAttempt: new Date().toISOString() }, 'sistema').catch(() => {}); }
  }
  return job.id;
}
// Pasos seguidos hasta agotar el tiempo disponible (cron de Vercel o llamada de la consola)
async function drain(org, ms) {
  const until = Date.now() + ms; let n = 0;
  while (Date.now() < until - 5000) { const id = await step(org); if (!id) break; n++; }
  return n;
}
async function enqueueRefreshAll() {
  await q("delete from orgs where kind = 'quick' and expires_at < now()").catch(() => {});
  const r = await q("select id from orgs where published and kind = 'client'");
  for (const o of r.rows) await enqueue(o.id, 'refresh', {}, 'sistema');
  return r.rows.length;
}

let busy = 0;
function start() {
  const CONC = Number(process.env.JOB_CONCURRENCY || 2);
  setInterval(() => { if (busy >= CONC) return; busy++; step(null).catch(() => {}).finally(() => { busy--; }); }, 3000);
  const when = process.env.REFRESH_CRON || '17 5 * * *';
  if (when !== 'off') cron.schedule(when, () => enqueueRefreshAll().catch(() => {}), { timezone: process.env.TZ || 'America/Bogota' });
}

module.exports = { enqueue, start, step, drain, enqueueRefreshAll, RUN };
