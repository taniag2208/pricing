/* TITA Pricing Intelligence 360° — onboarding guiado: link → catálogo → mercado → estrategia → oportunidades.
   Todo lo que se muestra viene del estado real del trabajo en el servidor (sin animaciones de progreso ficticias). */
(function () {
  'use strict';
  const { useState, useEffect } = React;
  const TP = window.TP, UI = TP.ui, html = UI.html, L = TP.live, I = TP.ingest;
  const { Icon, Badge, Note } = UI;

  const tokKey = (org) => 'tita-quick-' + org;
  const saveTok = (org, t) => { try { localStorage.setItem(tokKey(org), t); } catch (e) { /* sin almacenamiento */ } };
  const getTok = (org) => { try { return localStorage.getItem(tokKey(org)); } catch (e) { return null; } };
  const hostName = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('es-CO'));
  const COUNTRY = { CO: 'Colombia', MX: 'México', PE: 'Perú', CL: 'Chile', AR: 'Argentina', EC: 'Ecuador', PA: 'Panamá', US: 'Estados Unidos', ES: 'España', BR: 'Brasil', UY: 'Uruguay', GT: 'Guatemala', CR: 'Costa Rica' };

  /* ---------- pasos ---------- */
  const STEPS = ['Conoce tu negocio', 'Exploramos tu catálogo', 'Encontramos tu mercado', 'Configura tu estrategia', 'Descubre tus oportunidades'];
  const stepOf = (phase) => ({ own: 1, need_own: 1, discover: 2, confirm_comps: 2, need_comps: 2, comps: 2, cats: 3, classify: 3, done: 4 }[phase] ?? 1);
  function Stepper({ cur }) {
    return html`<ol className="stepper" aria-label="Pasos del análisis">${STEPS.map((t, i) => html`<li key=${i} className=${i < cur ? 'done' : i === cur ? 'cur' : ''} aria-current=${i === cur ? 'step' : undefined}><span className="n">${String(i + 1).padStart(2, '0')}</span><span className="t">${t}</span></li>`)}</ol>`;
  }

  /* ---------- diagnóstico de conexión ---------- */
  const STAGE = { connect: 'Conectando', platform: 'Identificando plataforma', catalog: 'Leyendo catálogo', validate: 'Validando productos', categories: 'Analizando categorías', partial: 'Lectura parcial', done: 'Completado', failed: 'Requiere intervención', needs_input: 'Requiere intervención' };
  const STAGE_ORDER = ['connect', 'platform', 'catalog', 'validate', 'categories'];
  const ATT = { ok: ['ok', 'Funcionó'], empty: ['warn', 'Sin productos útiles'], fail: ['down', 'No funcionó'], blocked: ['down', 'No permitido'], skip: ['neutral', 'No disponible'] };
  function ConnectionDiagnosis({ d, title, children, live }) {
    if (!d) return html`<section className="diag"><div className="diag-head"><span className="eyebrow">Diagnóstico de conexión</span><h3>${title || 'Conectando con la tienda…'}</h3></div><div className="diag-stages">${STAGE_ORDER.map((s, i) => html`<span key=${s} className=${i === 0 ? 'run' : ''}>${STAGE[s]}</span>`)}</div></section>`;
    const terminal = ['done', 'partial', 'failed', 'needs_input'].includes(d.stage);
    const idx = terminal ? (d.stage === 'done' || d.stage === 'partial' ? STAGE_ORDER.length : STAGE_ORDER.indexOf('catalog')) : STAGE_ORDER.indexOf(d.stage);
    const tone = d.stage === 'done' ? 'ok' : d.stage === 'partial' ? 'warn' : terminal ? 'down' : 'info';
    const pricedPct = d.found ? Math.round((d.priced / d.found) * 100) : null;
    return html`<section className=${'diag diag-t-' + tone} aria-live=${live ? 'polite' : undefined}>
      <div className="diag-head"><div><span className="eyebrow">Diagnóstico de conexión</span><h3>${title || (d.origin ? hostName(d.origin) : 'Tienda')}</h3></div><${Badge} tone=${tone}>${STAGE[d.stage] || d.stage}<//></div>
      <div className="diag-stages">${STAGE_ORDER.map((s, i) => html`<span key=${s} className=${i < idx ? 'done' : i === idx && !terminal ? 'run' : terminal && i === idx && d.stage === 'failed' ? 'fail' : ''}>${STAGE[s]}</span>`)}</div>
      <dl className="diag-kv">
        <div><dt>Plataforma</dt><dd>${d.platform || 'No identificada'}</dd></div>
        <div><dt>País y moneda</dt><dd>${(d.country ? COUNTRY[d.country] || d.country : 'Sin confirmar') + ' · ' + (d.currency || 'moneda sin confirmar')}</dd></div>
        <div><dt>Método de lectura</dt><dd>${d.methodLabel || '—'}</dd></div>
        <div><dt>Productos encontrados</dt><dd className="mono">${fmtN(d.found)}</dd></div>
        <div><dt>Con precio válido</dt><dd className="mono">${fmtN(d.priced)}${pricedPct != null ? html` <span className="muted">(${pricedPct} %)</span>` : null}</dd></div>
        <div><dt>Categorías identificadas</dt><dd className="mono">${fmtN(d.categories)}</dd></div>
      </dl>
      ${d.warnings && d.warnings.length ? html`<ul className="diag-warn">${d.warnings.map((w, i) => html`<li key=${i}><${Icon} n="alert" s=${14} />${w}</li>`)}</ul>` : null}
      ${d.attempts && d.attempts.length ? html`<details className="diag-att"><summary>Qué intentamos (${d.attempts.length})</summary><ol>${d.attempts.map((a, i) => html`<li key=${i}><span className="lvl mono">N${a.level}</span><span>${a.label}</span><${Badge} tone=${(ATT[a.status] || ATT.fail)[0]}>${(ATT[a.status] || ATT.fail)[1]}<//><small>${a.detail}${a.ms ? ' · ' + (a.ms / 1000).toFixed(1) + ' s' : ''}</small></li>`)}</ol></details>` : null}
      ${children ? html`<div className="diag-actions">${children}</div>` : null}
    </section>`;
  }

  /* ---------- competidores ---------- */
  const TYPE = { directo: ['Directo', 'Mismo tipo de producto y precio parecido'], aspiracional: ['Aspiracional', 'Mismo tipo de producto, precio más alto'], 'económico': ['Económico', 'Mismo tipo de producto, precio más bajo'], indirecto: ['Indirecto', 'Comparte pocas categorías'], referente: ['Referente', 'Referente de categoría o de otro mercado'] };
  const COMP = { alta: ['ok', 'Comparabilidad alta'], media: ['info', 'Comparabilidad media'], baja: ['warn', 'Comparabilidad baja'], sin_productos: ['down', 'Sin productos comparables'], no_comparable: ['down', 'Otra moneda o escala'], otro_mercado: ['warn', 'Otro mercado'] };
  const READ = { pending: ['neutral', 'En cola'], reading: ['info', 'Leyendo…'], ok: ['ok', 'Leído'], partial: ['warn', 'Lectura parcial'], failed: ['down', 'Pendiente: no se pudo leer'] };
  const VER = { ok: ['ok', 'Dominio verificado'], dns_not_found: ['down', 'El dominio no existe'], unreachable: ['warn', 'No respondió'], timeout: ['warn', 'No respondió a tiempo'], blocked: ['down', 'Dirección no permitida'] };
  const verOf = (v) => VER[v] || (String(v || '').startsWith('http_') ? ['warn', 'Error del sitio (' + v.slice(5) + ')'] : ['neutral', 'Sin verificar']);

  function CompetitorConfirm({ org, p, onSent, onReset }) {
    const confirm = p.phase === 'confirm_comps';
    const cands = confirm ? p.candidates || [] : [];
    const [sel, setSel] = useState(() => new Set(cands.filter((c) => c.verified === 'ok').map((c) => c.url)));
    const [txt, setTxt] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
    const extra = txt.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    const urls = [...cands.filter((c) => sel.has(c.url)).map((c) => c.url), ...extra];
    const toggle = (u) => setSel((x) => { const n = new Set(x); n.has(u) ? n.delete(u) : n.add(u); return n; });
    const send = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await L.api('POST', '/quick/' + org + '/comps', { urls }); onSent(); } catch (x) { setErr(x.message); setBusy(false); } };
    const failed = (p.comps || []).filter((c) => c.read && c.read.status === 'failed');
    return html`<form className="sheet" onSubmit=${send}>
      ${confirm ? html`<p className="lead-s">Encontramos estas tiendas que venden lo mismo que <b>${p.storeName || 'tu tienda'}</b>. Verificamos que cada dominio exista antes de mostrarlo. Marca las que son tu competencia y agrega las que falten.</p>`
        : html`<${Note} tone="warn">No tenemos competidores con catálogo legible todavía. Escribe los links de las tiendas que compiten contigo y seguimos con el análisis.<//>`}
      ${p.discoverError ? html`<${Note} tone="warn">${p.discoverError}<//>` : null}
      ${cands.length ? html`<ul className="cand">${cands.map((c) => { const v = verOf(c.verified); return html`<li key=${c.url} className=${sel.has(c.url) ? 'on' : ''}>
        <label><input type="checkbox" checked=${sel.has(c.url)} onChange=${() => toggle(c.url)} />
          <span className="cand-main"><b>${c.name}</b><span className="mono muted">${hostName(c.url)}</span>${c.category ? html`<small>${c.category}</small>` : null}</span>
          <span className="cand-tags"><${Badge} tone=${v[0]}>${v[1]}<//>${c.source === 'registro' ? html`<${Badge} tone="ok">Catálogo verificado antes<//>` : html`<${Badge} tone="neutral">Búsqueda web<//>`}${c.positioning ? html`<${Badge} tone="neutral">${c.positioning}<//>` : null}</span></label></li>`; })}</ul>` : null}
      ${failed.length ? html`<details className="manual" open><summary className="sm">${failed.length} tienda(s) que no pudimos leer</summary><ul className="checks">${failed.map((c) => html`<li key=${c.url} className="no"><${Icon} n="x" s=${14} /><span><b>${c.name}</b> <span className="muted">${hostName(c.url)}</span>: ${c.read.why}</span></li>`)}</ul></details>` : null}
      <label className="fld" htmlFor="qc-u"><span>${confirm ? 'Agregar otros competidores (opcional, uno por línea)' : 'Links de 2 a 5 competidores (uno por línea)'}</span><textarea id="qc-u" rows=${confirm ? 3 : 5} placeholder=${'marca1.com\nmarca2.com.co'} value=${txt} onInput=${(e) => setTxt(e.target.value)}></textarea></label>
      ${err ? html`<div className="err" role="alert">${err}</div>` : null}
      <div className="ob-actions"><button className="btn ghost" type="button" onClick=${onReset}>Analizar otra tienda</button><button className="btn primary" type="submit" disabled=${busy || !urls.length}>${busy ? 'Enviando…' : confirm ? 'Analizar con ' + urls.length + ' competidor' + (urls.length === 1 ? '' : 'es') : 'Continuar con estos competidores'}</button></div>
    </form>`;
  }

  // Tablero de competidores: estado de lectura, tipo, comparabilidad y evidencia. Permite reintentar solo los fallidos.
  function CompetitorBoard({ comps, org, canRetry, onRetried, compact }) {
    const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
    if (!comps || !comps.length) return null;
    const failed = comps.filter((c) => c.read && c.read.status === 'failed');
    const retry = async () => { setBusy(true); setErr(''); try { await L.api('POST', '/quick/' + org + '/retry', {}); onRetried && onRetried(); } catch (x) { setErr(x.message); } setBusy(false); };
    return html`<div className="board">
      <ul className="comps-list">${comps.map((c) => { const r = READ[(c.read || {}).status] || READ.pending; const t = TYPE[c.type]; const k = COMP[c.comparability]; return html`<li key=${c.url} className=${'cl-' + ((c.read || {}).status || 'pending')}>
        <div className="cl-head"><div><b>${c.name}</b> <span className="mono muted">${hostName(c.url)}</span></div><div className="cl-tags"><${Badge} tone=${r[0]}>${r[1]}<//>${t ? html`<${Badge} tone="info">${t[0]}<//>` : null}${k ? html`<${Badge} tone=${k[0]}>${k[1]}<//>` : null}</div></div>
        ${c.read && c.read.status === 'failed' ? html`<p className="sm">${c.read.why}. Se conserva como referencia pendiente.</p>` : null}
        ${c.read && (c.read.status === 'ok' || c.read.status === 'partial') ? html`<p className="sm muted">${c.read.methodLabel} · ${fmtN(c.read.related)} productos relacionados de ${fmtN(c.read.found)} leídos${c.read.currency ? ' · ' + c.read.currency : ''}${c.read.at ? ' · ' + new Date(c.read.at).toLocaleDateString('es-CO') : ''}</p>` : null}
        ${c.confidence != null && !compact ? html`<div className="conf"><span>Evidencia</span><div className="bar" role="img" aria-label=${'Evidencia ' + Math.round(c.confidence * 100) + ' de 100'}><i style=${{ width: Math.round(c.confidence * 100) + '%' }}></i></div><span className="mono">${Math.round(c.confidence * 100)}</span></div>` : null}
        ${c.note ? html`<p className="sm">${c.note}</p>` : null}
        ${c.evidence && c.evidence.length && !compact ? html`<details><summary className="sm">Por qué lo clasificamos así</summary><ul className="plain">${c.evidence.map((e, i) => html`<li key=${i}>${e}</li>`)}</ul></details>` : null}
      </li>`; })}</ul>
      ${canRetry && failed.length ? html`<div className="mapact"><button type="button" className="btn sm" disabled=${busy} onClick=${retry}>${busy ? 'Reintentando…' : 'Reintentar solo las ' + failed.length + ' lecturas fallidas'}</button>${err ? html`<span className="err">${err}</span>` : null}</div>` : null}
    </div>`;
  }

  /* ---------- estrategia (paso 4) ---------- */
  const OBJ = [['competitividad', 'Ser competitivo', 'Alinear precios con el mercado sin perder margen'], ['margen', 'Proteger el margen', 'Subir donde el mercado lo permite'], ['volumen', 'Ganar volumen', 'Ser más atractivo en precio en productos clave'], ['posicionamiento', 'Reforzar posicionamiento', 'Sostener una marca premium con evidencia']];
  function StrategyForm({ org, initial, onSaved }) {
    const [f, setF] = useState(() => ({ objective: 'competitividad', maxChange: 0.12, minMargin: '', rounding: 'psico', ...(initial || {}) }));
    const [state, setState] = useState(initial ? 'saved' : 'idle');
    const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setState('dirty'); };
    const save = async (e) => { e.preventDefault(); setState('saving'); try { await L.api('POST', '/quick/' + org + '/strategy', { ...f, minMargin: f.minMargin === '' ? null : Number(f.minMargin) / 100 }); setState('saved'); onSaved && onSaved(); } catch (x) { setState('error'); L.toast(x.message, 'bad'); } };
    return html`<form className="sheet" onSubmit=${save}>
      <p className="lead-s">Mientras terminamos el análisis, cuéntanos qué buscas. Solo lo imprescindible; puedes cambiarlo después.</p>
      <fieldset className="opts"><legend className="fld-l">Objetivo principal</legend>${OBJ.map(([k, t, d]) => html`<label key=${k} className=${'optc' + (f.objective === k ? ' on' : '')}><input type="radio" name="obj" className="sr" checked=${f.objective === k} onChange=${() => set('objective', k)} /><b>${t}</b><span>${d}</span></label>`)}</fieldset>
      <div className="grid-3f">
        <label className="fld"><span>Cambio máximo por producto</span><select value=${f.maxChange} onChange=${(e) => set('maxChange', Number(e.target.value))}>${[0.05, 0.08, 0.12, 0.2].map((v) => html`<option key=${v} value=${v}>${Math.round(v * 100)} %</option>`)}</select></label>
        <label className="fld"><span>Margen mínimo (si conoces tus costos)</span><input type="number" min="0" max="90" placeholder="Opcional, %" value=${f.minMargin} onInput=${(e) => set('minMargin', e.target.value)} /></label>
        <label className="fld"><span>Redondeo de precios</span><select value=${f.rounding} onChange=${(e) => set('rounding', e.target.value)}>${Object.entries(TP.ROUNDING).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}</select></label>
      </div>
      <div className="ob-actions"><span className="muted sm" aria-live="polite">${state === 'saved' ? 'Guardado. Se aplica a las recomendaciones.' : state === 'saving' ? 'Guardando…' : ''}</span><button className="btn primary" type="submit" disabled=${state === 'saving' || state === 'saved'}>Guardar estrategia</button></div>
    </form>`;
  }

  /* ---------- recuperación de la tienda propia (nivel 4) ---------- */
  const OWN_REASON = {
    country_selector: 'Esta dirección es una página para elegir país, no una tienda. Elige el sitio del país que quieres analizar.',
    unreachable: 'No pudimos conectarnos: el dominio no existe o no responde. Revisa que la dirección esté bien escrita.',
    dns_not_found: 'El dominio no existe. Revisa que la dirección esté bien escrita.',
    invalid_url: 'La dirección no es válida o no está permitida.', blocked_destination: 'La dirección no está permitida.',
    timeout: 'La tienda tardó demasiado en responder. Puede estar lenta en este momento: intenta de nuevo en unos minutos.',
    robots: 'La tienda no permite que programas lean su catálogo (lo indica en su archivo robots.txt) y respetamos esa decisión.',
    robots_unavailable: 'El archivo robots.txt de la tienda no respondió; por norma no leemos el sitio en ese caso.',
    waf: 'La tienda tiene una protección contra lecturas automáticas que no intentamos evadir.', login: 'La tienda pide iniciar sesión para ver los productos.',
    restricted: 'La tienda no permite la lectura automática de su catálogo.',
    no_catalog: 'La tienda no publica su catálogo en un formato que podamos leer automáticamente.', no_prices: 'Encontramos productos, pero sin precios visibles.',
    ai_error: 'La IA no pudo extraer los productos de las páginas de la tienda.', too_few: 'Encontramos muy pocos productos con precio para hacer un análisis.',
  };
  function OwnRecovery({ org, p, onReset, onSent, onRetry }) {
    const [err, setErr] = useState(''); const [busy, setBusy] = useState(''); const [fix, setFix] = useState(''); const [cn, setCn] = useState({ platform: 'shopify' });
    const useUrl = async (url) => { setBusy('url'); setErr(''); try { await L.api('POST', '/quick/' + org + '/own', { url }); onRetry(); } catch (x) { setErr(x.message); setBusy(''); } };
    const pick = async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      setBusy('file'); setErr('');
      try {
        const r = await I.readFile(f);
        const parsed = r.rows ? { items: I.fromRows(r.rows) } : I.parseText(r.text, null);
        if (!parsed.items || parsed.items.length < 8) throw new Error('No encontramos al menos 8 productos con nombre y precio. Revisa que el archivo tenga columnas de nombre, precio y categoría.');
        await L.api('POST', '/quick/' + org + '/catalog', { items: parsed.items.map((x) => ({ name: x.name, price: x.price, promo: x.promo, label: x.label, desc: x.desc, sku: x.sku })) });
        onSent();
      } catch (x) { setErr(x.message || 'No se pudo leer el archivo.'); setBusy(''); }
    };
    const connect = async (e) => { e.preventDefault(); setBusy('auth'); setErr(''); try { await L.api('POST', '/quick/' + org + '/connect', cn); setCn({ platform: cn.platform }); onSent(); } catch (x) { setErr(x.message); setBusy(''); } };
    const cf = (k, label, type, ph) => html`<label className="fld"><span>${label}</span><input type=${type || 'text'} autoComplete="off" spellCheck="false" placeholder=${ph || ''} value=${cn[k] || ''} onInput=${(e) => setCn({ ...cn, [k]: e.target.value })} /></label>`;
    return html`<div className="recover">
      <${ConnectionDiagnosis} d=${p.ownDiag} title="Tu tienda">${html`<p><b>${OWN_REASON[p.reason] || OWN_REASON[p.code] || OWN_REASON.no_catalog}</b></p>`}${p.redirect ? html`<p className="sm muted">La dirección redirige a ${p.redirect}.</p>` : null}<//>
      ${p.countries ? html`<section className="sheet"><h3>Elige el país</h3><div className="chips">${p.countries.map((c) => html`<button key=${c.url} type="button" className="chip" disabled=${!!busy} onClick=${() => useUrl(c.url)}>${c.label} <span className="muted">${hostName(c.url)}</span></button>`)}</div></section>` : null}
      <div className="grid-2">
        <section className="sheet"><span className="eyebrow">Opción 1</span><h3>Probar otra dirección</h3><form className="urlrow" onSubmit=${(e) => { e.preventDefault(); if (fix.trim()) useUrl(fix.trim()); }}><input aria-label="Otra dirección de la tienda" placeholder="https://tienda.com" value=${fix} onInput=${(e) => setFix(e.target.value)} /><button className="btn sm" type="submit" disabled=${!!busy || !fix.trim()}>Probar</button></form>
          <span className="eyebrow mt">Opción 2</span><h3>Subir el catálogo</h3><p className="sm muted">CSV o Excel con columnas de <b>nombre</b> y <b>precio</b> (y si las tienes, <b>categoría</b> y <b>precio de promoción</b>). La exportación de productos de cualquier tienda sirve.</p>
          <div><label className=${'btn' + (busy ? ' disabled' : '')}><input type="file" className="sr" accept=".csv,.txt,.xlsx,.xls" onChange=${pick} />${busy === 'file' ? 'Leyendo archivo…' : 'Subir catálogo (CSV o Excel)'}</label></div></section>
        <form className="sheet" onSubmit=${connect}><span className="eyebrow">Opción 3</span><h3>Conectar tu tienda</h3><p className="sm muted">Con credenciales de solo lectura de tu plataforma. Se usan una sola vez para leer el catálogo y no se guardan.</p>
          <label className="fld"><span>Plataforma</span><select value=${cn.platform} onChange=${(e) => setCn({ platform: e.target.value })}><option value="shopify">Shopify (token de app personalizada)</option><option value="woocommerce">WooCommerce (clave REST)</option><option value="vtex">VTEX (AppKey y AppToken)</option></select></label>
          ${cn.platform === 'shopify' ? [cf('store', 'Dominio de administración', 'text', 'mitienda.myshopify.com'), cf('token', 'Token de acceso (read_products)', 'password', 'shpat_…')]
          : cn.platform === 'woocommerce' ? [cf('store', 'Dirección de la tienda', 'text', 'https://mitienda.com'), cf('key', 'Clave de consumidor', 'password', 'ck_…'), cf('secret', 'Secreto de consumidor', 'password', 'cs_…')]
          : [cf('account', 'Cuenta VTEX', 'text', 'mitienda'), cf('appKey', 'AppKey', 'password'), cf('appToken', 'AppToken', 'password')]}
          <div><button className="btn" type="submit" disabled=${!!busy}>${busy === 'auth' ? 'Conectando…' : 'Conectar y leer catálogo'}</button></div></form>
      </div>
      ${err ? html`<div className="err" role="alert">${err}</div>` : null}
      <div className="ob-actions"><button className="btn ghost" type="button" onClick=${onReset}>Analizar otra tienda</button></div>
    </div>`;
  }

  /* ---------- el link (como en la primera versión: formulario simple y centrado) ---------- */
  function QuickLanding({ onStarted, onLogin }) {
    const [url, setUrl] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
    const go = async (e) => {
      e.preventDefault(); setBusy(true); setErr('');
      try { const r = await L.api('POST', '/quick', { url }); saveTok(r.org, r.token); onStarted(r.org); }
      catch (x) { setErr(x.message); setBusy(false); }
    };
    return html`<div className="ob"><div className="ob-in">
      <div className="row-between"><div className="brand"><img src="/brand/tita-mark.svg" alt="" width="28" height="28" /><span className="wm">TITA MEDIA</span><span className="prod">Pricing Intelligence 360°</span></div><button type="button" className="linkbtn sm" onClick=${onLogin}>Ingreso equipo Tita</button></div>
      <p className="eyebrow">Pricing intelligence · Retail · IA</p>
      <h1>Descubre oportunidades de rentabilidad en tu catálogo.</h1>
      <p className="lead">Pega el link de una tienda online. Leemos su catálogo público, la IA encuentra a sus competidores, compara productos equivalentes y te mostramos dónde está caro, dónde está barato y qué espacios del mercado no está cubriendo.</p>
      <form className="urlform" onSubmit=${go}>
        <label htmlFor="q-url">Dirección de la tienda</label>
        <div className="urlrow"><${Icon} n="store" /><input id="q-url" type="text" inputMode="url" autoComplete="url" placeholder="https://mitienda.com" value=${url} onInput=${(e) => setUrl(e.target.value)} /><button className="btn primary" type="submit" disabled=${busy || !url.trim()}>${busy ? 'Preparando…' : 'Analizar'}<${Icon} n="arrow" /></button></div>
        ${err ? html`<div className="err" role="alert">${err}</div>` : null}
        <div className="hint">Funciona con Shopify, VTEX, WooCommerce y la mayoría de tiendas que publican sus productos. Si tu tienda no se puede leer, podrás subir un archivo o conectarla. El análisis toma entre 5 y 10 minutos y queda disponible 7 días.</div>
      </form>
      <ul className="checks"><li className="ok"><${Icon} n="check" s=${14} />Solo usamos información pública de las tiendas: productos, precios y fichas. Respetamos robots.txt.</li><li className="ok"><${Icon} n="check" s=${14} />Sin registro ni configuración.</li><li className="ok"><${Icon} n="check" s=${14} />Cada recomendación muestra su evidencia; si no hay evidencia, no recomendamos.</li></ul>
    </div></div>`;
  }

  /* ---------- fases del análisis (estado real del trabajo en el servidor) ---------- */
  const PHASES = [['own', 'Leyendo el catálogo de la tienda'], ['discover', 'Buscando competidores en la web'], ['confirm', 'Confirmando tus competidores'], ['comps', 'Leyendo el catálogo de los competidores'], ['cats', 'Proponiendo categorías y atributos'], ['classify', 'Clasificando productos con IA'], ['done', 'Construyendo el análisis']];
  const PHASE_IDX = { own: 0, need_own: 0, discover: 1, confirm_comps: 2, need_comps: 2, comps: 3, cats: 4, classify: 5, done: 6 };
  function phaseDetail(p) {
    const d = p.ownDiag || {};
    const comps = p.comps || [];
    const read = comps.filter((c) => c.read && (c.read.status === 'ok' || c.read.status === 'partial'));
    const failed = comps.filter((c) => c.read && c.read.status === 'failed');
    return {
      own: p.own != null ? fmtN(p.own) + ' productos tomados para el análisis' + (p.ownTotal > p.own ? ' (de ' + fmtN(p.ownTotal) + ' leídos)' : '') + (d.methodLabel ? ' · ' + d.methodLabel : '') + (d.currency ? ' · ' + d.currency : '')
        : p.phase === 'need_own' ? (OWN_REASON[p.reason] || OWN_REASON[p.code] || 'No pudimos leer el catálogo')
        : d.stage ? STAGE[d.stage] + (d.platform ? ' · ' + d.platform : '') + (d.found ? ' · ' + fmtN(d.found) + ' productos' : '') : '',
      discover: p.candidates ? p.candidates.length + ' candidatos: ' + p.candidates.slice(0, 6).map((c) => c.name).join(', ') + (p.candidates.length > 6 ? '…' : '') : p.discoverError || '',
      confirm: comps.length ? comps.length + ' competidores confirmados' : p.phase === 'confirm_comps' ? 'Esperando tu confirmación' : '',
      comps: comps.length ? [read.length ? read.map((c) => c.name + ' (' + fmtN(c.read.related) + ')').join(', ') : '', failed.length ? failed.length + ' sin leer: ' + failed.map((c) => c.name).join(', ') : '', comps.some((c) => ['pending', 'reading'].includes((c.read || {}).status)) ? 'leyendo ' + comps.filter((c) => ['pending', 'reading'].includes((c.read || {}).status)).length + ' de ' + comps.length + '…' : ''].filter(Boolean).join(' · ') : '',
      cats: p.cats ? p.cats.join(', ') : '',
      classify: p.classified != null ? fmtN(p.classified) + ' clasificados · ' + fmtN(p.left || 0) + ' en cola' : '',
      done: '',
    };
  }
  function Phases({ p, status }) {
    const cur = PHASE_IDX[p.phase || 'own'] ?? 0;
    const waiting = status === 'waiting', failed = status === 'failed';
    const det = phaseDetail(p);
    return html`<ol className="proc" aria-label="Fases del análisis">${PHASES.map(([k, t], i) => {
      const cls = i < cur ? 'done' : i === cur ? (waiting ? 'wait' : failed ? 'fail' : 'run') : '';
      return html`<li key=${k} className=${'procrow ' + cls} aria-current=${i === cur ? 'step' : undefined}><span className="st">${i < cur ? html`<${Icon} n="check" s=${12} />` : i === cur && waiting ? '!' : i === cur && failed ? html`<${Icon} n="x" s=${12} />` : ''}</span><b>${t}</b><span className="res">${det[k] || (i === cur && waiting ? 'Necesitamos tu respuesta' : '')}</span></li>`;
    })}</ol>`;
  }

  function QuickGate({ org, me, children, onReset }) {
    const [st, setSt] = useState(undefined);
    const [kick, setKick] = useState(0);
    useEffect(() => {
      let alive = true, timer = null, pumping = false;
      const pull = async () => {
        let s = null; try { s = await L.api('GET', '/quick/' + org + '/status'); } catch (e) { s = { status: 'failed', error: e.message }; }
        if (!alive) return; setSt(s);
        const live = s && (s.status === 'queued' || s.status === 'running');
        if (live && !pumping) { pumping = true; L.api('POST', '/quick/' + org + '/pump').catch(() => {}).finally(() => { pumping = false; }); }
        if (live) timer = setTimeout(pull, 2500);
      };
      pull();
      return () => { alive = false; clearTimeout(timer); };
    }, [org, kick]);
    if (st === undefined) return html`<div className="ob"><div className="ob-in"><span className="spin"></span></div></div>`;
    if (st && st.status === 'done') return children;
    const p = (st && st.progress) || {};
    const phase = p.phase || 'own';
    const again = (patch) => { setSt({ status: 'queued', progress: { ...p, ...patch } }); setKick((x) => x + 1); };
    const waiting = st && st.status === 'waiting';
    const failed = st && st.status === 'failed';
    const name = p.storeName || (me.org && me.org.name) || 'la tienda';
    const title = waiting ? (phase === 'need_own' ? (p.countries ? 'Elige el país de la tienda' : 'Necesitamos tu ayuda con el catálogo') : phase === 'confirm_comps' ? 'Confirma tu mercado' : '¿Quiénes son tus competidores?')
      : failed ? 'No pudimos completar el análisis' : 'Analizando ' + name + '…';
    let action = null;
    if (waiting && phase === 'need_own') action = html`<${OwnRecovery} org=${org} p=${p} onReset=${onReset} onSent=${() => again({ phase: 'discover' })} onRetry=${() => again({ phase: 'own', ownDiag: null })} />`;
    else if (waiting) action = html`<${CompetitorConfirm} key=${phase + (p.candidates || []).length} org=${org} p=${p} onReset=${onReset} onSent=${() => again({ phase: 'comps' })} />`;
    else if (failed) action = html`<div className="sheet"><${Note} tone="warn">${st.error}<//><div className="ob-actions"><button className="btn primary" type="button" onClick=${onReset}>Analizar otra tienda</button></div></div>`;
    const showStrategy = !waiting && !failed && (PHASE_IDX[phase] || 0) >= 3;
    return html`<div className="ob"><div className="ob-in wide">
      <div className="ob-top"><div className="brand"><img src="/brand/tita-mark.svg" alt="" width="24" height="24" /><span className="wm">TITA MEDIA</span><span className="prod">Pricing Intelligence 360°</span></div><span className="muted sm">Puedes dejar esta pestaña abierta: el análisis avanza mientras la ves.</span></div>
      <div className="ob-head"><h2>${title}</h2></div>
      <${Phases} p=${p} status=${st && st.status} />
      ${action}
      ${showStrategy ? html`<details className="sheet strat" open><summary><span className="eyebrow">Mientras terminamos</span><h3>Configura tu estrategia</h3></summary><${StrategyForm} org=${org} initial=${p.strategy} /></details>` : null}
      ${p.comps && p.comps.length && !waiting ? html`<details className="sheet"><summary><h3>Tus competidores</h3></summary><${CompetitorBoard} comps=${p.comps} org=${org} compact=${phase === 'comps'} /></details>` : null}
      ${p.ownDiag && !(waiting && phase === 'need_own') ? html`<details className="sheet"><summary><h3>Diagnóstico de conexión de tu tienda</h3></summary><${ConnectionDiagnosis} d=${p.ownDiag} title=${name} live=${phase === 'own'} /></details>` : null}
    </div></div>`;
  }

  TP.onboard = { QuickLanding, QuickGate, ConnectionDiagnosis, CompetitorBoard, StrategyForm, saveTok, getTok, hostName };
})();
