/* TITA Pricing Intelligence 360° — motor de estado, onboarding, Overview y Market Intelligence. */
(function () {
  'use strict';
  const { useState, useMemo, useEffect } = React;
  const TP = window.TP, UI = TP.ui, html = UI.html;
  const { Icon, Badge, Seg, Select, Empty, Note, SimTag, Thumb } = UI;
  const A = (TP.app = {});

  /* ---------- motor: todo el análisis se recalcula desde cfg + decisiones ---------- */
  const hCache = new WeakMap();
  A.policyOf = (cfg) => ({ ...cfg.policy, useCost: true });
  A.compute = function (D, cfg, dec) {
    let H = hCache.get(D); if (!H) { H = TP.homologate(D); hCache.set(D, H); }
    const comps = cfg.comps.filter((b) => D.brandById[b]);
    const cfg2 = { ...cfg, comps };
    const E = { D, H, cfg: cfg2, dec, mk: D.mk, cats: D.cats.filter((c) => cfg.cats.includes(c.id)), pool: {}, own: {}, model: {}, band: {}, diag: {} };
    const pol = A.policyOf(cfg);
    E.cats.forEach((c) => {
      const pool = TP.categoryPool(D, H, c.id, comps, dec.map);
      const own = D.products.filter((p) => p.brand === 'own' && p.cat === c.id);
      const on = c.attrs.filter((a) => !(cfg.attrsOff[c.id] || []).includes(a.id)).map((a) => a.id);
      const model = pool.length ? TP.fitModel(c, pool, on) : { ok: false, reason: 'muestra', n: 0, need: TP.minSample(on.length), k: on.length, nRaw: 0 };
      E.pool[c.id] = pool; E.own[c.id] = own; E.model[c.id] = model;
      E.band[c.id] = pool.length ? TP.bands(pool, cfg.franjas[c.id]) : TP.bands(own.length ? own : [{ list: 1 }], cfg.franjas[c.id]);
      E.diag[c.id] = own.map((p) => TP.diagnose(c, model, p, TP.comparablesFor(c, p, pool, dec.comp), pol, D.mk));
    });
    E.cats = E.cats.filter((c) => E.own[c.id].length);
    E.allDiag = E.cats.flatMap((c) => E.diag[c.id].map((d) => ({ ...d, cat: c })));
    E.pendingMaps = H.filter((h) => cfg.cats.includes(h.cat) && comps.includes(h.brand) && h.status !== 'equiv' && !dec.map[h.key]).length;
    E.hasCost = D.products.some((p) => p.brand === 'own' && p.cost > 0);
    E.hasUnits = D.products.some((p) => p.brand === 'own' && p.cost > 0 && p.units > 0);
    return E;
  };
  A.brandName = (E, id) => (E.D.brandById[id] || { name: id }).name;
  A.priceOf = (p, priceType) => (priceType === 'promo' && p.promo ? p.promo : p.list);
  A.viewPool = (E, f, catId) => (E.pool[catId] || []).filter((p) => f.brands.includes(p.brand) && (f.mat === 'all' || p.mat === f.mat) && (f.typ === 'all' || p.typ === f.typ));
  A.viewOwn = (E, f, catId) => (E.own[catId] || []).filter((p) => (f.mat === 'all' || p.mat === f.mat) && (f.typ === 'all' || p.typ === f.typ));
  A.indexVsMarket = (E, catId) => { const o = E.own[catId].map((p) => p.list), m = E.pool[catId].map((p) => p.list); return o.length && m.length ? TP.median(o) / TP.median(m) : NaN; };
  A.POS = { below: { t: 'Por debajo de su banda', tone: 'up' }, above: { t: 'Por encima de su banda', tone: 'down' }, in: { t: 'Dentro de su banda', tone: 'ok' }, na: { t: 'Sin estimación del modelo', tone: 'neutral' } };
  A.ACTION = { up: 'Evaluar incremento', down: 'Revisar posible sobreprecio', keep: 'Mantener' };

  /* ---------- barra de filtros compartida ---------- */
  A.FilterBar = function ({ E, f, setF, showPrice = true }) {
    const cat = E.D.catById[f.cat];
    const comps = E.cfg.comps;
    const toggle = (b) => setF({ ...f, brands: f.brands.includes(b) ? f.brands.filter((x) => x !== b) : [...f.brands, b] });
    return html`<div className="filters" role="region" aria-label="Filtros activos">
      <${Select} id="f-cat" label="Categoría" value=${f.cat} onChange=${(v) => setF({ ...f, cat: v, mat: 'all', typ: 'all' })} options=${E.cats.map((c) => ({ v: c.id, l: c.name }))} compact />
      <${Select} id="f-typ" label="Tipología" value=${f.typ} onChange=${(v) => setF({ ...f, typ: v })} options=${[{ v: 'all', l: 'Todas' }, ...cat.typologies.map((t) => ({ v: t, l: t }))]} compact />
      <${Select} id="f-mat" label="Material" value=${f.mat} onChange=${(v) => setF({ ...f, mat: v })} options=${[{ v: 'all', l: 'Todos' }, ...cat.materials.map((t) => ({ v: t, l: t }))]} compact />
      ${showPrice ? html`<div className="fld compact"><span>Precio</span><${Seg} label="Tipo de precio" value=${f.priceType} onChange=${(v) => setF({ ...f, priceType: v })} options=${[{ v: 'list', l: 'Lista' }, { v: 'promo', l: 'Promocional' }]} /></div>` : null}
      <div className="fld compact brands"><span>Competidores en la vista (${f.brands.length}/${comps.length})</span><div className="chips">${comps.map((b) => html`<button key=${b} type="button" className=${'chip ' + (f.brands.includes(b) ? 'on' : '')} aria-pressed=${f.brands.includes(b)} onClick=${() => toggle(b)}>${A.brandName(E, b)}</button>`)}</div></div>
    </div>`;
  };

  /* =========================================================
     ONBOARDING
     ========================================================= */
  const OBJECTIVES = [
    { v: 'competitividad', l: 'Competitividad', d: 'Saber dónde estoy caro o barato frente al mercado' },
    { v: 'rentabilidad', l: 'Rentabilidad', d: 'Encontrar margen sin perder posición' },
    { v: 'lanzamientos', l: 'Lanzamientos', d: 'Poner precio a productos nuevos con evidencia' },
    { v: 'promociones', l: 'Promociones', d: 'Decidir descuentos con margen y reglas claras' },
  ];
  A.OBJECTIVES = OBJECTIVES;
  const STEPS = [
    ['Analizando catálogo', (E, s) => `${s.ownN} productos propios y ${s.compN} productos de ${E.cfg.comps.length} competidores leídos`],
    ['Identificando categorías', (E, s) => `${E.D.cats.length} categorías detectadas · ${E.cats.length} seleccionadas para analizar`],
    ['Interpretando atributos', (E, s) => `${s.attrs} atributos con escala de 1 a 5 propuestos por categoría`],
    ['Detectando competidores potenciales', (E) => `${E.D.brands.length - 1} marcas con oferta en tus categorías`],
    ['Homologando categorías', (E, s) => `${s.maps} equivalencias propuestas · ${s.partial} requieren segmentación · ${s.noeq} descartadas`],
    ['Encontrando productos comparables', (E, s) => `${s.withComps} de ${s.ownN} productos con al menos 2 comparables`],
    ['Construyendo el mapa competitivo', (E, s) => `${s.models} de ${E.cats.length} categorías con modelo de precio válido`],
    ['Identificando oportunidades', (E, s) => `${s.below} productos por debajo y ${s.above} por encima de su banda`],
  ];
  A.summarize = (E) => {
    const ownN = E.cats.reduce((s, c) => s + E.own[c.id].length, 0);
    const compN = E.cats.reduce((s, c) => s + E.pool[c.id].length, 0);
    const Hs = E.H.filter((h) => E.cfg.cats.includes(h.cat) && E.cfg.comps.includes(h.brand));
    return {
      ownN, compN, attrs: E.cats.length ? Math.round(TP.mean(E.cats.map((c) => c.attrs.length))) : 0,
      maps: Hs.length, partial: Hs.filter((h) => h.status === 'partial').length, noeq: Hs.filter((h) => h.status === 'noequiv').length,
      withComps: E.allDiag.filter((d) => d.comps.length >= 2).length, models: E.cats.filter((c) => E.model[c.id].ok).length,
      below: E.allDiag.filter((d) => d.pos === 'below').length, above: E.allDiag.filter((d) => d.pos === 'above').length,
    };
  };

  /* =========================================================
     OVERVIEW
     ========================================================= */
  A.Overview = function ({ E, go, openProduct }) {
    const mk = E.mk;
    const valid = E.allDiag.filter((d) => d.pos !== 'na');
    const below = E.allDiag.filter((d) => d.pos === 'below'), above = E.allDiag.filter((d) => d.pos === 'above');
    const idx = TP.median(E.cats.map((c) => A.indexVsMarket(E, c.id)).filter(isFinite));
    let ws = 0; E.cats.forEach((c) => { ws += TP.whiteSpaces(c, E.own[c.id], E.pool[c.id], E.band[c.id], 'typ', E.model[c.id]).filter((x) => x.gap).length; });
    const obj = E.cfg.objective;
    let prio = [...E.allDiag].filter((d) => d.action !== 'keep');
    if (obj === 'rentabilidad') prio.sort((a, b) => (b.action === 'up') - (a.action === 'up') || b.priority - a.priority);
    else prio.sort((a, b) => b.priority - a.priority);
    prio = prio.slice(0, 7);
    const promoHeavy = E.cfg.comps.map((b) => { const ps = E.cats.flatMap((c) => E.pool[c.id].filter((p) => p.brand === b)); return { b, n: ps.length, s: ps.length ? ps.filter((p) => p.promo).length / ps.length : 0 }; }).filter((x) => x.n >= 8 && x.s >= 0.35);
    const alerts = [];
    E.cats.filter((c) => !E.model[c.id].ok).forEach((c) => alerts.push({ tone: 'warn', t: `${c.name}: sin estimación de precio`, d: `${E.model[c.id].n} productos comparables; el modelo necesita ${E.model[c.id].need}. Revisa equivalencias o agrega competidores.`, a: () => go('market', { cat: c.id, sub: 'homolog' }), al: 'Revisar equivalencias' }));
    if (E.pendingMaps) alerts.push({ tone: 'info', t: `${E.pendingMaps} equivalencias de categoría esperan tu revisión`, d: 'La IA propuso segmentar categorías mixtas y descartar algunas con nombre parecido. Ya se usan en el análisis; confírmalas.', a: () => go('market', { sub: 'homolog' }), al: 'Revisar' });
    promoHeavy.forEach((x) => alerts.push({ tone: 'info', t: `${A.brandName(E, x.b)} tiene ${Math.round(x.s * 100)} % de su oferta en promoción`, d: 'El modelo compara precios de lista. Usa la vista de precio promocional para ver su precio efectivo.', a: () => go('market', { sub: 'escalera', priceType: 'promo' }), al: 'Ver escalera' }));
    const recent = Object.entries(E.ws ? E.ws.history || {} : {}).flatMap(([sid, h]) => (h.changes || []).filter((x) => Date.now() - new Date(x.at).getTime() < 7 * 864e5).map((x) => ({ ...x, sid })));
    if (recent.length) { const up = recent.filter((x) => x.to > x.from).length; alerts.unshift({ tone: 'info', t: recent.length + ' cambios de precio de la competencia en los últimos 7 días', d: up + ' subidas y ' + (recent.length - up) + ' bajadas en ' + new Set(recent.map((x) => x.sid)).size + ' tiendas, detectadas en la actualización diaria.', a: () => go('market', { sub: 'escalera' }), al: 'Ver escalera' }); }
    if (!E.hasCost && E.P && E.P.priv) alerts.push({ tone: 'info', t: 'Sin costos cargados', d: 'Sin costos no calculamos el precio mínimo rentable ni el margen de cada escenario.', a: () => go(E.P.config ? 'data' : 'privados', { sub: 'privados' }), al: 'Cargar costos' });
    if (E.D.pending && E.P && E.P.config) alerts.unshift({ tone: 'info', t: E.D.pending + ' productos importados sin clasificar', d: 'El análisis usa solo productos clasificados. Clasifica más lotes para ampliar la cobertura.', a: () => go('data', { sub: 'clasificacion' }), al: 'Clasificar' });
    const start = { competitividad: ['Revisa los productos por encima de su banda y la escalera de precios', 'market', { sub: 'escalera' }], rentabilidad: ['Empieza por los productos por debajo de su banda con evidencia consistente', 'advisor', { pos: 'below' }], lanzamientos: ['Simula el precio de tu próximo producto con comparables reales', 'launch', {}], promociones: ['Simula escenarios de descuento con su efecto en margen', 'promo', {}] }[obj];
    return html`<div className="page">
      <header className="ph"><div><div className="eyebrow">Overview</div><h1>¿Qué está pasando con tus precios?</h1><p>${E.D.brandById.own.name} frente a ${E.cfg.comps.length} competidores en ${E.cats.length} categorías · ${TP.MARKETS[E.cfg.market].name}, ${E.mk.currency}</p></div>
        <button className="startcard" type="button" onClick=${() => go(start[1], start[2])}><span className="eyebrow">Tu prioridad: ${A.OBJECTIVES.find((o) => o.v === obj).l}</span><b>${start[0]}</b><${Icon} n="arrow" /></button></header>
      <div className="kpis">
        <div className="kpi"><span>Portafolio con precio estimado</span><b>${valid.length}<small>/${E.allDiag.length}</small></b><em>${Math.round((valid.length / Math.max(1, E.allDiag.length)) * 100)} % del catálogo analizado</em></div>
        <div className="kpi"><span>Índice de precio vs. mercado</span><b>${isFinite(idx) ? Math.round(idx * 100) : '—'}</b><em>100 = mediana de la competencia (mediana entre categorías)</em></div>
        <div className="kpi"><span>Por debajo de su banda</span><b className="t-up">${below.length}</b><em>posible margen sin cambiar el producto</em></div>
        <div className="kpi"><span>Por encima de su banda</span><b className="t-down">${above.length}</b><em>revisar precio o comunicar valor</em></div>
        <div className="kpi"><span>Espacios competitivos</span><b>${ws}</b><em>tipología × franja con poca oferta propia</em></div>
      </div>
      <div className="grid-main">
        <section className="panel"><div className="ptitle"><h2>Decisiones para evaluar primero</h2><button className="linkbtn" type="button" onClick=${() => go('advisor', {})}>Ver todas</button></div>
          ${prio.length ? html`<div className="tw"><table className="tbl"><thead><tr><th>Producto</th><th className="num">Precio actual</th><th className="num">Estimado</th><th className="num">Brecha</th><th>Evidencia</th><th>Sugerencia</th></tr></thead><tbody>
            ${prio.map((d) => html`<tr key=${d.p.id} className="click" tabIndex="0" onClick=${() => openProduct(d.cat.id, d.p.id)} onKeyDown=${(e) => e.key === 'Enter' && openProduct(d.cat.id, d.p.id)}><td><div className="pcell"><${Thumb} p=${d.p} size=${34} /><div><b>${d.p.name}</b><small>${d.cat.short} · ${d.p.mat}</small></div></div></td><td className="num">${TP.fmt(d.p.list, mk)}</td><td className="num">${d.est ? TP.fmt(d.est, mk) : '—'}</td><td className=${'num ' + (d.gap < 0 ? 't-up' : 't-down')}>${TP.pct(d.gap)}</td><td><${Badge} tone=${d.evidence === 'consistente' ? 'ok' : 'warn'}>${d.evidence}<//></td><td>${A.ACTION[d.action]}</td></tr>`)}
          </tbody></table></div>` : html`<${Empty} title="Sin decisiones pendientes">Todos los productos con estimación están dentro de su banda.<//>`}
          <p className="foot">Brecha = precio actual frente al precio estimado por atributos. No es disposición a pagar ni precio óptimo: es lo que cobra el mercado por atributos similares.</p>
        </section>
        <section className="panel"><div className="ptitle"><h2>Alertas</h2></div>
          <ul className="alerts">${alerts.map((a, i) => html`<li key=${i} className=${'al-' + a.tone}><${Icon} n=${a.tone === 'warn' ? 'alert' : 'info'} /><div><b>${a.t}</b><p>${a.d}</p><button className="linkbtn" type="button" onClick=${a.a}>${a.al}</button></div></li>`)}</ul></section>
      </div>
      <section className="panel"><div className="ptitle"><h2>Estado por categoría</h2></div>
        <div className="tw"><table className="tbl"><thead><tr><th>Categoría</th><th className="num">Tus productos</th><th className="num">Comparables</th><th>Modelo</th><th className="num">Índice vs. mercado</th><th className="num">Debajo</th><th className="num">Encima</th><th></th></tr></thead><tbody>
          ${E.cats.map((c) => { const m = E.model[c.id]; const ix = A.indexVsMarket(E, c.id); return html`<tr key=${c.id}><td><b>${c.name}</b></td><td className="num">${E.own[c.id].length}</td><td className="num">${E.pool[c.id].length}</td><td>${m.ok ? html`<${Badge} tone=${m.reliability === 'Alta' ? 'ok' : 'warn'}>Confiabilidad ${m.reliability.toLowerCase()}<//>` : html`<${Badge} tone="neutral">${TP.REASON_TEXT[m.reason]}<//>`}</td><td className="num">${isFinite(ix) ? Math.round(ix * 100) : '—'}</td><td className="num">${E.diag[c.id].filter((d) => d.pos === 'below').length}</td><td className="num">${E.diag[c.id].filter((d) => d.pos === 'above').length}</td><td><button className="linkbtn" type="button" onClick=${() => go('market', { cat: c.id, sub: 'categoria' })}>Analizar</button></td></tr>`; })}
        </tbody></table></div></section>
    </div>`;
  };

  /* =========================================================
     MARKET INTELLIGENCE
     ========================================================= */
  const SUBS = [
    ['homolog', 'Homologación'], ['valor', 'Precio vs. atributos'], ['categoria', 'Categoría vs. categoría'], ['producto', 'Producto vs. producto'], ['escalera', 'Escalera'], ['rangos', 'Rangos'], ['piramide', 'Pirámide'], ['territorios', 'Territorios'], ['whitespace', 'White spaces'], ['composicion', 'Composición'], ['capsulas', 'Cápsulas'], ['transversal', 'Entre categorías'],
  ];
  A.MARKET_SUBS = SUBS;
  A.Market = function (props) {
    const { E, f, setF, sub, setSub } = props;
    const V = { homolog: Homolog, valor: ValueV, categoria: CatVsCat, producto: ProdVsProd, escalera: LadderV, rangos: RangesV, piramide: PyramidV, territorios: TerritoryV, whitespace: WhiteSpaceV, composicion: CompositionV, capsulas: CapsulesV, transversal: CrossV }[sub] || Homolog;
    return html`<div className="page">
      <header className="ph"><div><div className="eyebrow">Market Intelligence</div><h1>${SUBS.find((s) => s[0] === sub)[1]}</h1><p>${SUBQ[sub]}</p></div></header>
      <nav className="tabs" aria-label="Vistas de mercado">${SUBS.map(([k, l]) => html`<button key=${k} type="button" className=${sub === k ? 'on' : ''} aria-current=${sub === k ? 'page' : undefined} onClick=${() => setSub(k)}>${l}${k === 'homolog' && E.pendingMaps ? html`<span className="cnt">${E.pendingMaps}</span>` : null}</button>`)}</nav>
      ${sub !== 'homolog' && sub !== 'transversal' ? html`<${A.FilterBar} E=${E} f=${f} setF=${setF} />` : null}
      <${V} ...${props} />
    </div>`;
  };
  const SUBQ = {
    homolog: '¿Qué categorías de la competencia son realmente equivalentes a las mías?',
    valor: '¿Cobro de acuerdo con los atributos de mis productos frente al mercado?',
    categoria: '¿Cómo se compara mi categoría con las categorías equivalentes de cada marca?',
    producto: '¿Qué productos de la competencia se parecen a cada uno de los míos y cuánto cuestan?',
    escalera: '¿Dónde se ubica cada producto de cada marca en la escala de precios?',
    rangos: '¿Qué territorio de precio ocupa cada competidor y con quién me superpongo?',
    piramide: '¿Dónde se concentra la oferta y dónde está mi portafolio?',
    territorios: '¿Qué marcas cobran más o menos de lo que valen sus atributos?',
    whitespace: '¿En qué espacios tiene oferta el mercado y yo no?',
    composicion: '¿Qué colores, materiales y atributos predominan frente al mercado?',
    capsulas: '¿Cómo se posiciona cada colección o agrupación de mi portafolio?',
    transversal: '¿Cómo se comparan mis categorías entre sí en arquitectura de precio y profundidad?',
  };

  /* ---- Homologación ---- */
  function Homolog({ E, f, setF, dec, setDec, P }) {
    const lock = !(P && P.config);
    const [st, setSt] = useState('all');
    const [cf, setCf] = useState('all');
    const rows = E.H.filter((h) => E.cfg.cats.includes(h.cat) && E.cfg.comps.includes(h.brand) && (cf === 'all' || h.cat === cf) && (st === 'all' || h.status === st || (st === 'pending' && h.status !== 'equiv' && !dec.map[h.key])));
    const setD = (k, v) => { if (lock) return; setDec({ ...dec, map: { ...dec.map, [k]: dec.map[k] === v ? undefined : v } }); };
    const all = E.H.filter((h) => E.cfg.cats.includes(h.cat) && E.cfg.comps.includes(h.brand));
    const ST = { equiv: ['Equivalente', 'ok'], partial: ['Mixta: segmentar', 'warn'], noequiv: ['No equivalente', 'neutral'] };
    return html`<div>
      <div className="sumrow">
        ${[['all', 'Todas', all.length], ['equiv', 'Equivalentes', all.filter((h) => h.status === 'equiv').length], ['partial', 'Mixtas', all.filter((h) => h.status === 'partial').length], ['noequiv', 'No equivalentes', all.filter((h) => h.status === 'noequiv').length], ['pending', 'Sin revisar', E.pendingMaps]].map(([k, l, n]) => html`<button key=${k} type="button" className=${'sumc ' + (st === k ? 'on' : '')} onClick=${() => setSt(k)}><b>${n}</b><span>${l}</span></button>`)}
        <${Select} id="h-cat" label="Mi categoría" value=${cf} onChange=${setCf} options=${[{ v: 'all', l: 'Todas' }, ...E.cats.map((c) => ({ v: c.id, l: c.name }))]} compact />
      </div>
      ${lock ? html`<${Note}>Estas equivalencias las configura y revisa el equipo de Tita.<//>` : null}<${Note}>La homologación se decide por <b>contenido</b>, no solo por nombres: la categoría que Claude asignó a cada producto (por su nombre y ficha), sus tipos, materiales y rango de precio. Una etiqueta mixta se segmenta y solo entran los productos equivalentes.<//>
      <div className="maplist">${rows.map((h) => {
        const c = E.D.catById[h.cat], d = dec.map[h.key];
        const included = d === 'reject' ? false : h.status === 'noequiv' ? d === 'accept' || d === 'all' : true;
        return html`<article key=${h.key} className=${'map ' + (included ? '' : 'off')}>
          <div className="maphead">
            <div className="mapfrom"><span className="muted">${A.brandName(E, h.brand)}</span><b>«${h.label.name}»</b><small>${h.total} productos</small></div>
            <${Icon} n="arrow" cls="muted" />
            <div className="mapto"><span className="muted">Tu categoría</span><b>${c.name}</b><small>${h.status === 'noequiv' ? 'no se incluye' : h.status === 'partial' ? (d === 'all' ? `se incluyen los ${h.total}` : `se incluyen ${h.n} de ${h.total}`) : `se incluyen ${h.n}`}</small></div>
            <div className="mapst"><${Badge} tone=${ST[h.status][1]}>${ST[h.status][0]}<//>${d ? html`<${Badge} tone="info">${d === 'accept' ? 'Aceptada por ti' : d === 'reject' ? 'Descartada por ti' : 'Corregida: incluir todo'}<//>` : h.status !== 'equiv' ? html`<${Badge} tone="neutral">Propuesta IA<//>` : null}</div>
          </div>
          <p className="reason">${h.reason}</p>
          <div className="evid">
            <span><em>Nombre</em>${h.ns === 'alta' ? 'similar' : h.ns === 'media' ? 'genérico' : 'distinto'}</span>
            <span><em>Tipologías</em>${h.typs.slice(0, 3).map((t) => t[0] + ' (' + t[1] + ')').join(', ')}</span>
            <span><em>Materiales compatibles</em>${Math.round(h.matOk * 100)} %</span>
            <span><em>Rango de precio común</em>${Math.round(h.ov * 100)} %</span>
            <span className="sample">${h.sample.map((p) => html`<${Thumb} key=${p.id} p=${p} size=${30} />`)}</span>
          </div>
          ${lock ? null : html`<div className="mapact">
            ${h.status !== 'noequiv' ? html`<button type="button" className=${'btn sm ' + (d === 'accept' ? 'primary' : '')} onClick=${() => setD(h.key, 'accept')}><${Icon} n="check" />${h.status === 'partial' ? 'Aceptar segmentación' : 'Aceptar'}</button>` : html`<button type="button" className=${'btn sm ' + (d === 'accept' ? 'primary' : '')} onClick=${() => setD(h.key, 'accept')}>Incluir de todos modos</button>`}
            ${h.status === 'partial' ? html`<button type="button" className=${'btn sm ' + (d === 'all' ? 'primary' : '')} onClick=${() => setD(h.key, 'all')}>Corregir: incluir todo</button>` : null}
            ${h.status !== 'noequiv' ? html`<button type="button" className=${'btn sm ' + (d === 'reject' ? 'danger' : '')} onClick=${() => setD(h.key, 'reject')}><${Icon} n="x" />Descartar</button>` : null}
            <span className="muted sm">${h.status === 'noequiv' && d === 'accept' ? 'Atención: mezcla tipologías distintas en el modelo.' : 'Cada decisión recalcula comparables, franjas y modelo.'}</span>
          </div>`}
        </article>`;
      })}${rows.length ? null : html`<${Empty} title="Nada en este filtro" />`}</div>
    </div>`;
  }

  /* ---- Categoría vs categoría ---- */
  function brandStats(E, f, catId, includeOwn = true) {
    const cat = E.D.catById[catId], pool = A.viewPool(E, f, catId), own = A.viewOwn(E, f, catId), b = E.band[catId];
    const groups = [...(includeOwn ? [['own', own]] : []), ...f.brands.map((id) => [id, pool.filter((p) => p.brand === id)])].filter((g) => g[1].length);
    const mktMeans = cat.attrs.map((_, i) => TP.mean(pool.map((p) => p.lv[i])));
    return groups.map(([id, ps]) => {
      const pr = ps.map((p) => A.priceOf(p, f.priceType));
      const bandMix = [0, 1, 2].map((bi) => ps.filter((p) => TP.bandOf(A.priceOf(p, f.priceType), b) === bi).length / ps.length);
      const mats = {}; ps.forEach((p) => (mats[p.mat] = (mats[p.mat] || 0) + 1));
      const topMat = Object.entries(mats).sort((a, c) => c[1] - a[1])[0];
      const means = cat.attrs.map((_, i) => TP.mean(ps.map((p) => p.lv[i])));
      const dif = cat.attrs.map((a, i) => ({ a, d: means[i] - mktMeans[i] })).sort((x, y) => y.d - x.d)[0];
      return { id, own: id === 'own', name: A.brandName(E, id), ps, n: ps.length, min: Math.min(...pr), max: Math.max(...pr), med: TP.median(pr), p25: TP.quantile(pr, 0.25), p75: TP.quantile(pr, 0.75), p10: TP.quantile(pr, 0.1), p90: TP.quantile(pr, 0.9), bandMix, topMat, typs: new Set(ps.map((p) => p.typ)).size, mats: Object.keys(mats).length, dif, attrIdx: TP.mean(ps.map((p) => TP.mean(p.lv))), promoShare: ps.filter((p) => p.promo).length / ps.length };
    });
  }
  A.brandStats = brandStats;
  function BandEditor({ E, catId, setCfg }) {
    const conf = E.cfg.franjas[catId] || { mode: 'pct', p1: 33, p2: 67 };
    const b = E.band[catId];
    if (!setCfg) return html`<div className="bandedit"><span className="muted sm">Franjas: Entrada &lt; ${TP.fmt(b.c1, E.mk, true)} ≤ Core &lt; ${TP.fmt(b.c2, E.mk, true)} ≤ Premium</span></div>`;
    const upd = (patch) => setCfg({ ...E.cfg, franjas: { ...E.cfg.franjas, [catId]: { ...conf, ...patch } } });
    return html`<div className="bandedit"><span className="muted">Franjas:</span>
      <${Seg} size="sm" label="Modo de franjas" value=${conf.mode || 'pct'} onChange=${(v) => upd(v === 'abs' ? { mode: 'abs', c1: Math.round(b.c1), c2: Math.round(b.c2) } : { mode: 'pct', p1: 33, p2: 67 })} options=${[{ v: 'pct', l: 'Percentiles del mercado' }, { v: 'abs', l: 'Valores fijos' }]} />
      ${conf.mode === 'abs' ? html`<label className="mini" htmlFor="be-c1">Core desde<input id="be-c1" type="number" value=${conf.c1} onChange=${(e) => upd({ c1: +e.target.value })} /></label><label className="mini" htmlFor="be-c2">Premium desde<input id="be-c2" type="number" value=${conf.c2} onChange=${(e) => upd({ c2: +e.target.value })} /></label>`
        : html`<label className="mini" htmlFor="be-p1">Corte 1 (P)<input id="be-p1" type="number" min="5" max="60" value=${conf.p1 || 33} onChange=${(e) => upd({ p1: TP.clamp(+e.target.value, 5, 60) })} /></label><label className="mini" htmlFor="be-p2">Corte 2 (P)<input id="be-p2" type="number" min="40" max="95" value=${conf.p2 || 67} onChange=${(e) => upd({ p2: TP.clamp(+e.target.value, 40, 95) })} /></label>`}
      <span className="muted sm">Entrada &lt; ${TP.fmt(b.c1, E.mk, true)} ≤ Core &lt; ${TP.fmt(b.c2, E.mk, true)} ≤ Premium</span></div>`;
  }
  A.BandEditor = BandEditor;
  function CatVsCat({ E, f, setCfg, go, P }) {
    const cat = E.D.catById[f.cat];
    const rows = brandStats(E, f, f.cat);
    const maps = E.H.filter((h) => h.cat === f.cat && f.brands.includes(h.brand) && h.status !== 'noequiv' && E.dec.map[h.key] !== 'reject');
    if (rows.length < 2) return html`<${Empty} title="No hay suficientes marcas en la vista">Activa al menos un competidor en los filtros.<//>`;
    const [lo, hi] = UI.domain(rows.flatMap((r) => [r.p10, r.p90]));
    const x = UI.logScale(lo, hi, 0, 100);
    const own = rows.find((r) => r.own), comps = rows.filter((r) => !r.own);
    const mktMed = TP.median(A.viewPool(E, f, f.cat).map((p) => A.priceOf(p, f.priceType)));
    const closest = [...comps].sort((a, b) => Math.abs(Math.log(a.med / own.med)) - Math.abs(Math.log(b.med / own.med)))[0];
    const prem = [...comps].sort((a, b) => b.med - a.med)[0];
    const bestVal = [...comps].sort((a, b) => b.attrIdx / Math.log(b.med) - a.attrIdx / Math.log(a.med))[0];
    const ownPrem = own ? own.bandMix[2] : 0, mPrem = TP.mean(comps.map((c) => c.bandMix[2]));
    return html`<div>
      <div className="mapchips"><b>${cat.name}</b><${Icon} n="arrow" cls="muted" />${maps.map((h) => html`<span key=${h.key} className="mc">${h.label.name} <em>${A.brandName(E, h.brand)}${h.status === 'partial' && E.dec.map[h.key] !== 'all' ? ' · segmentada' : ''}</em></span>`)}<button className="linkbtn" type="button" onClick=${() => go('market', { sub: 'homolog' })}>Revisar equivalencias</button></div>
      <${BandEditor} E=${E} catId=${f.cat} setCfg=${P && P.config ? setCfg : null} />
      <div className="tw"><table className="tbl cvc"><thead><tr><th>Marca</th><th className="num">Productos</th><th className="num">Mín.</th><th className="num">Mediana</th><th className="num">Máx.</th><th style=${{ minWidth: '170px' }}>Distribución (P10–P90)</th><th>Entrada · Core · Premium</th><th>Material predominante</th><th className="num">Diversidad</th><th>Diferencial</th></tr></thead><tbody>
        ${rows.map((r) => html`<tr key=${r.id} className=${r.own ? 'ownrow' : ''}><td><b>${r.name}</b>${r.promoShare > 0.3 ? html` <${Badge} tone="info" title="Proporción de productos en promoción">${Math.round(r.promoShare * 100)} % promo<//>` : null}</td><td className="num">${r.n}</td><td className="num">${TP.fmt(r.min, E.mk, true)}</td><td className="num"><b>${TP.fmt(r.med, E.mk, true)}</b></td><td className="num">${TP.fmt(r.max, E.mk, true)}</td>
          <td><div className="mini-range" title=${TP.fmt(r.p10, E.mk) + ' – ' + TP.fmt(r.p90, E.mk)}><span className=${r.own ? 'own' : ''} style=${{ left: x(r.p10) + '%', width: Math.max(2, x(r.p90) - x(r.p10)) + '%' }}></span><i style=${{ left: x(r.med) + '%' }}></i></div></td>
          <td><div className="stack" title=${r.bandMix.map((v, i) => TP.BAND_NAMES[i] + ' ' + Math.round(v * 100) + ' %').join(' · ')}>${r.bandMix.map((v, i) => html`<span key=${i} className=${'s' + i} style=${{ width: v * 100 + '%' }}></span>`)}</div><small className="muted">${r.bandMix.map((v) => Math.round(v * 100)).join(' · ')} %</small></td>
          <td>${r.topMat[0]} <span className="muted">${Math.round((r.topMat[1] / r.n) * 100)} %</span></td><td className="num" title="Tipologías y materiales distintos">${r.typs} tip. · ${r.mats} mat.</td><td>${r.dif.d >= 0.3 ? html`${r.dif.a.name} <span className="t-up">+${r.dif.d.toFixed(1).replace('.', ',')}</span>` : html`<span className="muted">Sin diferencial claro</span>`}</td></tr>`)}
      </tbody></table></div>
      <p className="foot">Precio ${f.priceType === 'list' ? 'de lista' : 'promocional (si existe; si no, de lista)'}. Diferencial = atributo con mayor nivel promedio frente al promedio del mercado. Diversidad = tipologías y materiales distintos.</p>
      ${own ? html`<section className="panel insights"><h2><${Icon} n="spark" />Lectura automática</h2><ul>
        <li>Tu mediana (${TP.fmt(own.med, E.mk)}) está ${TP.pct(own.med / mktMed - 1)} frente a la mediana de la competencia en la vista (${TP.fmt(mktMed, E.mk)}).</li>
        <li>El competidor más cercano por precio es <b>${closest.name}</b> (mediana ${TP.fmt(closest.med, E.mk)}); el más premium es <b>${prem.name}</b> (${TP.fmt(prem.med, E.mk)}).</li>
        <li><b>${bestVal.name}</b> ofrece el mayor nivel de atributos por peso cobrado: es la referencia de "valor" de esta categoría.</li>
        <li>${ownPrem < mPrem * 0.6 ? html`Tienes ${Math.round(ownPrem * 100)} % del portafolio en Premium frente a ${Math.round(mPrem * 100)} % promedio de la competencia: posible brecha de posicionamiento. <button className="linkbtn" type="button" onClick=${() => go('market', { sub: 'whitespace' })}>Ver white spaces</button>` : html`Tu participación en Premium (${Math.round(ownPrem * 100)} %) es similar o mayor a la del mercado (${Math.round(mPrem * 100)} %).`}</li>
      </ul><p className="foot">Reglas de lectura calculadas sobre los datos de la vista; no hay un modelo de lenguaje generando el texto en el prototipo.</p></section>` : null}
    </div>`;
  }

  /* ---- Producto vs producto ---- */
  function ProdVsProd({ E, f, dec, setDec, focus, setFocus, P }) {
    const lock = !(P && P.config);
    const cat = E.D.catById[f.cat];
    const own = A.viewOwn(E, f, f.cat);
    const pool = A.viewPool(E, f, f.cat);
    const [q, setQ] = useState('');
    const [showRej, setShowRej] = useState(false);
    const selId = focus && own.find((p) => p.id === focus) ? focus : own[0] && own[0].id;
    const p = own.find((x) => x.id === selId);
    if (!p) return html`<${Empty} title="Sin productos propios en este filtro">Cambia tipología o material.<//>`;
    const list = own.filter((x) => !q || TP.strip(x.name).includes(TP.strip(q)));
    const all = pool.map((qq) => ({ q: qq, s: TP.similarity(cat, p, qq), key: p.id + '>' + qq.id })).filter((x) => x.s.score >= 0.7).sort((a, b) => b.s.score - a.s.score).slice(0, 8);
    const shown = all.filter((x) => showRej || dec.comp[x.key] !== 'reject');
    const acc = all.filter((x) => dec.comp[x.key] !== 'reject');
    const med = acc.length ? TP.median(acc.map((x) => x.q.list)) : NaN;
    const setD = (k, v) => setDec({ ...dec, comp: { ...dec.comp, [k]: dec.comp[k] === v ? undefined : v } });
    const explain = (x) => {
      const s = x.s, parts = [];
      parts.push(s.sameTyp ? `Mismo tipo (${p.typ})` : `Tipo distinto (${x.q.typ} frente a ${p.typ})`);
      parts.push(s.sameMat ? `mismo material (${p.mat})` : `material distinto (${x.q.mat})`);
      if (s.shared.length) parts.push(`coinciden en ${s.shared.slice(0, 2).join(' y ').toLowerCase()}`);
      const up = s.differ.filter((d) => d.d > 0), dn = s.differ.filter((d) => d.d < 0);
      let t = parts.join(', ') + '.';
      if (up.length) t += ` El comparable tiene mejor ${up.map((d) => d.attr.name.toLowerCase() + ' (+' + d.d + ')').join(', ')}.`;
      if (dn.length) t += ` Tu producto supera en ${dn.map((d) => d.attr.name.toLowerCase() + ' (' + d.d + ')').join(', ')}.`;
      t += ` Su precio de lista es ${TP.pct(x.q.list / p.list - 1)} frente al tuyo.`;
      return t;
    };
    return html`<div className="pvp">
      <aside className="plist"><label className="fld" htmlFor="pvp-q"><span>Buscar en tu catálogo (${own.length})</span><input id="pvp-q" type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Nombre del producto" /></label>
        <ul>${list.map((x) => html`<li key=${x.id}><button type="button" className=${x.id === selId ? 'on' : ''} onClick=${() => setFocus(x.id)}><${Thumb} p=${x} size=${34} /><span><b>${x.name}</b><small>${x.mat} · ${TP.fmt(x.list, E.mk)}</small></span></button></li>`)}</ul></aside>
      <div className="pdetail">
        <div className="pcard own"><${Thumb} p=${p} size=${92} /><div className="pinfo"><span className="eyebrow">Tu producto</span><h3>${p.name}</h3><div className="muted">${p.typ} · ${p.mat} · ${p.color}${p.collection ? ' · ' + p.collection : ''}${p.url ? html` · <a href=${p.url} target="_blank" rel="noopener noreferrer">ver en la tienda</a>` : null}</div>${p.ev ? html`<div className="sm muted">Evidencia: «${p.ev}»</div>` : null}<div className="price">${TP.fmt(p.list, E.mk)}${p.promo ? html` <span className="muted">promoción ${TP.fmt(p.promo, E.mk)}</span>` : null}</div>
          <div className="lvls">${cat.attrs.map((a, i) => html`<span key=${a.id} title=${a.levels[p.lv[i] - 1]}><em>${a.name}</em><i className="pips">${[1, 2, 3, 4, 5].map((k) => html`<b key=${k} className=${k <= p.lv[i] ? 'on' : ''}></b>`)}</i></span>`)}</div></div>
          <div className="pstat"><span>Mediana de comparables aceptados</span><b>${TP.fmt(med, E.mk)}</b><em>${isFinite(med) ? 'Tu precio está ' + TP.pct(p.list / med - 1) + ' frente a ellos' : 'Sin comparables suficientes'}</em></div></div>
        <div className="ptitle"><h2>Comparables propuestos por IA (${acc.length})</h2><label className="tgl" htmlFor="pvp-rej"><input id="pvp-rej" type="checkbox" checked=${showRej} onChange=${(e) => setShowRej(e.target.checked)} />Mostrar descartados</label></div>
        ${shown.length ? html`<div className="comps">${shown.map((x) => { const d = dec.comp[x.key]; return html`<article key=${x.key} className=${'comp ' + (d === 'reject' ? 'off' : '')}>
          <${Thumb} p=${x.q} size=${64} /><div className="cbody">
            <div className="chead"><div><span className="muted">${A.brandName(E, x.q.brand)}</span><b>${x.q.name}</b><small>${x.q.typ} · ${x.q.mat} · ${x.q.color}${x.q.url ? html` · <a href=${x.q.url} target="_blank" rel="noopener noreferrer">ver en la tienda</a>` : null}</small></div><div className="cprice"><b>${TP.fmt(x.q.list, E.mk)}</b>${x.q.promo ? html`<small>promo ${TP.fmt(x.q.promo, E.mk)}</small>` : null}</div></div>
            <div className="cbadges"><${Badge} tone=${x.s.label === 'Muy similar' ? 'ok' : x.s.label === 'Similar' ? 'info' : 'neutral'}>${x.s.label}<//><span className="muted sm" title="Índice heurístico de 0 a 1 (tipología, material y distancia entre niveles). No es una probabilidad calibrada.">índice ${x.s.score.toFixed(2).replace('.', ',')}</span><${Badge} tone=${x.s.conf.startsWith('Clasificación') ? 'neutral' : 'warn'}>${x.s.conf}<//>${d === 'accept' ? html`<${Badge} tone="info">Confirmado por ti<//>` : null}</div>
            <p className="cexp">${explain(x)}</p>
            ${lock ? null : html`<div className="mapact"><button type="button" className=${'btn sm ' + (d === 'accept' ? 'primary' : '')} onClick=${() => setD(x.key, 'accept')}><${Icon} n="check" />Es comparable</button><button type="button" className=${'btn sm ' + (d === 'reject' ? 'danger' : '')} onClick=${() => setD(x.key, 'reject')}><${Icon} n="x" />No es comparable</button></div>`}
          </div></article>`; })}</div>` : html`<${Empty} title="Sin comparables con similitud suficiente">Amplía los competidores de la vista o revisa la homologación.<//>`}
        <p className="foot">Íconos ilustrativos por tipo y color (las fotos de otras tiendas no se pueden cargar aquí; usa «ver en la tienda»). Los comparables descartados dejan de usarse en el Price Advisor.</p>
      </div></div>`;
  }

  /* ---- Precio vs. atributos (vista central del agente original) ---- */
  A.score = (cat, p) => { const w = cat.attrs.map((a) => (a.weight == null ? 1 : a.weight)); const tw = TP.sum(w) || 1; return TP.sum(p.lv.map((v, j) => v * w[j])) / tw; };
  function ValueV({ E, f, go, setFocus, setSub }) {
    const cat = E.D.catById[f.cat];
    const own = A.viewOwn(E, f, f.cat), pool = A.viewPool(E, f, f.cat);
    const b = E.band[f.cat];
    const st = A.brandStats(E, { ...f, priceType: 'list' }, f.cat, false);
    const cls = {}; st.forEach((r) => { cls[r.id] = r.med < b.c1 ? 0 : r.med < b.c2 ? 1 : 2; });
    const pts = [...pool.map((p) => ({ p, x: A.score(cat, p), y: A.priceOf(p, f.priceType), g: cls[p.brand] != null ? cls[p.brand] : 1, own: false, brandName: A.brandName(E, p.brand) })), ...own.map((p) => ({ p, x: A.score(cat, p), y: A.priceOf(p, f.priceType), own: true }))];
    const so = TP.mean(own.map((p) => A.score(cat, p))), sm = TP.mean(pool.map((p) => A.score(cat, p)));
    const all = E.D.products.filter((p) => p.brand === 'own' && p.cat === f.cat);
    const pend = all.filter((p) => p.conf === 'baja' || p.imputed >= 2).length;
    return html`<div>
      <div className="kpis">
        <div className="kpi"><span>Con atributos completos</span><b>${all.filter((p) => !p.imputed).length}<small> de ${all.length} productos</small></b><em>tus productos con todos sus atributos calificados</em></div>
        <div className="kpi"><span>Por confirmar</span><b>${pend}<small> productos</small></b><em>Claude no está seguro de algún atributo · <button type="button" className="linkbtn" onClick=${() => go('data', { sub: 'revision' })}>Revisar</button></em></div>
        <div className="kpi"><span>Tu marca frente al mercado</span><b>${isFinite(so - sm) ? (so - sm >= 0 ? '+' : '') + (so - sm).toFixed(2).replace('.', ',') : '—'}<small> puntos de atributos</small></b><em>${E.D.brandById.own.name} ${isFinite(so) ? so.toFixed(2).replace('.', ',') : '—'} · competencia ${isFinite(sm) ? sm.toFixed(2).replace('.', ',') : '—'} · ${cat.short}</em></div>
      </div>
      <section className="panel"><${UI.ValueScatter} pts=${pts} bands=${b} mk=${E.mk} ownName=${E.D.brandById.own.name} onPick=${(p) => { if (p.brand === 'own') { setFocus(p.id); setSub('producto'); } }} />
        <p className="foot">Puntaje de atributos = promedio ponderado de los niveles 1 a 5 (pesos editables en la rúbrica). La competencia se colorea por la franja de su marca. Clic en un producto tuyo para ver sus comparables.</p></section>
    </div>`;
  }

  /* ---- Escalera / Rangos / Pirámide / Territorios ---- */
  function LadderV({ E, f, setFocus, setSub }) {
    const rows = brandStats(E, f, f.cat).sort((a, b) => a.med - b.med).map((r) => ({ id: r.id, name: r.name, own: r.own, items: r.ps.map((p) => ({ p })) }));
    return html`<section className="panel"><${UI.Ladder} rows=${rows} bands=${E.band[f.cat]} mk=${E.mk} priceType=${f.priceType} onPick=${(p) => { if (p.brand === 'own') { setFocus(p.id); setSub('producto'); } }} /><p className="foot">Marcas ordenadas por mediana. Clic en un producto propio para ver sus comparables. ${f.priceType === 'promo' ? 'Los puntos huecos están en promoción.' : ''}</p></section>`;
  }
  function RangesV({ E, f }) {
    const b = E.band[f.cat];
    const st = brandStats(E, f, f.cat).sort((a, c) => a.med - c.med);
    const rows = st.map((r) => ({ ...r, cls: r.med < b.c1 ? 'Entrada' : r.med < b.c2 ? 'Intermedia' : 'Premium' }));
    const own = st.find((r) => r.own);
    const ov = own ? st.filter((r) => !r.own).map((r) => ({ r, o: Math.max(0, Math.min(r.p75, own.p75) - Math.max(r.p25, own.p25)) / Math.max(1, Math.min(r.p75 - r.p25, own.p75 - own.p25)) })).sort((a, c) => c.o - a.o) : [];
    return html`<div><section className="panel"><${UI.Ranges} rows=${rows} mk=${E.mk} bands=${b} /></section>
      <section className="panel"><h2>Superposición con tu territorio central (P25–P75)</h2><div className="ovl">${ov.map(({ r, o }) => html`<div key=${r.id} className="ovr"><span>${r.name}</span><div className="obar"><i style=${{ width: Math.min(100, o * 100) + '%' }}></i></div><b>${Math.round(Math.min(1, o) * 100)} %</b><span className="muted">${o >= 0.5 ? 'Competidor directo por precio' : o > 0.15 ? 'Superposición parcial' : 'Territorio distinto'}</span></div>`)}</div>
      <p className="foot">Clasificación por la mediana de cada marca frente a los cortes de franja. Una marca intermedia que se superpone con tu territorio es la referencia más directa para reposicionar.</p></section></div>`;
  }
  function PyramidV({ E, f }) {
    const b = E.band[f.cat];
    const own = A.viewOwn(E, f, f.cat), pool = A.viewPool(E, f, f.cat);
    const cnt = (ps) => [0, 1, 2].map((bi) => ps.filter((p) => TP.bandOf(A.priceOf(p, f.priceType), b) === bi).length);
    const st = brandStats(E, f, f.cat);
    return html`<div className="grid-2"><section className="panel"><${UI.Pyramid} own=${cnt(own)} mkt=${cnt(pool)} bands=${b} mk=${E.mk} ownName=${E.D.brandById.own.name} /></section>
      <section className="panel"><h2>Referencias por franja y marca</h2><div className="tw"><table className="tbl"><thead><tr><th>Marca</th><th className="num">Entrada</th><th className="num">Core</th><th className="num">Premium</th></tr></thead><tbody>${st.map((r) => html`<tr key=${r.id} className=${r.own ? 'ownrow' : ''}><td>${r.name}</td>${[0, 1, 2].map((i) => html`<td key=${i} className="num">${Math.round(r.bandMix[i] * r.n)}</td>`)}</tr>`)}</tbody></table></div>
      <p className="foot">Concentración alta = franja disputada. Poca oferta en una franja no prueba que exista demanda: valídalo antes de invertir.</p></section></div>`;
  }
  function TerritoryV({ E, f }) {
    const cat = E.D.catById[f.cat], m = E.model[f.cat];
    const pts = brandStats(E, f, f.cat).map((r) => ({ id: r.id, name: r.name, own: r.own, x: r.attrIdx, y: r.med, n: r.n }));
    const line = m.ok ? [1.5, 2, 2.5, 3, 3.5, 4, 4.5].map((v) => [v, m.predict(cat.attrs.map(() => v)).est]) : null;
    return html`<section className="panel"><${UI.Territory} points=${pts} mk=${E.mk} line=${line} />${!m.ok ? html`<${Note} tone="warn">Sin línea de valor: el modelo de esta categoría no tiene evidencia suficiente.<//>` : null}</section>`;
  }

  /* ---- White spaces ---- */
  function WhiteSpaceV({ E, f, go, addStudyRec }) {
    const [dim, setDim] = useState('typ');
    const [sel, setSel] = useState(null);
    const cat = E.D.catById[f.cat], b = E.band[f.cat];
    const own = E.own[f.cat], pool = A.viewPool(E, f, f.cat);
    const cells = TP.whiteSpaces(cat, own, pool, b, dim, E.model[f.cat]);
    const keys = dim === 'mat' ? cat.materials : cat.typologies;
    const gaps = cells.filter((c) => c.gap);
    const cur = sel && cells.find((c) => c.key === sel.key && c.band === sel.band);
    const rangeTxt = (bi) => (bi === 0 ? 'hasta ' + TP.fmt(b.c1, E.mk) : bi === 1 ? TP.fmt(b.c1, E.mk) + ' – ' + TP.fmt(b.c2, E.mk) : 'desde ' + TP.fmt(b.c2, E.mk));
    return html`<div>
      <div className="row-between"><${Seg} label="Dimensión" value=${dim} onChange=${(v) => { setDim(v); setSel(null); }} options=${[{ v: 'typ', l: 'Tipología × franja' }, { v: 'mat', l: 'Material × franja' }]} /><span className="muted">${gaps.length} espacios detectados con la competencia de la vista</span></div>
      <div className="grid-ws">
        <section className="panel"><div className="tw"><table className="heat"><thead><tr><th></th>${[0, 1, 2].map((bi) => html`<th key=${bi}>${TP.BAND_NAMES[bi]}<small>${rangeTxt(bi)}</small></th>`)}</tr></thead><tbody>
          ${keys.map((k) => html`<tr key=${k}><th>${k}</th>${[0, 1, 2].map((bi) => { const c = cells.find((x) => x.key === k && x.band === bi); const on = cur && cur.key === k && cur.band === bi; return html`<td key=${bi}><button type="button" className=${'cell ' + (c.gap ? 'gap g-' + c.gap.type : '') + (on ? ' sel' : '')} style=${{ '--h': Math.min(1, c.mShare * 4) }} onClick=${() => setSel({ key: k, band: bi })} aria-label=${k + ', ' + TP.BAND_NAMES[bi]}><b>${Math.round(c.mShare * 100)} %</b><span>tú ${Math.round(c.oShare * 100)} %</span>${c.gap ? html`<em>${TP.GAP_TEXT[c.gap.type].t}</em>` : null}</button></td>`; })}</tr>`)}
        </tbody></table></div>
        <div className="legend"><span><i className="sw heat"></i>Intensidad = % de la oferta de la competencia</span><span><i className="sw gapb"></i>Espacio detectado</span></div></section>
        <section className="panel wsd">${cur ? html`<div>
          <span className="eyebrow">${cat.name} · ${cur.key} · ${TP.BAND_NAMES[cur.band]}</span>
          <h2>${cur.gap ? TP.GAP_TEXT[cur.gap.type].t : 'Sin brecha relevante'}</h2>
          <p>La combinación <b>${cur.key}</b> en la franja ${TP.BAND_NAMES[cur.band]} (${rangeTxt(cur.band)}) concentra ${Math.round(cur.mShare * 100)} % de la oferta de las marcas seleccionadas y ${Math.round(cur.oShare * 100)} % de tu portafolio (${cur.o} de tus productos, ${cur.m} de la competencia).</p>
          ${cur.gap ? html`<p>${TP.GAP_TEXT[cur.gap.type].d}</p>` : null}
          ${cur.gap && cur.gap.type === 'posicionamiento' ? html`<p>Productos tuyos que el modelo ubica en esta franja: ${cur.gap.repos.map((p) => p.name + ' (' + TP.fmt(p.list, E.mk) + ')').join(', ')}.</p>` : null}
          ${cur.gap && cur.gap.type === 'atributos' ? html`<p>Nivel promedio de atributos: mercado ${cur.gap.mAttr.toFixed(1).replace('.', ',')} frente a ${cur.gap.oAttr.toFixed(1).replace('.', ',')} en tus productos de ese tipo.</p>` : null}
          <${Note} tone="warn">Una brecha de oferta no prueba que haya demanda insatisfecha. Puede ser un espacio que el mercado ya probó y abandonó. Valídalo antes de desarrollar producto.<//>
          ${cur.gap ? html`<div className="mapact"><button type="button" className="btn primary sm" onClick=${() => go('launch', { prefill: { cat: f.cat, typ: dim === 'typ' ? cur.key : null, mat: dim === 'mat' ? cur.key : null, band: cur.band } })}><${Icon} n="launch" />Simular un producto aquí</button><button type="button" className="btn sm" onClick=${() => { addStudyRec({ cat: f.cat, method: 'vw', why: `Validar disposición a pagar en ${cur.key} · ${TP.BAND_NAMES[cur.band]} antes de desarrollar producto`, target: cur.key + ' · ' + TP.BAND_NAMES[cur.band], center: Math.sqrt((cur.band === 0 ? b.c1 * 0.7 : cur.band === 1 ? b.c1 : b.c2) * (cur.band === 0 ? b.c1 : cur.band === 1 ? b.c2 : b.c2 * 1.4)) }); go('pulse', {}); }}><${Icon} n="pulse" />Validar con consumidores</button></div>` : null}
        </div>` : html`<${Empty} icon="eye" title="Elige una celda">Los espacios marcados combinan alta oferta del mercado y baja participación tuya. La IA los clasifica en brecha de surtido, de posicionamiento o de atributos.<//>`}
        </section>
      </div></div>`;
  }

  /* ---- Composición ---- */
  function CompositionV({ E, f }) {
    const cat = E.D.catById[f.cat];
    const [dim, setDim] = useState('color');
    const [attr, setAttr] = useState(cat.attrs[0].id);
    const own = A.viewOwn(E, f, f.cat), pool = A.viewPool(E, f, f.cat);
    const ai = Math.max(0, cat.attrs.findIndex((a) => a.id === attr));
    const keyOf = (p) => (dim === 'color' ? p.color : dim === 'mat' ? p.mat : dim === 'typ' ? p.typ : p.lv[ai]);
    const keys = dim === 'color' ? cat.colors : dim === 'mat' ? cat.materials : dim === 'typ' ? cat.typologies : [1, 2, 3, 4, 5];
    const items = keys.map((k) => ({ label: dim === 'attr' ? 'Nivel ' + k + ' · ' + cat.attrs[ai].levels[k - 1] : k, own: own.filter((p) => keyOf(p) === k).length / Math.max(1, own.length), mkt: pool.filter((p) => keyOf(p) === k).length / Math.max(1, pool.length), sw: dim === 'color' ? UI.colorHex(k) : null }));
    const big = [...items].sort((a, b) => Math.abs(b.own - b.mkt) - Math.abs(a.own - a.mkt))[0];
    return html`<section className="panel"><div className="row-between"><${Seg} label="Dimensión" value=${dim} onChange=${setDim} options=${[{ v: 'color', l: 'Colores' }, { v: 'mat', l: 'Materiales' }, { v: 'typ', l: 'Tipologías' }, { v: 'attr', l: 'Atributo' }]} />${dim === 'attr' ? html`<${Select} id="comp-attr" label="Atributo" value=${attr} onChange=${setAttr} options=${cat.attrs.map((a) => ({ v: a.id, l: a.name }))} compact />` : null}</div>
      <${UI.Paired} items=${items} ownName=${E.D.brandById.own.name} />
      ${big ? html`<p className="insight"><${Icon} n="spark" />La mayor diferencia está en <b>${big.label}</b>: ${Math.round(big.own * 100)} % de tu portafolio frente a ${Math.round(big.mkt * 100)} % de la oferta de la competencia.</p>` : null}
      <p className="foot">Colores y materiales normalizados a las listas estándar de cada categoría (editables en Catálogo y clasificación).</p></section>`;
  }

  /* ---- Cápsulas ---- */
  function CapsulesV({ E, f, go, openProduct }) {
    const [g, setG] = useState('collection');
    const diag = E.diag[f.cat].filter((d) => (f.mat === 'all' || d.p.mat === f.mat) && (f.typ === 'all' || d.p.typ === f.typ));
    const keyOf = (d) => (g === 'collection' ? d.p.collection : g === 'mat' ? d.p.mat : d.p.typ);
    const groups = [...new Set(diag.map(keyOf))].map((k) => { const ds = diag.filter((d) => keyOf(d) === k); const gaps = ds.map((d) => d.gap).filter(isFinite); return { k, ds, med: TP.median(ds.map((d) => d.p.list)), gap: gaps.length ? TP.mean(gaps) : NaN, below: ds.filter((d) => d.pos === 'below').length, above: ds.filter((d) => d.pos === 'above').length, mix: [0, 1, 2].map((bi) => ds.filter((d) => TP.bandOf(d.p.list, E.band[f.cat]) === bi).length / ds.length) }; }).sort((a, b) => b.ds.length - a.ds.length);
    const [open, setOpen] = useState(null);
    return html`<div><${Seg} label="Agrupar por" value=${g} onChange=${(v) => { setG(v); setOpen(null); }} options=${[{ v: 'collection', l: 'Colección o etiqueta de tu tienda' }, { v: 'typ', l: 'Estilo (tipo)' }, { v: 'mat', l: 'Material' }]} />
      <div className="caps">${groups.map((x) => html`<section key=${x.k} className="panel cap"><div className="caphead"><div><h3>${x.k}</h3><span className="muted">${x.ds.length} productos · mediana ${TP.fmt(x.med, E.mk)}</span></div>
        <div className="capk"><span>Brecha media vs. estimado</span><b className=${x.gap < 0 ? 't-up' : 't-down'}>${TP.pct(x.gap)}</b></div>
        <div className="capk"><span>Debajo / encima</span><b>${x.below} / ${x.above}</b></div>
        <div className="capk wide"><span>Franjas</span><div className="stack">${x.mix.map((v, i) => html`<span key=${i} className=${'s' + i} style=${{ width: v * 100 + '%' }}></span>`)}</div></div>
        <button type="button" className="btn sm" onClick=${() => setOpen(open === x.k ? null : x.k)} aria-expanded=${open === x.k}>${open === x.k ? 'Ocultar' : 'Ver productos'}</button></div>
        ${open === x.k ? html`<div className="tw"><table className="tbl"><thead><tr><th>Producto</th><th className="num">Actual</th><th className="num">Estimado</th><th>Posición</th></tr></thead><tbody>${x.ds.map((d) => html`<tr key=${d.p.id} className="click" onClick=${() => openProduct(f.cat, d.p.id)}><td><div className="pcell"><${Thumb} p=${d.p} size=${30} /><b>${d.p.name}</b></div></td><td className="num">${TP.fmt(d.p.list, E.mk)}</td><td className="num">${d.est ? TP.fmt(d.est, E.mk) : '—'}</td><td><${Badge} tone=${A.POS[d.pos].tone}>${A.POS[d.pos].t}<//></td></tr>`)}</tbody></table></div>` : null}
      </section>`)}</div>
      <p className="foot">Brecha media negativa = la colección se publica por debajo de lo que el mercado cobra por atributos similares.</p></div>`;
  }

  /* ---- Entre categorías ---- */
  function CrossV({ E, go }) {
    const rows = E.cats.map((c) => { const own = E.own[c.id], pr = own.map((p) => p.list); const b = E.band[c.id]; return { c, n: own.length, typs: new Set(own.map((p) => p.typ)).size, med: TP.median(pr), mkt: TP.median(E.pool[c.id].map((p) => p.list)), idx: A.indexVsMarket(E, c.id), spread: TP.quantile(pr, 0.9) / TP.quantile(pr, 0.1), mix: [0, 1, 2].map((bi) => own.filter((p) => TP.bandOf(p.list, b) === bi).length / own.length), m: E.model[c.id], comp: E.pool[c.id].length }; });
    const mx = Math.max(1.3, ...rows.map((r) => r.idx || 1)), mn = Math.min(0.7, ...rows.map((r) => r.idx || 1));
    const lo = [...rows].filter((r) => isFinite(r.idx)).sort((a, b) => a.idx - b.idx)[0], hi = [...rows].filter((r) => isFinite(r.idx)).sort((a, b) => b.idx - a.idx)[0];
    const x = (v) => ((v - mn) / (mx - mn)) * 100;
    return html`<div>
      <section className="panel"><h2>Índice de precio frente al mercado de cada categoría</h2>
        <div className="idxbars">${rows.map((r) => html`<div key=${r.c.id} className="ib"><span>${r.c.name}</span><div className="ibt"><i className="base" style=${{ left: x(1) + '%' }}></i><b className=${r.idx < 1 ? 'lo' : 'hi'} style=${{ left: Math.min(x(1), x(r.idx)) + '%', width: Math.abs(x(r.idx) - x(1)) + '%' }}></b></div><em>${Math.round(r.idx * 100)}</em></div>`)}</div>
        <p className="foot">100 = mediana de la competencia en esa categoría. Cada categoría se compara con su propio mercado.</p></section>
      <section className="panel"><div className="tw"><table className="tbl"><thead><tr><th>Categoría</th><th className="num">Profundidad</th><th className="num">Tipologías</th><th className="num">Tu mediana</th><th className="num">Mediana mercado</th><th className="num">Amplitud P90/P10</th><th>Tu mezcla de franjas</th><th>Modelo</th></tr></thead><tbody>
        ${rows.map((r) => html`<tr key=${r.c.id}><td><button className="linkbtn" type="button" onClick=${() => go('market', { cat: r.c.id, sub: 'categoria' })}>${r.c.name}</button></td><td className="num">${r.n}</td><td className="num">${r.typs}</td><td className="num">${TP.fmt(r.med, E.mk, true)}</td><td className="num">${TP.fmt(r.mkt, E.mk, true)}</td><td className="num">${r.spread.toFixed(1).replace('.', ',')}×</td><td><div className="stack">${r.mix.map((v, i) => html`<span key=${i} className=${'s' + i} style=${{ width: v * 100 + '%' }}></span>`)}</div></td><td>${r.m.ok ? 'R² validación ' + r.m.r2cv.toFixed(2).replace('.', ',') : TP.REASON_TEXT[r.m.reason]}</td></tr>`)}
      </tbody></table></div></section>
      ${lo && hi && lo !== hi ? html`<section className="panel insights"><h2><${Icon} n="spark" />Lectura automática</h2><ul><li><b>${lo.c.name}</b> es tu categoría más barata frente a su mercado (índice ${Math.round(lo.idx * 100)}) y <b>${hi.c.name}</b> la más cara (${Math.round(hi.idx * 100)}). Una arquitectura de marca coherente suele mantener índices similares entre categorías.</li><li>La categoría con portafolio más profundo es <b>${[...rows].sort((a, b) => b.n - a.n)[0].c.name}</b>; la de mayor amplitud de precios es <b>${[...rows].sort((a, b) => b.spread - a.spread)[0].c.name}</b>.</li></ul></section>` : null}
      <${Note}>Cada categoría tiene su propio modelo econométrico. No combinamos categorías heterogéneas (por ejemplo bolsos y billeteras) en un solo modelo: sus atributos y escalas de precio no son comparables sin una justificación estadística.<//>
    </div>`;
  }
})();
