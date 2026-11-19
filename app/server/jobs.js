// Trabajos en segundo plano: importar catálogos, proponer categorías, mapear etiquetas,
// clasificar y actualizar a diario. Se guardan en la tabla jobs y sobreviven a reinicios.
const cron = require('node-cron');
const { q } = require('./db');
const store = require('./store');
const ai = require('./ai');
const { crawl } = require('./scrape');
const { id, slug } = require('./util');
const TP = require('./shared');
const registry = require('./registry');
const { keywordsOf } = require('./util');
const I = TP.ingest;

const CHUNK = 150;
const COUNTRY = { co: ['CO', 'Colombia', 'pesos colombianos (COP)'], mx: ['MX', 'México', 'pesos mexicanos (MXN)'], pe: ['PE', 'Perú', 'soles (PEN)'], cl: ['CL', 'Chile', 'pesos chilenos (CLP)'] };
const saleOf = (p) => (p.promo && p.promo < p.price ? p.promo : p.price);
const medianOf = (a) => { const s = a.filter((x) => x > 0).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
// Motivo legible de por qué no se pudo leer una tienda.
const failWhy = (e) => (e.code === 'timeout' ? 'tardó demasiado en responder' : e.reason && require('./scrape').REASON_MSG[e.reason] ? require('./scrape').REASON_MSG[e.reason] : (require('./scrape').USER_MSG[e.code] || 'no se pudo leer'));
// Límite duro de tiempo por tienda: una tienda lenta no puede detener el análisis.
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('Tiempo agotado'), { code: 'timeout' })), ms))]);
const MARKETS = ['CO', 'MX', 'PE', 'CL'];
const COUNTRY_BY_TLD = (host) => { const t = (host.match(/\.(?:com\.)?([a-z]{2})$/) || [])[1]; return t && COUNTRY[t] ? COUNTRY[t][0] : null; };
const { USER_MSG, REASON_MSG, METHOD_LABEL } = require('./scrape');
const { resolveHost, safeFetch } = require('./net');

// Diagnóstico sin datos técnicos sensibles, para guardar y mostrar.
const publicDiag = (d) => (d ? { stage: d.stage, status: d.status || null, code: d.code || null, reason: d.reason || null, origin: d.origin || null, platform: d.platform || null, method: d.method || null, methodLabel: METHOD_LABEL[d.method] || null, currency: d.currency || null, country: d.country || null, found: d.found || 0, priced: d.priced || 0, categories: d.categories || 0, pages: d.pages || 0, ms: d.ms || null, robots: d.robots || null, warnings: (d.warnings || []).slice(0, 8), attempts: (d.attempts || []).map((a) => ({ level: a.level, label: a.label, status: a.status, detail: String(a.detail || '').slice(0, 160), ms: a.ms || null })), at: d.finishedAt || d.startedAt || null } : null);

// Verificación rápida de un dominio propuesto: existe (DNS) y responde (página de inicio).
async function verifyDomain(url) {
  try {
    const u = new URL(url);
    const h = await resolveHost(u.hostname);
    if (!h.ok) return h.code === 'blocked_destination' ? 'blocked' : 'dns_not_found';
    const r = await safeFetch(u.origin + '/', { timeout: 8000, retries: 0, maxBytes: 300000, headers: { 'User-Agent': require('./scrape').UA, Accept: 'text/html' } });
    return r.status < 500 ? 'ok' : 'http_' + r.status;
  } catch (e) { return e.code === 'timeout' ? 'timeout' : e.code === 'blocked_destination' ? 'blocked' : 'unreachable'; }
}

