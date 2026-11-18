/* TITA Pricing Intelligence 360° — copiloto (Claude con herramientas sobre los datos del espacio,
   con respaldo por reglas), shell de navegación y arranque. */
(function () {
  'use strict';
  const { useState, useMemo, useEffect, useRef } = React;
  const TP = window.TP, UI = TP.ui, html = UI.html, A = TP.app, L = TP.live, I = TP.ingest;
  const { Icon, Badge, Thumb, Empty, Note, Select } = UI;

  /* =========================================================
     COPILOTO — respaldo por reglas (si Claude no está disponible)
     ========================================================= */
  function detectCat(E, text) { const t = TP.strip(text); return (E.cats.find((c) => c.syn.some((s) => t.includes(s)) || t.includes(TP.strip(c.short))) || {}).id; }
  function intentOf(text) {
    const t = TP.strip(text);
    if (/(increment|subo|subir|aument|sube).*\d|\d.*(increment|subo|subir|aument)/.test(t) || /que (pasa|ocurre) si/.test(t)) return 'raise';
    if (/validar|consumidor|encuesta|disposicion a pagar/.test(t)) return 'validate';
    if (/atribut|explica/.test(t)) return 'attrs';
    if (/franja|participacion/.test(t)) return 'bands';
    if (/debajo|barat|subvalor/.test(t)) return 'below';
    if (/encima|caro|sobreprecio/.test(t)) return 'above';
    if (/primero|priori/.test(t)) return 'first';
    if (/categor.*(oportunidad|posicion)|(oportunidad|posicion).*categor/.test(t)) return 'cats';
    if (/compar|competencia|frente a/.test(t)) return 'compare';
    return null;
  }
  function answer(E, f, intent, catId, pctIn, actions) {
    const mk = E.mk;
    const cat = E.D.catById[catId || f.cat];
    const m = E.model[cat.id];
    const basis = (c) => { const mm = E.model[c.id]; return mm.ok ? `Modelo de ${c.name.toLowerCase()}: R² de validación ${mm.r2cv.toFixed(2).replace('.', ',')}, ${mm.n} productos de competencia, confiabilidad ${mm.reliability.toLowerCase()}.` : `${c.name}: sin modelo (${mm.n} de ${mm.need} productos); se usan comparables directos.`; };
    const prodRows = (ds) => html`<ul className="cp-list">${ds.map((d) => html`<li key=${d.p.id}><${Thumb} p=${d.p} size=${28} /><span><b>${d.p.name}</b> · ${d.cat.short} · ${TP.fmt(d.p.list, mk)} → est. ${d.est ? TP.fmt(d.est, mk) : '—'} <em>${TP.pct(isFinite(d.gap) ? d.gap : d.gapComp)}</em></span></li>`)}</ul>`;
    switch (intent) {
      case 'cats': {
        const r = E.cats.map((c) => { const below = E.diag[c.id].filter((d) => d.pos === 'below').length; const ws = TP.whiteSpaces(c, E.own[c.id], E.pool[c.id], E.band[c.id], 'typ', E.model[c.id]).filter((x) => x.gap).length; return { c, below, ws, idx: A.indexVsMarket(E, c.id), s: below * 2 + ws }; }).sort((a, b) => b.s - a.s);
        const t = r[0];
        return { text: html`<p>La mayor oportunidad está en <b>${t.c.name}</b>: ${t.below} productos por debajo de su banda y ${t.ws} espacios competitivos con poca oferta propia (índice de precio ${Math.round(t.idx * 100)} frente a 100 del mercado).</p><ul className="cp-list">${r.map((x) => html`<li key=${x.c.id}><span><b>${x.c.name}</b> · ${x.below} por debajo · ${x.ws} espacios · índice ${isFinite(x.idx) ? Math.round(x.idx * 100) : '—'}</span></li>`)}</ul>`, action: { l: 'Abrir ' + t.c.name + ' en Price Advisor', fn: () => actions.go('advisor', { cat: t.c.id, pos: 'below', sub: 'diagnostico' }) }, basis: 'Puntaje = 2 × productos por debajo de su banda + espacios competitivos. ' + basis(t.c), conf: 'Media' };
      }
      case 'compare': {
        const st = A.brandStats(E, { ...f, cat: cat.id, mat: 'all', typ: 'all', brands: E.cfg.comps, priceType: 'list' }, cat.id);
        const own = st.find((x) => x.own), cs = st.filter((x) => !x.own);
        const mm = TP.median(E.pool[cat.id].map((p) => p.list));
        const closest = [...cs].sort((a, b) => Math.abs(Math.log(a.med / own.med)) - Math.abs(Math.log(b.med / own.med)))[0];
        return { text: html`<p>En <b>${cat.name.toLowerCase()}</b> tu mediana es ${TP.fmt(own.med, mk)}, ${TP.pct(own.med / mm - 1)} frente a la mediana de ${cs.length} competidores (${TP.fmt(mm, mk)}). Tu competidor más cercano por precio es <b>${closest.name}</b>. Tienes ${Math.round(own.bandMix[2] * 100)} % del portafolio en Premium frente a ${Math.round(TP.mean(cs.map((c) => c.bandMix[2])) * 100)} % promedio del mercado.</p>`, action: { l: 'Ver categoría vs. categoría', fn: () => actions.go('market', { cat: cat.id, sub: 'categoria' }) }, basis: 'Precios de lista de ' + E.pool[cat.id].length + ' productos homologados.', conf: 'Alta' };
      }
      case 'below': case 'above': {
        const ds = E.allDiag.filter((d) => d.pos === intent).sort((a, b) => b.priority - a.priority);
        return { text: html`<p>${ds.length ? html`Hay <b>${ds.length}</b> productos ${intent === 'below' ? 'por debajo' : 'por encima'} de la banda P10–P90 que el mercado cobra por sus atributos. Los de mayor prioridad:` : 'No hay productos en esa situación con los filtros y competidores actuales.'}</p>${prodRows(ds.slice(0, 6))}`, action: { l: 'Ver la lista completa', fn: () => actions.go('advisor', { pos: intent, sub: 'diagnostico' }) }, basis: 'Banda P10–P90 de los modelos por categoría. Brecha = precio actual frente al estimado.', conf: 'Media' };
      }
      case 'bands': {
        const r = [];
        E.cats.forEach((c) => { const b = E.band[c.id]; const o = [0, 1, 2].map((bi) => E.own[c.id].filter((p) => TP.bandOf(p.list, b) === bi).length / E.own[c.id].length); const mm = [0, 1, 2].map((bi) => E.pool[c.id].filter((p) => TP.bandOf(p.list, b) === bi).length / Math.max(1, E.pool[c.id].length)); [0, 1, 2].forEach((bi) => { if (o[bi] < mm[bi] * 0.6) r.push({ c, bi, o: o[bi], m: mm[bi] }); }); });
        return { text: r.length ? html`<p>Tu participación es baja frente al mercado en:</p><ul className="cp-list">${r.map((x, i) => html`<li key=${i}><span><b>${x.c.name} · ${TP.BAND_NAMES[x.bi]}</b>: ${Math.round(x.o * 100)} % de tu portafolio frente a ${Math.round(x.m * 100)} % de la oferta.</span></li>`)}</ul><p className="muted sm">Poca oferta propia no prueba que exista demanda; valídalo antes de desarrollar producto.</p>` : html`<p>Tu distribución por franjas es similar a la del mercado en todas las categorías.</p>`, action: { l: 'Ver pirámide', fn: () => actions.go('market', { cat: r[0] ? r[0].c.id : cat.id, sub: 'piramide' }) }, basis: 'Franjas por terciles del precio de lista de la competencia (configurables).', conf: 'Alta' };
      }
      case 'attrs': {
        if (!m.ok) return { text: html`<p>En ${cat.name.toLowerCase()} el modelo se abstiene (${m.n} de ${m.need} productos necesarios), así que no puedo atribuir el precio a atributos con evidencia suficiente.</p>`, action: { l: 'Ver qué falta', fn: () => actions.go('advisor', { cat: cat.id, sub: 'modelo' }) }, basis: basis(cat), conf: 'Baja' };
        const top = [...m.coef].sort((a, b) => b.pct - a.pct);
        return { text: html`<p>En <b>${cat.name.toLowerCase()}</b>, lo que más mueve el precio de mercado es:</p><ul className="cp-list">${top.map((c) => html`<li key=${c.attr.id}><span><b>${c.attr.name}</b>: ${TP.pct(c.pct, 1)} por nivel${c.sig ? '' : ' (no concluyente)'}</span></li>`)}</ul>`, action: { l: 'Ver calidad del modelo', fn: () => actions.go('advisor', { cat: cat.id, sub: 'modelo' }) }, basis: basis(cat), conf: m.reliability };
      }
      case 'first': {
        const ds = [...E.allDiag].filter((d) => d.action !== 'keep').sort((a, b) => b.priority - a.priority).slice(0, 5);
        return { text: html`<p>Prioridad = tamaño de la brecha × consistencia de la evidencia (modelo y comparables directos coinciden):</p>${prodRows(ds)}`, action: { l: 'Abrir el primero', fn: () => ds[0] && actions.openProduct(ds[0].cat.id, ds[0].p.id) }, basis: 'Calculado sobre ' + E.allDiag.length + ' productos de ' + E.cats.length + ' categorías.', conf: 'Media' };
      }
      case 'raise': {
        const x = (pctIn || 5) / 100;
        const scope = catId ? [E.D.catById[catId]] : E.cats;
        let out = 0, inb = 0, franja = 0, tot = 0, under = 0;
        scope.forEach((c) => E.diag[c.id].forEach((d) => { tot++; const np = d.p.list * (1 + x); if (d.hi && d.p.list <= d.hi && np > d.hi) out++; if (d.lo && d.p.list < d.lo && np >= d.lo) inb++; if (TP.bandOf(np, E.band[c.id]) !== TP.bandOf(d.p.list, E.band[c.id])) franja++; if (d.lo && np < d.lo) under++; }));
        const idx = TP.median(scope.map((c) => A.indexVsMarket(E, c.id) * (1 + x)));
        return { text: html`<p>Con un incremento uniforme de <b>${Math.round(x * 100)} %</b>${catId ? ' en ' + scope[0].name.toLowerCase() : ''}:</p><ul className="cp-list"><li><span><b>${inb}</b> productos que hoy están por debajo entrarían a su banda de mercado.</span></li><li><span><b>${out}</b> productos quedarían por encima de su banda.</span></li><li><span><b>${franja}</b> de ${tot} cambiarían de franja.</span></li><li><span>Índice de precio frente al mercado: ${isFinite(idx) ? Math.round(idx * 100) : '—'}.</span></li></ul><p className="muted sm">${E.hasUnits ? 'Para el efecto en unidades y margen usa Promotion Optimizer con un supuesto de elasticidad o la elasticidad medida.' : 'Sin datos de ventas no estimo el efecto en volumen ni en margen.'} Un incremento uniforme ignora que cada producto tiene una brecha distinta: el Price Advisor propone cambios por producto.</p>`, action: { l: 'Ir al Price Advisor', fn: () => actions.go('advisor', { sub: 'diagnostico' }) }, basis: 'Bandas P10–P90 de los modelos actuales; sin efecto de demanda.', conf: 'Media' };
      }
      case 'validate': {
        const recs = A.pulseRecs(E, []);
        const r = recs.find((x) => x.method === 'gg') || recs[0];
        if (!r) return { text: html`<p>No hay una decisión con poca evidencia que justifique un estudio ahora.</p>`, basis: '', conf: '' };
        return { text: html`<p>Recomiendo validar <b>${r.target}</b> con un estudio <b>${{ vw: 'Van Westendorp', gg: 'Gabor-Granger', cj: 'Conjoint' }[r.method]}</b>.</p><p>${r.why}</p>`, action: { l: 'Crear el estudio en Pulse', fn: () => actions.go('pulse', {}) }, basis: 'Brecha media de la colección frente al estimado por atributos.', conf: 'Media' };
      }
      default:
        return { text: html`<p>En este modo de demostración entiendo un conjunto acotado de preguntas sobre los datos cargados. Prueba con una de las sugeridas, por ejemplo «¿Qué productos están por debajo de su rango competitivo?» o «¿Qué ocurre si incremento mis precios un 8 %?».</p>`, basis: 'Sin modelo de lenguaje conectado: las intenciones se detectan por palabras clave.', conf: '' };
    }
  }

  /* =========================================================
     COPILOTO — herramientas que Claude puede usar sobre los datos
     ========================================================= */
  function tools(E, actions) {
    const r2 = (x) => (isFinite(x) ? Math.round(x * 1000) / 1000 : null);
    const catOf = (id) => E.cats.find((c) => c.id === id || TP.strip(c.name).includes(TP.strip(String(id || ''))));
    const prod = (d) => ({ producto: d.p.name, id: d.p.id, categoria: d.cat ? d.cat.name : '', precio_actual: Math.round(d.p.list), precio_estimado: d.est ? Math.round(d.est) : null, banda: d.lo ? [Math.round(d.lo), Math.round(d.hi)] : null, brecha: r2(d.gap), brecha_vs_comparables: r2(d.gapComp), posicion: d.pos, sugerencia: A.ACTION[d.action], evidencia: d.evidence, comparables: d.comps.length });
    return [
      { name: 'resumen_categorias', description: 'Resumen por categoría analizada: productos propios y de competencia, estado y calidad del modelo de precio, índice de precio vs. mercado (1 = mediana), productos por debajo y por encima de su banda. Úsala primero para orientarte.', execute: () => E.cats.map((c) => { const m = E.model[c.id]; return { id: c.id, categoria: c.name, propios: E.own[c.id].length, competencia: E.pool[c.id].length, modelo: m.ok ? { r2_validacion: r2(m.r2cv), error_medio: r2(m.mape), confiabilidad: m.reliability } : { abstiene: TP.REASON_TEXT[m.reason], muestra: m.n, necesaria: m.need }, indice_vs_mercado: r2(A.indexVsMarket(E, c.id)), debajo_banda: E.diag[c.id].filter((d) => d.pos === 'below').length, encima_banda: E.diag[c.id].filter((d) => d.pos === 'above').length }; }) },
      { name: 'productos', description: 'Lista productos propios con su diagnóstico: precio actual, estimado por atributos, banda P10-P90, brecha, sugerencia y evidencia. Filtra por posición y categoría; ordenados por prioridad.', inputSchema: { type: 'object', properties: { posicion: { type: 'string', enum: ['below', 'above', 'in', 'na', 'all'] }, categoria: { type: 'string', description: 'id o nombre de la categoría (opcional)' }, limite: { type: 'number' } } }, execute: (i) => { const c = i.categoria ? catOf(i.categoria) : null; return E.allDiag.filter((d) => (!c || d.cat.id === c.id) && (!i.posicion || i.posicion === 'all' || d.pos === i.posicion)).sort((a, b) => b.priority - a.priority).slice(0, Math.min(25, Number(i.limite) || 10)).map(prod); } },
      { name: 'atributos', description: 'Coeficientes del modelo de una categoría: prima de precio por nivel de cada atributo y si es concluyente (intervalo 90 %).', inputSchema: { type: 'object', properties: { categoria: { type: 'string' } }, required: ['categoria'] }, execute: (i) => { const c = catOf(i.categoria); if (!c) throw new Error('Categoría no encontrada'); const m = E.model[c.id]; if (!m.ok) return { abstiene: TP.REASON_TEXT[m.reason], muestra: m.n, necesaria: m.need }; return m.coef.map((k) => ({ atributo: k.attr.name, prima_por_nivel: r2(k.pct), concluyente: k.sig })); } },
      { name: 'marcas', description: 'Comparación por marca en una categoría: número de productos, precio mínimo, mediano y máximo, mezcla Entrada/Core/Premium y proporción en promoción.', inputSchema: { type: 'object', properties: { categoria: { type: 'string' } }, required: ['categoria'] }, execute: (i) => { const c = catOf(i.categoria); if (!c) throw new Error('Categoría no encontrada'); return A.brandStats(E, { cat: c.id, brands: E.cfg.comps, priceType: 'list', mat: 'all', typ: 'all' }, c.id).map((r) => ({ marca: r.name, propia: r.own, productos: r.n, min: Math.round(r.min), mediana: Math.round(r.med), max: Math.round(r.max), mezcla_entrada_core_premium: r.bandMix.map(r2), en_promocion: r2(r.promoShare) })); } },
      { name: 'espacios_competitivos', description: 'White spaces de una categoría: combinaciones tipo × franja con alta oferta de la competencia y baja participación propia, con su clasificación (surtido, posicionamiento, atributos).', inputSchema: { type: 'object', properties: { categoria: { type: 'string' } }, required: ['categoria'] }, execute: (i) => { const c = catOf(i.categoria); if (!c) throw new Error('Categoría no encontrada'); return TP.whiteSpaces(c, E.own[c.id], E.pool[c.id], E.band[c.id], 'typ', E.model[c.id]).filter((x) => x.gap).map((x) => ({ tipo: x.key, franja: TP.BAND_NAMES[x.band], oferta_mercado: r2(x.mShare), tu_portafolio: r2(x.oShare), brecha: x.gap.type })); } },
      { name: 'simular_incremento', description: 'Efecto de un cambio uniforme de precio (porcentaje, negativo para bajar) sobre la posición frente a las bandas y franjas. No estima demanda.', inputSchema: { type: 'object', properties: { porcentaje: { type: 'number' }, categoria: { type: 'string' } }, required: ['porcentaje'] }, execute: (i) => { const x = Number(i.porcentaje) / 100; const c = i.categoria ? catOf(i.categoria) : null; const sc = c ? [c] : E.cats; let out = 0, inb = 0, fr = 0, tot = 0; sc.forEach((k) => E.diag[k.id].forEach((d) => { tot++; const np = d.p.list * (1 + x); if (d.hi && d.p.list <= d.hi && np > d.hi) out++; if (d.lo && d.p.list < d.lo && np >= d.lo) inb++; if (TP.bandOf(np, E.band[k.id]) !== TP.bandOf(d.p.list, E.band[k.id])) fr++; })); return { productos: tot, entran_a_su_banda: inb, quedan_por_encima: out, cambian_de_franja: fr }; } },
      { name: 'ir_a_vista', description: 'Lleva al usuario a una vista de la plataforma. vista: overview, market, advisor, launch, promo, pulse, learning, data. sub (opcional) para market: homolog, valor, categoria, producto, escalera, rangos, piramide, territorios, whitespace, composicion, capsulas, transversal; para advisor: diagnostico, modelo, aprobacion.', inputSchema: { type: 'object', properties: { vista: { type: 'string' }, sub: { type: 'string' }, categoria: { type: 'string' }, posicion: { type: 'string' } }, required: ['vista'] }, execute: (i) => { const c = i.categoria ? catOf(i.categoria) : null; actions.go(String(i.vista), { sub: i.sub, cat: c ? c.id : undefined, pos: i.posicion }); return 'Vista abierta.'; } },
    ];
  }
  const RULES = 'Eres el copiloto de pricing de la plataforma TITA Pricing Intelligence 360°, para equipos comerciales, de producto y de pricing. Responde en español, en 2 a 6 frases o una lista corta, con cifras concretas tomadas SOLO de las herramientas (no inventes datos; si no hay datos, dilo). Precios en la moneda del espacio. Recuerda cuando aplique: el precio estimado refleja lo que cobra el mercado por atributos similares; no es disposición a pagar ni precio óptimo, y un espacio con poca oferta no prueba que haya demanda. Si la respuesta tiene una vista que la respalda, usa ir_a_vista al final. No uses tablas Markdown.';
  const md = (t) => t.split(/\n{2,}/).map((para, i) => html`<p key=${i}>${para.split(/(\*\*[^*]+\*\*)/).map((s, j) => (s.startsWith('**') ? html`<b key=${j}>${s.slice(2, -2)}</b>` : s.split('\n').map((l, k) => (k ? [html`<br key=${'b' + k} />`, l] : l))))}</p>`);

  function Copilot({ E, f, open, setOpen, msgs, setMsgs, actions }) {
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState(false);
    const [mode, setMode] = useState('checking');
    const end = useRef(null), ctl = useRef(null), sref = useRef(null);
    useEffect(() => { end.current && end.current.scrollIntoView({ block: 'end' }); }, [msgs, open, busy]);
    useEffect(() => { let alive = true; (async () => { const s = await I.sample(); let lim = null; try { lim = s ? await s.limits() : null; } catch (e) { lim = null; } if (!alive) return; sref.current = s; setMode(s && lim && lim.tools ? 'llm' : 'rules'); })(); return () => { alive = false; }; }, []);
    const cat = E.D.catById[f.cat] || E.cats[0];
    const SUG = [
      ['cats', '¿Qué categorías tienen mayor oportunidad de mejorar su posicionamiento?'],
      ['compare', `¿Cómo se comparan mis ${cat ? cat.short.toLowerCase() : 'productos'} con los de la competencia?`],
      ['below', '¿Qué productos están por debajo de su rango competitivo?'],
      ['bands', '¿En qué franjas de precio tengo poca participación?'],
      ['attrs', `¿Qué atributos explican las diferencias de precio${cat ? ' en ' + cat.short.toLowerCase() : ''}?`],
      ['first', '¿Qué productos debería revisar primero?'],
      ['raise', '¿Qué ocurre si incremento mis precios un 5 %?'],
      ['validate', '¿Qué colección debería validar con consumidores?'],
    ];
    const askRules = (text, forced) => {
      const intent = forced || intentOf(text);
      const c = detectCat(E, text) || (intent === 'compare' || intent === 'attrs' ? f.cat : null);
      const pm = TP.strip(text).match(/(\d+(?:[.,]\d+)?)\s*%?/);
      const a = answer(E, f, intent, c, pm ? parseFloat(pm[1].replace(',', '.')) : null, actions);
      setMsgs((m) => [...m, { who: 'u', text }, { who: 'a', ...a }]);
    };
    const ask = async (text, forced) => {
      setQ('');
      if (mode !== 'llm' || !E.cats.length) return askRules(text, forced);
      const hist = msgs.filter((m) => m.who === 'u' || m.raw).slice(-6).map((m) => ({ role: m.who === 'u' ? 'user' : 'assistant', content: m.who === 'u' ? m.text : m.raw }));
      setMsgs((m) => [...m, { who: 'u', text }, { who: 'a', raw: '', live: true }]);
      ctl.current = new AbortController(); setBusy(true);
      const upd = (patch) => setMsgs((m) => { const n = [...m]; n[n.length - 1] = { ...n[n.length - 1], ...patch }; return n; });
      try {
        const res = await sref.current([{ role: 'user', content: RULES + '\n\nEspacio: ' + E.D.brandById.own.name + ', ' + E.cats.length + ' categorías, ' + E.cfg.comps.length + ' competidores, moneda ' + E.mk.currency + '. Vista actual: categoría ' + (cat ? cat.name : '—') + '.' }, ...hist, { role: 'user', content: text }], { tools: tools(E, actions), signal: ctl.current.signal, cache: false, onText: ({ text: t }) => upd({ raw: t }) });
        upd({ raw: res.text, live: false, basis: 'Respondido por Claude con las herramientas de datos de este espacio.' });
      } catch (e) {
        if (e.code === 'not_granted' || e.code === 'tools_unavailable' || e.code === 'sampling_disabled') { setMode('rules'); setMsgs((m) => m.slice(0, -2)); askRules(text, forced); }
        else upd({ raw: (e.text || '') + (e.code === 'cancelled' ? '' : '\n\n' + I.errText(e)), live: false });
      }
      setBusy(false);
    };
    if (!open) return null;
    return html`<aside className="copilot" aria-label="Copiloto de pricing">
      <div className="cphead"><div><b><${Icon} n="spark" /> Copiloto de pricing</b><small>${mode === 'llm' ? 'Claude responde con los datos de tu cuenta y te lleva a la vista que lo respalda.' : mode === 'rules' ? 'Claude no está disponible en este momento: respondo con reglas calculadas sobre tus datos.' : 'Conectando…'}</small></div><button type="button" className="iconbtn" aria-label="Cerrar copiloto" onClick=${() => setOpen(false)}><${Icon} n="x" /></button></div>
      <div className="cpbody">
        ${!msgs.length ? html`<p className="muted">Pregunta sobre tus precios, categorías o competidores. Te llevo a la vista que respalda cada respuesta.</p>` : null}
        ${msgs.map((m, i) => (m.who === 'u' ? html`<div key=${i} className="msg u">${m.text}</div>` : m.raw != null ? html`<div key=${i} className="msg a">${m.raw ? md(m.raw) : html`<span className="muted">Pensando…</span>`}${m.basis ? html`<small className="basis">${m.basis}</small>` : null}</div>` : html`<div key=${i} className="msg a">${m.text}${m.action ? html`<button type="button" className="btn sm" onClick=${() => { m.action.fn(); if (innerWidth < 900) setOpen(false); }}>${m.action.l}<${Icon} n="arrow" /></button>` : null}${m.basis ? html`<small className="basis">${m.conf ? html`<b>Confianza: ${m.conf.toLowerCase()}.</b> ` : null}${m.basis}</small>` : null}</div>`))}
        <div ref=${end}></div>
      </div>
      ${E.cats.length ? html`<div className="cpsug">${SUG.map(([k, t]) => html`<button key=${k} type="button" className="chip" disabled=${busy} onClick=${() => ask(t, k)}>${t}</button>`)}</div>` : null}
      <form className="cpin" onSubmit=${(e) => { e.preventDefault(); if (q.trim() && !busy) ask(q.trim()); }}><label htmlFor="cp-q" className="sr">Pregunta al copiloto</label><input id="cp-q" type="text" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${E.cats.length ? 'Escribe una pregunta…' : 'Clasifica productos para usar el copiloto'} disabled=${!E.cats.length} />${busy ? html`<button type="button" className="btn sm" onClick=${() => ctl.current && ctl.current.abort()}>Detener</button>` : html`<button type="submit" className="iconbtn" aria-label="Enviar" disabled=${!E.cats.length}><${Icon} n="send" /></button>`}</form>
    </aside>`;
  }

  /* =========================================================
     SHELL
     ========================================================= */
  const ROUTES = ['overview', 'market', 'advisor', 'launch', 'promo', 'pulse', 'learning', 'privados', 'data', 'config', 'usuarios'];
  const hashRoute = () => { const h = (location.hash || '').slice(1).split('/').pop(); return ROUTES.includes(h) ? h : 'overview'; };

  function Toasts() {
    const [list, setList] = useState([]);
    useEffect(() => { L.toast = (text, tone) => { const id = Date.now() + Math.random(); setList((l) => [...l.slice(-2), { id, text, tone }]); setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 6000); }; return () => { L.toast = () => {}; }; }, []);
    return html`<div className="toasts" aria-live="polite">${list.map((t) => html`<div key=${t.id} className=${'toast t-' + (t.tone || 'info')}>${t.text}</div>`)}</div>`;
  }
  const Center = ({ children }) => html`<div className="ob"><div className="ob-in narrowbox">${children}</div></div>`;
  const ROLE = { tita_admin: 'Administrador Tita', client_admin: 'Administrador del cliente', analyst: 'Analista', viewer: 'Lectura' };

  /* ---------- usuarios de una cuenta (Tita) ---------- */
  function UsersAdmin({ org }) {
    const [list, setList] = useState(null);
    const [f, setF] = useState({ name: '', email: '', role: 'client_admin' });
    const [msg, setMsg] = useState(null);
    const load = () => L.api('GET', '/admin/orgs/' + org + '/users').then(setList).catch((e) => L.toast(e.message, 'bad'));
    useEffect(() => { load(); }, [org]);
    const add = async (e) => { e.preventDefault(); try { const r = await L.api('POST', '/admin/orgs/' + org + '/users', f); setMsg({ email: f.email, pw: r.tempPassword }); setF({ name: '', email: '', role: f.role }); L.resetPeople(); load(); } catch (x) { L.toast(x.message, 'bad'); } };
    const reset = async (u) => { try { const r = await L.api('PATCH', '/admin/users/' + u.id, { resetPassword: true }); setMsg({ email: u.email, pw: r.tempPassword }); load(); } catch (x) { L.toast(x.message, 'bad'); } };
    const role = async (u, r) => { await L.api('PATCH', '/admin/users/' + u.id, { role: r }).catch((x) => L.toast(x.message, 'bad')); load(); };
    const [del, setDel] = useState(null);
    const remove = async (u) => { await L.api('DELETE', '/admin/users/' + u.id).catch((x) => L.toast(x.message, 'bad')); setDel(null); load(); };
    return html`<div className="page"><header className="ph"><div><div className="eyebrow">Usuarios de la cuenta</div><h1>¿Quién del cliente puede entrar?</h1><p>Crea los accesos del cliente. Cada persona recibe una contraseña temporal y debe cambiarla al entrar.</p></div></header>
      ${msg ? html`<${Note}>Contraseña temporal de <b>${msg.email}</b>: <span className="mono sel">${msg.pw}</span>. Cópiala y envíala por un canal seguro; no se vuelve a mostrar.<//>` : null}
      <form className="panel" onSubmit=${add}><h2>Nuevo usuario</h2><div className="grid-3f"><label className="fld" htmlFor="nu-n"><span>Nombre</span><input id="nu-n" value=${f.name} onInput=${(e) => setF({ ...f, name: e.target.value })} /></label><label className="fld" htmlFor="nu-e"><span>Correo</span><input id="nu-e" type="email" value=${f.email} onInput=${(e) => setF({ ...f, email: e.target.value })} /></label><${Select} id="nu-r" label="Rol" value=${f.role} onChange=${(v) => setF({ ...f, role: v })} options=${[{ v: 'client_admin', l: 'Administrador del cliente (aprueba, carga costos)' }, { v: 'analyst', l: 'Analista (propone cambios y estudios)' }, { v: 'viewer', l: 'Lectura (solo ve el análisis)' }]} /></div><div><button className="btn primary sm" type="submit">Crear acceso</button></div></form>
      <section className="panel">${!list ? html`<span className="spin"></span>` : list.length ? html`<div className="tw"><table className="tbl"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Último ingreso</th><th></th></tr></thead><tbody>${list.map((u) => html`<tr key=${u.id}><td><b>${u.name}</b>${u.must_change ? html`<small>pendiente de cambiar contraseña</small>` : null}</td><td>${u.email}</td><td><select aria-label="Rol" value=${u.role} onChange=${(e) => role(u, e.target.value)}><option value="client_admin">Administrador del cliente</option><option value="analyst">Analista</option><option value="viewer">Lectura</option></select></td><td>${u.last_login ? new Date(u.last_login).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td><td><div className="mapact"><button type="button" className="btn sm" onClick=${() => reset(u)}>Nueva contraseña</button>${del === u.id ? html`<button type="button" className="btn sm danger" onClick=${() => remove(u)}>Confirmar</button>` : html`<button type="button" className="btn sm ghost" onClick=${() => setDel(u.id)}>Quitar</button>`}</div></td></tr>`)}</tbody></table></div>` : html`<${Empty} title="Sin usuarios todavía">Crea al menos un administrador del cliente antes de publicar la cuenta.<//>`}</section></div>`;
  }

  /* ---------- espacio de una cuenta (Tita o cliente) ---------- */
  function Workspace({ me, orgId, orgInfo, onBack, refreshOrg }) {
    const P = L.perms(me.user.role);
    L.org = orgId;
    const ws = L.useWorkspace(orgId, { fast: P.tita });
    const jobs = L.useJobs(orgId, P.tita);
    const [route, setRoute] = useState(hashRoute);
    const [fRaw, setFRaw] = useState({ cat: null, off: [], priceType: 'list', mat: 'all', typ: 'all', pos: null });
    const [subs, setSubs] = useState({ market: 'valor', advisor: 'diagnostico', config: 'competidores', data: 'tiendas' });
    const [focus, setFocus] = useState(null);
    const [extraRecs, setExtraRecs] = useState([]);
    const [prefill, setPrefill] = useState(null);
    const [cpOpen, setCpOpen] = useState(false);
    const [msgs, setMsgs] = useState([]);
    const [navOpen, setNavOpen] = useState(false);
    const [pubAsk, setPubAsk] = useState(false);
    useEffect(() => { const on = () => setRoute(hashRoute()); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []);
    useEffect(() => { L.resetPeople(); }, [orgId]);
    const cfg = useMemo(() => ({ ...A.defaultConfig(), ...(ws.ws.config || {}) }), [ws.ws.config]);
    const dec = useMemo(() => ({ map: {}, comp: {}, ...(ws.ws.dec || {}) }), [ws.ws.dec]);
    const ready = ws.status === 'ready';
    const D = useMemo(() => (ready && Object.keys(ws.cats).length ? I.buildDataset(ws) : null), [ready, ws.stores, ws.catalog, ws.cats, ws.cls, ws.fixes, ws.labelmap, ws.priv, cfg.market]);
    const E = useMemo(() => { if (!D) return null; const e = A.compute(D, cfg, dec); e.P = P; e.ws = ws; return e; }, [D, cfg, dec, ws.history]);
    const approvals = useMemo(() => Object.values(ws.approvals).sort((a, b) => (b.at || '').localeCompare(a.at || '')), [ws.approvals]);
    const studies = useMemo(() => Object.values(ws.studies).sort((a, b) => (b.at || '').localeCompare(a.at || '')), [ws.studies]);

    if (ws.status === 'loading') return html`<${Center}><div className="mapact"><span className="spin"></span><span>Cargando la cuenta…</span></div><//>`;
    if (ws.status === 'error') return html`<${Center}><h2>No se pudo cargar la cuenta</h2><p className="muted">${ws.error}</p><button className="btn primary" type="button" onClick=${() => location.reload()}>Reintentar</button><//>`;
    if (ws.status === 'unpublished' || (!P.tita && !cfg.setupDone)) return html`<${Center}><div className="brandmark"><span className="logo">T</span>TITA Pricing Intelligence <b>360°</b></div><h2>Estamos preparando tu cuenta</h2><p className="muted">El equipo de Tita está importando los catálogos, definiendo las categorías y revisando la clasificación. Te avisaremos cuando el análisis esté listo.</p><button className="btn ghost" type="button" onClick=${() => L.api('POST', '/logout').then(() => location.reload())}>Cerrar sesión</button><//>`;
    const adminBar = P.tita ? html`<div className="adminbar"><button type="button" className="btn sm ghost" onClick=${onBack}><${Icon} n="arrow" cls="flip" />Cuentas</button><b>${orgInfo.name}</b><${Badge} tone=${orgInfo.published ? 'ok' : 'warn'}>${orgInfo.published ? 'Publicada: el cliente la ve' : 'Sin publicar: el cliente no la ve'}<//>
      ${pubAsk ? html`<span className="sm">${orgInfo.published ? '¿Ocultar la cuenta al cliente?' : '¿Publicar? El cliente verá todo el análisis.'}</span><button type="button" className="btn sm primary" onClick=${async () => { await L.api('PATCH', '/admin/orgs/' + orgId, { published: !orgInfo.published }); if (!orgInfo.published && !cfg.setupDone) await A.saveConfig(ws, { setupDone: true }); setPubAsk(false); refreshOrg(); }}>Confirmar</button><button type="button" className="btn sm ghost" onClick=${() => setPubAsk(false)}>Cancelar</button>` : html`<button type="button" className="btn sm" onClick=${() => setPubAsk(true)}>${orgInfo.published ? 'Despublicar' : 'Publicar para el cliente'}</button>`}
      <button type="button" className="btn sm" disabled=${!Object.keys(ws.stores).length} onClick=${() => L.runJob('refresh')}>Actualizar todo ahora</button></div>` : null;
    if (P.tita && !cfg.setupDone) return html`<div>${adminBar}<${A.Setup} ws=${ws} ro=${false} jobs=${jobs} orgName=${orgInfo.name} /><${Toasts} /></div>`;
    if (!E || !D) return html`<div>${adminBar}<${Center}><h2>Sin categorías todavía</h2><p className="muted">${P.tita ? 'Define las categorías en Catálogo y clasificación.' : 'La cuenta aún no tiene categorías.'}</p>${P.tita ? html`<button className="btn primary" type="button" onClick=${() => A.saveConfig(ws, { setupDone: false, step: 3 })}>Ir a categorías</button>` : null}<//><${Toasts} /></div>`;

    const cat = E.cats.some((c) => c.id === fRaw.cat) ? fRaw.cat : E.cats[0] && E.cats[0].id;
    const f = { ...fRaw, cat, brands: E.cfg.comps.filter((b) => !fRaw.off.includes(b)) };
    const setF = (n) => setFRaw({ ...n, off: E.cfg.comps.filter((b) => !n.brands.includes(b)), brands: undefined });
    const allowed = (r) => (['data', 'config', 'usuarios'].includes(r) ? P.tita : r === 'privados' ? P.priv && !P.tita : true);
    const go = (r, o = {}) => {
      if (!ROUTES.includes(r) || !allowed(r)) r = 'overview';
      const n = { ...fRaw };
      if (o.cat && E.cats.some((c) => c.id === o.cat)) { n.cat = o.cat; n.mat = 'all'; n.typ = 'all'; }
      if (o.priceType) n.priceType = o.priceType;
      n.pos = o.pos || null;
      setFRaw(n);
      if (o.sub) setSubs((s) => ({ ...s, [r]: o.sub }));
      if (o.prefill) setPrefill({ ...o.prefill, t: Date.now() });
      setNavOpen(false);
      if (location.hash.slice(1) !== r) location.hash = r;
      setRoute(r);
      try { document.querySelector('.main').scrollTo(0, 0); } catch (e) { /* sin scroll */ }
    };
    const rt = allowed(route) ? route : 'overview';
    const openProduct = (catId, pid) => { setFocus(pid); go('advisor', { cat: catId, sub: 'diagnostico' }); };
    const actions = { go, openProduct };
    const setSub = (k) => setSubs((s) => ({ ...s, [rt]: k }));
    const setDec = (n) => (P.config ? L.set('ws/dec', { map: n.map || {}, comp: n.comp || {} }) : Promise.resolve());
    const setCfg = (n) => A.saveConfig(ws, n);
    const common = { E, ws, D, f, setF, dec, setDec, setCfg, go, openProduct, focus, setFocus, approvals, studies, sub: subs[rt], setSub, P, ro: !P.write, jobs };
    const pend = approvals.filter((a) => a.status === 'pendiente').length;
    const needCats = !E.cats.length && ['market', 'advisor', 'launch', 'promo'].includes(rt);
    let view;
    if (needCats) view = html`<div className="page"><${Empty} icon="store" title="Todavía no hay productos clasificados en las categorías" action=${P.tita ? html`<button type="button" className="btn primary" onClick=${() => go('data', { sub: 'clasificacion' })}>Ir a clasificación</button>` : null}>El análisis empieza cuando haya productos de la tienda y de la competencia clasificados.<//></div>`;
    else switch (rt) {
      case 'market': view = html`<${A.Market} ...${common} addStudyRec=${(r) => setExtraRecs((x) => [r, ...x].slice(0, 3))} />`; break;
      case 'advisor': view = html`<${A.Advisor} ...${common} />`; break;
      case 'launch': view = html`<${A.Launch} key=${prefill ? prefill.t : 'l'} ...${common} prefill=${prefill} />`; break;
      case 'promo': view = html`<${A.Promo} ...${common} />`; break;
      case 'pulse': view = html`<${A.Pulse} ...${common} extraRecs=${extraRecs} />`; break;
      case 'learning': view = html`<${A.Learning} ...${common} />`; break;
      case 'data': view = html`<${A.DataModule} ...${common} />`; break;
      case 'config': view = html`<${A.Config} ...${common} />`; break;
      case 'usuarios': view = html`<${UsersAdmin} org=${orgId} />`; break;
      case 'privados': view = html`<div className="page"><header className="ph"><div><div className="eyebrow">Datos privados</div><h1>Costos y ventas</h1><p>Solo los ven los administradores de tu cuenta y el equipo de Tita.</p></div></header><${A.PrivateImport} ws=${ws} ro=${!P.priv} /></div>`; break;
      default: view = html`<${A.Overview} ...${common} />`;
    }
    const NAV = [
      ['Inteligencia', [['overview', 'Overview', 'overview'], ['market', 'Market Intelligence', 'market'], ['advisor', 'Price Advisor', 'advisor']]],
      ['Decisiones', [['launch', 'Product Launch', 'launch'], ['promo', 'Promotion Optimizer', 'promo']]],
      ['Validación y aprendizaje', [['pulse', 'Pulse WTP', 'pulse'], ['learning', 'Revenue Learning', 'learning']]],
      ...(P.tita ? [['Administración Tita', [['data', 'Catálogo y clasificación', 'store'], ['config', 'Configuración', 'config'], ['usuarios', 'Usuarios', 'lock']]]] : P.priv ? [['Datos', [['privados', 'Costos y ventas', 'upload']]]] : []),
    ];
    const navItem = ([k, l, ic]) => html`<a key=${k} href=${'#' + k} className=${rt === k ? 'on' : ''} aria-current=${rt === k ? 'page' : undefined} onClick=${(e) => { e.preventDefault(); go(k); }}><${Icon} n=${ic} />${l}${k === 'market' && E.pendingMaps && P.tita ? html`<span className="cnt">${E.pendingMaps}</span>` : null}${k === 'advisor' && pend ? html`<span className="cnt">${pend}</span>` : null}${k === 'data' && D.pending ? html`<span className="cnt" title="Productos sin clasificar">${D.pending > 999 ? '999+' : D.pending}</span>` : null}</a>`;
    return html`<div className=${'shell ' + (cpOpen ? 'cp-on' : '')}>
      <aside className=${'side ' + (navOpen ? 'open' : '')}>
        <div className="brandmark"><span className="logo">T</span><div><b>TITA Pricing</b><small>Intelligence 360°</small></div></div>
        <nav aria-label="Módulos">${NAV.map(([g, items]) => html`<div key=${g} className="ng"><span>${g}</span>${items.map(navItem)}</div>`)}</nav>
        <div className="sidefoot"><div className="tenant"><span className="muted">Cuenta</span><b>${orgInfo.name}</b><small>${me.user.name} · ${ROLE[me.user.role]}</small><button type="button" className="linkbtn side-link" onClick=${() => L.api('POST', '/logout').then(() => location.reload())}>Cerrar sesión</button></div></div>
      </aside>
      ${navOpen ? html`<div className="scrim" onClick=${() => setNavOpen(false)}></div>` : null}
      <div className="main">
        ${adminBar}
        <header className="top">
          <button type="button" className="iconbtn menu" aria-label="Abrir menú" onClick=${() => setNavOpen(true)}><${Icon} n="menu" /></button>
          <div className="topctx"><b>${D.brandById.own.name}</b><span className="muted">${(ws.stores.own && ws.stores.own.url) ? I.hostOf(ws.stores.own.url) : ''}</span><span className="pill">${E.mk.currency}</span><span className="pill">${D.products.filter((p) => p.cat).length} productos clasificados</span>${(ws.stores.own || {}).importedAt ? html`<span className="pill">Datos al ${new Date(ws.stores.own.importedAt).toLocaleDateString('es-CO')}</span>` : null}${!P.write ? html`<span className="pill demo">Solo lectura</span>` : null}</div>
          <button type="button" className=${'btn sm cpbtn ' + (cpOpen ? 'primary' : '')} disabled=${!me.ai} title=${me.ai ? '' : 'Falta configurar la API de Claude en el servidor'} onClick=${() => setCpOpen(!cpOpen)} aria-expanded=${cpOpen}><${Icon} n="spark" />Copiloto</button>
        </header>
        <main id="content">${view}</main>
      </div>
      <${Copilot} E=${E} f=${f} open=${cpOpen} setOpen=${setCpOpen} msgs=${msgs} setMsgs=${setMsgs} actions=${actions} />
      <${Toasts} />
    </div>`;
  }

  /* ---------- consola Tita: cuentas de clientes ---------- */
  function AdminHome({ me, open }) {
    const [orgs, setOrgs] = useState(null);
    const [name, setName] = useState('');
    const [team, setTeam] = useState(null);
    const [tf, setTf] = useState({ name: '', email: '' });
    const [msg, setMsg] = useState(null);
    const load = () => { L.api('GET', '/admin/orgs').then(setOrgs).catch((e) => L.toast(e.message, 'bad')); L.api('GET', '/admin/team').then(setTeam).catch(() => {}); };
    useEffect(() => { load(); }, []);
    const create = async (e) => { e.preventDefault(); try { const r = await L.api('POST', '/admin/orgs', { name }); setName(''); open(r.id); } catch (x) { L.toast(x.message, 'bad'); } };
    const addTeam = async (e) => { e.preventDefault(); try { const r = await L.api('POST', '/admin/team', tf); setMsg({ email: tf.email, pw: r.tempPassword }); setTf({ name: '', email: '' }); load(); } catch (x) { L.toast(x.message, 'bad'); } };
    return html`<div className="adminhome"><header className="top"><div className="topctx"><span className="logo">T</span><b>Consola Tita · Pricing Intelligence 360°</b></div><span className="sm muted">${me.user.name}</span><button type="button" className="btn sm ghost" onClick=${() => L.api('POST', '/logout').then(() => location.reload())}>Cerrar sesión</button></header>
      <div className="page">
        ${!me.ai ? html`<${Note} tone="warn">El servidor no tiene configurada la API de Claude (ANTHROPIC_API_KEY): la importación automática funciona, pero no se pueden proponer categorías, clasificar ni usar el copiloto.<//>` : null}
        ${me.user.mustChange ? null : null}
        <header className="ph"><div><div className="eyebrow">Cuentas de clientes</div><h1>¿Qué cuentas administra Tita?</h1><p>Cada cuenta tiene su tienda, sus competidores, sus categorías y sus usuarios. El cliente solo ve su cuenta, y solo cuando la publicas.</p></div>
          <form className="newacct" onSubmit=${create}><label className="fld" htmlFor="no-n"><span>Nueva cuenta</span><input id="no-n" placeholder="Nombre del cliente" value=${name} onInput=${(e) => setName(e.target.value)} /></label><button className="btn primary" type="submit" disabled=${!name.trim()}>Crear y configurar</button></form></header>
        <section className="panel">${!orgs ? html`<span className="spin"></span>` : orgs.length ? html`<div className="tw"><table className="tbl"><thead><tr><th>Cliente</th><th>Estado</th><th className="num">Tiendas</th><th className="num">Productos</th><th className="num">Usuarios</th><th>Última actividad</th><th></th></tr></thead><tbody>${orgs.map((o) => html`<tr key=${o.id} className="click" onClick=${() => open(o.id)}><td><b>${o.name}</b><small>${o.id}</small></td><td><${Badge} tone=${o.published ? 'ok' : 'warn'}>${o.published ? 'Publicada' : 'En configuración'}<//>${o.last_job === 'running' || o.last_job === 'queued' ? html` <${Badge} tone="info">trabajo en curso<//>` : o.last_job === 'failed' ? html` <${Badge} tone="down">último trabajo falló<//>` : null}</td><td className="num">${o.stores}</td><td className="num">${o.products}</td><td className="num">${o.users}</td><td>${o.updated_at ? new Date(o.updated_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td><td><button type="button" className="btn sm">Abrir</button></td></tr>`)}</tbody></table></div>` : html`<${Empty} icon="store" title="Aún no hay cuentas">Crea la primera cuenta con el nombre del cliente.<//>`}</section>
        <section className="panel"><h2>Equipo Tita</h2><p className="muted">Administradores con acceso a todas las cuentas.</p>
          ${msg ? html`<${Note}>Contraseña temporal de <b>${msg.email}</b>: <span className="mono sel">${msg.pw}</span>. Envíala por un canal seguro.<//>` : null}
          ${team ? html`<ul className="plain">${team.map((t) => html`<li key=${t.id}>${t.name} · ${t.email}</li>`)}</ul>` : null}
          <form className="mapact" onSubmit=${addTeam}><input aria-label="Nombre" placeholder="Nombre" value=${tf.name} onInput=${(e) => setTf({ ...tf, name: e.target.value })} /><input aria-label="Correo" type="email" placeholder="correo@titamedia.com" value=${tf.email} onInput=${(e) => setTf({ ...tf, email: e.target.value })} /><button className="btn sm" type="submit">Agregar administrador</button></form></section>
      </div><${Toasts} /></div>`;
  }

  /* ---------- acceso ---------- */
  function Login({ onDone }) {
    const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
    const submit = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await L.api('POST', '/login', { email, password: pw }); onDone(); } catch (x) { setErr(x.message); } setBusy(false); };
    return html`<${Center}><div className="brandmark"><span className="logo">T</span>TITA Pricing Intelligence <b>360°</b></div><h1>Inteligencia de precios para tu catálogo</h1><form className="urlform" onSubmit=${submit}><label className="fld" htmlFor="lg-e"><span>Correo</span><input id="lg-e" type="email" autoComplete="username" value=${email} onInput=${(e) => setEmail(e.target.value)} /></label><label className="fld" htmlFor="lg-p"><span>Contraseña</span><input id="lg-p" type="password" autoComplete="current-password" value=${pw} onInput=${(e) => setPw(e.target.value)} /></label>${err ? html`<div className="err" role="alert">${err}</div>` : null}<button className="btn primary" type="submit" disabled=${busy || !email || !pw}>${busy ? 'Entrando…' : 'Entrar'}</button></form><p className="muted sm">¿No tienes acceso? Escríbele a tu contacto en Tita Media.</p><//>`;
  }
  function ChangePassword({ onDone }) {
    const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState('');
    const submit = async (e) => { e.preventDefault(); if (pw !== pw2) { setErr('Las contraseñas no coinciden.'); return; } try { await L.api('POST', '/me/password', { password: pw }); onDone(); } catch (x) { setErr(x.message); } };
    return html`<${Center}><h2>Crea tu contraseña</h2><p className="muted">Entraste con una contraseña temporal. Elige una nueva de al menos 10 caracteres.</p><form className="urlform" onSubmit=${submit}><label className="fld" htmlFor="cp-1"><span>Nueva contraseña</span><input id="cp-1" type="password" autoComplete="new-password" value=${pw} onInput=${(e) => setPw(e.target.value)} /></label><label className="fld" htmlFor="cp-2"><span>Repítela</span><input id="cp-2" type="password" autoComplete="new-password" value=${pw2} onInput=${(e) => setPw2(e.target.value)} /></label>${err ? html`<div className="err">${err}</div>` : null}<button className="btn primary" type="submit">Guardar y continuar</button></form><//>`;
  }

  function App() {
    const [me, setMe] = useState(undefined);
    const [orgId, setOrgId] = useState(() => { try { return sessionStorage.getItem('tita-org'); } catch (e) { return null; } });
    const [orgInfo, setOrgInfo] = useState(null);
    const loadMe = () => L.api('GET', '/me').then((m) => { L.uid = m.user.id; L.role = m.user.role; setMe(m); }).catch(() => setMe(null));
    useEffect(() => { L.onUnauth = () => setMe(null); loadMe(); }, []);
    const target = me && me.user.role !== 'tita_admin' ? me.org && me.org.id : orgId;
    const loadOrg = () => target && L.api('GET', '/orgs/' + target).then(setOrgInfo).catch(() => { setOrgId(null); });
    useEffect(() => { setOrgInfo(null); loadOrg(); }, [target]);
    const open = (id) => { try { sessionStorage.setItem('tita-org', id); } catch (e) { /* sin almacenamiento */ } location.hash = 'overview'; setOrgId(id); };
    const back = () => { try { sessionStorage.removeItem('tita-org'); } catch (e) { /* sin almacenamiento */ } location.hash = ''; setOrgId(null); };
    if (me === undefined) return html`<${Center}><span className="spin"></span><//>`;
    if (me === null) return html`<${Login} onDone=${loadMe} />`;
    if (me.user.mustChange) return html`<${ChangePassword} onDone=${loadMe} />`;
    if (me.user.role === 'tita_admin' && !orgId) return html`<${AdminHome} me=${me} open=${open} />`;
    if (!target) return html`<${Center}><h2>Tu usuario no tiene una cuenta asignada</h2><p className="muted">Pide acceso a tu contacto en Tita Media.</p><//>`;
    if (!orgInfo) return html`<${Center}><span className="spin"></span><//>`;
    return html`<${Workspace} key=${target} me=${me} orgId=${target} orgInfo=${orgInfo} onBack=${back} refreshOrg=${loadOrg} />`;
  }

  class Boundary extends React.Component {
    constructor(p) { super(p); this.state = { err: null }; }
    static getDerivedStateFromError(err) { return { err }; }
    render() {
      if (this.state.err) return html`<div className="ob"><div className="ob-in"><h2>Algo falló al dibujar esta vista</h2><p className="muted">${String(this.state.err && this.state.err.message)}</p><button className="btn primary" type="button" onClick=${() => { location.hash = ''; location.reload(); }}>Volver al inicio</button></div></div>`;
      return this.props.children;
    }
  }
  ReactDOM.createRoot(document.getElementById('root')).render(html`<${Boundary}><${App} /><//>`);
})();
