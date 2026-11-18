/* TITA Pricing Intelligence 360° — copiloto (Claude con herramientas sobre los datos del espacio,
   con respaldo por reglas), shell de navegación y arranque. */
(function () {
  'use strict';
  const { useState, useMemo, useEffect, useRef } = React;
  const TP = window.TP, UI = TP.ui, html = UI.html, A = TP.app, L = TP.live, I = TP.ingest;
  const { Icon, Badge, Thumb, Empty, Note } = UI;

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
      <div className="cphead"><div><b><${Icon} n="spark" /> Copiloto de pricing</b><small>${mode === 'llm' ? 'Claude responde con los datos de este espacio. Cada pregunta usa tu cuota de Claude.' : mode === 'rules' ? 'Claude no está disponible en esta vista: respondo con reglas calculadas sobre tus datos.' : 'Conectando…'}</small></div><button type="button" className="iconbtn" aria-label="Cerrar copiloto" onClick=${() => setOpen(false)}><${Icon} n="x" /></button></div>
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
  const NAV = [
    ['Inteligencia', [['overview', 'Overview', 'overview'], ['market', 'Market Intelligence', 'market'], ['advisor', 'Price Advisor', 'advisor']]],
    ['Decisiones', [['launch', 'Product Launch', 'launch'], ['promo', 'Promotion Optimizer', 'promo']]],
    ['Validación y aprendizaje', [['pulse', 'Pulse WTP', 'pulse'], ['learning', 'Revenue Learning', 'learning']]],
    ['Datos', [['data', 'Catálogo y clasificación', 'store']]],
  ];
  const ROUTES = ['overview', 'market', 'advisor', 'launch', 'promo', 'pulse', 'learning', 'data', 'config'];
  const hashRoute = () => { const h = (location.hash || '').slice(1); return ROUTES.includes(h) ? h : 'overview'; };

  function Toasts() {
    const [list, setList] = useState([]);
    useEffect(() => { L.toast = (text, tone) => { const id = Date.now() + Math.random(); setList((l) => [...l.slice(-2), { id, text, tone }]); setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 6000); }; return () => { L.toast = () => {}; }; }, []);
    return html`<div className="toasts" aria-live="polite">${list.map((t) => html`<div key=${t.id} className=${'toast t-' + (t.tone || 'info')}>${t.text}</div>`)}</div>`;
  }

  function App() {
    const ws = L.useWorkspace();
    const [P, setP] = useState({ write: null, edit: false });
    const [route, setRoute] = useState(hashRoute);
    const [fRaw, setFRaw] = useState({ cat: null, off: [], priceType: 'list', mat: 'all', typ: 'all', pos: null });
    const [subs, setSubs] = useState({ market: 'valor', advisor: 'diagnostico', config: 'competidores', data: 'tiendas' });
    const [focus, setFocus] = useState(null);
    const [extraRecs, setExtraRecs] = useState([]);
    const [prefill, setPrefill] = useState(null);
    const [cpOpen, setCpOpen] = useState(false);
    const [msgs, setMsgs] = useState([]);
    const [navOpen, setNavOpen] = useState(false);
    useEffect(() => { const on = () => setRoute(hashRoute()); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []);
    useEffect(() => { if (ws.status !== 'ready' && ws.status !== 'slow') return; (async () => { const w = await L.canWrite(); const e = await L.canEdit(); setP({ write: w !== false, edit: e }); })(); }, [ws.status]);
    const cfg = useMemo(() => ({ ...A.defaultConfig(), ...(ws.ws.config || {}) }), [ws.ws.config]);
    const dec = useMemo(() => ({ map: {}, comp: {}, ...(ws.ws.dec || {}) }), [ws.ws.dec]);
    const D = useMemo(() => (cfg.setupDone ? I.buildDataset(ws) : null), [cfg.setupDone, ws.stores, ws.catalog, ws.cats, ws.cls, ws.fixes, ws.labelmap, ws.priv, cfg.market]);
    const E = useMemo(() => (D ? A.compute(D, cfg, dec) : null), [D, cfg, dec]);
    const approvals = useMemo(() => Object.values(ws.approvals).sort((a, b) => (b.at || '').localeCompare(a.at || '')), [ws.approvals]);
    const studies = useMemo(() => Object.values(ws.studies).sort((a, b) => (b.at || '').localeCompare(a.at || '')), [ws.studies]);

    if (ws.status === 'loading') return html`<div className="ob"><div className="ob-in"><div className="mapact"><span className="spin"></span><span>Cargando el espacio de trabajo…</span></div></div></div>`;
    if (ws.status === 'nodb' || ws.status === 'revoked' || ws.status === 'error') return html`<div className="ob"><div className="ob-in"><h2>No se puede abrir el espacio de trabajo</h2><p className="muted">${ws.status === 'nodb' ? 'Esta vista no tiene acceso a la base de datos del espacio. Abre la página dentro de claude.ai con tu cuenta.' : ws.status === 'revoked' ? 'Se retiró tu acceso.' : 'La base de datos respondió con un error (' + (ws.error || '') + '). Recarga la página.'}</p></div></div>`;
    const slowNote = ws.status === 'slow' ? html`<div className="confirm">No se pudo confirmar la conexión con la base de datos; lo que ves puede estar desactualizado.</div>` : null;
    const ro = P.write === false;
    if (!cfg.setupDone) return html`<div>${slowNote}<${A.Setup} ws=${ws} ro=${ro} /><${Toasts} /></div>`;

    const cat = E.cats.some((c) => c.id === fRaw.cat) ? fRaw.cat : E.cats[0] && E.cats[0].id;
    const f = { ...fRaw, cat, brands: E.cfg.comps.filter((b) => !fRaw.off.includes(b)) };
    const setF = (n) => setFRaw({ ...n, off: E.cfg.comps.filter((b) => !n.brands.includes(b)), brands: undefined });
    const go = (r, o = {}) => {
      if (!ROUTES.includes(r)) r = 'overview';
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
    const openProduct = (catId, pid) => { setFocus(pid); go('advisor', { cat: catId, sub: 'diagnostico' }); };
    const actions = { go, openProduct };
    const setSub = (k) => setSubs((s) => ({ ...s, [route]: k }));
    const setDec = (n) => L.set('ws/dec', { map: n.map || {}, comp: n.comp || {} });
    const setCfg = (n) => A.saveConfig(ws, n);
    const common = { E, ws, D, f, setF, dec, setDec, setCfg, go, openProduct, focus, setFocus, approvals, studies, sub: subs[route], setSub, P, ro };
    const pend = approvals.filter((a) => a.status === 'pendiente').length;
    const needCats = !E.cats.length && ['market', 'advisor', 'launch', 'promo'].includes(route);

    let view;
    if (needCats) view = html`<div className="page"><${Empty} icon="store" title="Todavía no hay productos tuyos clasificados en tus categorías" action=${html`<button type="button" className="btn primary" onClick=${() => go('data', { sub: 'clasificacion' })}>Ir a clasificación</button>`}>El análisis empieza cuando Claude clasifica al menos algunos productos de tu tienda y de la competencia.<//></div>`;
    else switch (route) {
      case 'market': view = html`<${A.Market} ...${common} addStudyRec=${(r) => setExtraRecs((x) => [r, ...x].slice(0, 3))} />`; break;
      case 'advisor': view = html`<${A.Advisor} ...${common} />`; break;
      case 'launch': view = html`<${A.Launch} key=${prefill ? prefill.t : 'l'} ...${common} prefill=${prefill} />`; break;
      case 'promo': view = html`<${A.Promo} ...${common} />`; break;
      case 'pulse': view = html`<${A.Pulse} ...${common} extraRecs=${extraRecs} />`; break;
      case 'learning': view = html`<${A.Learning} ...${common} />`; break;
      case 'data': view = html`<${A.DataModule} ...${common} />`; break;
      case 'config': view = html`<${A.Config} ...${common} />`; break;
      default: view = html`<${A.Overview} ...${common} />`;
    }
    const navItem = ([k, l, ic]) => html`<a key=${k} href=${'#' + k} className=${route === k ? 'on' : ''} aria-current=${route === k ? 'page' : undefined} onClick=${(e) => { e.preventDefault(); go(k); }}><${Icon} n=${ic} />${l}${k === 'market' && E.pendingMaps ? html`<span className="cnt">${E.pendingMaps}</span>` : null}${k === 'advisor' && pend ? html`<span className="cnt">${pend}</span>` : null}${k === 'data' && D.pending ? html`<span className="cnt" title="Productos sin clasificar">${D.pending > 999 ? '999+' : D.pending}</span>` : null}</a>`;
    return html`<div className=${'shell ' + (cpOpen ? 'cp-on' : '')}>
      <aside className=${'side ' + (navOpen ? 'open' : '')}>
        <div className="brandmark"><span className="logo">T</span><div><b>TITA Pricing</b><small>Intelligence 360°</small></div></div>
        <nav aria-label="Módulos">${NAV.map(([g, items]) => html`<div key=${g} className="ng"><span>${g}</span>${items.map(navItem)}</div>`)}</nav>
        <div className="sidefoot">${navItem(['config', 'Configuration', 'config'])}<div className="tenant"><span className="muted">Espacio de trabajo</span><b>${D.brandById.own.name}</b><small>${Object.keys(ws.stores).length - 1} competidores · ${TP.MARKETS[cfg.market].name}</small></div></div>
      </aside>
      ${navOpen ? html`<div className="scrim" onClick=${() => setNavOpen(false)}></div>` : null}
      <div className="main">
        <header className="top">
          <button type="button" className="iconbtn menu" aria-label="Abrir menú" onClick=${() => setNavOpen(true)}><${Icon} n="menu" /></button>
          <div className="topctx"><b>${D.brandById.own.name}</b><span className="muted">${(ws.stores.own && ws.stores.own.url) ? I.hostOf(ws.stores.own.url) : ''}</span><span className="pill">${E.mk.currency}</span><span className="pill">${D.products.filter((p) => p.cat).length} productos clasificados</span>${ro ? html`<span className="pill demo">Solo lectura</span>` : null}</div>
          <button type="button" className=${'btn sm cpbtn ' + (cpOpen ? 'primary' : '')} onClick=${() => setCpOpen(!cpOpen)} aria-expanded=${cpOpen}><${Icon} n="spark" />Copiloto</button>
        </header>
        ${slowNote}
        <main id="content">${view}</main>
      </div>
      <${Copilot} E=${E} f=${f} open=${cpOpen} setOpen=${setCpOpen} msgs=${msgs} setMsgs=${setMsgs} actions=${actions} />
      <${Toasts} />
    </div>`;
  }

  class Boundary extends React.Component {
    constructor(p) { super(p); this.state = { err: null }; }
    static getDerivedStateFromError(err) { return { err }; }
    render() {
      if (this.state.err) return html`<div className="ob"><div className="ob-in"><h2>Algo falló al dibujar esta vista</h2><p className="muted">${String(this.state.err && this.state.err.message)}</p><button className="btn primary" type="button" onClick=${() => { location.hash = 'overview'; location.reload(); }}>Volver al inicio</button></div></div>`;
      return this.props.children;
    }
  }
  ReactDOM.createRoot(document.getElementById('root')).render(html`<${Boundary}><${App} /><//>`);
})();