// Evaluación de un competidor leído. Tres preguntas separadas:
//   A. ¿es relevante comercialmente?  → coincidencia de vocabulario de producto, posicionamiento por precio, mercado
//   B. ¿se pudo leer?                  → método, productos, moneda (registro read)
//   C. ¿hay suficientes comparables?   → productos relacionados con el catálogo propio
// Nunca se rechaza por nivel de precio ni por pocos productos: se clasifica y se explica.
function evaluateCompetitor(st, c, res) {
  const kwOwn = st.keywords || [];
  const kwComp = keywordsOf(res.items);
  const shared = kwOwn.filter((w) => kwComp.includes(w));
  const overlap = kwOwn.length ? shared.length / Math.min(kwOwn.length, 15) : 0;
  const related = res.items.length; // ya filtrados por las palabras del catálogo propio al leer
  const sameCurrency = !st.currency || !res.currency || st.currency === res.currency;
  const sameCountry = !st.country || !res.country || st.country === res.country;
  const rawRatio = st.ownMed ? medianOf(res.items.map(saleOf)) / st.ownMed : null;
  // Si una de las monedas no se pudo confirmar y la escala difiere más de 15 veces, lo más probable es otra moneda o unidad: no se compara.
  const scaleOff = rawRatio != null && (!st.currency || !res.currency) && (rawRatio < 1 / 15 || rawRatio > 15);
  const ratio = sameCurrency && !scaleOff ? rawRatio : null;
  const big = (res.found || 0) > 600 && kwComp.length >= 20;
  let type;
  if (!sameCountry) type = 'referente';
  else if (big && overlap < 0.5) type = 'referente';
  else if (overlap < 0.2) type = 'indirecto';
  else if (ratio != null && ratio > 1.6) type = 'aspiracional';
  else if (ratio != null && ratio < 0.6) type = 'económico';
  else type = 'directo';
  const comparability = !sameCurrency || scaleOff ? 'no_comparable' : !sameCountry ? 'otro_mercado' : related >= 20 ? 'alta' : related >= 10 ? 'media' : related >= 1 ? 'baja' : 'sin_productos';
  // Puntaje de evidencia: suma de evidencias verificadas, cada una explicada (no es una probabilidad).
  const evidence = [];
  let score = 0;
  const add = (pts, txt) => { score += pts; evidence.push(txt); };
  if (c.verified === 'ok') add(0.1, 'el dominio existe y responde');
  add(0.15, 'catálogo leído con ' + (METHOD_LABEL[res.method] || res.method));
  add(Math.min(0.35, overlap * 0.35), shared.length ? 'comparte vocabulario de producto: ' + shared.slice(0, 6).join(', ') : 'casi no comparte vocabulario de producto');
  if (sameCurrency && st.currency) add(0.15, 'precios en ' + st.currency + ', igual que tu tienda');
  else if (!sameCurrency) evidence.push('precios en ' + res.currency + ' (tu tienda en ' + st.currency + '): no se comparan sin una tasa de cambio');
  if (sameCountry && st.country && res.country) add(0.1, 'vende en el mismo país (' + res.country + ')');
  else if (!sameCountry) evidence.push('vende en otro país (' + res.country + ')');
  add(related >= 20 ? 0.15 : related >= 10 ? 0.1 : related >= 1 ? 0.05 : 0, related + ' productos relacionados con tu catálogo');
  if (scaleOff) evidence.push('la escala de precios es ' + (rawRatio > 1 ? Math.round(rawRatio) + ' veces mayor' : Math.round(1 / rawRatio) + ' veces menor') + ' que la tuya y no se pudo confirmar la moneda: probablemente otra moneda o unidad');
  if (ratio != null) evidence.push('precio mediano ' + (ratio >= 1 ? Math.round((ratio - 1) * 100) + ' % más alto' : Math.round((1 - ratio) * 100) + ' % más bajo') + ' que el tuyo');
  const include = sameCurrency && !scaleOff && sameCountry && related >= 1;
  return {
    read: { status: res.diag && res.diag.status === 'partial' ? 'partial' : 'ok', method: res.method, methodLabel: METHOD_LABEL[res.method] || res.method, found: res.found || res.items.length, related, currency: res.currency || null, country: res.country || null, at: new Date().toISOString() },
    type, comparability, confidence: Math.round(Math.min(1, score) * 100) / 100, evidence, include,
    note: !include ? (!sameCurrency ? 'Se conserva como referencia: otra moneda.' : scaleOff ? 'Se conserva como referencia: precios en otra escala o moneda.' : !sameCountry ? 'Se conserva como referencia: otro país.' : 'Sin productos comparables con tu catálogo.') : comparability === 'baja' ? 'Pocos productos comparables: sus resultados son orientativos.' : null,
  };
}
const compSummary = (comps) => comps.map((c) => ({ name: c.name, url: c.url, sid: c.sid || null, source: c.source, verified: c.verified, type: c.type || null, comparability: c.comparability || null, confidence: c.confidence || null, include: !!c.include, note: c.note || null, evidence: c.evidence || [], read: c.read }));

