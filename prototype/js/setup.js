/* TITA Pricing Intelligence 360° — configuración inicial y módulo «Catálogo y clasificación»:
   tiendas, importación de catálogos, categorías y rúbricas con IA, clasificación por lotes,
   revisión humana y costos/ventas. */
(function () {
  'use strict';
  const { useState, useMemo, useRef, useEffect } = React;
  const TP = window.TP, UI = TP.ui, html = UI.html, A = TP.app, I = TP.ingest, L = TP.live;
  const { Icon, Badge, Seg, Select, Empty, Note, Thumb } = UI;

  const nowIso = () => new Date().toISOString();
  A.defaultConfig = (o) => ({ storeName: '', market: 'CO', objective: 'competitividad', comps: [], cats: [], attrsOff: {}, franjas: {}, policy: { minMargin: 0.55, promoMinMargin: 0.35, rounding: 'psico', maxChange: 0.12 }, setupDone: false, step: 0, measured: null, ...o });
  A.saveConfig = (ws, patch) => L.set('ws/config', { ...A.defaultConfig(), ...(ws.ws.config || {}), ...patch });

  /* ---------- importación de un catálogo ---------- */
  A.ImportPanel = function ({ ws, sid, ro, onSaved }) {
    const store = ws.stores[sid] || {};
    const origin = I.origin(store.url);
    const [text, setText] = useState('');
    const [res, setRes] = useState(null);
    const [busy, setBusy] = useState('');
    const [err, setErr] = useState('');
    const [mode, setMode] = useState('add');
    const ctl = useRef(null);
    const existing = L.storeItems(ws, sid);
    const take = (r) => { setErr(r.error || (r.items.length ? '' : 'No encontramos productos con nombre y precio en este contenido.')); setRes(r.items.length ? r : null); };
    const process = () => { const r = I.parseText(text, origin); if (r.format === 'text') { setRes(null); setErr(''); setBusy('need-ai'); return; } setBusy(''); take(r); };
    const ai = async () => {
      const sample = await I.sample();
      if (!sample) { setErr('Claude no está disponible en esta vista. Usa el JSON de la plataforma o un archivo CSV/Excel.'); return; }
      ctl.current = new AbortController(); setBusy('ai'); setErr('');
      try { const items = await I.extractFromText(sample, text, origin, ctl.current.signal); take({ format: 'Página (extraído con Claude)', items }); setBusy(''); }
      catch (e) { setBusy('need-ai'); if (e.code !== 'cancelled') setErr(I.errText(e)); }
    };
    const onFile = async (e) => {
      const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
      try { const r = await I.readFile(f); if (r.rows) take({ format: 'Excel', items: I.fromRows(r.rows) }); else { setText(r.text.slice(0, 2e6)); const p = I.parseText(r.text, origin); if (p.format === 'text') setBusy('need-ai'); else take(p); } }
      catch (x) { setErr(x.message || 'No se pudo leer el archivo.'); }
    };
    const save = async () => {
      if (!res) return;
      const base = mode === 'add' ? existing : [];
      const by = Object.fromEntries(base.map((p) => [p.id, p]));
      res.items.forEach((p) => { by[p.id] = p; });
      const all = Object.values(by);
      setBusy('save');
      try {
        const chunks = await L.saveCatalog(sid, all, store.chunks || 0);
        await L.set('stores/' + sid, { ...store, n: all.length, chunks, importedAt: nowIso(), formats: [...new Set([...(store.formats || []), res.format])] });
        setRes(null); setText(''); setBusy(''); onSaved && onSaved(all.length);
      } catch (e) { setBusy(''); }
    };
    return html`<div className="imp">
      ${origin ? html`<div className="implinks"><b>1. Abre el catálogo público de ${I.hostOf(origin)}</b><p className="muted sm">Abre el enlace de la plataforma de la tienda (los demás mostrarán un error). Si ves texto con productos, selecciónalo todo (Ctrl+A), cópialo y pégalo abajo. Repite con page=2, 3… para catálogos grandes.</p>
        <ul>${I.links(origin).map((l) => html`<li key=${l.platform}><a href=${l.url} target="_blank" rel="noopener noreferrer">${l.platform}<${Icon} n="link" s=${13} /></a><span className="muted sm">${l.note}</span></li>`)}</ul>
        <p className="muted sm">¿Otra plataforma? Abre una página de categoría de la tienda, copia todo el texto y pégalo: Claude extrae los productos.</p></div>` : null}
      <div className="impbox">
        <label className="fld" htmlFor=${'imp-t-' + sid}><span>${origin ? '2. ' : ''}Pega aquí el contenido (JSON, CSV o texto de la página)</span><textarea id=${'imp-t-' + sid} rows="5" value=${text} onInput=${(e) => { setText(e.target.value); setBusy(''); }} disabled=${ro} placeholder='{"products":[…]}  ·  nombre;precio;categoria;…  ·  texto de una página de categoría'></textarea></label>
        <div className="mapact"><button type="button" className="btn sm primary" disabled=${ro || !text.trim() || busy === 'ai'} onClick=${process}>Procesar</button><span className="muted sm">o</span><label className=${'btn sm ' + (ro ? 'disabled' : '')} htmlFor=${'imp-f-' + sid}><${Icon} n="upload" />Subir archivo (CSV, Excel, JSON)</label><input id=${'imp-f-' + sid} type="file" accept=".csv,.tsv,.txt,.json,.xlsx,.xls" className="sr" disabled=${ro} onChange=${onFile} /></div>
        ${busy === 'need-ai' || busy === 'ai' ? html`<${Note}>No es un JSON de plataforma ni un CSV. Claude puede leer el texto y extraer nombre, precio, precio tachado y categoría de cada producto.
          <div className="mapact mt6">${busy === 'ai' ? html`<span className="spin"></span><span className="sm">Extrayendo productos…</span><button type="button" className="btn sm" onClick=${() => ctl.current && ctl.current.abort()}>Detener</button>` : html`<button type="button" className="btn sm primary" onClick=${ai}><${Icon} n="spark" />Extraer con Claude</button>`}</div><//>` : null}
        ${err ? html`<div className="err" role="alert">${err}</div>` : null}
        ${res ? html`<div className="preview"><div className="row-between"><b>${res.items.length} productos detectados · formato ${res.format}</b>${existing.length ? html`<${Seg} size="sm" label="Modo" value=${mode} onChange=${setMode} options=${[{ v: 'add', l: 'Agregar a los ' + existing.length + ' actuales' }, { v: 'replace', l: 'Reemplazar catálogo' }]} />` : null}</div>
          <div className="tw"><table className="tbl"><thead><tr><th>Producto</th><th>Etiqueta</th><th className="num">Precio lista</th><th className="num">Promoción</th></tr></thead><tbody>${res.items.slice(0, 6).map((p) => html`<tr key=${p.id}><td>${p.name}</td><td>${p.label}</td><td className="num">${p.price.toLocaleString('es-CO')}</td><td className="num">${p.promo ? p.promo.toLocaleString('es-CO') : '—'}</td></tr>`)}</tbody></table></div>
          ${res.items.length > 6 ? html`<p className="muted sm">… y ${res.items.length - 6} más.</p>` : null}
          <div className="mapact"><button type="button" className="btn primary sm" disabled=${busy === 'save' || ro} onClick=${save}>${busy === 'save' ? 'Guardando…' : 'Guardar ' + res.items.length + ' productos'}</button><button type="button" className="btn sm ghost" onClick=${() => setRes(null)}>Descartar</button></div></div>` : null}
      </div></div>`;
  };

  /* ---------- tiendas ---------- */
  A.StoresPanel = function ({ ws, ro, only }) {
    const cfg = { ...A.defaultConfig(), ...(ws.ws.config || {}) };
    const [open, setOpen] = useState(null);
    const [nm, setNm] = useState(''); const [url, setUrl] = useState(''); const [err, setErr] = useState('');
    const [del, setDel] = useState(null);
    const ids = Object.keys(ws.stores).filter((id) => (only === 'own' ? id === 'own' : only === 'comp' ? id !== 'own' : true)).sort((a, b) => (a === 'own' ? -1 : b === 'own' ? 1 : (ws.stores[a].name || '').localeCompare(ws.stores[b].name || '')));
    const add = async (e) => {
      e.preventDefault();
      const o = I.origin(url);
      if (!nm.trim() || !o) { setErr('Escribe el nombre y una dirección válida (por ejemplo competidor.com).'); return; }
      let id = I.slug(nm); if (id === 'own' || ws.stores[id]) id += '-' + (Object.keys(ws.stores).length + 1);
      setErr('');
      await L.set('stores/' + id, { name: nm.trim(), url: o, role: 'comp', n: 0, chunks: 0, createdAt: nowIso() });
      await A.saveConfig(ws, { comps: [...new Set([...(cfg.comps || []), id])] });
      setNm(''); setUrl(''); setOpen(id);
    };
    const remove = async (id) => {
      const s = ws.stores[id];
      for (let k = 0; k < (s.chunks || 0); k++) await L.del('catalog/' + id + '-' + k);
      await L.del('stores/' + id);
      await A.saveConfig(ws, { comps: (cfg.comps || []).filter((x) => x !== id) });
      setDel(null);
    };
    return html`<div className="stores">
      ${ids.map((id) => { const s = ws.stores[id]; return html`<section key=${id} className="panel store">
        <div className="row-between"><div><span className="eyebrow">${id === 'own' ? 'Tu tienda' : 'Competidor'}</span><h3>${s.name}</h3><span className="muted sm">${s.url ? I.hostOf(s.url) : 'sin URL'} · ${s.n || 0} productos${s.importedAt ? ' · actualizado ' + new Date(s.importedAt).toLocaleDateString('es-CO') : ''}</span></div>
          <div className="mapact"><button type="button" className=${'btn sm ' + (open === id ? 'primary' : '')} onClick=${() => setOpen(open === id ? null : id)} aria-expanded=${open === id}><${Icon} n="upload" />${s.n ? 'Actualizar catálogo' : 'Importar catálogo'}</button>${id !== 'own' && !ro ? (del === id ? html`<button type="button" className="btn sm danger" onClick=${() => remove(id)}>Confirmar: eliminar tienda y su catálogo</button><button type="button" className="btn sm ghost" onClick=${() => setDel(null)}>Cancelar</button>` : html`<button type="button" className="btn sm ghost" onClick=${() => setDel(id)}>Eliminar</button>`) : null}</div></div>
        ${open === id ? html`<${A.ImportPanel} ws=${ws} sid=${id} ro=${ro} onSaved=${() => setOpen(null)} />` : null}
      </section>`; })}
      ${only !== 'own' ? html`<form className="panel addstore" onSubmit=${add}><h3>Agregar competidor</h3><div className="two"><label className="fld" htmlFor="as-n"><span>Nombre de la marca</span><input id="as-n" type="text" value=${nm} onInput=${(e) => setNm(e.target.value)} disabled=${ro} /></label><label className="fld" htmlFor="as-u"><span>URL de su tienda online</span><input id="as-u" type="text" inputMode="url" value=${url} onInput=${(e) => setUrl(e.target.value)} placeholder="competidor.com" disabled=${ro} /></label></div>${err ? html`<div className="err">${err}</div>` : null}<div><button type="submit" className="btn sm primary" disabled=${ro}>Agregar</button></div></form>` : null}
    </div>`;
  };

  /* ---------- categorías y rúbricas ---------- */
  const listTxt = (a) => (a || []).join(', ');
  const txtList = (t) => String(t || '').split(',').map((x) => x.trim()).filter(Boolean);
  function CatEditor({ c, onChange, onRemove, ro }) {
    const up = (patch) => onChange({ ...c, ...patch });
    const upA = (j, patch) => up({ attrs: c.attrs.map((a, k) => (k === j ? { ...a, ...patch } : a)) });
    return html`<details className="catedit" open=${c._open}><summary><b>${c.name || 'Nueva categoría'}</b><span className="muted sm">${c.typologies.length} tipos · ${c.attrs.length} atributos</span></summary>
      <div className="two"><label className="fld" htmlFor=${'ce-n-' + c.id}><span>Nombre</span><input id=${'ce-n-' + c.id} value=${c.name} disabled=${ro} onInput=${(e) => up({ name: e.target.value })} /></label><label className="fld" htmlFor=${'ce-s-' + c.id}><span>Nombre corto</span><input id=${'ce-s-' + c.id} value=${c.short} disabled=${ro} onInput=${(e) => up({ short: e.target.value })} /></label>
        <label className="fld wide" htmlFor=${'ce-t-' + c.id}><span>Tipos (separados por coma)</span><input id=${'ce-t-' + c.id} value=${listTxt(c.typologies)} disabled=${ro} onChange=${(e) => up({ typologies: txtList(e.target.value) })} /></label>
        <label className="fld" htmlFor=${'ce-m-' + c.id}><span>Materiales</span><input id=${'ce-m-' + c.id} value=${listTxt(c.materials)} disabled=${ro} onChange=${(e) => up({ materials: txtList(e.target.value) })} /></label><label className="fld" htmlFor=${'ce-c-' + c.id}><span>Colores estándar</span><input id=${'ce-c-' + c.id} value=${listTxt(c.colors)} disabled=${ro} onChange=${(e) => up({ colors: txtList(e.target.value) })} /></label>
        <label className="fld wide" htmlFor=${'ce-y-' + c.id}><span>Sinónimos que usa la competencia</span><input id=${'ce-y-' + c.id} value=${listTxt(c.syn)} disabled=${ro} onChange=${(e) => up({ syn: txtList(e.target.value).map(TP.strip) })} /></label></div>
      <div className="tw"><table className="tbl rub"><thead><tr><th>Atributo</th>${[1, 2, 3, 4, 5].map((l) => html`<th key=${l}>Nivel ${l}</th>`)}<th>Peso</th></tr></thead><tbody>${c.attrs.map((a, j) => html`<tr key=${a.id}><td><input aria-label="Nombre del atributo" value=${a.name} disabled=${ro} onInput=${(e) => upA(j, { name: e.target.value })} /></td>${a.levels.map((l, k) => html`<td key=${k}><input aria-label=${'Nivel ' + (k + 1)} value=${l} disabled=${ro} onInput=${(e) => upA(j, { levels: a.levels.map((x, i) => (i === k ? e.target.value : x)) })} /></td>`)}<td><input aria-label="Peso del atributo" type="number" min="0" max="10" step="0.5" value=${a.weight == null ? 1 : a.weight} disabled=${ro} onChange=${(e) => upA(j, { weight: Math.max(0, +e.target.value || 0) })} /></td></tr>`)}</tbody></table></div>
      <p className="muted sm">El peso solo afecta el «puntaje de atributos» (vista Precio vs. atributos). El precio estimado sale del mercado: el modelo calcula cuánto vale cada nivel.</p>
      ${onRemove && !ro ? html`<button type="button" className="btn sm ghost" onClick=${onRemove}>Quitar categoría</button>` : null}
    </details>`;
  }
  A.CategoryStudio = function ({ ws, ro, onSaved }) {
    const cfg = { ...A.defaultConfig(), ...(ws.ws.config || {}) };
    const saved = Object.entries(ws.cats).map(([id, c]) => ({ ...c, id })).sort((a, b) => (a.order || 0) - (b.order || 0));
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const ctl = useRef(null);
    const ownN = L.storeItems(ws, 'own').length;
    const propose = async () => {
      const sample = await I.sample();
      if (!sample) { setErr('Claude no está disponible en esta vista.'); return; }
      const own = L.storeItems(ws, 'own'); const comps = Object.keys(ws.stores).filter((s) => s !== 'own').flatMap((s) => L.storeItems(ws, s).slice(0, 400));
      ctl.current = new AbortController(); setBusy(true); setErr('');
      try { const cats = await I.proposeCategories(sample, own, comps, { storeName: cfg.storeName }, ctl.current.signal); setDraft(cats.map((c, i) => ({ ...c, _open: i === 0, _on: true }))); }
      catch (e) { if (e.code !== 'cancelled') setErr(I.errText(e)); }
      setBusy(false);
    };
    const saveDraft = async () => {
      const on = draft.filter((c) => c._on);
      for (const c of on) { const { _open, _on, ...rest } = c; await L.set('cats/' + c.id, { ...rest, createdAt: nowIso(), origin: 'ia' }); }
      await A.saveConfig(ws, { cats: [...new Set([...(cfg.cats || []), ...on.map((c) => c.id)])] });
      setDraft(null); onSaved && onSaved();
    };
    const [edit, setEdit] = useState({});
    const saveOne = async (c) => { const { _open, _on, ...rest } = c; await L.set('cats/' + c.id, rest); setEdit((e) => ({ ...e, [c.id]: undefined })); };
    return html`<div className="studio">
      ${draft ? html`<section className="panel"><div className="row-between"><h2>Propuesta de Claude: ${draft.length} categorías</h2><span className="muted sm">Revisa nombres, tipos y niveles. Desmarca las que no quieras analizar.</span></div>
          ${draft.map((c, i) => html`<div key=${c.id} className="drow"><label className="tgl" htmlFor=${'dr-' + c.id}><input id=${'dr-' + c.id} type="checkbox" checked=${c._on} onChange=${(e) => setDraft(draft.map((x, k) => (k === i ? { ...x, _on: e.target.checked } : x)))} />Analizar</label><${CatEditor} c=${c} ro=${ro} onChange=${(n) => setDraft(draft.map((x, k) => (k === i ? n : x)))} /></div>`)}
          <div className="mapact"><button type="button" className="btn primary" disabled=${ro || !draft.some((c) => c._on)} onClick=${saveDraft}>Guardar categorías seleccionadas</button><button type="button" className="btn ghost" onClick=${() => setDraft(null)}>Descartar propuesta</button></div></section>`
        : html`<section className="panel"><div className="row-between"><div><h2>${saved.length ? 'Categorías de análisis' : 'Crea tus categorías con IA'}</h2><p className="muted">${saved.length ? 'Puedes editar nombres, tipos, materiales, colores y niveles de cada rúbrica.' : 'Claude lee tu catálogo y el de la competencia y propone categorías comparables, cada una con su rúbrica de atributos de 5 niveles. Tú decides cuáles quedan.'}</p></div>
          ${busy ? html`<div className="mapact"><span className="spin"></span><span className="sm">Claude está leyendo ${ownN} productos (puede tardar hasta un minuto)…</span><button type="button" className="btn sm" onClick=${() => ctl.current && ctl.current.abort()}>Detener</button></div>` : html`<button type="button" className=${'btn ' + (saved.length ? 'sm' : 'primary')} disabled=${ro || !ownN} onClick=${propose}><${Icon} n="spark" />${saved.length ? 'Proponer de nuevo' : 'Proponer categorías y rúbricas'}</button>`}</div>
          ${!ownN ? html`<${Note} tone="warn">Primero importa el catálogo de tu tienda.<//>` : null}
          ${err ? html`<div className="err">${err}</div>` : null}
          ${saved.map((c) => { const cur = edit[c.id] || c; return html`<div key=${c.id} className="drow"><label className="tgl" htmlFor=${'ca-' + c.id}><input id=${'ca-' + c.id} type="checkbox" checked=${cfg.cats.includes(c.id)} disabled=${ro} onChange=${() => A.saveConfig(ws, { cats: cfg.cats.includes(c.id) ? cfg.cats.filter((x) => x !== c.id) : [...cfg.cats, c.id] })} />Analizar</label><${CatEditor} c=${cur} ro=${ro} onChange=${(n) => setEdit((e) => ({ ...e, [c.id]: n }))} />${edit[c.id] ? html`<div className="mapact"><button type="button" className="btn sm primary" onClick=${() => saveOne(edit[c.id])}>Guardar cambios</button><button type="button" className="btn sm ghost" onClick=${() => setEdit((e) => ({ ...e, [c.id]: undefined }))}>Descartar</button><span className="muted sm">Cambiar niveles no reclasifica productos ya calificados.</span></div>` : null}</div>`; })}
        </section>`}
    </div>`;
  };

  /* ---------- clasificación ---------- */
  A.ClassifyPanel = function ({ ws, ro }) {
    const cfg = { ...A.defaultConfig(), ...(ws.ws.config || {}) };
    const cats = Object.entries(ws.cats).map(([id, c]) => ({ ...c, id })).filter((c) => cfg.cats.includes(c.id)).sort((a, b) => (a.order || 0) - (b.order || 0));
    const active = ['own', ...cfg.comps.filter((s) => ws.stores[s])];
    const items = useMemo(() => I.allItems(ws), [ws.catalog]);
    const cm = useMemo(() => I.classMap(ws), [ws.cls, ws.fixes]);
    const lm = useMemo(() => I.labelMap(ws), [ws.labelmap]);
    const [size, setSize] = useState(40);
    const [busy, setBusy] = useState('');
    const [err, setErr] = useState('');
    const [last, setLast] = useState(null);
    const ctl = useRef(null);
    const groups = useMemo(() => {
      const g = {};
      Object.values(items).forEach((it) => { if (!active.includes(it.sid)) return; const k = it.sid + '|' + it.label; (g[k] = g[k] || { key: k, sid: it.sid, store: (ws.stores[it.sid] || {}).name, label: it.label, n: 0, examples: [] }); g[k].n++; if (g[k].examples.length < 4) g[k].examples.push(it.name); });
      return Object.values(g).sort((a, b) => (a.sid === 'own' ? -1 : 0) - (b.sid === 'own' ? -1 : 0) || b.n - a.n);
    }, [items, active.join(',')]);
    const unmapped = groups.filter((g) => !(g.key in lm));
    const queue = Object.values(items).filter((it) => active.includes(it.sid) && !cm[it.pid] && lm[it.sid + '|' + it.label] !== null && lm[it.sid + '|' + it.label] !== undefined);
    const ordered = [...queue.filter((it) => it.sid === 'own'), ...(() => { const by = {}; queue.filter((it) => it.sid !== 'own').forEach((it) => (by[it.sid] = by[it.sid] || []).push(it)); const out = []; const ls = Object.values(by); for (let i = 0; ls.some((l) => l[i]); i++) ls.forEach((l) => l[i] && out.push(l[i])); return out; })()];
    const done = Object.values(items).filter((it) => active.includes(it.sid) && cm[it.pid]).length;
    const relevant = Object.values(items).filter((it) => active.includes(it.sid) && lm[it.sid + '|' + it.label] !== null).length;
    const run = async (fn) => {
      const sample = await I.sample();
      if (!sample) { setErr('Claude no está disponible en esta vista.'); return; }
      ctl.current = new AbortController(); setErr('');
      try { await fn(sample, ctl.current.signal); } catch (e) { if (e.code !== 'cancelled') setErr(e.code ? I.errText(e) : L.errText(e)); }
      setBusy('');
    };
    const mapLabels = () => { setBusy('map'); run(async (sample, signal) => {
      for (let i = 0; i < unmapped.length; i += 120) {
        const part = unmapped.slice(i, i + 120);
        const m = await I.mapLabels(sample, part, cats, signal);
        part.forEach((g) => { if (!(g.key in m)) m[g.key] = 'mixed'; });
        await L.set('labelmap/ia-' + Date.now(), { at: nowIso(), by: L.uid, items: m });
      }
    }); };
    const classify = () => { setBusy('cls'); run(async (sample, signal) => {
      const batch = ordered.slice(0, size);
      const t0 = Date.now();
      const res = await I.classifyBatch(sample, cats, batch, signal);
      const items2 = {}; batch.forEach((p) => { if (res[p.id]) items2[p.pid] = res[p.id]; });
      await L.set('cls/b-' + Date.now(), { at: nowIso(), by: L.uid, items: items2 });
      setLast({ n: Object.keys(items2).length, sent: batch.length, secs: Math.round((Date.now() - t0) / 1000), low: Object.values(items2).filter((x) => x.conf === 'baja').length, none: Object.values(items2).filter((x) => !x.cat).length });
    }); };
    const setMap = (key, v) => L.set('labelmap/manual', { at: nowIso(), items: { ...((ws.labelmap.manual || {}).items || {}), [key]: v === '_none' ? null : v } });
    if (!cats.length) return html`<${Empty} title="Primero define las categorías">La clasificación usa las rúbricas de tus categorías.<//>`;
    return html`<div className="clsp">
      <section className="panel"><div className="row-between"><div><span className="eyebrow">Paso 1</span><h2>Mapear etiquetas de cada tienda</h2><p className="muted">Claude decide qué etiquetas del catálogo de cada tienda corresponden a tus categorías (por uso, no por nombre). Así solo se clasifican productos relevantes.</p></div>
        ${busy === 'map' ? html`<div className="mapact"><span className="spin"></span><span className="sm">Mapeando ${unmapped.length} etiquetas…</span></div>` : html`<button type="button" className=${'btn ' + (unmapped.length ? 'primary' : 'sm')} disabled=${ro || !unmapped.length || !!busy} onClick=${mapLabels}><${Icon} n="spark" />${unmapped.length ? 'Mapear ' + unmapped.length + ' etiquetas' : 'Todo mapeado'}</button>`}</div>
        <details><summary className="sm">Ver y corregir el mapeo (${groups.length} etiquetas)</summary><div className="tw"><table className="tbl"><thead><tr><th>Tienda</th><th>Etiqueta</th><th className="num">Productos</th><th>Categoría</th></tr></thead><tbody>${groups.map((g) => html`<tr key=${g.key}><td>${g.store}</td><td>${g.label}<small>${g.examples.slice(0, 2).join(' · ')}</small></td><td className="num">${g.n}</td><td><select aria-label=${'Categoría de ' + g.label} value=${g.key in lm ? (lm[g.key] === null ? '_none' : lm[g.key]) : ''} disabled=${ro} onChange=${(e) => setMap(g.key, e.target.value)}><option value="" disabled>Sin mapear</option><option value="mixed">Mixta: decidir por producto</option>${cats.map((c) => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}<option value="_none">No aplica</option></select></td></tr>`)}</tbody></table></div></details>
      </section>
      <section className="panel"><div className="row-between"><div><span className="eyebrow">Paso 2</span><h2>Clasificar atributos con Claude</h2><p className="muted">Cada producto recibe categoría, tipo, material, color y nivel 1–5 por atributo, con una cita de evidencia. Lo que no se puede inferir queda vacío y va a revisión.</p></div></div>
        <div className="progress"><div className="pbar"><i style=${{ width: (relevant ? Math.min(100, (done / relevant) * 100) : 0) + '%' }}></i></div><span><b>${done}</b> de ${relevant} productos relevantes clasificados · ${queue.length} en cola</span></div>
        ${unmapped.length ? html`<${Note} tone="warn">Hay ${unmapped.length} etiquetas sin mapear: sus productos no entran a la cola hasta mapearlas.<//>` : null}
        <div className="mapact"><span className="sm muted">Productos por lote</span><${Seg} size="sm" label="Tamaño del lote" value=${size} onChange=${setSize} options=${[20, 40, 60].map((v) => ({ v, l: String(v) }))} />
          ${busy === 'cls' ? html`<span className="spin"></span><span className="sm">Clasificando ${Math.min(size, queue.length)} productos (30 a 90 segundos)…</span><button type="button" className="btn sm" onClick=${() => ctl.current && ctl.current.abort()}>Detener</button>` : html`<button type="button" className="btn primary" disabled=${ro || !queue.length || !!busy} onClick=${classify}><${Icon} n="spark" />Clasificar siguiente lote</button>`}
          ${queue.length ? html`<span className="muted sm">≈ ${Math.ceil(queue.length / size)} lotes restantes. Cada lote usa tu cuota de Claude y se lanza con un clic.</span>` : null}</div>
        ${last ? html`<p className="sm">Último lote: ${last.n} de ${last.sent} clasificados en ${last.secs} s · ${last.low} con confianza baja · ${last.none} fuera de tus categorías.</p>` : null}
        ${err ? html`<div className="err" role="alert">${err}</div>` : null}
      </section></div>`;
  };

  /* ---------- revisión humana ---------- */
  A.ReviewQueue = function ({ ws, ro }) {
    const cfg = { ...A.defaultConfig(), ...(ws.ws.config || {}) };
    const cats = Object.entries(ws.cats).map(([id, c]) => ({ ...c, id }));
    const items = useMemo(() => I.allItems(ws), [ws.catalog]);
    const cm = useMemo(() => I.classMap(ws), [ws.cls, ws.fixes]);
    const [filter, setFilter] = useState('pend');
    const [edits, setEdits] = useState({});
    const rows = Object.entries(cm).filter(([pid, c]) => items[pid] && c.cat && cats.some((x) => x.id === c.cat)).map(([pid, c]) => ({ pid, c, it: items[pid], nulls: (c.lv || []).filter((v) => !(v >= 1)).length }))
      .filter((r) => (filter === 'pend' ? !r.c.fixed && (r.c.conf === 'baja' || r.nulls >= 2) : filter === 'own' ? r.it.sid === 'own' && !r.c.fixed : r.c.fixed))
      .sort((a, b) => (a.it.sid === 'own' ? -1 : 0) - (b.it.sid === 'own' ? -1 : 0) || b.nulls - a.nulls).slice(0, 40);
    const cur = (r) => edits[r.pid] || { cat: r.c.cat, typ: r.c.typ, mat: r.c.mat, color: r.c.color, lv: [...(r.c.lv || [])] };
    const upd = (r, patch) => setEdits((e) => ({ ...e, [r.pid]: { ...cur(r), ...patch } }));
    const confirm = async (r) => {
      const v = cur(r); const sid = r.it.sid;
      const prev = (ws.fixes[sid] || {}).items || {};
      await L.set('fixes/' + sid, { items: { ...prev, [r.pid]: { ...v, conf: 'alta', by: L.uid, at: nowIso() } } });
      setEdits((e) => ({ ...e, [r.pid]: undefined }));
    };
    const pendN = Object.entries(cm).filter(([pid, c]) => items[pid] && c.cat && !c.fixed && (c.conf === 'baja' || (c.lv || []).filter((v) => !(v >= 1)).length >= 2)).length;
    return html`<div><div className="row-between"><${Seg} label="Filtro" value=${filter} onChange=${setFilter} options=${[{ v: 'pend', l: 'Por confirmar (' + pendN + ')' }, { v: 'own', l: 'Tus productos sin confirmar' }, { v: 'fixed', l: 'Confirmados por el equipo' }]} /><span className="muted sm">Mostrando hasta 40. Confirmar o corregir guarda la calificación con tu usuario.</span></div>
      <div className="revs">${rows.map((r) => { const v = cur(r); const c = cats.find((x) => x.id === v.cat) || cats[0]; return html`<article key=${r.pid} className="panel rev">
        <div className="row-between"><div><span className="muted sm">${(ws.stores[r.it.sid] || {}).name} · ${r.it.label}</span><h3>${r.it.name}</h3><span className="sm">${TP.fmt(r.it.price, TP.MARKETS[cfg.market])}${r.it.url ? html` · <a href=${r.it.url} target="_blank" rel="noopener noreferrer">ver en la tienda</a>` : null}</span></div><div className="cbadges"><${Badge} tone=${r.c.conf === 'alta' ? 'ok' : r.c.conf === 'baja' ? 'down' : 'warn'}>Confianza ${r.c.conf}<//>${r.nulls ? html`<${Badge} tone="warn">${r.nulls} sin evidencia<//>` : null}</div></div>
        ${r.it.desc ? html`<p className="sm muted clamp">${r.it.desc}</p>` : null}${r.c.ev ? html`<p className="sm"><b>Evidencia:</b> «${r.c.ev}»</p>` : null}
        <div className="revf"><${Select} id=${'rv-c-' + r.pid} label="Categoría" value=${v.cat} onChange=${(x) => upd(r, { cat: x, lv: (cats.find((k) => k.id === x) || c).attrs.map(() => null) })} options=${cats.map((k) => ({ v: k.id, l: k.name }))} compact />
          <${Select} id=${'rv-t-' + r.pid} label="Tipo" value=${v.typ || ''} onChange=${(x) => upd(r, { typ: x })} options=${[{ v: '', l: '—' }, ...c.typologies.map((t) => ({ v: t, l: t }))]} compact />
          <${Select} id=${'rv-m-' + r.pid} label="Material" value=${v.mat || ''} onChange=${(x) => upd(r, { mat: x })} options=${[{ v: '', l: '—' }, ...c.materials.map((t) => ({ v: t, l: t }))]} compact />
          <${Select} id=${'rv-k-' + r.pid} label="Color" value=${v.color || ''} onChange=${(x) => upd(r, { color: x })} options=${[{ v: '', l: '—' }, ...c.colors.map((t) => ({ v: t, l: t }))]} compact /></div>
        <div className="revl">${c.attrs.map((a, j) => html`<${Select} key=${a.id} id=${'rv-a-' + r.pid + j} label=${a.name} value=${String(v.lv[j] || '')} onChange=${(x) => { const lv = [...v.lv]; lv[j] = x ? +x : null; upd(r, { lv }); }} options=${[{ v: '', l: 'Sin dato' }, ...a.levels.map((l, k) => ({ v: String(k + 1), l: k + 1 + ' · ' + l }))]} compact />`)}</div>
        <div className="mapact"><button type="button" className="btn sm primary" disabled=${ro} onClick=${() => confirm(r)}><${Icon} n="check" />${edits[r.pid] ? 'Guardar corrección' : 'Confirmar'}</button></div>
      </article>`; })}${rows.length ? null : html`<${Empty} icon="check" title="Nada pendiente en este filtro" />`}</div></div>`;
  };

  /* ---------- costos, ventas e inventario (datos privados) ---------- */
  A.PrivateImport = function ({ ws, ro }) {
    const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
    const own = L.storeItems(ws, 'own');
    const keys = new Set(own.flatMap((p) => [p.sku && TP.strip(p.sku), TP.strip(p.name)].filter(Boolean)));
    const pm = I.privMap(ws);
    const salesN = Object.values(ws.sales).reduce((s, d) => s + Object.keys(d.rows || {}).length, 0);
    const col = (r, ks) => { const k = Object.keys(r).find((x) => ks.some((w) => TP.strip(x).includes(w))); return k ? r[k] : null; };
    const load = async (e, kind) => {
      const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
      setErr(''); setMsg('');
      try {
        const r = await I.readFile(f);
        const rows = r.rows || I.csvRows(r.text);
        if (kind === 'costs') {
          const items = {};
          rows.forEach((x) => { const id = col(x, ['sku', 'referencia', 'codigo']) || col(x, ['nombre', 'producto', 'name']); if (!id) return; items[TP.strip(String(id))] = { cost: I.parseMoney(col(x, ['costo', 'cost'])) || 0, sold: Number(col(x, ['vendid', 'sold', 'ventas'])) || null, planned: Number(col(x, ['planead', 'planned', 'compradas', 'inventario inicial'])) || null, weekly: Number(col(x, ['semanal', 'weekly', 'promedio'])) || null }; });
          const ent = Object.entries(items);
          if (!ent.length) throw new Error('No encontramos columnas de SKU o nombre y costo.');
          for (let k = 0; k * 1500 < ent.length; k++) await L.set('priv/costs-' + k, { at: nowIso(), items: Object.fromEntries(ent.slice(k * 1500, (k + 1) * 1500)) });
          setMsg(`${ent.length} filas guardadas; ${ent.filter(([k]) => keys.has(k)).length} coinciden con productos de tu catálogo por SKU o nombre.`);
        } else {
          const by = {};
          rows.forEach((x) => { const id = col(x, ['sku', 'referencia', 'codigo']) || col(x, ['nombre', 'producto', 'name']); const d = col(x, ['fecha', 'semana', 'date', 'week']); const u = Number(col(x, ['unidades', 'units', 'cantidad'])); if (!id || !d || !isFinite(u)) return; const dt = new Date(d); if (isNaN(dt)) return; const wk = new Date(dt.getTime() - ((dt.getDay() + 6) % 7) * 864e5).toISOString().slice(0, 10); const k = TP.strip(String(id)); by[k] = by[k] || {}; by[k][wk] = (by[k][wk] || 0) + u; });
          const ent = Object.entries(by);
          if (!ent.length) throw new Error('No encontramos columnas de SKU o nombre, fecha y unidades.');
          for (let k = 0; k * 400 < ent.length; k++) await L.set('sales/s-' + k, { at: nowIso(), rows: Object.fromEntries(ent.slice(k * 400, (k + 1) * 400)) });
          setMsg(`Ventas semanales de ${ent.length} productos guardadas; ${ent.filter(([k]) => keys.has(k)).length} coinciden con tu catálogo.`);
        }
      } catch (x) { setErr(x.message || L.errText(x)); }
    };
    const tpl = (kind) => L.download(kind === 'costs' ? 'plantilla_costos.csv' : 'plantilla_ventas.csv', kind === 'costs' ? L.csv([['sku', 'nombre', 'costo', 'unidades_vendidas', 'unidades_planeadas', 'unidades_semanales'], ...own.slice(0, 3).map((p) => [p.sku || '', p.name, '', '', '', ''])]) : L.csv([['sku', 'nombre', 'fecha', 'unidades'], ...own.slice(0, 2).map((p) => [p.sku || '', p.name, '2026-10-05', ''])]));
    return html`<div className="grid-2">
      <section className="panel"><h2>Costos y rotación</h2><p className="muted">Para precio mínimo rentable, margen, diagnóstico precio vs. diseño y promociones. Columnas: SKU o nombre, costo, unidades vendidas, unidades planeadas y (opcional) unidades semanales.</p>
        <div className="mapact"><label className=${'btn sm primary ' + (ro ? 'disabled' : '')} htmlFor="pv-c"><${Icon} n="upload" />Subir costos (CSV o Excel)</label><input id="pv-c" type="file" accept=".csv,.txt,.xlsx,.xls" className="sr" disabled=${ro} onChange=${(e) => load(e, 'costs')} /><button type="button" className="btn sm" onClick=${() => tpl('costs')}>Descargar plantilla</button></div>
        <p className="sm">${Object.keys(pm).length} productos con costo cargado.</p></section>
      <section className="panel"><h2>Ventas semanales</h2><p className="muted">Para medir el efecto real de los cambios de precio (Revenue Learning). Columnas: SKU o nombre, fecha y unidades; se agrupan por semana.</p>
        <div className="mapact"><label className=${'btn sm primary ' + (ro ? 'disabled' : '')} htmlFor="pv-s"><${Icon} n="upload" />Subir ventas</label><input id="pv-s" type="file" accept=".csv,.txt,.xlsx,.xls" className="sr" disabled=${ro} onChange=${(e) => load(e, 'sales')} /><button type="button" className="btn sm" onClick=${() => tpl('sales')}>Descargar plantilla</button></div>
        <p className="sm">${salesN} productos con ventas semanales.</p></section>
      ${msg ? html`<div className="span2"><${Note}>${msg}<//></div>` : null}${err ? html`<div className="err span2">${err}</div>` : null}
      <div className="span2"><${Note} tone="warn">Costos y ventas solo los ven quienes pueden editar o contribuir en este espacio de trabajo; quienes tienen acceso de solo lectura no los ven.<//></div>
    </div>`;
  };

  /* ---------- módulo Catálogo y clasificación ---------- */
  A.DataModule = function ({ ws, ro, sub, setSub, D }) {
    const SUB = [['tiendas', 'Tiendas y catálogos'], ['categorias', 'Categorías y rúbricas'], ['clasificacion', 'Clasificación con IA'], ['revision', 'Revisión'], ['privados', 'Costos y ventas']];
    const V = { tiendas: html`<${A.StoresPanel} ws=${ws} ro=${ro} />`, categorias: html`<${A.CategoryStudio} ws=${ws} ro=${ro} />`, clasificacion: html`<${A.ClassifyPanel} ws=${ws} ro=${ro} />`, revision: html`<${A.ReviewQueue} ws=${ws} ro=${ro} />`, privados: html`<${A.PrivateImport} ws=${ws} ro=${ro} />` };
    const nStores = Object.keys(ws.stores).length;
    return html`<div className="page"><header className="ph"><div><div className="eyebrow">Catálogo y clasificación</div><h1>¿Qué datos alimentan el análisis?</h1><p>${nStores} tiendas · ${D ? D.totalItems : 0} productos importados · ${D ? D.products.filter((p) => p.cat).length : 0} clasificados en tus categorías${D && D.pending ? ' · ' + D.pending + ' sin clasificar' : ''}.</p></div></header>
      <nav className="tabs">${SUB.map(([k, l]) => html`<button key=${k} type="button" className=${sub === k ? 'on' : ''} onClick=${() => setSub(k)}>${l}</button>`)}</nav>
      ${V[sub] || V.tiendas}</div>`;
  };

  /* ---------- asistente inicial ---------- */
  A.Setup = function ({ ws, ro }) {
    const cfg = { ...A.defaultConfig(), ...(ws.ws.config || {}) };
    const step = cfg.step || 0;
    const go = (n, patch) => A.saveConfig(ws, { ...patch, step: n });
    const [nm, setNm] = useState(cfg.storeName || ''); const [url, setUrl] = useState((ws.stores.own || {}).url || ''); const [mkt, setMkt] = useState(cfg.market); const [obj, setObj] = useState(cfg.objective); const [err, setErr] = useState('');
    const steps = ['Tu tienda', 'Tu catálogo', 'Competidores', 'Categorías', 'Clasificación'];
    const compsWith = Object.keys(ws.stores).filter((s) => s !== 'own' && (ws.stores[s].n || 0) > 0);
    const saveStore = async (e) => {
      e.preventDefault();
      const o = I.origin(url);
      if (!nm.trim() || !o) { setErr('Escribe el nombre de tu marca y la dirección de tu tienda.'); return; }
      await L.set('stores/own', { ...(ws.stores.own || {}), name: nm.trim(), url: o, role: 'own', n: (ws.stores.own || {}).n || 0, chunks: (ws.stores.own || {}).chunks || 0 });
      await go(1, { storeName: nm.trim(), market: mkt, objective: obj });
    };
    const stepper = html`<ol className="ob-steps" aria-label="Progreso">${steps.map((s, i) => html`<li key=${i} className=${i === step ? 'cur' : i < step ? 'done' : ''}><button type="button" disabled=${i > step || ro} onClick=${() => go(i)}><span>${i < step ? html`<${Icon} n="check" s=${12} />` : i + 1}</span>${s}</button></li>`)}</ol>`;
    let body;
    if (step === 0) body = html`<form className="urlform" onSubmit=${saveStore}>
        <div className="two"><label className="fld" htmlFor="su-n"><span>Nombre de tu marca</span><input id="su-n" type="text" value=${nm} onInput=${(e) => setNm(e.target.value)} disabled=${ro} /></label><label className="fld" htmlFor="su-u"><span>Dirección de tu tienda online</span><input id="su-u" type="text" inputMode="url" placeholder="https://mitienda.com" value=${url} onInput=${(e) => setUrl(e.target.value)} disabled=${ro} /></label></div>
        <div className="fld"><span>Mercado principal y moneda</span><${Seg} label="Mercado" value=${mkt} onChange=${setMkt} options=${Object.values(TP.MARKETS).map((m) => ({ v: m.id, l: m.name + ' · ' + m.currency }))} /></div>
        <div className="fld"><span>¿Qué quieres optimizar primero?</span><div className="opts">${A.OBJECTIVES.map((o) => html`<button key=${o.v} type="button" className=${'optc ' + (obj === o.v ? 'on' : '')} aria-pressed=${obj === o.v} onClick=${() => setObj(o.v)}><b>${o.l}</b><span>${o.d}</span></button>`)}</div></div>
        ${err ? html`<div className="err">${err}</div>` : null}
        <div className="ob-actions"><button className="btn primary" type="submit" disabled=${ro}>Continuar<${Icon} n="arrow" /></button></div></form>`;
    else if (step === 1) body = html`<div><${A.StoresPanel} ws=${ws} ro=${ro} only="own" /><div className="ob-actions"><button className="btn primary" type="button" disabled=${ro || !(ws.stores.own && ws.stores.own.n)} onClick=${() => go(2)}>Continuar<${Icon} n="arrow" /></button></div></div>`;
    else if (step === 2) body = html`<div><p className="muted">Agrega las marcas con las que te comparas (recomendado: 4 a 10) e importa su catálogo. ${compsWith.length} con productos.</p><${A.StoresPanel} ws=${ws} ro=${ro} only="comp" /><div className="ob-actions"><button className="btn primary" type="button" disabled=${ro || compsWith.length < 1} onClick=${() => go(3, { comps: [...new Set([...(cfg.comps || []), ...compsWith])] })}>Continuar<${Icon} n="arrow" /></button></div></div>`;
    else if (step === 3) body = html`<div><${A.CategoryStudio} ws=${ws} ro=${ro} /><div className="ob-actions"><button className="btn primary" type="button" disabled=${ro || !cfg.cats.length} onClick=${() => go(4)}>Continuar<${Icon} n="arrow" /></button></div></div>`;
    else body = html`<div><${A.ClassifyPanel} ws=${ws} ro=${ro} /><${Note}>Puedes entrar al panel en cualquier momento: el análisis usa lo que ya esté clasificado y la clasificación sigue en «Catálogo y clasificación».<//><div className="ob-actions"><button className="btn primary" type="button" disabled=${ro} onClick=${() => A.saveConfig(ws, { setupDone: true, step: 5 })}>Ir al panel<${Icon} n="arrow" /></button></div></div>`;
    return html`<div className="ob"><div className="ob-in wide">
      <div className="brandmark"><span className="logo">T</span>TITA Pricing Intelligence <b>360°</b></div>
      ${step === 0 ? html`<h1>Descubre oportunidades de rentabilidad en tu catálogo.</h1><p className="lead">Conecta tu tienda y la de tus competidores. Claude entiende los catálogos, propone las categorías y califica los atributos; el sistema compara, estima precios y te muestra qué revisar.</p>` : html`<h2>${steps[step]}</h2>`}
      ${ro ? html`<${Note} tone="warn">Tienes acceso de solo lectura: quien administra este espacio de trabajo debe completar la configuración.<//>` : null}
      ${stepper}${body}</div></div>`;
  };
})();
