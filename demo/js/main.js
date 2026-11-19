/* Tita Pricing Intelligence 360° — copiloto, shell de navegación y arranque. */
(function () {
  'use strict';
  const { useState, useMemo, useEffect, useRef } = React;
  const TP = window.TP, UI = TP.ui, html = UI.html, A = TP.app;
  const { Icon, Badge, Thumb } = UI;

  /* =========================================================
     COPILOTO (modo demostración: intenciones por reglas, cálculos reales)
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
        return { text: html`<p>Con un incremento uniforme de <b>${Math.round(x * 100)} %</b>${catId ? ' en ' + scope[0].name.toLowerCase() : ''}:</p><ul className="cp-list"><li><span><b>${inb}</b> productos que hoy están por debajo entrarían a su banda de mercado.</span></li><li><span><b>${out}</b> productos quedarían por encima de su banda.</span></li><li><span><b>${franja}</b> de ${tot} cambiarían de franja.</span></li><li><span>Índice de precio frente al mercado: ${isFinite(idx) ? Math.round(idx * 100) : '—'}.</span></li></ul><p className="muted sm">${E.cfg.privateData ? 'Para el efecto en unidades y margen usa Promotion Optimizer con un supuesto de elasticidad o la elasticidad medida.' : 'Sin datos de ventas no estimo el efecto en volumen ni en margen.'} Un incremento uniforme ignora que cada producto tiene una brecha distinta: el Price Advisor propone cambios por producto.</p>`, action: { l: 'Ir al Price Advisor', fn: () => actions.go('advisor', { sub: 'diagnostico' }) }, basis: 'Bandas P10–P90 de los modelos actuales; sin efecto de demanda.', conf: 'Media' };
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
  function Copilot({ E, f, open, setOpen, msgs, setMsgs, actions }) {
    const [q, setQ] = useState('');
    const end = useRef(null);
    useEffect(() => { end.current && end.current.scrollIntoView({ block: 'end' }); }, [msgs, open]);
    const cat = E.D.catById[f.cat];
    const SUG = [
      ['cats', '¿Qué categorías tienen mayor oportunidad de mejorar su posicionamiento?'],
      ['compare', `¿Cómo se comparan mis ${cat.short.toLowerCase()} con los de la competencia?`],
      ['below', '¿Qué productos están por debajo de su rango competitivo?'],
      ['bands', '¿En qué franjas de precio tengo poca participación?'],
      ['attrs', `¿Qué atributos explican las diferencias de precio en ${cat.short.toLowerCase()}?`],
      ['first', '¿Qué productos debería revisar primero?'],
      ['raise', '¿Qué ocurre si incremento mis precios un 5 %?'],
      ['validate', '¿Qué colección debería validar con consumidores?'],
    ];
    const ask = (text, forced) => {
      const intent = forced || intentOf(text);
      const c = detectCat(E, text) || (intent === 'compare' || intent === 'attrs' ? f.cat : null);
      const pm = TP.strip(text).match(/(\d+(?:[.,]\d+)?)\s*%?/);
      const a = answer(E, f, intent, c, pm ? parseFloat(pm[1].replace(',', '.')) : null, actions);
      setMsgs([...msgs, { who: 'u', text }, { who: 'a', ...a }]);
      setQ('');
    };
    if (!open) return null;
    return html`<aside className="copilot" aria-label="Copiloto de pricing">
      <div className="cphead"><div><b><${Icon} n="spark" /> Copiloto de pricing</b><small>Modo demostración: respuestas por reglas calculadas sobre los datos de la demo. No hay un modelo de lenguaje conectado.</small></div><button type="button" className="iconbtn" aria-label="Cerrar copiloto" onClick=${() => setOpen(false)}><${Icon} n="x" /></button></div>
      <div className="cpbody">
        ${!msgs.length ? html`<p className="muted">Pregunta sobre tus precios, categorías o competidores. Puedo llevarte a la vista que respalda cada respuesta.</p>` : null}
        ${msgs.map((m, i) => (m.who === 'u' ? html`<div key=${i} className="msg u">${m.text}</div>` : html`<div key=${i} className="msg a">${m.text}${m.action ? html`<button type="button" className="btn sm" onClick=${() => { m.action.fn(); if (innerWidth < 900) setOpen(false); }}>${m.action.l}<${Icon} n="arrow" /></button>` : null}${m.basis ? html`<small className="basis">${m.conf ? html`<b>Confianza: ${m.conf.toLowerCase()}.</b> ` : null}${m.basis}</small>` : null}</div>`))}
        <div ref=${end}></div>
      </div>
      <div className="cpsug">${SUG.map(([k, t]) => html`<button key=${k} type="button" className="chip" onClick=${() => ask(t, k)}>${t}</button>`)}</div>
      <form className="cpin" onSubmit=${(e) => { e.preventDefault(); if (q.trim()) ask(q.trim()); }}><label htmlFor="cp-q" className="sr">Pregunta al copiloto</label><input id="cp-q" type="text" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Escribe una pregunta…" /><button type="submit" className="iconbtn" aria-label="Enviar"><${Icon} n="send" /></button></form>
    </aside>`;
  }

  /* =========================================================
     SHELL
     ========================================================= */
  const NAV = [
    ['Inteligencia', [['overview', 'Overview', 'overview'], ['market', 'Market Intelligence', 'market'], ['advisor', 'Price Advisor', 'advisor']]],
    ['Decisiones', [['launch', 'Product Launch', 'launch'], ['promo', 'Promotion Optimizer', 'promo']]],
    ['Validación y aprendizaje', [['pulse', 'Pulse WTP', 'pulse'], ['learning', 'Revenue Learning', 'learning']]],
  ];
  const ROUTES = ['overview', 'market', 'advisor', 'launch', 'promo', 'pulse', 'learning', 'config'];
  const KEY = 'tita-pi360-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* almacenamiento no disponible */ } };
  const hashRoute = () => { const h = (location.hash || '').slice(1); return ROUTES.includes(h) ? h : 'overview'; };

  function App() {
    const [cfg, setCfgRaw] = useState(() => { const s = load(); return s && s.cfg && s.cfg.vertical ? s.cfg : null; });
    const [dec, setDec] = useState({ map: {}, comp: {} });
    const [route, setRoute] = useState(hashRoute);
    const [fRaw, setFRaw] = useState({ cat: null, off: [], priceType: 'list', mat: 'all', typ: 'all', pos: null });
    const [subs, setSubs] = useState({ market: 'homolog', advisor: 'diagnostico', config: 'integraciones' });
    const [focus, setFocus] = useState(null);
    const [approvals, setApprovals] = useState([]);
    const [studies, setStudies] = useState([]);
    const [extraRecs, setExtraRecs] = useState([]);
    const [prefill, setPrefill] = useState(null);
    const [cpOpen, setCpOpen] = useState(false);
    const [msgs, setMsgs] = useState([]);
    const [navOpen, setNavOpen] = useState(false);
    const [restartAsk, setRestartAsk] = useState(false);

    useEffect(() => { const on = () => setRoute(hashRoute()); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []);
    const setCfg = (n) => {
      if (cfg && n && n.market !== cfg.market) { setApprovals([]); setStudies([]); setDec({ map: {}, comp: {} }); setFocus(null); setMsgs([]); }
      setCfgRaw(n); save({ cfg: n });
    };
    const E = useMemo(() => (cfg ? A.compute(cfg, dec) : null), [cfg, dec]);
    if (!cfg) return html`<${A.Onboarding} onDone=${(c) => { setCfg(c); setFRaw({ cat: c.cats[0], off: [], priceType: 'list', mat: 'all', typ: 'all', pos: null }); location.hash = 'overview'; setRoute('overview'); }} />`;

    const cat = cfg.cats.includes(fRaw.cat) ? fRaw.cat : cfg.cats[0];
    const f = { ...fRaw, cat, brands: cfg.comps.filter((b) => !fRaw.off.includes(b)) };
    const setF = (n) => setFRaw({ ...n, off: cfg.comps.filter((b) => !n.brands.includes(b)), brands: undefined });
    const go = (r, o = {}) => {
      const n = { ...fRaw };
      if (o.cat && cfg.cats.includes(o.cat)) { n.cat = o.cat; n.mat = 'all'; n.typ = 'all'; }
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
    const common = { E, f, setF, dec, setDec, setCfg, go, openProduct, focus, setFocus, approvals, setApprovals, studies, setStudies, sub: subs[route], setSub };
    const pend = approvals.filter((a) => a.status === 'pendiente').length;
    const restart = () => setRestartAsk(true);
    const doRestart = () => { setRestartAsk(false); setCfgRaw(null); save(null); setDec({ map: {}, comp: {} }); setApprovals([]); setStudies([]); setMsgs([]); setFocus(null); };

    let view;
    switch (route) {
      case 'market': view = html`<${A.Market} ...${common} addStudyRec=${(r) => setExtraRecs((x) => [r, ...x].slice(0, 3))} />`; break;
      case 'advisor': view = html`<${A.Advisor} ...${common} />`; break;
      case 'launch': view = html`<${A.Launch} key=${prefill ? prefill.t : 'l'} ...${common} prefill=${prefill} />`; break;
      case 'promo': view = html`<${A.Promo} ...${common} />`; break;
      case 'pulse': view = html`<${A.Pulse} ...${common} extraRecs=${extraRecs} />`; break;
      case 'learning': view = html`<${A.Learning} ...${common} />`; break;
      case 'config': view = html`<${A.Config} ...${common} restart=${restart} />`; break;
      default: view = html`<${A.Overview} ...${common} />`;
    }
    const navItem = ([k, l, ic]) => html`<a key=${k} href=${'#' + k} className=${route === k ? 'on' : ''} aria-current=${route === k ? 'page' : undefined} onClick=${(e) => { e.preventDefault(); go(k); }}><${Icon} n=${ic} />${l}${k === 'market' && E.pendingMaps ? html`<span className="cnt">${E.pendingMaps}</span>` : null}${k === 'advisor' && pend ? html`<span className="cnt">${pend}</span>` : null}${k === 'promo' || k === 'learning' ? html`<span className="tagx">expansión</span>` : null}</a>`;
    return html`<div className=${'shell ' + (cpOpen ? 'cp-on' : '')}>
      <aside className=${'side ' + (navOpen ? 'open' : '')}>
        <div className="brandmark"><span className="logo">T</span><div><b>Tita Pricing</b><small>Intelligence 360°</small></div></div>
        <nav aria-label="Módulos">${NAV.map(([g, items]) => html`<div key=${g} className="ng"><span>${g}</span>${items.map(navItem)}</div>`)}</nav>
        <div className="sidefoot">${navItem(['config', 'Configuration', 'config'])}<div className="tenant"><span className="muted">Espacio de trabajo</span><b>${cfg.storeName}</b><small>${cfg.platform} · ${TP.MARKETS[cfg.market].name}</small></div></div>
      </aside>
      ${navOpen ? html`<div className="scrim" onClick=${() => setNavOpen(false)}></div>` : null}
      <div className="main">
        <header className="top">
          <button type="button" className="iconbtn menu" aria-label="Abrir menú" onClick=${() => setNavOpen(true)}><${Icon} n="menu" /></button>
          <div className="topctx"><b>${cfg.storeName}</b><span className="muted">${cfg.host}</span><span className="pill">${E.mk.currency}</span><span className="pill demo" title="Catálogos, competidores, costos y ventas son ficticios">Datos de demostración</span></div>
          <button type="button" className=${'btn sm cpbtn ' + (cpOpen ? 'primary' : '')} onClick=${() => setCpOpen(!cpOpen)} aria-expanded=${cpOpen}><${Icon} n="spark" />Copiloto</button>
        </header>
        ${restartAsk ? html`<div className="confirm" role="alertdialog" aria-label="Confirmar reinicio"><span>¿Reiniciar el onboarding? Se pierden decisiones, aprobaciones y estudios de esta sesión.</span><button className="btn sm danger" type="button" onClick=${doRestart}>Reiniciar</button><button className="btn sm" type="button" onClick=${() => setRestartAsk(false)}>Cancelar</button></div>` : null}
        <main id="content">${view}</main>
      </div>
      <${Copilot} E=${E} f=${f} open=${cpOpen} setOpen=${setCpOpen} msgs=${msgs} setMsgs=${setMsgs} actions=${actions} />
    </div>`;
  }

  class Boundary extends React.Component {
    constructor(p) { super(p); this.state = { err: null }; }
    static getDerivedStateFromError(err) { return { err }; }
    render() {
      if (this.state.err) return html`<div className="ob"><div className="ob-in"><h2>Algo falló al dibujar esta vista</h2><p className="muted">${String(this.state.err && this.state.err.message)}</p><button className="btn primary" type="button" onClick=${() => { save(null); location.hash = ''; location.reload(); }}>Reiniciar el prototipo</button></div></div>`;
      return this.props.children;
    }
  }
  ReactDOM.createRoot(document.getElementById('root')).render(html`<${Boundary}><${App} /><//>`);
})();