const BATCH = Number(process.env.CLASSIFY_BATCH || ((process.env.AI_PROVIDER || '').toLowerCase() === 'gateway' ? 20 : 40));
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
    let last = 0;
    const res = await crawl(s.url, ({ diag }) => { if (Date.now() - last > 1500) { last = Date.now(); progress(job.id, { diag: publicDiag(diag) }).catch(() => {}); } });
    const ws = await store.snapshot(org);
    const prev = Object.fromEntries(Object.values(ws.catalog).filter((c) => c.sid === sid).flatMap((c) => c.items || []).map((p) => [p.id, p]));
    const at = new Date().toISOString();
    const changes = [];
    res.items.forEach((p) => { const o = prev[p.id]; if (o && (o.price !== p.price || (o.promo || null) !== (p.promo || null))) changes.push({ id: p.id, name: p.name, at, from: o.price, to: p.price, promoFrom: o.promo || null, promoTo: p.promo || null }); });
    const chunks = await saveCatalog(org, sid, res.items, s.chunks || 0);
    await store.put(org, 'stores', sid, { ...s, n: res.items.length, chunks, platform: res.platform || METHOD_LABEL[res.method], method: res.method, currency: res.currency, country: res.country, diag: publicDiag(res.diag), importedAt: at, lastError: null, newItems: res.items.filter((p) => !prev[p.id]).length, formats: [...new Set([...(s.formats || []), (res.platform || METHOD_LABEL[res.method]) + ' (automático)'])] }, 'sistema');
    if (changes.length) { const h = (await store.get(org, 'history', sid)) || { changes: [] }; await store.put(org, 'history', sid, { changes: [...changes, ...h.changes].slice(0, 800) }, 'sistema'); }
    return { platform: res.platform || METHOD_LABEL[res.method], method: res.method, items: res.items.length, pages: res.pages, status: res.diag.status, priceChanges: changes.length };
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
      if (!Object.keys(out).length) throw new Error('La IA no devolvió clasificaciones para el lote.');
      await store.put(org, 'cls', 'b-' + Date.now(), { at: new Date().toISOString(), by: 'sistema', items: out }, 'sistema');
      batches++; total += Object.keys(out).length; low += Object.values(out).filter((x) => x.conf === 'baja').length; none += Object.values(out).filter((x) => !x.cat).length;
      await progress(job.id, { done: total, left: queue.length - Object.keys(out).length, batches, low, none });
    }
    return { classified: total, batches, low, none };
  },
  // Análisis rápido desde un link: tienda → competidores (búsqueda + verificación) → confirmación → lectura y evaluación → categorías → clasificación.
  async quick(job) {
    const org = job.org_id;
    const st = { ...(job.progress || {}) };
    const save = (patch) => { Object.assign(st, patch); return progress(job.id, st); };
    const phase = st.phase || 'own';
    const cap = (items, n) => (items.length <= n ? items : items.filter((_, i) => i % Math.ceil(items.length / n) === 0).slice(0, n));
    const owner = { orgId: org, userId: 'invitado' };
    if (phase === 'own') {
      const s = await store.get(org, 'stores', 'own');
      let res, lastSave = 0;
      const onProgress = ({ diag }) => { if (Date.now() - lastSave > 1500) { lastSave = Date.now(); save({ ownDiag: publicDiag(diag) }).catch(() => {}); } };
      try { res = await withTimeout(crawl(s.url, onProgress, { maxPages: Number(process.env.QUICK_OWN_PAGES || 3), sitemapMax: Number(process.env.QUICK_OWN_MAX || 90), deadline: job.deadline - 60000, ai: ai.facade({ ...owner, kind: 'quick-extract' }) }), 170000); }
      catch (e) {
        if (['billing', 'ai_limit'].includes(e.code)) throw e;
        // Sin salida automática: el usuario puede corregir la dirección, elegir país o subir el catálogo; el análisis no termina en error.
        const asked = TP.ingest.hostOf(s.url), real = e.diag && e.diag.origin ? TP.ingest.hostOf(e.diag.origin) : asked;
        await save({ phase: 'need_own', reason: e.code === 'country_selector' ? 'country_selector' : e.reason || e.code || 'no_catalog', code: e.code || 'no_catalog', redirect: real !== asked ? real : null, countries: e.countries || null, ownDiag: publicDiag(e.diag || { stage: 'failed', code: e.code || 'timeout', attempts: [] }) });
        return { wait: true };
      }
      const items = cap(res.items, Number(process.env.QUICK_OWN_MAX || 90));
      const diag = publicDiag(res.diag);
      if (items.length < 8) { await save({ phase: 'need_own', reason: 'too_few', code: 'partial', ownDiag: { ...diag, stage: 'needs_input', warnings: [...diag.warnings, 'Solo encontramos ' + items.length + ' productos con precio; se necesitan al menos 8.'] } }); return { wait: true }; }
      const chunks = await saveCatalog(org, 'own', items, 0);
      await store.put(org, 'stores', 'own', { ...s, url: res.origin, n: items.length, total: res.found || res.items.length, chunks, platform: res.platform, method: res.method, currency: res.currency, country: res.country, importedAt: new Date().toISOString(), diag }, 'sistema');
      await save({ phase: 'discover', own: items.length, ownTotal: res.found || res.items.length, platform: res.platform, method: res.method, currency: res.currency, country: res.country, ownDiag: diag });
      return { partial: true };
    }
    if (phase === 'discover') {
      const s = await store.get(org, 'stores', 'own');
      const ws = await store.snapshot(org);
      const own = Object.values(ws.catalog).filter((c) => c.sid === 'own').flatMap((c) => c.items || []);
      const labels = {}; own.forEach((p) => (labels[p.label] = (labels[p.label] || 0) + 1));
      const tried = (st.comps || []).map((c) => c.url);
      const ccode = st.country || COUNTRY_BY_TLD(new URL(s.url).hostname);
      const country = COUNTRY[String(ccode || '').toLowerCase()] || null;
      let out = {};
      try {
        const topLabels = Object.entries(labels).sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]);
        const ctx = 'Tienda: ' + s.url + (country ? '\nPaís de venta: ' + country[1] + ' (precios en ' + (st.currency || country[2]) + ')' : st.currency ? '\nMoneda: ' + st.currency : '') + '\nCategorías principales del catálogo: ' + topLabels.join(', ') + '\nPrecio mediano: ' + Math.round(medianOf(own.map(saleOf))) + '\nEjemplos de productos y precios: ' + own.slice(0, 15).map((p) => p.name + ' (' + p.price + ')').join('; ') + '\n\n';
        const rules = 'Excluye marketplaces (Mercado Libre, Amazon, Linio, Dafiti, Shein, Temu) y la propia tienda. Puedes incluir tiendas por departamentos solo como referentes de categoría.\n' +
          'La URL debe ser la de la tienda de ese país (por ejemplo, el sitio de Colombia de una marca internacional, no el global). Da solo direcciones que encontraste en la búsqueda (no redes sociales). Nunca inventes una dirección.\n' +
          (tried.length ? 'Ya conocemos estas, no las repitas: ' + tried.join(', ') + '\n' : '') +
          'Responde solo JSON: {"country": "CO"|"MX"|"PE"|"CL"|otro código ISO, "storeName": "nombre comercial de la tienda", "competitors": [{"name": "Marca", "url": "https://tienda-del-pais", "category": "categorías en las que compite", "positioning": "premium"|"similar"|"económico"}]}';
        const outs = await Promise.allSettled([
          ai.research('Eres analista de pricing de retail en Latinoamérica. Usa la búsqueda web para encontrar las tiendas online que compiten con esta tienda.\n\n' + ctx +
            'Para cada una de las categorías principales busca 2 o 3 marcas o tiendas que vendan ESE tipo de producto en el MISMO país, con tienda online propia. Incluye competidores de precio parecido, algunos más premium y algunos más económicos. En total 10 a 12 distintas. ' + rules, { ...owner, kind: 'quick-competitors', maxUses: 6 }),
          ai.research('Eres analista de mercado de retail. Busca en la web qué marcas compiten con esta tienda por el mismo cliente: marcas del mismo país (nacionales o internacionales con sitio local) que vendan productos parecidos. Incluye marcas locales medianas, no solo las más famosas. Da 8 a 10. \n\n' + ctx + rules, { ...owner, kind: 'quick-competitors', maxUses: 6 }),
        ]);
        const ok = outs.filter((r) => r.status === 'fulfilled').map((r) => r.value || {});
        if (!ok.length && outs[0].reason && ['billing', 'ai_limit'].includes(outs[0].reason.code)) throw outs[0].reason;
        if (!ok.length) await save({ discoverError: 'La búsqueda web no respondió; puedes agregar competidores a mano.' });
        out = { country: (ok.find((o) => o.country) || {}).country, storeName: (ok.find((o) => o.storeName) || {}).storeName, competitors: ok.flatMap((o) => o.competitors || []) };
      } catch (e) { if (['billing', 'ai_limit'].includes(e.code)) throw e; out = {}; await save({ discoverError: 'La búsqueda web falló; puedes agregar competidores a mano.' }); }
      const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return ''; } };
      const seen = new Set([host(s.url), ...tried.map(host)]);
      const market = st.country || (['CO', 'MX', 'PE', 'CL'].includes(out.country) ? out.country : 'CO');
      const fromWeb = (out.competitors || []).filter((c) => c && c.url && /^https?:\/\//.test(c.url) && host(c.url) && !seen.has(host(c.url)) && seen.add(host(c.url))).slice(0, 12).map((c) => ({ name: String(c.name || host(c.url)).slice(0, 60), url: String(c.url), category: c.category ? String(c.category).slice(0, 120) : null, positioning: c.positioning || null, source: 'web' }));
      const fromReg = (await registry.suggest(market, keywordsOf(own), seen, 6).catch(() => [])).map((c) => ({ ...c, source: 'registro' }));
      fromReg.forEach((c) => seen.add(host(c.url)));
      // Verificación de dominios antes de presentarlos: que existan y respondan (sin leer el catálogo todavía).
      const cands = await Promise.all([...fromWeb, ...fromReg].slice(0, 16).map(async (c) => ({ ...c, verified: await verifyDomain(c.url) })));
      if (out.storeName) await store.put(org, 'stores', 'own', { ...s, name: out.storeName }, 'sistema');
      await save({ phase: cands.length ? 'confirm_comps' : 'need_comps', candidates: cands, market, storeName: out.storeName || st.storeName || s.name });
      return { wait: true };
    }
    if (phase === 'comps') {
      // st.comps: registro por competidor confirmado (relevancia, lectura y comparabilidad por separado)
      const comps = st.comps || [];
      if (!st.keywords) {
        const wsk = await store.snapshot(org);
        const own = Object.values(wsk.catalog).filter((c) => c.sid === 'own').flatMap((c) => c.items || []);
        await save({ keywords: keywordsOf(own), ownMed: medianOf(own.map(saleOf)) });
      }
      const todo = comps.filter((c) => c.read.status === 'pending');
      for (let i = 0; i < todo.length && Date.now() < job.deadline - 100000; i += 4) {
        const group = todo.slice(i, i + 4);
        group.forEach((c) => { c.read = { status: 'reading', at: new Date().toISOString() }; });
        await save({ comps }); // marcados antes de leer: si el paso se corta, no se repiten en bucle
        const copts = { maxPages: Number(process.env.QUICK_COMP_PAGES || 6), enough: 150, keywords: st.keywords, sitemapMax: 50, deadline: job.deadline - 60000, ai: ai.facade({ ...owner, kind: 'quick-extract' }), textMax: 50 };
        const got = await Promise.all(group.map((c) => withTimeout(crawl(c.url, null, copts), Number(process.env.QUICK_COMP_TIMEOUT_MS || 60000)).then((res) => ({ c, res }), (err) => ({ c, err }))));
        for (const g of got) {
          if (g.err) {
            if (['billing', 'ai_limit'].includes(g.err.code)) throw g.err;
            g.c.read = { status: 'failed', code: g.err.code || 'error', reason: g.err.reason || null, why: failWhy(g.err), at: new Date().toISOString(), attempts: ((g.err.diag || {}).attempts || []).map((a) => ({ label: a.label, status: a.status, detail: a.detail })) };
            continue;
          }
          const ev = evaluateCompetitor(st, g.c, g.res);
          Object.assign(g.c, ev);
          if (g.c.include) {
            let sid = g.c.sid || slug(g.c.name); if (sid === 'own' || comps.some((f) => f !== g.c && f.sid === sid)) sid += '-' + comps.indexOf(g.c);
            g.c.sid = sid;
            const items = cap(g.res.items, Number(process.env.QUICK_COMP_MAX || 120));
            const chunks = await saveCatalog(org, sid, items, 0);
            await store.put(org, 'stores', sid, { name: g.c.name, url: g.res.origin, role: 'comp', n: items.length, chunks, platform: g.res.platform, method: g.res.method, currency: g.res.currency, country: g.res.country, kind: g.c.type, importedAt: new Date().toISOString() }, 'sistema');
            registry.remember({ url: g.res.origin, market: g.res.country || st.market, platform: g.res.platform, items: g.res.items, ok: true });
          }
        }
        await save({ comps });
      }
      if (comps.some((c) => c.read.status === 'pending' || c.read.status === 'reading')) {
        comps.forEach((c) => { if (c.read.status === 'reading' && Date.now() - Date.parse(c.read.at) > 240000) c.read = { status: 'failed', code: 'timeout', why: 'la lectura se interrumpió por tiempo', at: new Date().toISOString() }; });
        await save({ comps });
        if (comps.some((c) => c.read.status === 'pending' || c.read.status === 'reading')) return { partial: true };
      }
      const usable = comps.filter((c) => c.include);
      // Pocos competidores utilizables: una segunda búsqueda (una sola vez); si tampoco, se le piden al usuario.
      if (usable.length < 2 && !st.round2 && !st.manual) { await save({ phase: 'discover', round2: true }); return { partial: true }; }
      if (!usable.length) { await save({ phase: 'need_comps' }); return { wait: true }; }
      if (st.cats && st.cats.length) {
        // reintento después del análisis: se actualiza la lista de competidores y se clasifican solo los productos nuevos
        const cfg = await store.get(org, 'ws', 'config');
        await store.put(org, 'ws', 'config', { ...cfg, comps: usable.map((c) => c.sid), competitors: compSummary(comps) }, 'sistema');
        await save({ phase: 'classify' });
      } else await save({ phase: 'cats' });
      return { partial: true };
    }
    if (phase === 'cats') {
      const ws = await store.snapshot(org);
      const own = Object.values(ws.catalog).filter((c) => c.sid === 'own').flatMap((c) => c.items || []);
      const compItems = Object.values(ws.catalog).filter((c) => c.sid !== 'own').flatMap((c) => c.items || []);
      const all = await I.proposeCategories(ai.facade({ ...owner, kind: 'quick-categories' }), own, compItems, { storeName: st.storeName || '' });
      // Se analizan las categorías con más productos comparables de ambos lados (por sinónimos en nombre y etiqueta).
      const nrm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const hits = (c, list) => list.filter((p) => { const t = nrm(p.name + ' ' + p.label); return c.syn.some((w) => w.length > 2 && t.includes(w)); }).length;
      const cats = all.map((c) => ({ c, o: hits(c, own), m: hits(c, compItems) })).sort((a, b) => Math.min(b.o, b.m) - Math.min(a.o, a.m) || b.o - a.o).slice(0, Number(process.env.QUICK_CATS || 4)).map((x) => x.c);
      for (const c of cats) await store.put(org, 'cats', c.id, { ...c, origin: 'ia', createdAt: new Date().toISOString() }, 'sistema');
      const comps = st.comps || [];
      const sg = st.strategy || {};
      await store.put(org, 'ws', 'config', { storeName: st.storeName || '', market: MARKETS.includes(st.market) ? st.market : 'CO', currency: st.currency || null, objective: sg.objective || 'competitividad', comps: comps.filter((c) => c.include).map((c) => c.sid), competitors: compSummary(comps), ownDiag: st.ownDiag || null, cats: cats.map((c) => c.id), attrsOff: {}, franjas: {}, policy: { minMargin: sg.minMargin != null ? sg.minMargin : 0.55, promoMinMargin: 0.35, rounding: sg.rounding || 'psico', maxChange: sg.maxChange || 0.12, useCost: false }, setupDone: false, step: 4, measured: null }, 'sistema');
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
        const misses = st.misses || {};
        for (let i = 0; i < batches.length; i++) {
          const ok = results[i].status === 'fulfilled';
          if (!ok && results[i].reason && ['billing', 'ai_limit'].includes(results[i].reason.code)) throw results[i].reason;
          const out = {};
          batches[i].forEach((p) => {
            if (ok && results[i].value[p.id]) out[p.id] = results[i].value[p.id];
            // Un producto que la IA no clasifica en 2 intentos queda fuera del análisis en vez de bloquearlo.
            else if ((misses[p.id] = (misses[p.id] || 0) + 1) >= 2) out[p.id] = { cat: null, conf: 'baja', skipped: true };
          });
          if (Object.keys(out).length) { await store.put(org, 'cls', 'b-' + Date.now() + '-' + i, { at: new Date().toISOString(), by: 'sistema', items: out }, 'sistema'); wrote++; }
        }
        await save({ misses, aiErrors: (st.aiErrors || 0) + results.filter((r) => r.status === 'rejected').length });
        if (!wrote && !done) throw Object.assign(new Error('La IA no pudo clasificar los productos (puede estar saturada). Intenta de nuevo en unos minutos.'), { code: 'ai_error' });
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
    else if (result && result.wait) await q("update jobs set status = 'waiting', lease_until = null, updated_at = now() where id = $1", [job.id]);
    else await q("update jobs set status = 'done', lease_until = null, progress = progress || $2, updated_at = now() where id = $1", [job.id, { result }]);
  } catch (e) {
    const msg = String((e && (e.message || e.code)) || e);
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

module.exports = { enqueue, start, step, drain, enqueueRefreshAll, RUN, saveCatalog, evaluateCompetitor, verifyDomain, publicDiag, compSummary };
