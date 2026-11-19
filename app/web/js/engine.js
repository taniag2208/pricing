/* Tita Pricing Intelligence 360° — motor analítico. Corre en el navegador sobre los datos
   reales del espacio de trabajo (catálogos importados y clasificados). */
(function () {
  'use strict';
  const TP = (window.TP = {});

  /* ---------- utilidades ---------- */
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : NaN);
  function quantile(arr, p) {
    if (!arr.length) return NaN;
    const s = [...arr].sort((x, y) => x - y);
    const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  }
  const median = (a) => quantile(a, 0.5);
  Object.assign(TP, { hashStr, rng, gauss, clamp, strip, sum, mean, quantile, median });

  /* ---------- mercados ---------- */
  TP.MARKETS = {
    CO: { id: 'CO', name: 'Colombia', currency: 'COP', symbol: '$', fx: 1, locale: 'es-CO', dec: 0, step: 10000 },
    MX: { id: 'MX', name: 'México', currency: 'MXN', symbol: '$', fx: 1 / 215, locale: 'es-MX', dec: 0, step: 50 },
    PE: { id: 'PE', name: 'Perú', currency: 'PEN', symbol: 'S/ ', fx: 1 / 1080, locale: 'es-PE', dec: 2, step: 10 },
    CL: { id: 'CL', name: 'Chile', currency: 'CLP', symbol: '$', fx: 1 / 4.2, locale: 'es-CL', dec: 0, step: 5000 },
  };
  TP.ROUNDING = {
    psico: 'Terminación psicológica del mercado',
    multiplo: 'Múltiplo comercial',
    none: 'Sin redondeo',
  };
  TP.roundingExample = function (mk) {
    return { CO: 'termina en 900 (p. ej. 349.900)', MX: 'termina en 9 (p. ej. 1.899)', PE: 'termina en ,90 (p. ej. 289,90)', CL: 'termina en 990 (p. ej. 79.990)' }[mk.id];
  };
  TP.roundPrice = function (v, mk, mode) {
    if (!(v > 0)) return v;
    if (mode === 'none') return mk.dec ? Math.round(v * 100) / 100 : Math.round(v);
    if (mode === 'multiplo') return Math.max(mk.step, Math.round(v / mk.step) * mk.step);
    switch (mk.id) {
      case 'CO': return Math.max(900, Math.round(v / 1000) * 1000 - 100);
      case 'MX': return Math.max(9, Math.round(v / 10) * 10 - 1);
      case 'PE': return Math.max(0.9, Math.round(v) - 0.1);
      case 'CL': return Math.max(990, Math.round(v / 1000) * 1000 - 10);
      default: return Math.round(v);
    }
  };
  TP.fmt = function (v, mk, compact) {
    if (v == null || !isFinite(v)) return '—';
    if (compact && v >= 100000) {
      if (v >= 1e6) return mk.symbol + (v / 1e6).toLocaleString(mk.locale, { maximumFractionDigits: 1 }) + ' M';
      return mk.symbol + Math.round(v / 1000).toLocaleString(mk.locale) + ' mil';
    }
    return mk.symbol + v.toLocaleString(mk.locale, { minimumFractionDigits: mk.dec, maximumFractionDigits: mk.dec });
  };
  TP.pct = (x, d = 0, signed = true) => { if (x == null || !isFinite(x)) return '—'; if (Math.abs(x * 100) < 0.5 * Math.pow(10, -d)) x = 0; return (signed && x > 0 ? '+' : '') + (x * 100).toFixed(d).replace('.', ',') + ' %'; };

  /* ---------- homologación de categorías (reglas sobre la clasificación de cada producto) ---------- */
  const GENERIC = ['accesorios', 'marroquineria', 'muebles', 'hogar', 'descanso', 'productos', 'coleccion', 'novedades', 'sale', 'ofertas', 'todo', 'tienda', 'mujer', 'hombre'];
  TP.nameScore = function (label, cat) {
    const t = strip(label);
    if (cat.syn.some((s) => t.includes(s))) return 'alta';
    if (GENERIC.some((g) => t.includes(g))) return 'media';
    return 'baja';
  };
  TP.homologate = function (D) {
    const own = {};
    D.cats.forEach((c) => {
      const ps = D.products.filter((p) => p.brand === 'own' && p.cat === c.id).map((p) => p.list);
      own[c.id] = { lo: quantile(ps, 0.1), hi: quantile(ps, 0.9) };
    });
    const out = [];
    D.labels.filter((l) => l.brand !== 'own').forEach((l) => {
      const ps = l.ids.map((id) => D.byId[id]);
      const total = ps.length;
      D.cats.forEach((c) => {
        const n = ps.filter((p) => p.cat === c.id).length;
        const share = n / total;
        const ns = TP.nameScore(l.name, c);
        let status = null;
        if (share >= 0.85) status = 'equiv';
        else if (share >= 0.2) status = 'partial';
        else if (share === 0 && ns !== 'baja' && ps.some((p) => p.cat === null && p.srcCat === c.id)) status = 'noequiv';
        if (!status) return;
        const typCount = {};
        ps.forEach((p) => (typCount[p.typ] = (typCount[p.typ] || 0) + 1));
        const typs = Object.entries(typCount).sort((a, b) => b[1] - a[1]);
        const matOk = ps.filter((p) => c.materials.includes(p.mat)).length / total;
        const prices = ps.map((p) => p.list);
        const lo = quantile(prices, 0.1), hi = quantile(prices, 0.9);
        const ov = Math.max(0, Math.min(hi, own[c.id].hi) - Math.max(lo, own[c.id].lo)) / Math.max(1, Math.max(hi, own[c.id].hi) - Math.min(lo, own[c.id].lo));
        const outside = typs.filter(([t]) => !c.typologies.includes(t));
        let reason;
        if (status === 'equiv') reason = `El nombre «${l.name}» es ${ns === 'alta' ? 'equivalente' : 'distinto'} al tuyo, pero lo decisivo es el contenido: ${Math.round(share * 100)} % de sus ${total} productos corresponde a tipologías de ${c.name.toLowerCase()} (${typs.slice(0, 3).map((t) => t[0]).join(', ')}).`;
        else if (status === 'partial') reason = `Categoría mixta: ${n} de ${total} productos son de ${c.name.toLowerCase()}; el resto (${outside.slice(0, 2).map((t) => t[0]).join(', ') || 'otras tipologías'}) pertenece a otra categoría. Se propone segmentar y comparar solo las tipologías equivalentes.`;
        else reason = `El nombre se parece a «${c.name}», pero las imágenes y descripciones muestran ${typs.slice(0, 2).map((t) => t[0].toLowerCase()).join(' y ')}: otro uso y otra tipología. No se recomienda compararla.`;
        out.push({ key: l.key + '>' + c.id, label: l, cat: c.id, brand: l.brand, status, share, n, total, ns, typs, matOk, ov, reason, sample: ps.filter((p) => status === 'noequiv' || p.cat === c.id).slice(0, 3) });
      });
    });
    return out;
  };
  // ¿qué productos de competencia entran a una categoría dadas las decisiones del usuario?
  TP.categoryPool = function (D, H, catId, comps, mapDec) {
    const ids = new Set();
    H.filter((h) => h.cat === catId && comps.includes(h.brand)).forEach((h) => {
      const d = mapDec[h.key];
      if (d === 'reject') return;
      if (h.status === 'noequiv' && d !== 'accept' && d !== 'all') return;
      const all = d === 'all' || h.status === 'noequiv';
      h.label.ids.forEach((id) => { const p = D.byId[id]; if (all || p.cat === catId) ids.add(id); });
    });
    return [...ids].map((id) => D.byId[id]);
  };

  /* ---------- álgebra lineal mínima ---------- */
  function invert(M) {
    const n = M.length, A = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r2 = c + 1; r2 < n; r2++) if (Math.abs(A[r2][c]) > Math.abs(A[piv][c])) piv = r2;
      if (Math.abs(A[piv][c]) < 1e-12) return null;
      [A[c], A[piv]] = [A[piv], A[c]];
      const d = A[c][c];
      for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (let r2 = 0; r2 < n; r2++) if (r2 !== c) { const f = A[r2][c]; if (f) for (let j = 0; j < 2 * n; j++) A[r2][j] -= f * A[c][j]; }
    }
    return A.map((row) => row.slice(n));
  }
  function ols(X, y, lambda) {
    const k = X[0].length;
    const XtX = Array.from({ length: k }, () => Array(k).fill(0));
    const Xty = Array(k).fill(0);
    for (let i = 0; i < X.length; i++) for (let a = 0; a < k; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b]; }
    for (let a = 1; a < k; a++) XtX[a][a] += lambda;
    const inv = invert(XtX);
    if (!inv) return null;
    const beta = inv.map((row) => sum(row.map((v, j) => v * Xty[j])));
    return { beta, inv };
  }
  const dot = (a, b) => sum(a.map((v, i) => v * b[i]));
  TP.ols = ols;

  /* ---------- modelo hedónico log-lineal con validación cruzada y abstención ---------- */
  TP.minSample = (k) => Math.max(30, 8 * (k + 1));
  TP.fitModel = function (cat, pool, attrsOn) {
    const idx = cat.attrs.map((a, i) => i).filter((i) => attrsOn.includes(cat.attrs[i].id));
    const k = idx.length;
    const need = TP.minSample(k);
    const base = { cat: cat.id, k, need, idx, nRaw: pool.length };
    if (k === 0) return { ...base, ok: false, reason: 'sin-atributos', n: pool.length };
    if (pool.length < need) return { ...base, ok: false, reason: 'muestra', n: pool.length };
    const row = (p) => [1, ...idx.map((i) => p.lv[i])];
    let data = pool.map((p) => ({ p, x: row(p), y: Math.log(p.list) }));
    // primera pasada para detectar atípicos (residuo > 3,5 MAD)
    const f0 = ols(data.map((d) => d.x), data.map((d) => d.y), 0.01);
    if (!f0) return { ...base, ok: false, reason: 'calidad', n: pool.length };
    const res0 = data.map((d) => d.y - dot(d.x, f0.beta));
    const med0 = median(res0), mad = median(res0.map((r) => Math.abs(r - med0))) * 1.4826;
    const cut = 3.5 * Math.max(mad, 1e-6);
    const excluded = data.filter((d, i) => Math.abs(res0[i] - med0) > cut).map((d) => d.p);
    data = data.filter((d, i) => Math.abs(res0[i] - med0) <= cut);
    const n = data.length;
    if (n < need) return { ...base, ok: false, reason: 'muestra', n, excluded };
    const fit = ols(data.map((d) => d.x), data.map((d) => d.y), 0.01);
    if (!fit) return { ...base, ok: false, reason: 'calidad', n, excluded };
    const yhat = data.map((d) => dot(d.x, fit.beta));
    const ym = mean(data.map((d) => d.y));
    const sst = sum(data.map((d) => (d.y - ym) ** 2));
    const sse = sum(data.map((d, i) => (d.y - yhat[i]) ** 2));
    const r2 = 1 - sse / sst;
    const s2 = sse / Math.max(1, n - k - 1);
    // validación cruzada en 5 particiones (orden determinístico por hash del id)
    const order = data.map((d, i) => [hashStr(d.p.id), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const cvRes = Array(n).fill(0);
    let inBand = 0;
    for (let f = 0; f < 5; f++) {
      const test = new Set(order.filter((_, j) => j % 5 === f));
      const tr = data.filter((_, i) => !test.has(i));
      const ff = ols(tr.map((d) => d.x), tr.map((d) => d.y), 0.01);
      if (!ff) return { ...base, ok: false, reason: 'calidad', n, excluded };
      // cobertura honesta: banda con los residuos del entrenamiento de la partición, evaluada en la partición de prueba
      const trRes = tr.map((d) => d.y - dot(d.x, ff.beta));
      const a = quantile(trRes, 0.1), b = quantile(trRes, 0.9);
      test.forEach((i) => { cvRes[i] = data[i].y - dot(data[i].x, ff.beta); if (cvRes[i] >= a && cvRes[i] <= b) inBand++; });
    }
    const r2cv = 1 - sum(cvRes.map((r) => r * r)) / sst;
    const mape = mean(cvRes.map((r) => Math.abs(Math.exp(-r) - 1)));
    const q10 = quantile(cvRes, 0.1), q90 = quantile(cvRes, 0.9);
    const coverage = inBand / n;
    const coef = idx.map((ai, j) => {
      const b = fit.beta[j + 1], se = Math.sqrt(Math.max(0, s2 * fit.inv[j + 1][j + 1]));
      return { attr: cat.attrs[ai], b, se, pct: Math.exp(b) - 1, lo: Math.exp(b - 1.645 * se) - 1, hi: Math.exp(b + 1.645 * se) - 1, sig: Math.abs(b) > 1.645 * se };
    });
    const ok = r2cv >= 0.5;
    const reliability = !ok ? 'Insuficiente' : r2cv >= 0.75 && n >= need * 1.5 ? 'Alta' : r2cv >= 0.62 ? 'Media' : 'Baja';
    const means = idx.map((i) => mean(data.map((d) => d.p.lv[i])));
    return {
      ...base, ok, reason: ok ? null : 'calidad', n, excluded, beta: fit.beta, r2, r2cv, mape, q10, q90, coverage, coef, reliability, means,
      predict(lv) {
        const x = [1, ...idx.map((i) => lv[i])];
        const l = dot(x, fit.beta);
        return { est: Math.exp(l), lo: Math.exp(l + q10), hi: Math.exp(l + q90) };
      },
      contributions(lv) {
        return idx.map((i, j) => ({ attr: cat.attrs[i], level: lv[i], eff: Math.exp(fit.beta[j + 1] * (lv[i] - means[j])) - 1 }));
      },
    };
  };
  TP.REASON_TEXT = {
    muestra: 'Muestra insuficiente',
    calidad: 'Calidad del modelo insuficiente',
    'sin-atributos': 'Sin atributos activos',
  };

  /* ---------- similitud producto contra producto ---------- */
  // Tamaño o presentación leído del nombre: medidas (140x190), tallas de cama, volumen y peso. null si no hay.
  const BED = { cuna: 1, sencillo: 2, sencilla: 2, twin: 2, semidoble: 3, full: 3, doble: 4, queen: 5, king: 6 };
  TP.sizeOf = function (name) {
    const t = strip(String(name || ''));
    const dim = t.match(/(\d{2,3}(?:[.,]\d)?)\s*(?:x|×|\*)\s*(\d{2,3}(?:[.,]\d)?)(?:\s*(?:x|×|\*)\s*\d{1,3})?\s*(cm)?/);
    if (dim) { const w = parseFloat(dim[1].replace(',', '.')), h = parseFloat(dim[2].replace(',', '.')); return { kind: 'dim', v: Math.min(w, h) * Math.max(w, h), label: Math.min(w, h) + '×' + Math.max(w, h) }; }
    const bed = t.match(/\b(super king|king|queen|semidoble|doble|sencill[oa]|twin|full|cuna)\b/);
    if (bed) { const k = bed[1].replace('super king', 'king'); return { kind: 'bed', v: BED[k] || BED[k.replace(/a$/, 'o')], label: bed[1] }; }
    const vol = t.match(/(\d+(?:[.,]\d+)?)\s*(ml|cc|litros?|lts?|l)\b/);
    if (vol) { const n = parseFloat(vol[1].replace(',', '.')); return { kind: 'vol', v: /^m|^c/.test(vol[2]) ? n : n * 1000, label: vol[1] + ' ' + vol[2] }; }
    const wt = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|gr|g)\b/);
    if (wt) { const n = parseFloat(wt[1].replace(',', '.')); return { kind: 'wt', v: /^k/.test(wt[2]) ? n * 1000 : n, label: wt[1] + ' ' + wt[2] }; }
    return null;
  };
  const NAME_STOP = new Set(['para', 'con', 'sin', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'por', 'mujer', 'hombre', 'unisex', 'color', 'talla', 'ref']);
  const tokensOf = (n) => new Set(strip(String(n || '')).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !NAME_STOP.has(w) && !/^\d+$/.test(w)));
  TP.similarity = function (cat, a, b) {
    const sameTyp = a.typ === b.typ;
    const sameMat = a.mat === b.mat;
    const diffs = a.lv.map((v, i) => b.lv[i] - v);
    // solo cuentan los atributos con evidencia en ambos productos (los imputados con la mediana no prueban parecido)
    const known = a.lv.map((_, i) => !(a.lvRaw && !(a.lvRaw[i] >= 1)) && !(b.lvRaw && !(b.lvRaw[i] >= 1)));
    const kd = diffs.filter((_, i) => known[i]);
    const mad = kd.length ? mean(kd.map(Math.abs)) : 2;
    const cover = a.lv.length ? kd.length / a.lv.length : 0;
    let score = (sameTyp ? 0.4 : 0.05) + (sameMat ? 0.15 : 0.04) + 0.45 * (1 - mad / 4) * (0.5 + 0.5 * cover);
    // Tamaño o presentación: si ambos lo declaran y no coincide (más de 15 % de diferencia), no son equivalentes.
    const sa = TP.sizeOf(a.name), sb = TP.sizeOf(b.name);
    const sizeMismatch = !!(sa && sb && sa.kind === sb.kind && Math.abs(sa.v - sb.v) / Math.max(sa.v, sb.v) > 0.15);
    if (sizeMismatch) score = Math.min(score - 0.25, 0.6);
    // Nombres: palabras en común (sin marcas ni palabras vacías) suben un poco la similitud; no la deciden.
    const ta = tokensOf(a.name), tb = tokensOf(b.name);
    const inter = [...ta].filter((w) => tb.has(w));
    const jac = ta.size && tb.size ? inter.length / (ta.size + tb.size - inter.length) : 0;
    score += 0.05 * jac;
    const why = [sameTyp ? 'mismo tipo (' + a.typ + ')' : 'tipo distinto', sameMat ? 'mismo material' : 'material distinto', kd.length + ' de ' + a.lv.length + ' atributos con evidencia en ambos' + (kd.length ? ', diferencia media ' + mad.toFixed(1) + ' niveles' : ''), sa && sb ? (sizeMismatch ? 'tamaño distinto (' + sa.label + ' frente a ' + sb.label + ')' : sa.kind === sb.kind ? 'mismo tamaño (' + sa.label + ')' : null) : null, inter.length ? 'nombres comparten: ' + inter.slice(0, 4).join(', ') : null].filter(Boolean);
    const shared = cat.attrs.filter((_, i) => known[i] && diffs[i] === 0).map((x) => x.name);
    const differ = cat.attrs.map((x, i) => ({ attr: x, d: diffs[i] })).filter((x, i) => known[i] && Math.abs(x.d) >= 1);
    const label = score >= 0.85 ? 'Muy similar' : score >= 0.72 ? 'Similar' : 'Parcial';
    let conf = 'Clasificación con evidencia completa';
    if (!b.hasDesc && !b.matPublic) conf = 'Atributos inferidos solo de imagen';
    else if (!b.hasDesc || !b.matPublic) conf = 'Evidencia parcial: revisar';
    return { score, sameTyp, sameMat, shared, differ, label, conf, why, sizeMismatch };
  };
  TP.comparablesFor = function (cat, p, pool, compDec, opts) {
    const lim = (opts && opts.limit) || 5;
    return pool
      .map((q) => ({ q, s: TP.similarity(cat, p, q), key: p.id + '>' + q.id }))
      .filter((x) => x.s.score >= 0.7 && compDec[x.key] !== 'reject')
      .sort((a, b) => b.s.score - a.s.score || a.q.id.localeCompare(b.q.id))
      .slice(0, lim);
  };

  /* ---------- franjas ---------- */
  TP.bands = function (pool, conf) {
    const prices = pool.map((p) => p.list);
    if (conf && conf.mode === 'abs' && conf.c1 > 0 && conf.c2 > conf.c1) return { c1: conf.c1, c2: conf.c2, mode: 'abs' };
    const p1 = conf && conf.p1 ? conf.p1 : 33, p2 = conf && conf.p2 ? conf.p2 : 67;
    return { c1: quantile(prices, p1 / 100), c2: quantile(prices, p2 / 100), mode: 'pct', p1, p2 };
  };
  TP.BAND_NAMES = ['Entrada', 'Core', 'Premium'];
  TP.bandOf = (price, b) => (price < b.c1 ? 0 : price < b.c2 ? 1 : 2);

  /* ---------- diagnóstico por producto ---------- */
  TP.diagnose = function (cat, model, p, comps, policy, mk) {
    const out = { p, comps };
    let cm = comps.length ? median(comps.map((c) => c.q.list)) : NaN;
    out.compMedian = cm;
    out.gapComp = comps.length >= 2 ? p.list / cm - 1 : NaN;
    if (model && model.ok) {
      const pr = model.predict(p.lv);
      Object.assign(out, pr);
      out.gap = p.list / pr.est - 1;
      out.pos = p.list < pr.lo ? 'below' : p.list > pr.hi ? 'above' : 'in';
    } else out.pos = 'na';
    const agreeUp = out.gapComp <= -0.08, agreeDown = out.gapComp >= 0.08;
    if (out.pos === 'below') { out.action = 'up'; out.evidence = agreeUp ? 'consistente' : 'mixta'; }
    else if (out.pos === 'above') { out.action = 'down'; out.evidence = agreeDown ? 'consistente' : 'mixta'; }
    else if (out.pos === 'in') { out.action = 'keep'; out.evidence = 'consistente'; }
    else {
      // Sin modelo: solo se sugiere un cambio con al menos 3 comparables cercanos y si el precio queda fuera de su rango central (P25–P75).
      const close = comps.filter((c) => c.s.score >= 0.75).map((c) => c.q.list);
      out.compRange = close.length >= 3 ? [quantile(close, 0.25), quantile(close, 0.75)] : null;
      if (!out.compRange) out.action = 'keep';
      else out.action = p.list < out.compRange[0] * 0.97 ? 'up' : p.list > out.compRange[1] * 1.03 ? 'down' : 'keep';
      if (out.compRange) { out.compMedian = cm = median(close); out.gapComp = p.list / cm - 1; }
      out.evidence = out.compRange ? 'solo comparables' : 'insuficiente';
    }
    const mc = policy.maxChange;
    const stepOf = policy.rounding === 'multiplo' ? mk.step : mk.id === 'CO' || mk.id === 'CL' ? 1000 : mk.id === 'MX' ? 10 : 1;
    if (out.action === 'up') { out.scenario = TP.roundPrice(Math.min(isFinite(out.est) ? out.est : cm, p.list * (1 + mc)), mk, policy.rounding); if (!(out.scenario > p.list)) out.scenario = TP.roundPrice(p.list + stepOf, mk, policy.rounding); }
    else if (out.action === 'down') { out.scenario = TP.roundPrice(Math.max(isFinite(out.est) ? out.est : cm, p.list * (1 - mc)), mk, policy.rounding); if (!(out.scenario < p.list)) out.scenario = TP.roundPrice(p.list - stepOf, mk, policy.rounding); }
    else out.scenario = p.list;
    if (out.action !== 'keep' && Math.abs(out.scenario / p.list - 1) < 0.01) { out.action = 'keep'; out.scenario = p.list; }
    out.floor = policy.useCost && p.cost != null ? TP.roundPrice(p.cost / (1 - policy.minMargin), mk, policy.rounding) : null;
    if (out.floor && out.scenario < out.floor) out.scenario = out.floor;
    const mag = isFinite(out.gap) ? Math.abs(out.gap) : isFinite(out.gapComp) ? Math.abs(out.gapComp) * 0.6 : 0;
    out.priority = out.action === 'keep' ? 0 : mag * (out.evidence === 'consistente' ? 1 : 0.55);
    return out;
  };

  /* ---------- white spaces ---------- */
  TP.whiteSpaces = function (cat, ownPool, mktPool, bands, dim, model) {
    const keys = dim === 'mat' ? cat.materials : cat.typologies;
    const get = (p) => (dim === 'mat' ? p.mat : p.typ);
    const cells = [];
    keys.forEach((k) => {
      [0, 1, 2].forEach((bi) => {
        const m = mktPool.filter((p) => get(p) === k && TP.bandOf(p.list, bands) === bi);
        const o = ownPool.filter((p) => get(p) === k && TP.bandOf(p.list, bands) === bi);
        const mShare = m.length / Math.max(1, mktPool.length), oShare = o.length / Math.max(1, ownPool.length);
        const cell = { key: k, band: bi, m: m.length, o: o.length, mShare, oShare, gap: null };
        if (mShare >= 0.05 && oShare <= mShare * 0.45) {
          // ¿productos propios que el modelo ubica en esta franja pero se publican más abajo?
          const repos = model && model.ok ? ownPool.filter((p) => get(p) === k && TP.bandOf(model.predict(p.lv).est, bands) === bi && TP.bandOf(p.list, bands) < bi) : [];
          const mAttr = mean(m.map((p) => mean(p.lv)));
          const ownSame = ownPool.filter((p) => get(p) === k);
          const oAttr = ownSame.length ? mean(ownSame.map((p) => mean(p.lv))) : NaN;
          if (repos.length >= 1) cell.gap = { type: 'posicionamiento', repos };
          else if (o.length === 0 && ownSame.length === 0) cell.gap = { type: 'surtido' };
          else if (isFinite(oAttr) && mAttr - oAttr >= 0.6) cell.gap = { type: 'atributos', mAttr, oAttr };
          else cell.gap = { type: 'surtido' };
          cell.mAttr = mAttr;
        }
        cells.push(cell);
      });
    });
    return cells;
  };
  TP.GAP_TEXT = {
    surtido: { t: 'Brecha de surtido', d: 'El mercado tiene oferta en este espacio y tu portafolio casi no.' },
    posicionamiento: { t: 'Brecha de posicionamiento', d: 'Tienes productos con atributos de esta franja, pero publicados a un precio de una franja inferior.' },
    atributos: { t: 'Diferencia de atributos', d: 'La oferta del mercado aquí tiene niveles de atributos superiores a los de tus productos del mismo tipo.' },
  };

  /* ---------- Pulse WTP: cálculo sobre respuestas reales importadas ---------- */
  function crossAt(grid, a, b) { for (let i = 1; i < grid.length; i++) if ((a[i - 1] - b[i - 1]) * (a[i] - b[i]) <= 0) { const t = (a[i - 1] - b[i - 1]) / ((a[i - 1] - b[i - 1]) - (a[i] - b[i]) || 1); return grid[i - 1] + (grid[i] - grid[i - 1]) * t; } return NaN; }
  // rows: [[demasiadoBarato, barato, caro, demasiadoCaro], ...] en la moneda del mercado
  TP.vwFromResponses = function (rows) {
    const resp = rows.filter((r) => r.length >= 4 && r.every((v) => v > 0) && r[0] <= r[1] && r[1] <= r[2] && r[2] <= r[3]);
    const n = resp.length;
    if (n < 30) return { n, discarded: rows.length - n, error: 'Se necesitan al menos 30 respuestas consistentes (barato ≤ caro); hay ' + n + '.' };
    const all = resp.flat();
    const lo = quantile(all, 0.01) * 0.9, hi = quantile(all, 0.99) * 1.1, steps = 90;
    const grid = Array.from({ length: steps + 1 }, (_, i) => lo * Math.pow(hi / lo, i / steps));
    const share = (fn) => grid.map((p) => resp.filter((x) => fn(x, p)).length / n);
    const curves = { tooCheap: share((x, p) => x[0] >= p), cheap: share((x, p) => x[1] >= p), expensive: share((x, p) => x[2] <= p), tooExpensive: share((x, p) => x[3] <= p) };
    const notCheap = curves.cheap.map((v) => 1 - v), notExp = curves.expensive.map((v) => 1 - v);
    return { grid, curves, n, discarded: rows.length - n, pmc: crossAt(grid, curves.tooCheap, notCheap), pme: crossAt(grid, curves.tooExpensive, notExp), opp: crossAt(grid, curves.tooCheap, curves.tooExpensive), ipp: crossAt(grid, curves.cheap, curves.expensive) };
  };
  // answers: [[r1..rk], ...] intención 1-5 para cada precio en prices
  TP.ggFromResponses = function (prices, answers) {
    const resp = answers.filter((a) => a.length >= prices.length && a.slice(0, prices.length).every((v) => v >= 1 && v <= 5));
    const n = resp.length;
    if (n < 30) return { n, error: 'Se necesitan al menos 30 respuestas completas; hay ' + n + '.' };
    const pts = prices.map((p, j) => { const s = resp.filter((a) => a[j] >= 4).length / n; return { p, s, rev: p * s }; });
    const best = pts.reduce((a, b) => (b.rev > a.rev ? b : a), pts[0]);
    return { pts, best, n };
  };
  // Conjoint por calificación: 4 atributos (niveles 1/3/5) + 3 precios en un arreglo ortogonal L18 (Taguchi):
  // cada par de factores aparece en todas sus combinaciones el mismo número de veces, así los efectos se estiman por separado.
  const L18 = ['11111', '12222', '13333', '21122', '22233', '23311', '31213', '32321', '33132', '11332', '12113', '13221', '21231', '22312', '23123', '31323', '32131', '33212'];
  TP.conjointDesign = function (cat, prices, seed) {
    const r = rng(seed || 7);
    const attrs = cat.attrs.slice(0, 4);
    const lv = [1, 3, 5];
    const profiles = L18.map((row, i) => ({ id: 'P' + (i + 1), lv: attrs.map((_, j) => lv[Number(row[j]) - 1]), price: Number(row[4]) - 1 }));
    for (let i = profiles.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [profiles[i], profiles[j]] = [profiles[j], profiles[i]]; }
    profiles.forEach((p, i) => (p.id = 'P' + (i + 1)));
    return { attrs: attrs.map((a) => ({ id: a.id, name: a.name, levels: [a.levels[0], a.levels[2], a.levels[4]] })), prices, profiles };
  };
  // ratings: [[nota de cada perfil en el orden del diseño (0-10)], ...]
  TP.conjointEstimate = function (design, ratings) {
    const resp = ratings.filter((r) => r.length >= design.profiles.length && r.every((v) => v >= 0 && v <= 10));
    const n = resp.length;
    if (n < 20) return { n, error: 'Se necesitan al menos 20 encuestados con las ' + design.profiles.length + ' calificaciones; hay ' + n + '.' };
    const X = [], y = [];
    resp.forEach((r) => design.profiles.forEach((p, k) => {
      const row = [1];
      p.lv.forEach((l) => { row.push(l === 3 ? 1 : 0, l === 5 ? 1 : 0); });
      row.push(p.price === 1 ? 1 : 0, p.price === 2 ? 1 : 0);
      X.push(row); y.push(r[k]);
    }));
    const f = ols(X, y, 0);
    if (!f) return { n, error: 'El diseño no permite estimar las utilidades.' };
    const b = f.beta;
    const center = (arr) => { const m = mean(arr); return arr.map((v) => v - m); };
    const rows = design.attrs.map((a, j) => ({ attr: a, levels: a.levels, pw: center([0, b[1 + 2 * j], b[2 + 2 * j]]) }));
    const k = 1 + 2 * design.attrs.length;
    const pricePw = center([0, b[k], b[k + 1]]);
    const ranges = rows.map((x) => Math.max(...x.pw) - Math.min(...x.pw));
    const pr = Math.max(...pricePw) - Math.min(...pricePw);
    const tot = sum(ranges) + pr || 1;
    return { rows, pricePw, n, importance: [...rows.map((x, i) => ({ name: x.attr.name, v: ranges[i] / tot })), { name: 'Precio', v: pr / tot }].sort((a2, b2) => b2.v - a2.v) };
  };

  /* ---------- Revenue Learning: diferencias en diferencias sobre ventas reales ---------- */
  // weekly: { productId: { 'AAAA-MM-DD': unidades } }, change = { pid, at (ISO), from, to }, controls = [pid]
  TP.did = function (weekly, change, controls) {
    const t0 = new Date(change.at).getTime();
    const series = (pid) => Object.entries(weekly[pid] || {}).map(([d, u]) => ({ t: new Date(d).getTime(), u }));
    const tr = series(change.pid);
    const pre = tr.filter((x) => x.t < t0), post = tr.filter((x) => x.t >= t0);
    const cs = controls.map(series).filter((s) => s.length);
    if (pre.length < 3 || post.length < 3 || !cs.length) return { error: 'Faltan semanas de ventas: se necesitan al menos 3 antes y 3 después del cambio, y productos de control.', pre: pre.length, post: post.length, controls: cs.length };
    const cpre = cs.flatMap((s) => s.filter((x) => x.t < t0).map((x) => x.u)), cpost = cs.flatMap((s) => s.filter((x) => x.t >= t0).map((x) => x.u));
    const m = (a) => Math.max(0.01, mean(a));
    const did = Math.log(m(post.map((x) => x.u)) / m(pre.map((x) => x.u))) - Math.log(m(cpost) / m(cpre));
    const ch = Math.log(change.to / change.from);
    if (Math.abs(ch) < 0.005) return { error: 'El cambio de precio es demasiado pequeño para medir elasticidad.' };
    const e = did / ch;
    const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)) / Math.max(1, a.length));
    // error estándar por método delta de las cuatro medias (tratado y control, antes y después); no corrige autocorrelación semanal
    const rel = (a) => sd(a) / m(a);
    const seLog = Math.sqrt(rel(pre.map((x) => x.u)) ** 2 + rel(post.map((x) => x.u)) ** 2 + rel(cpre) ** 2 + rel(cpost) ** 2);
    const se = Math.abs(seLog / ch);
    const weeks = [...new Set([...tr.map((x) => x.t), ...cs.flat().map((x) => x.t)])].sort((a, b) => a - b);
    const ctlAt = (t) => mean(cs.map((s) => (s.find((x) => x.t === t) || {}).u).filter((v) => v != null));
    return { e, lo: e - 1.645 * se, hi: e + 1.645 * se, weeks, trt: weeks.map((t) => (tr.find((x) => x.t === t) || {}).u ?? null), ctl: weeks.map(ctlAt), t0, n: { pre: pre.length, post: post.length, controls: cs.length } };
  };
})();