/* Tita Pricing Intelligence 360° — Price Advisor, Product Launch, Promotion Optimizer, Pulse WTP, Revenue Learning y Configuración. */
(function () {
  'use strict';
  const { useState, useMemo, useEffect } = React;
  const TP = window.TP, UI = TP.ui, html = UI.html, A = TP.app;
  const { Icon, Badge, Seg, Select, Empty, Note, SimTag, Thumb } = UI;

  A.ROLES = {
    pricing: { l: 'Dirección de precios', can: ['aprobar', 'configurar', 'simular', 'estudios'] },
    analista: { l: 'Analista de precios', can: ['configurar', 'simular', 'estudios'] },
    producto: { l: 'Producto y Diseño', can: ['simular', 'estudios'] },
    comercial: { l: 'Dirección comercial', can: ['aprobar', 'simular'] },
    lectura: { l: 'Solo lectura', can: [] },
  };
  const can = (cfg, a) => A.ROLES[cfg.role].can.includes(a);

  /* =========================================================
     PRICE ADVISOR
     ========================================================= */
  A.Advisor = function ({ E, f, setF, sub, setSub, focus, setFocus, approvals, setApprovals, studies, go }) {
    const cat = E.D.catById[f.cat], m = E.model[f.cat];
    const SUB = [['diagnostico', 'Diagnóstico'], ['modelo', 'Calidad del modelo'], ['aprobacion', 'Bandeja de aprobación']];
    const pend = approvals.filter((a) => a.status === 'pendiente').length;
    return html`<div className="page">
      <header className="ph"><div><div className="eyebrow">Price Advisor</div><h1>${sub === 'modelo' ? '¿Cuánto confiar en el precio estimado?' : sub === 'aprobacion' ? '¿Qué cambios esperan aprobación?' : '¿Qué precios conviene revisar y por qué?'}</h1><p>Valoración por atributos frente a comparables de ${f.brands.length === E.cfg.comps.length ? 'todos tus competidores' : 'los competidores configurados'}. Ninguna recomendación se aplica sin aprobación humana.</p></div></header>
      <nav className="tabs">${SUB.map(([k, l]) => html`<button key=${k} type="button" className=${sub === k ? 'on' : ''} onClick=${() => setSub(k)}>${l}${k === 'aprobacion' && pend ? html`<span className="cnt">${pend}</span>` : null}</button>`)}</nav>
      ${sub !== 'aprobacion' ? html`<${A.FilterBar} E=${E} f=${f} setF=${setF} showPrice=${false} />` : null}
      ${sub === 'modelo' ? html`<${ModelView} E=${E} cat=${cat} m=${m} go=${go} />` : sub === 'aprobacion' ? html`<${Approvals} E=${E} approvals=${approvals} setApprovals=${setApprovals} />` : html`<${Diagnosis} E=${E} f=${f} cat=${cat} m=${m} focus=${focus} setFocus=${setFocus} approvals=${approvals} setApprovals=${setApprovals} studies=${studies} go=${go} />`}
    </div>`;
  };

  function Diagnosis({ E, f, cat, m, focus, setFocus, approvals, setApprovals, studies, go }) {
    const [pos, setPos] = useState(f.pos || 'all');
    useEffect(() => { if (f.pos) setPos(f.pos); }, [f.pos]);
    const all = E.diag[f.cat].filter((d) => (f.mat === 'all' || d.p.mat === f.mat) && (f.typ === 'all' || d.p.typ === f.typ));
    const rows = all.filter((d) => pos === 'all' || d.pos === pos).sort((a, b) => b.priority - a.priority || (a.gap || 0) - (b.gap || 0));
    const sel = all.find((d) => d.p.id === focus) || rows[0];
    const cnt = (k) => all.filter((d) => d.pos === k).length;
    return html`<div>
      ${!m.ok ? html`<${Note} tone="warn"><b>Sin estimación del modelo en ${cat.name}.</b> ${m.reason === 'muestra' ? `Hay ${m.n} productos comparables y se necesitan ${m.need} para ${m.k} atributos.` : 'La validación cruzada no alcanza la calidad mínima.'} Las sugerencias usan solo comparables directos y se marcan con evidencia "solo comparables". <button className="linkbtn" type="button" onClick=${() => go('advisor', { sub: 'modelo' })}>Ver qué falta</button><//>` : null}
      <div className="sumrow">${[['all', 'Todos', all.length], ['below', 'Por debajo', cnt('below')], ['above', 'Por encima', cnt('above')], ['in', 'En banda', cnt('in')], ['na', 'Sin estimación', cnt('na')]].map(([k, l, n]) => html`<button key=${k} type="button" className=${'sumc ' + (pos === k ? 'on' : '')} onClick=${() => setPos(k)}><b>${n}</b><span>${l}</span></button>`)}</div>
      <div className="advgrid">
        <section className="panel"><div className="tw"><table className="tbl"><thead><tr><th>Producto</th><th className="num">Actual</th><th className="num">Estimado</th><th className="num">Brecha</th><th>Sugerencia</th>${E.cfg.privateData ? html`<th className="num">Rotación</th>` : null}</tr></thead><tbody>
          ${rows.map((d) => html`<tr key=${d.p.id} className=${'click ' + (sel && sel.p.id === d.p.id ? 'sel' : '')} tabIndex="0" onClick=${() => setFocus(d.p.id)} onKeyDown=${(e) => e.key === 'Enter' && setFocus(d.p.id)}>
            <td><div className="pcell"><${Thumb} p=${d.p} size=${32} /><div><b>${d.p.name}</b><small>${d.p.mat}</small></div></div></td>
            <td className="num">${TP.fmt(d.p.list, E.mk)}</td><td className="num">${d.est ? TP.fmt(d.est, E.mk) : '—'}</td>
            <td className=${'num ' + (d.gap < 0 ? 't-up' : d.gap > 0 ? 't-down' : '')}>${isFinite(d.gap) ? TP.pct(d.gap) : isFinite(d.gapComp) ? TP.pct(d.gapComp) + '*' : '—'}</td>
            <td><${Badge} tone=${d.action === 'up' ? 'up' : d.action === 'down' ? 'down' : 'neutral'}>${A.ACTION[d.action]}<//></td>
            ${E.cfg.privateData ? html`<td className="num">${Math.round(d.p.st * 100)} %</td>` : null}
          </tr>`)}
        </tbody></table></div>${rows.length ? null : html`<${Empty} title="Ningún producto en este grupo" />`}<p className="foot">* Brecha frente a la mediana de comparables cuando no hay modelo.</p></section>
        ${sel ? html`<${Detail} key=${sel.p.id} E=${E} cat=${cat} m=${m} d=${sel} approvals=${approvals} setApprovals=${setApprovals} studies=${studies} go=${go} />` : null}
      </div></div>`;
  }

  function Detail({ E, cat, m, d, approvals, setApprovals, studies, go }) {
    const mk = E.mk, pol = E.cfg.policy, p = d.p;
    const [price, setPrice] = useState(d.scenario);
    const [note, setNote] = useState('');
    const pending = approvals.find((a) => a.pid === p.id && a.status === 'pendiente');
    const lo = TP.roundPrice(p.list * 0.7, mk, 'none'), hi = TP.roundPrice(p.list * 1.4, mk, 'none');
    const rp = TP.roundPrice(price, mk, pol.rounding);
    const hasCost = E.cfg.privateData;
    const marg = (v) => (v - p.cost) / v;
    const study = studies.find((s) => s.cat === cat.id && s.result);
    const brandsC = [...new Set(d.comps.map((c) => A.brandName(E, c.q.brand)))];
    let text;
    if (d.action === 'up') text = `Este producto presenta materiales y características similares a ${d.comps.length} referencias comparables${brandsC.length ? ' de ' + brandsC.slice(0, 3).join(', ') : ''}. Su precio publicado está ${TP.pct(Math.abs(isFinite(d.gapComp) ? d.gapComp : d.gap), 0, false)} por debajo de ${isFinite(d.gapComp) ? 'la mediana de ese grupo' : 'su precio estimado'}${d.pos === 'below' ? ' y por debajo de la banda P10–P90 del modelo de atributos' : ''}. Recomendamos evaluar un escenario de incremento, sujeto a validación de demanda y rentabilidad.`;
    else if (d.action === 'down') text = `El precio publicado está ${TP.pct(isFinite(d.gap) ? d.gap : d.gapComp, 0, false)} por encima de lo que el mercado cobra por atributos similares${d.pos === 'above' ? ' y fuera de la banda P10–P90' : ''}. Antes de bajar el precio, revisa si hay atributos que el modelo no captura (marca, exclusividad, servicio) y si la rotación confirma una barrera de precio.`;
    else text = `El precio está dentro de la banda que el mercado cobra por productos con atributos similares${d.comps.length ? ' y cerca de la mediana de sus ' + d.comps.length + ' comparables' : ''}. No hay evidencia para moverlo.`;
    if (d.evidence === 'mixta') text += ' Atención: el modelo y los comparables directos no coinciden del todo; la evidencia es mixta.';
    let dx = null;
    if (hasCost) {
      const lowSt = p.st < 0.45, hiSt = p.st > 0.72;
      if (d.pos === 'above' && lowSt) dx = ['Posible barrera de precio', 'Precio por encima de su banda y rotación baja.'];
      else if (d.pos !== 'above' && lowSt) dx = ['Revisar diseño o surtido', 'El precio está en línea con el mercado pero rota poco: el problema probablemente no es el precio.'];
      else if (d.pos === 'below' && hiSt) dx = ['Oportunidad de precio', 'Rota bien y está por debajo de su banda.'];
      else dx = ['Sin señal de rotación', 'Rotación dentro del rango esperado.'];
    }
    const send = () => {
      if (!can(E.cfg, 'simular')) return;
      setApprovals([{ id: 'ap' + Date.now(), pid: p.id, cat: cat.id, name: p.name, from: p.list, to: rp, kind: 'Precio base', note, by: A.ROLES[E.cfg.role].l, status: 'pendiente', at: new Date().toLocaleString('es-CO') }, ...approvals]);
      setNote('');
    };
    const contrib = m.ok ? m.contributions(p.lv) : [];
    const cmx = Math.max(0.05, ...contrib.map((c) => Math.abs(c.eff)));
    return html`<aside className="panel detail" aria-label="Detalle del producto">
      <div className="dhead"><${Thumb} p=${p} size=${64} /><div><span className="eyebrow">${cat.name} · ${p.collection || ''}</span><h2>${p.name}</h2><div className="muted">${p.typ} · ${p.mat} · ${p.color}</div><div className="dbadges"><${Badge} tone=${A.POS[d.pos].tone}>${A.POS[d.pos].t}<//><${Badge} tone=${d.evidence === 'consistente' ? 'ok' : 'warn'}>Evidencia ${d.evidence}<//></div></div></div>
      <${UI.PriceStrip} mk=${mk} current=${p.list} est=${d.est} lo=${d.lo} hi=${d.hi} comps=${d.comps.map((c) => c.q.list)} floor=${d.floor} wtp=${study && study.result.range} extra=${rp !== p.list ? [{ v: rp, t: 'Escenario', cls: 'scn', y: 16 }] : []} />
      <div className="why"><h3><${Icon} n="spark" />Por qué</h3><p>${text}</p></div>
      ${dx ? html`<div className="dx"><b>${dx[0]}</b> · rotación ${Math.round(p.st * 100)} % (vendido sobre planeado) · ${dx[1]}</div>` : null}
      ${contrib.length ? html`<div><h3>Qué explica el estimado</h3><p className="muted sm">Efecto de cada atributo frente al producto promedio de la categoría.</p><div className="contrib">${contrib.map((c) => html`<div key=${c.attr.id} className="cbr"><span>${c.attr.name} <em>nivel ${c.level}</em></span><div className="ctrack"><div className="czero"></div><div className=${'cbar ' + (c.eff < 0 ? 'neg' : '')} style=${{ left: c.eff >= 0 ? '50%' : 50 + (c.eff / cmx) * 50 + '%', width: (Math.abs(c.eff) / cmx) * 50 + '%' }}></div></div><b>${TP.pct(c.eff)}</b></div>`)}</div></div>` : null}
      <div className="scen"><h3>Escenario</h3>
        <label className="fld" htmlFor="sc-price"><span>Precio a evaluar: <b>${TP.fmt(rp, mk)}</b> (${TP.pct(rp / p.list - 1, 1)} · redondeo: ${TP.ROUNDING[pol.rounding].toLowerCase()})</span><input id="sc-price" type="range" min=${lo} max=${hi} step=${(hi - lo) / 200} value=${price} onInput=${(e) => setPrice(+e.target.value)} /></label>
        <div className="kv sm">
          <div><span>Posición en banda</span><b>${d.est ? (rp < d.lo ? 'Debajo' : rp > d.hi ? 'Encima' : 'Dentro') : '—'}</b></div>
          <div><span>Franja resultante</span><b>${TP.BAND_NAMES[TP.bandOf(rp, E.band[cat.id])]}</b></div>
          <div><span>Cambio vs. tope por ciclo</span><b className=${Math.abs(rp / p.list - 1) > pol.maxChange + 0.005 ? 't-down' : ''}>${TP.pct(rp / p.list - 1, 1)} / ±${Math.round(pol.maxChange * 100)} %</b></div>
          ${hasCost ? html`<div><span>Margen bruto</span><b>${TP.pct(marg(p.list), 1, false)} → ${TP.pct(marg(rp), 1, false)}</b></div><div><span>Precio mínimo rentable</span><b className=${rp < d.floor ? 't-down' : ''}>${TP.fmt(d.floor, mk)}</b></div>` : html`<div className="wide"><span>Margen</span><b className="muted">Requiere costos · <button className="linkbtn" type="button" onClick=${() => go('config', { sub: 'integraciones' })}>conectar</button></b></div>`}
        </div>
        ${hasCost && rp < d.floor ? html`<${Note} tone="warn">El escenario queda por debajo del margen mínimo de ${Math.round(pol.minMargin * 100)} %.<//>` : null}
        ${Math.abs(rp / p.list - 1) > pol.maxChange + 0.005 ? html`<${Note} tone="warn">El cambio supera el tope por ciclo configurado; requerirá una justificación en la aprobación.<//>` : null}
        <label className="fld" htmlFor="sc-note"><span>Justificación para quien aprueba</span><textarea id="sc-note" rows="2" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="Opcional"></textarea></label>
        <div className="mapact">${pending ? html`<${Badge} tone="info">Pendiente de aprobación: ${TP.fmt(pending.to, mk)}<//>` : html`<button type="button" className="btn primary sm" disabled=${rp === p.list || !can(E.cfg, 'simular')} onClick=${send}>Enviar a aprobación</button>`}${!can(E.cfg, 'simular') ? html`<span className="muted sm">Tu rol no permite proponer cambios.</span>` : null}</div>
      </div>
      <details className="assum"><summary>Supuestos y limitaciones</summary><ul>
        <li>El estimado refleja lo que cobra el mercado por atributos similares (regresión hedónica log-lineal). No mide disposición a pagar ni es el precio que maximiza utilidad.</li>
        <li>Se usan precios de lista de la competencia; las promociones no entran al modelo.</li>
        <li>${d.comps.filter((c) => !c.q.hasDesc || !c.q.matPublic).length} de ${d.comps.length} comparables tienen atributos inferidos con evidencia parcial.</li>
        <li>${hasCost ? 'El efecto en volumen no se estima aquí: usa Promotion Optimizer o Revenue Learning.' : 'Sin costos ni ventas no se evalúa margen ni volumen.'}</li>
        ${study ? html`<li>Incluye el rango aceptable declarado del estudio Pulse «${study.name}» (respuestas de encuesta, no ventas).</li>` : null}
      </ul></details>
    </aside>`;
  }

  function ModelView({ E, cat, m, go }) {
    if (!m.ok) {
      const pool = E.pool[cat.id];
      return html`<section className="panel abst"><${Icon} n="alert" s=${22} /><div><h2>El modelo se abstiene en ${cat.name}</h2>
        <p>${m.reason === 'muestra' ? `Hay ${m.n} productos comparables y, con ${m.k} atributos, se necesitan al menos ${m.need} (8 por coeficiente, mínimo 30). Con menos datos el modelo memoriza en vez de aprender y sus precios no se pueden defender.` : m.reason === 'calidad' ? `La validación cruzada explica ${Math.round((m.r2cv || 0) * 100)} % de la variación del precio en productos que el modelo no vio; el mínimo es 50 %.` : 'No hay atributos activos.'}</p>
        <h3>Qué puedes hacer</h3><ul>
          <li><button className="linkbtn" type="button" onClick=${() => go('market', { sub: 'homolog', cat: cat.id })}>Revisar equivalencias</button>: aceptar categorías mixtas suma comparables.</li>
          <li><button className="linkbtn" type="button" onClick=${() => go('config', { sub: 'competidores' })}>Agregar competidores</button> con oferta en esta categoría.</li>
          <li><button className="linkbtn" type="button" onClick=${() => go('config', { sub: 'categorias' })}>Reducir atributos del modelo</button> (baja el mínimo requerido).</li>
          <li><button className="linkbtn" type="button" onClick=${() => go('pulse', {})}>Validar con consumidores</button> mientras se completa la muestra.</li></ul>
        <p className="muted sm">${pool.length} productos de competencia en la categoría con los competidores configurados.</p></div></section>`;
    }
    const top = [...m.coef].filter((c) => c.sig).sort((a, b) => b.pct - a.pct).slice(0, 3);
    return html`<div>
      <div className="kpis">
        <div className="kpi"><span>Confiabilidad</span><b>${m.reliability}</b><em>según validación cruzada y tamaño de muestra</em></div>
        <div className="kpi"><span>R² en validación cruzada</span><b>${m.r2cv.toFixed(2).replace('.', ',')}</b><em>ajuste en entrenamiento ${m.r2.toFixed(2).replace('.', ',')} · 5 particiones</em></div>
        <div className="kpi"><span>Error medio</span><b>${Math.round(m.mape * 100)} %</b><em>en productos que el modelo no vio</em></div>
        <div className="kpi"><span>Cobertura de la banda</span><b>${Math.round(m.coverage * 100)} %</b><em>P10–P90, meta 75–85 %</em></div>
        <div className="kpi"><span>Muestra</span><b>${m.n}</b><em>mínimo ${m.need} · ${m.excluded.length} atípicos excluidos</em></div>
      </div>
      <div className="grid-2">
        <section className="panel"><h2>¿Qué atributos explican las diferencias de precio?</h2><${UI.Coefs} coef=${m.coef} />
          ${top.length ? html`<p className="insight"><${Icon} n="spark" />En ${cat.name.toLowerCase()}, cada nivel adicional de <b>${top[0].attr.name.toLowerCase()}</b> se asocia con ${TP.pct(top[0].pct, 0)} en el precio de mercado${top[1] ? html`, seguido de ${top[1].attr.name.toLowerCase()} (${TP.pct(top[1].pct, 0)})` : ''}.</p>` : null}</section>
        <section className="panel"><h2>Cómo se calcula</h2><p className="formula">ln(Precio) = β₀ + Σ βᵢ × Nivelᵢ</p>
          <ul className="plain"><li>Entrenado con precios <b>de lista</b> de los ${E.cfg.comps.length} competidores configurados (los filtros de vista no cambian el modelo).</li><li>Atributos calificados de 1 a 5 con la rúbrica de la categoría; ${m.k} activos.</li><li>Atípicos de captura excluidos por residuo mayor a 3,5 desviaciones robustas${m.excluded.length ? ': ' + m.excluded.map((p) => A.brandName(E, p.brand) + ' ' + p.name).join(', ') : ''}.</li><li>Banda P10–P90 a partir de los errores de validación cruzada.</li><li>Abstención automática si la muestra es menor a ${m.need} o el R² de validación es menor a 0,50.</li></ul>
          <p className="muted sm">Se recalcula en el navegador cada vez que cambias equivalencias, competidores o atributos.</p></section>
      </div></div>`;
  }

  function Approvals({ E, approvals, setApprovals }) {
    const [exp, setExp] = useState(false);
    const ok = can(E.cfg, 'aprobar');
    const setSt = (id, status) => setApprovals(approvals.map((a) => (a.id === id ? { ...a, status, by2: A.ROLES[E.cfg.role].l } : a)));
    const approved = approvals.filter((a) => a.status === 'aprobado');
    const csv = ['sku_demo;producto;precio_actual;precio_nuevo;tipo;aprobado_por', ...approved.map((a) => [a.pid, a.name, a.from, a.to, a.kind, a.by2].join(';'))].join('\n');
    if (!approvals.length) return html`<${Empty} title="La bandeja está vacía">Envía un escenario desde el diagnóstico de un producto o desde Promotion Optimizer.<//>`;
    return html`<section className="panel">
      ${!ok ? html`<${Note} tone="warn">Tu rol (${A.ROLES[E.cfg.role].l}) no puede aprobar. Cámbialo en Configuración › Usuarios y roles para probar el flujo.<//>` : null}
      <div className="tw"><table className="tbl"><thead><tr><th>Cambio</th><th>Tipo</th><th className="num">Actual</th><th className="num">Propuesto</th><th>Propuesto por</th><th>Estado</th><th></th></tr></thead><tbody>
        ${approvals.map((a) => html`<tr key=${a.id}><td><b>${a.name}</b>${a.note ? html`<small>${a.note}</small>` : null}</td><td>${a.kind}</td><td className="num">${a.from != null ? TP.fmt(a.from, E.mk) : '—'}</td><td className="num">${a.to != null ? TP.fmt(a.to, E.mk) : a.detail}</td><td>${a.by}<small>${a.at}</small></td><td><${Badge} tone=${a.status === 'aprobado' ? 'ok' : a.status === 'rechazado' ? 'down' : 'info'}>${a.status}<//></td>
          <td>${a.status === 'pendiente' ? html`<div className="mapact"><button type="button" className="btn sm primary" disabled=${!ok} onClick=${() => setSt(a.id, 'aprobado')}>Aprobar</button><button type="button" className="btn sm" disabled=${!ok} onClick=${() => setSt(a.id, 'rechazado')}>Rechazar</button></div>` : null}</td></tr>`)}
      </tbody></table></div>
      <div className="mapact"><button type="button" className="btn sm" disabled=${!approved.length} onClick=${() => setExp(!exp)}>${exp ? 'Ocultar' : 'Generar'} archivo de carga (${approved.length})</button><span className="muted sm">En producción se escribe en el ERP o e-commerce mediante un conector autenticado.</span></div>
      ${exp ? html`<div><textarea className="mono csv" readOnly rows="5" value=${csv} aria-label="Archivo de carga"></textarea><button type="button" className="btn sm" onClick=${(e) => { const b = e.currentTarget; navigator.clipboard && navigator.clipboard.writeText(csv).then(() => (b.textContent = 'Copiado'), () => (b.textContent = 'Selecciona y copia el texto')); }}>Copiar</button></div>` : null}
    </section>`;
  }

  /* =========================================================
     PRODUCT LAUNCH
     ========================================================= */
  A.Launch = function ({ E, prefill, studies, approvals, setApprovals, go }) {
    const firstCat = (prefill && E.cats.find((c) => c.id === prefill.cat)) || E.cats[0];
    const [cid, setCid] = useState(firstCat.id);
    const cat = E.D.catById[cid];
    const init = (c) => ({ typ: (prefill && prefill.typ && c.id === (prefill && prefill.cat)) || c.typologies[0], mat: (prefill && prefill.mat && c.id === prefill.cat) || c.materials[0], lv: c.attrs.map(() => 3), cost: '', price: '', pos: prefill && prefill.band != null ? prefill.band : 1, img: null, sug: false, desc: '' });
    const [s, setS] = useState(() => init(firstCat));
    const [vars, setVars] = useState([]);
    const changeCat = (v) => { setCid(v); setS(init(E.D.catById[v])); };
    const set = (k, v) => setS((o) => ({ ...o, [k]: v }));
    const m = E.model[cid], b = E.band[cid], mk = E.mk, pol = E.cfg.policy;
    const probe = { id: 'nuevo', typ: s.typ, mat: s.mat, lv: s.lv, color: cat.colors[0], list: 1, hasDesc: true, matPublic: true };
    const comps = TP.comparablesFor(cat, probe, E.pool[cid], E.dec.comp, { limit: 8 });
    const pr = m.ok ? m.predict(s.lv) : null;
    const cost = parseFloat(String(s.cost).replace(/[^\d.]/g, '')) || 0;
    const floor = cost ? TP.roundPrice(cost / (1 - pol.minMargin), mk, pol.rounding) : null;
    const est = pr ? pr.est : comps.length ? TP.median(comps.map((c) => c.q.list)) : null;
    const sug = est ? TP.roundPrice(Math.max(est, floor || 0), mk, pol.rounding) : null;
    const price = parseFloat(String(s.price).replace(/[^\d.]/g, '')) || 0;
    const study = studies.find((x) => x.cat === cid && x.result && x.result.range);
    const posBand = price ? TP.bandOf(price, b) : null;
    const suggestFromImage = () => {
      const h = TP.hashStr((s.img ? s.img.name : 'sin-imagen') + s.typ + s.mat);
      const r = TP.rng(h);
      const mi = cat.materials.indexOf(s.mat);
      setS((o) => ({ ...o, sug: true, lv: cat.attrs.map((a) => (a.id === 'mat' ? cat.matLv[mi][1] : TP.clamp(Math.round(2.6 + r() * 2), 1, 5))) }));
    };
    const onImg = (e) => { const fl = e.target.files && e.target.files[0]; if (!fl) return; const fr = new FileReader(); fr.onload = () => set('img', { name: fl.name, url: fr.result }); fr.readAsDataURL(fl); };
    const saveVar = () => setVars((v) => [...v.slice(-2), { id: Date.now(), name: 'Variante ' + String.fromCharCode(65 + v.length % 26), typ: s.typ, mat: s.mat, lv: [...s.lv], est, lo: pr && pr.lo, hi: pr && pr.hi, price, floor, cost }]);
    return html`<div className="page">
      <header className="ph"><div><div className="eyebrow">Product Launch</div><h1>¿A qué precio debería salir este producto nuevo?</h1><p>Ingresa sus atributos y costo. El simulador recalcula el estimado, la banda, el precio mínimo rentable y los comparables en tiempo real.</p></div></header>
      <div className="launch">
        <section className="panel lform">
          <${Select} id="ln-cat" label="Categoría" value=${cid} onChange=${changeCat} options=${E.cats.map((c) => ({ v: c.id, l: c.name }))} />
          <div className="two"><${Select} id="ln-typ" label="Tipología" value=${s.typ} onChange=${(v) => set('typ', v)} options=${cat.typologies.map((t) => ({ v: t, l: t }))} /><${Select} id="ln-mat" label="Material" value=${s.mat} onChange=${(v) => set('mat', v)} options=${cat.materials.map((t) => ({ v: t, l: t }))} /></div>
          <div className="imgin">${s.img ? html`<img src=${s.img.url} alt="Imagen cargada del producto" />` : html`<div className="ph-img"><${Icon} n="upload" s=${20} /><span>Foto o render</span></div>`}
            <div><label className="btn sm" htmlFor="ln-img">${s.img ? 'Cambiar imagen' : 'Cargar imagen'}</label><input id="ln-img" type="file" accept="image/*" className="sr" onChange=${onImg} />
            <button type="button" className="btn sm" onClick=${suggestFromImage}><${Icon} n="spark" />Sugerir niveles</button>
            <p className="muted sm">${s.sug ? 'Niveles sugeridos. ' : ''}<${SimTag}>Simulado<//> En producción un modelo multimodal lee la imagen y la descripción y propone niveles con evidencia. Los diseños no lanzados requieren un proveedor de IA sin retención de datos.</p></div></div>
          <label className="fld" htmlFor="ln-desc"><span>Descripción (opcional)</span><textarea id="ln-desc" rows="2" value=${s.desc} onInput=${(e) => set('desc', e.target.value)} placeholder="Materiales, construcción, uso…"></textarea></label>
          <h3>Atributos</h3>
          ${cat.attrs.map((a, i) => html`<label key=${a.id} className="lvl" htmlFor=${'ln-a' + i}><span>${a.name}<em>${a.levels[s.lv[i] - 1]}</em></span><input id=${'ln-a' + i} type="range" min="1" max="5" step="1" value=${s.lv[i]} onInput=${(e) => { const lv = [...s.lv]; lv[i] = +e.target.value; setS((o) => ({ ...o, lv, sug: false })); }} /><b>${s.lv[i]}</b></label>`)}
          <div className="two"><label className="fld" htmlFor="ln-cost"><span>Costo unitario (opcional)</span><input id="ln-cost" type="number" min="0" value=${s.cost} onInput=${(e) => set('cost', e.target.value)} placeholder=${'en ' + mk.currency} /></label><label className="fld" htmlFor="ln-price"><span>Precio propuesto</span><input id="ln-price" type="number" min="0" value=${s.price} onInput=${(e) => set('price', e.target.value)} placeholder=${sug ? String(Math.round(sug)) : ''} /></label></div>
          <div className="fld"><span>Posicionamiento deseado</span><${Seg} label="Posicionamiento" value=${s.pos} onChange=${(v) => set('pos', v)} options=${TP.BAND_NAMES.map((n, i) => ({ v: i, l: n }))} /></div>
        </section>
        <section className="lout">
          <div className="panel">
            <div className="kpis compact">
              <div className="kpi"><span>Estimado por atributos</span><b>${est ? TP.fmt(est, mk) : '—'}</b><em>${pr ? 'Banda ' + TP.fmt(pr.lo, mk, true) + ' – ' + TP.fmt(pr.hi, mk, true) : comps.length ? 'Mediana de comparables (sin modelo)' : 'Sin evidencia suficiente'}</em></div>
              <div className="kpi"><span>Precio mínimo rentable</span><b>${floor ? TP.fmt(floor, mk) : '—'}</b><em>${floor ? 'margen mínimo ' + Math.round(pol.minMargin * 100) + ' %' : 'ingresa el costo'}</em></div>
              <div className="kpi"><span>Precio sugerido</span><b className="t-acc">${sug ? TP.fmt(sug, mk) : '—'}</b><em>${sug && floor && sug === floor ? 'limitado por el piso de rentabilidad' : 'estimado con redondeo de la política'}</em></div>
              <div className="kpi"><span>Costo objetivo</span><b>${price ? TP.fmt(price * (1 - pol.minMargin), mk) : sug ? TP.fmt(sug * (1 - pol.minMargin), mk) : '—'}</b><em>costo máximo para cumplir el margen ${price ? 'al precio propuesto' : 'al sugerido'}</em></div>
            </div>
            ${est ? html`<${UI.PriceStrip} mk=${mk} current=${price || null} currentLabel="Propuesto" est=${est} lo=${pr && pr.lo} hi=${pr && pr.hi} comps=${comps.map((c) => c.q.list)} floor=${floor} wtp=${study && study.result.range} />` : html`<${Empty} title="Sin evidencia para estimar">No hay comparables con similitud suficiente en esta categoría.<//>`}
            <ul className="checks">
              ${price && floor ? html`<li className=${price >= floor ? 'ok' : 'no'}><${Icon} n=${price >= floor ? 'check' : 'alert'} s=${14} />${price >= floor ? 'Cumple el margen mínimo: ' + TP.pct((price - cost) / price, 0, false) : 'Queda por debajo del precio mínimo rentable'}</li>` : null}
              ${price && pr ? html`<li className=${price >= pr.lo && price <= pr.hi ? 'ok' : 'warn'}><${Icon} n=${price >= pr.lo && price <= pr.hi ? 'check' : 'alert'} s=${14} />${price < pr.lo ? 'Por debajo de lo que el mercado cobra por estos atributos' : price > pr.hi ? 'Por encima de la banda del mercado: necesitará un argumento de valor' : 'Dentro de la banda del mercado'} (${TP.pct(price / pr.est - 1)} vs. estimado)</li>` : null}
              ${price ? html`<li className=${posBand === s.pos ? 'ok' : 'warn'}><${Icon} n=${posBand === s.pos ? 'check' : 'alert'} s=${14} />Queda en la franja ${TP.BAND_NAMES[posBand]}${posBand === s.pos ? ', como buscas' : ' y buscas ' + TP.BAND_NAMES[s.pos]}</li>` : null}
              ${study ? html`<li className="ok"><${Icon} n="pulse" s=${14} />Rango aceptable declarado (Pulse): ${TP.fmt(study.result.range[0], mk)} – ${TP.fmt(study.result.range[1], mk)}</li>` : html`<li className="muted"><${Icon} n="pulse" s=${14} />Sin estudio de disposición a pagar para esta categoría. <button className="linkbtn" type="button" onClick=${() => go('pulse', {})}>Crear uno</button></li>`}
            </ul>
            <div className="mapact"><button type="button" className="btn sm" onClick=${saveVar}>Guardar como variante</button><button type="button" className="btn sm primary" disabled=${!price || !can(E.cfg, 'simular')} onClick=${() => setApprovals([{ id: 'ap' + Date.now(), pid: 'nuevo', cat: cid, name: 'Nuevo · ' + s.typ + ' ' + s.mat, from: null, to: TP.roundPrice(price, mk, pol.rounding), kind: 'Producto nuevo', note: 'Estimado ' + (est ? TP.fmt(est, mk) : '—'), by: A.ROLES[E.cfg.role].l, status: 'pendiente', at: new Date().toLocaleString('es-CO') }, ...approvals])}>Enviar precio a aprobación</button></div>
          </div>
          ${vars.length ? html`<section className="panel"><h2>Variantes (hasta 3)</h2><div className="tw"><table className="tbl"><thead><tr><th>Variante</th><th>Tipo y material</th><th className="num">Estimado</th><th className="num">Propuesto</th><th className="num">Piso</th><th></th></tr></thead><tbody>${vars.map((v) => html`<tr key=${v.id}><td><b>${v.name}</b><small>niveles ${v.lv.join('·')}</small></td><td>${v.typ} · ${v.mat}</td><td className="num">${v.est ? TP.fmt(v.est, mk) : '—'}</td><td className="num">${v.price ? TP.fmt(v.price, mk) : '—'}</td><td className="num">${v.floor ? TP.fmt(v.floor, mk) : '—'}</td><td><button className="linkbtn" type="button" onClick=${() => setVars(vars.filter((x) => x.id !== v.id))}>Quitar</button></td></tr>`)}</tbody></table></div></section>` : null}
          <section className="panel"><h2>Comparables más cercanos (${comps.length})</h2>
            ${comps.length ? html`<div className="mini-comps">${comps.map((c) => html`<div key=${c.q.id} className="mcomp"><${Thumb} p=${c.q} size=${44} /><div><b>${c.q.name}</b><small>${A.brandName(E, c.q.brand)} · ${c.q.mat}</small><span>${TP.fmt(c.q.list, mk)} · <em>${c.s.label}</em></span></div></div>`)}</div>` : html`<${Empty} title="Sin comparables cercanos" />`}</section>
        </section>
      </div></div>`;
  };

  /* =========================================================
     PROMOTION OPTIMIZER
     ========================================================= */
  const ELAST = { cons: { l: 'Conservador (−1,2)', v: -1.2 }, med: { l: 'Medio (−2,0)', v: -2.0 }, alto: { l: 'Alto (−3,0)', v: -3.0 } };
  A.units = (p) => 6 + (TP.hashStr(p.id) % 40) * (p.st || 0.5);
  A.Promo = function ({ E, setCfg, approvals, setApprovals, go }) {
    const [cid, setCid] = useState(E.cats[0].id);
    const [scope, setScope] = useState('all');
    const [disc, setDisc] = useState(20);
    const [el, setEl] = useState(E.cfg.measured ? 'measured' : 'med');
    const [saved, setSaved] = useState([]);
    const cat = E.D.catById[cid], mk = E.mk, pol = E.cfg.policy;
    if (!E.cfg.privateData) return html`<div className="page"><header className="ph"><div><div className="eyebrow">Promotion Optimizer</div><h1>¿Qué descuento conviene y cuánto margen cuesta?</h1></div></header>
      <${Empty} icon="lock" title="Este módulo necesita costos y ventas" action=${html`<button type="button" className="btn primary" onClick=${() => setCfg({ ...E.cfg, privateData: true })}>Cargar archivo de costos y ventas de demostración</button>`}>Sin unidades vendidas y costos no se puede estimar el efecto de un descuento en ingresos ni en margen. En producción se conectan desde tu ERP o POS; en el prototipo puedes cargar un archivo de demostración.<//></div>`;
    const ev = el === 'measured' && E.cfg.measured ? E.cfg.measured.v : ELAST[el === 'measured' ? 'med' : el].v;
    const prods = E.own[cid].filter((p) => scope === 'all' || p.collection === scope || TP.BAND_NAMES[TP.bandOf(p.list, E.band[cid])] === scope);
    const calc = (d) => {
      let r0 = 0, r1 = 0, g0 = 0, g1 = 0, u0 = 0, u1 = 0, under = 0;
      prods.forEach((p) => { const u = A.units(p); const np = TP.roundPrice(p.list * (1 - d), mk, pol.rounding); const nu = u * Math.pow(np / p.list, ev); r0 += p.list * u; r1 += np * nu; g0 += (p.list - p.cost) * u; g1 += (np - p.cost) * nu; u0 += u; u1 += nu; if ((np - p.cost) / np < pol.promoMinMargin) under++; });
      return { r0, r1, g0, g1, u0, u1, under };
    };
    const c = calc(disc / 100);
    const curve = Array.from({ length: 11 }, (_, i) => i * 5).map((d) => ({ d, ...calc(d / 100) }));
    const best = curve.reduce((a, x) => (x.g1 > a.g1 ? x : a), curve[0]);
    const scopes = [{ v: 'all', l: 'Toda la categoría' }, ...E.D.V.collections.map((x) => ({ v: x, l: 'Colección ' + x })), ...TP.BAND_NAMES.map((x) => ({ v: x, l: 'Franja ' + x }))];
    return html`<div className="page"><header className="ph"><div><div className="eyebrow">Promotion Optimizer</div><h1>¿Qué descuento conviene y cuánto margen cuesta?</h1><p>Simulación con elasticidad constante sobre ventas y costos del archivo de demostración. Supuesto explícito, no una predicción garantizada.</p></div></header>
      <div className="launch">
        <section className="panel lform">
          <${Select} id="pr-cat" label="Categoría" value=${cid} onChange=${(v) => { setCid(v); setScope('all'); }} options=${E.cats.map((x) => ({ v: x.id, l: x.name }))} />
          <${Select} id="pr-scope" label="Alcance" value=${scope} onChange=${setScope} options=${scopes} />
          <label className="fld" htmlFor="pr-d"><span>Descuento: <b>${disc} %</b></span><input id="pr-d" type="range" min="0" max="50" step="5" value=${disc} onInput=${(e) => setDisc(+e.target.value)} /></label>
          <div className="fld"><span>Elasticidad precio (supuesto)</span><${Seg} label="Elasticidad" value=${el} onChange=${setEl} options=${[...Object.entries(ELAST).map(([k, v]) => ({ v: k, l: v.l })), ...(E.cfg.measured ? [{ v: 'measured', l: 'Medida (' + E.cfg.measured.v.toFixed(1).replace('.', ',') + ')' }] : [])]} /></div>
          ${!E.cfg.measured ? html`<p className="muted sm">Cuando mides el resultado de cambios reales en <button className="linkbtn" type="button" onClick=${() => go('learning', {})}>Revenue Learning</button>, la elasticidad medida aparece aquí.</p>` : null}
          <p className="muted sm">${prods.length} productos · margen mínimo en promoción ${Math.round(pol.promoMinMargin * 100)} % · redondeo ${TP.ROUNDING[pol.rounding].toLowerCase()}.</p>
        </section>
        <section className="lout"><div className="panel">
          <div className="kpis compact">
            <div className="kpi"><span>Ingresos</span><b className=${c.r1 >= c.r0 ? 't-up' : 't-down'}>${TP.pct(c.r1 / c.r0 - 1, 1)}</b><em>${TP.fmt(c.r0, mk, true)} → ${TP.fmt(c.r1, mk, true)}</em></div>
            <div className="kpi"><span>Margen bruto</span><b className=${c.g1 >= c.g0 ? 't-up' : 't-down'}>${TP.pct(c.g1 / c.g0 - 1, 1)}</b><em>${TP.fmt(c.g0, mk, true)} → ${TP.fmt(c.g1, mk, true)}</em></div>
            <div className="kpi"><span>Unidades</span><b>${TP.pct(c.u1 / c.u0 - 1, 0)}</b><em>por periodo</em></div>
            <div className="kpi"><span>Bajo el margen mínimo</span><b className=${c.under ? 't-down' : ''}>${c.under}</b><em>productos</em></div>
          </div>
          <${UI.Lines} xs=${curve.map((x) => x.d)} series=${[{ name: 'Ingresos (índice)', ys: curve.map((x) => (x.r1 / x.r0) * 100), slot: 1 }, { name: 'Margen bruto (índice)', ys: curve.map((x) => (x.g1 / x.g0) * 100), slot: 2 }]} markers=${[{ x: disc, label: 'Escenario ' + disc + ' %' }]} yFmt=${(v) => Math.round(v)} xLabel="Descuento (%)" />
          <p className="insight"><${Icon} n="spark" />Con elasticidad ${ev.toFixed(1).replace('.', ',')}, el margen bruto se maximiza con ${best.d} % de descuento en este alcance. ${best.d === 0 ? 'Descontar no recupera margen con este supuesto.' : ''}</p>
          <div className="mapact"><button type="button" className="btn sm" disabled=${saved.length >= 3} onClick=${() => setSaved([...saved, { id: Date.now(), cat: cat.short, scope: scopes.find((x) => x.v === scope).l, disc, ev, ...c }])}>Guardar escenario (${saved.length}/3)</button></div>
        </div>
        ${saved.length ? html`<section className="panel"><h2>Comparar escenarios</h2><div className="tw"><table className="tbl"><thead><tr><th>Escenario</th><th className="num">Descuento</th><th className="num">Elasticidad</th><th className="num">Ingresos</th><th className="num">Margen</th><th className="num">Bajo mínimo</th><th></th></tr></thead><tbody>${saved.map((x) => html`<tr key=${x.id}><td><b>${x.cat}</b><small>${x.scope}</small></td><td className="num">${x.disc} %</td><td className="num">${x.ev.toFixed(1).replace('.', ',')}</td><td className="num">${TP.pct(x.r1 / x.r0 - 1, 1)}</td><td className="num">${TP.pct(x.g1 / x.g0 - 1, 1)}</td><td className="num">${x.under}</td><td><div className="mapact"><button type="button" className="btn sm" onClick=${() => setApprovals([{ id: 'ap' + Date.now(), pid: 'promo', cat: cid, name: 'Promoción ' + x.cat + ' · ' + x.scope, from: null, to: null, detail: '−' + x.disc + ' %', kind: 'Descuento', note: 'Margen ' + TP.pct(x.g1 / x.g0 - 1, 1), by: A.ROLES[E.cfg.role].l, status: 'pendiente', at: new Date().toLocaleString('es-CO') }, ...approvals])}>A aprobación</button><button className="linkbtn" type="button" onClick=${() => setSaved(saved.filter((y) => y.id !== x.id))}>Quitar</button></div></td></tr>`)}</tbody></table></div></section>` : null}
        </section></div></div>`;
  };

  /* =========================================================
     PULSE WTP
     ========================================================= */
  const METHODS = {
    vw: { n: 'Van Westendorp', why: 'Sirve cuando no hay un precio de referencia claro: entrega un rango de precios aceptables.', size: 300 },
    gg: { n: 'Gabor-Granger', why: 'Sirve para elegir entre pocos precios concretos de un producto existente: entrega una curva de intención de compra declarada.', size: 250 },
    cj: { n: 'Conjoint', why: 'Sirve para decidir qué atributos vale la pena mejorar: estima la importancia relativa de cada atributo y del precio.', size: 400 },
  };
  A.pulseRecs = function (E, extra) {
    const recs = [...(extra || [])];
    E.cats.filter((c) => !E.model[c.id].ok).forEach((c) => recs.push({ cat: c.id, method: 'vw', target: c.name, why: `En ${c.name} no hay comparables suficientes para estimar precio (${E.model[c.id].n} de ${E.model[c.id].need}). Un Van Westendorp da un rango de referencia mientras se completa la muestra.`, center: TP.median(E.own[c.id].map((p) => p.list)) }));
    let bestCap = null;
    E.cats.filter((c) => E.model[c.id].ok).forEach((c) => { E.D.V.collections.forEach((k) => { const ds = E.diag[c.id].filter((d) => d.p.collection === k && isFinite(d.gap)); if (ds.length >= 3) { const g = TP.mean(ds.map((d) => d.gap)); if (!bestCap || g < bestCap.g) bestCap = { c, k, g, ds }; } }); });
    if (bestCap && bestCap.g < -0.05) recs.push({ cat: bestCap.c.id, method: 'gg', target: 'Colección ' + bestCap.k, why: `La colección ${bestCap.k} en ${bestCap.c.name.toLowerCase()} está en promedio ${TP.pct(Math.abs(bestCap.g), 0, false)} por debajo de su estimado. Antes de subir precios, un Gabor-Granger prueba cuatro niveles concretos.`, center: TP.median(bestCap.ds.map((d) => d.est)) });
    const c0 = E.cats.find((c) => E.model[c.id].ok);
    if (c0) recs.push({ cat: c0.id, method: 'cj', target: 'Próxima colección de ' + c0.name.toLowerCase(), why: `Para decidir qué atributos priorizar en ${c0.name.toLowerCase()}: el modelo de mercado dice cuánto se cobra por cada atributo; el Conjoint dice cuánto lo valora tu cliente.`, center: TP.median(E.own[c0.id].map((p) => p.list)) });
    return recs;
  };
  A.Pulse = function ({ E, studies, setStudies, extraRecs }) {
    const [edit, setEdit] = useState(null);
    const recs = A.pulseRecs(E, extraRecs);
    const mk = E.mk;
    const create = (r) => { const st = { id: 's' + Date.now(), name: METHODS[r.method].n + ' · ' + r.target, method: r.method, cat: r.cat, target: r.target, why: r.why, center: r.center, step: 0, sample: { n: METHODS[r.method].size, seg: 'Clientes que compraron en la categoría en los últimos 12 meses', channel: 'base' }, status: 'borrador' }; setStudies([st, ...studies]); setEdit(st.id); };
    const cur = studies.find((s) => s.id === edit);
    const upd = (patch) => setStudies(studies.map((s) => (s.id === edit ? { ...s, ...patch } : s)));
    return html`<div className="page"><header className="ph"><div><div className="eyebrow">Pulse WTP · Voice of Customer</div><h1>¿Qué decisión necesita validarse con consumidores?</h1><p>Módulo opcional. La IA lo recomienda solo cuando hay una decisión relevante y poca evidencia de mercado para resolverla.</p></div></header>
      ${cur ? html`<${StudyBuilder} E=${E} st=${cur} upd=${upd} close=${() => setEdit(null)} />` : html`<div>
        <section className="panel"><h2>Estudios recomendados</h2><div className="recs">${recs.map((r, i) => html`<article key=${i} className="rec"><div><${Badge} tone="info">${METHODS[r.method].n}<//><h3>${r.target}</h3><p>${r.why}</p><p className="muted sm">${METHODS[r.method].why}</p></div><button type="button" className="btn sm primary" disabled=${!can(E.cfg, 'estudios')} onClick=${() => create(r)}>Crear estudio</button></article>`)}</div></section>
        <section className="panel"><h2>Mis estudios</h2>${studies.length ? html`<div className="tw"><table className="tbl"><thead><tr><th>Estudio</th><th>Categoría</th><th>Estado</th><th>Resultado</th><th></th></tr></thead><tbody>${studies.map((s) => html`<tr key=${s.id}><td><b>${s.name}</b></td><td>${E.D.catById[s.cat].name}</td><td><${Badge} tone=${s.result ? 'ok' : 'info'}>${s.status}<//></td><td>${s.result && s.result.range ? TP.fmt(s.result.range[0], mk) + ' – ' + TP.fmt(s.result.range[1], mk) : s.result && s.result.imp ? 'Importancia de atributos' : '—'}</td><td><button type="button" className="btn sm" onClick=${() => setEdit(s.id)}>Abrir</button></td></tr>`)}</tbody></table></div>` : html`<${Empty} icon="pulse" title="Todavía no hay estudios">Crea uno desde una recomendación. Los resultados aparecen en Price Advisor y en Product Launch.<//>`}</section>
      </div>`}</div>`;
  };
  function StudyBuilder({ E, st, upd, close }) {
    const mk = E.mk, cat = E.D.catById[st.cat];
    const prices = [0.8, 0.9, 1, 1.1, 1.2].map((f) => TP.roundPrice(st.center * f, mk, 'psico'));
    const steps = ['Método', 'Cuestionario', 'Muestra y distribución', 'Revisión y aprobación', 'Resultados'];
    const go = (n) => upd({ step: n });
    const seed = TP.hashStr(st.id + st.method + st.sample.n);
    const runResults = () => {
      let result;
      if (st.method === 'vw') { const r = TP.simulateVW(st.center, st.sample.n, seed); result = { vw: r, range: [r.pmc, r.pme] }; }
      else if (st.method === 'gg') { const r = TP.simulateGG(prices, st.center, st.sample.n, seed); const acc = r.pts.filter((x) => x.s >= 0.45); result = { gg: r, range: acc.length ? [acc[0].p, acc[acc.length - 1].p] : null }; }
      else { const r = TP.simulateConjoint(cat, E.model[st.cat], st.sample.n, seed); result = { cj: r, imp: true }; }
      upd({ step: 4, status: 'resultados (demo)', result });
    };
    const Q = st.method === 'vw' ? ['¿A qué precio este producto te parecería tan barato que dudarías de su calidad?', '¿A qué precio te parecería una ganga, una buena compra?', '¿A qué precio empezaría a parecerte caro, aunque lo considerarías?', '¿A qué precio sería tan caro que no lo considerarías?']
      : st.method === 'gg' ? prices.map((p) => `Si este producto costara ${TP.fmt(p, mk)}, ¿qué tan probable es que lo compres? (1 = nada probable, 5 = muy probable)`)
      : [`Se mostrarán 8 pantallas con 3 alternativas cada una, combinando ${cat.attrs.slice(0, 4).map((a) => a.name.toLowerCase()).join(', ')} y precio (${prices[0] ? TP.fmt(prices[1], mk) + ', ' + TP.fmt(prices[2], mk) + ', ' + TP.fmt(prices[3], mk) : ''}). Pregunta: «¿Cuál de estas opciones comprarías?», con opción «Ninguna».`];
    return html`<section className="panel builder">
      <div className="row-between"><div><span className="eyebrow">${METHODS[st.method].n} · ${cat.name}</span><h2>${st.target}</h2></div><button type="button" className="btn sm ghost" onClick=${close}>Volver a estudios</button></div>
      <ol className="ob-steps small">${steps.map((s, i) => html`<li key=${i} className=${i === st.step ? 'cur' : i < st.step ? 'done' : ''}><button type="button" disabled=${i > st.step} onClick=${() => go(i)}><span>${i < st.step ? html`<${Icon} n="check" s=${12} />` : i + 1}</span>${s}</button></li>`)}</ol>
      ${st.step === 0 ? html`<div><p>${st.why}</p><div className="opts">${Object.entries(METHODS).map(([k, m]) => html`<button key=${k} type="button" className=${'optc ' + (st.method === k ? 'on' : '')} onClick=${() => upd({ method: k, name: m.n + ' · ' + st.target, sample: { ...st.sample, n: m.size } })}><b>${m.n}</b><span>${m.why}</span></button>`)}</div><div className="ob-actions"><button className="btn primary" type="button" onClick=${() => go(1)}>Generar cuestionario</button></div></div>` : null}
      ${st.step === 1 ? html`<div><p className="muted">Generado a partir de la categoría, sus atributos y el precio de referencia (${TP.fmt(st.center, mk)}). <${SimTag}>Generación simulada<//></p><ol className="qlist">${Q.map((q, i) => html`<li key=${i}>${q}</li>`)}</ol><p className="muted sm">Incluye una pregunta filtro de compra en la categoría y una de control de atención.</p><div className="ob-actions"><button className="btn ghost" type="button" onClick=${() => go(0)}>Atrás</button><button className="btn primary" type="button" onClick=${() => go(2)}>Aprobar preguntas</button></div></div>` : null}
      ${st.step === 2 ? html`<div className="two">
        <label className="fld" htmlFor="sb-n"><span>Tamaño de muestra objetivo</span><input id="sb-n" type="number" min="50" max="2000" value=${st.sample.n} onInput=${(e) => upd({ sample: { ...st.sample, n: TP.clamp(+e.target.value || 50, 50, 2000) } })} /></label>
        <${Select} id="sb-ch" label="Distribución" value=${st.sample.channel} onChange=${(v) => upd({ sample: { ...st.sample, channel: v } })} options=${[{ v: 'base', l: 'Base de clientes (correo o WhatsApp)' }, { v: 'panel', l: 'Panel externo de consumidores' }, { v: 'web', l: 'Intercepción en la tienda online' }]} />
        <label className="fld wide" htmlFor="sb-seg"><span>Segmento</span><input id="sb-seg" type="text" value=${st.sample.seg} onInput=${(e) => upd({ sample: { ...st.sample, seg: e.target.value } })} /></label>
        <p className="muted sm wide">Con ${st.sample.n} respuestas, el margen de error de una proporción es cercano a ±${Math.round(98 / Math.sqrt(st.sample.n))} puntos (95 %).</p>
        <div className="ob-actions wide"><button className="btn ghost" type="button" onClick=${() => go(1)}>Atrás</button><button className="btn primary" type="button" onClick=${() => go(3)}>Continuar</button></div></div>` : null}
      ${st.step === 3 ? html`<div><div className="kv"><div><span>Método</span><b>${METHODS[st.method].n}</b></div><div><span>Preguntas</span><b>${Q.length}</b></div><div><span>Muestra</span><b>${st.sample.n}</b></div><div><span>Canal</span><b>${{ base: 'Base de clientes', panel: 'Panel externo', web: 'Tienda online' }[st.sample.channel]}</b></div></div>
        ${st.status === 'borrador' ? html`<div className="ob-actions"><button className="btn ghost" type="button" onClick=${() => go(2)}>Atrás</button><button className="btn primary" type="button" onClick=${() => upd({ status: 'enlace creado' })}>Aprobar y crear enlace</button></div>`
          : html`<div><div className="linkbox"><span className="mono">https://pulse.demo.invalid/s/${st.id.slice(-6)}</span><${SimTag}>Enlace de demostración: no recibe respuestas<//></div><div className="ob-actions"><button className="btn primary" type="button" onClick=${runResults}>Simular respuestas (datos de demostración)</button></div></div>`}</div>` : null}
      ${st.step === 4 && st.result ? html`<${StudyResults} E=${E} st=${st} prices=${prices} />` : null}
    </section>`;
  }
  function StudyResults({ E, st }) {
    const mk = E.mk, r = st.result;
    if (r.vw) { const v = r.vw; return html`<div><${Note} tone="warn">Resultados generados con ${v.n} respuestas sintéticas de demostración.<//>
      <div className="kpis compact"><div className="kpi"><span>Rango aceptable</span><b>${TP.fmt(v.pmc, mk, true)} – ${TP.fmt(v.pme, mk, true)}</b><em>PMC a PME</em></div><div className="kpi"><span>Precio óptimo (OPP)</span><b>${TP.fmt(v.opp, mk, true)}</b><em>menor rechazo</em></div><div className="kpi"><span>Indiferencia (IPP)</span><b>${TP.fmt(v.ipp, mk, true)}</b><em>tan barato como caro</em></div></div>
      <${UI.Lines} xs=${v.grid} xLog=${true} mk=${mk} yMax=${1} yFmt=${(x) => Math.round(x * 100) + ' %'} series=${[{ name: 'Demasiado barato', ys: v.curves.tooCheap, slot: 1, dash: true }, { name: 'Barato', ys: v.curves.cheap, slot: 1 }, { name: 'Caro', ys: v.curves.expensive, slot: 2 }, { name: 'Demasiado caro', ys: v.curves.tooExpensive, slot: 2, dash: true }]} markers=${[{ x: v.pmc, label: 'PMC' }, { x: v.opp, label: 'OPP' }, { x: v.ipp, label: 'IPP' }, { x: v.pme, label: 'PME' }]} xLabel="Precio" />
      <details className="assum" open><summary>Limitaciones</summary><ul><li>Mide percepción declarada, no comportamiento de compra.</li><li>No considera la competencia en el momento de la compra; compleméntalo con el modelo de mercado.</li><li>El rango se integra en Price Advisor y Product Launch de ${E.D.catById[st.cat].name}.</li></ul></details></div>`; }
    if (r.gg) { const g = r.gg; return html`<div><${Note} tone="warn">Resultados generados con ${g.n} respuestas sintéticas de demostración.<//>
      <${UI.Lines} xs=${g.pts.map((x) => x.p)} mk=${mk} yMax=${1} yFmt=${(x) => Math.round(x * 100) + ' %'} series=${[{ name: 'Intención de compra declarada (4 y 5)', ys: g.pts.map((x) => x.s), slot: 1 }, { name: 'Ingreso relativo (precio × intención)', ys: g.pts.map((x) => x.rev / g.best.rev), slot: 2, dash: true }]} markers=${[{ x: g.best.p, label: 'Máximo ingreso declarado' }]} xLabel="Precio probado" />
      <p className="insight"><${Icon} n="spark" />El ingreso declarado es máximo en ${TP.fmt(g.best.p, mk)} con ${Math.round(g.best.s * 100)} % de intención. La intención declarada suele sobreestimar la compra real; no la trates como ventas garantizadas.</p></div>`; }
    const c = r.cj;
    return html`<div><${Note} tone="warn">Resultados generados con ${c.n} respuestas sintéticas de demostración.<//>
      <div className="grid-2"><div><h3>Importancia relativa</h3><div className="paired">${c.importance.map((x) => html`<div key=${x.name} className="prow"><div className="plab">${x.name}</div><div className="pbars"><div className="pb mkt" style=${{ width: x.v * 100 / c.importance[0].v + '%' }}></div></div><div className="pval"><span>${Math.round(x.v * 100)} %</span></div></div>`)}</div></div>
      <div><h3>Utilidades por nivel</h3><div className="tw"><table className="tbl"><thead><tr><th>Atributo</th><th className="num">Bajo</th><th className="num">Medio</th><th className="num">Alto</th></tr></thead><tbody>${c.rows.map((x) => html`<tr key=${x.attr.id}><td>${x.attr.name}</td>${x.pw.map((v, i) => html`<td key=${i} className="num" title=${x.levels[i]}>${v.toFixed(2).replace('.', ',')}</td>`)}</tr>`)}</tbody></table></div></div></div>
      <p className="foot">Utilidades centradas en el nivel medio. La importancia indica cuánto cambia la elección al pasar del peor al mejor nivel de cada atributo.</p></div>`;
  }

  /* =========================================================
     REVENUE LEARNING
     ========================================================= */
  A.Learning = function ({ E, approvals, setCfg, go, dec }) {
    const [demo, setDemo] = useState(false);
    const done = approvals.filter((a) => a.status === 'aprobado' && a.from && a.to);
    const corrections = Object.values(dec.map).filter(Boolean).length + Object.values(dec.comp).filter(Boolean).length;
    const items = demo && !done.length ? E.allDiag.filter((d) => d.action === 'up').slice(0, 3).map((d) => ({ id: 'demo' + d.p.id, pid: d.p.id, name: d.p.name, from: d.p.list, to: d.scenario, demo: true })) : done;
    const measure = (a) => {
      const r = TP.rng(TP.hashStr(a.id)); const ch = a.to / a.from - 1; const trueE = -1.4 - r() * 1.2;
      const wk = Array.from({ length: 12 }, (_, i) => i - 5);
      const base = 40 + r() * 30;
      const ctl = wk.map((w) => base * (1 + 0.02 * w) * (1 + TP.gauss(r) * 0.06));
      const trt = wk.map((w, i) => base * 0.9 * (1 + 0.02 * w) * (w > 0 ? Math.pow(1 + ch, trueE) : 1) * (1 + TP.gauss(r) * 0.06));
      const pre = (s) => TP.mean(s.slice(0, 6)), post = (s) => TP.mean(s.slice(6));
      const did = Math.log(post(trt) / pre(trt)) - Math.log(post(ctl) / pre(ctl));
      const e = did / Math.log(1 + ch);
      const se = Math.abs(0.09 / Math.log(1 + ch));
      return { wk, ctl, trt, e, lo: e - 1.645 * se, hi: e + 1.645 * se };
    };
    const ms = E.cfg.privateData ? items.map((a) => ({ a, m: measure(a) })) : [];
    const agg = ms.length ? TP.mean(ms.map((x) => x.m.e)) : null;
    return html`<div className="page"><header className="ph"><div><div className="eyebrow">Revenue Learning</div><h1>¿Qué pasó después de cambiar los precios?</h1><p>Mide cada cambio aprobado contra un grupo de control de productos similares y alimenta los supuestos de elasticidad del sistema.</p></div></header>
      ${!items.length ? html`<${Empty} icon="learning" title="Aún no hay cambios aprobados para medir" action=${html`<div className="mapact"><button className="btn primary" type="button" onClick=${() => go('advisor', {})}>Ir al Price Advisor</button><button className="btn" type="button" onClick=${() => setDemo(true)}>Ver ejemplo con datos de demostración</button></div>`}>Cuando apruebes un cambio de precio, aquí verás su efecto en unidades e ingresos frente a productos similares que no cambiaron.<//>`
      : !E.cfg.privateData ? html`<${Empty} icon="lock" title="Medir requiere ventas" action=${html`<button className="btn primary" type="button" onClick=${() => setCfg({ ...E.cfg, privateData: true })}>Cargar ventas de demostración</button>`}>Hay ${items.length} cambios listos para medir, pero no hay datos de ventas conectados.<//>`
      : html`<div>
        ${demo && !done.length ? html`<${Note} tone="warn">Ejemplo con cambios hipotéticos y ventas sintéticas: ningún cambio real fue aprobado.<//>` : null}
        <div className="kpis compact"><div className="kpi"><span>Cambios medidos</span><b>${ms.length}</b><em>8 semanas antes · 6 después</em></div><div className="kpi"><span>Elasticidad observada (promedio)</span><b>${agg.toFixed(1).replace('.', ',')}</b><em>diferencias en diferencias vs. control</em></div><div className="kpi"><span>Correcciones de usuarios</span><b>${corrections}</b><em>equivalencias y comparables revisados</em></div></div>
        <div className="mapact"><button type="button" className="btn sm primary" onClick=${() => setCfg({ ...E.cfg, measured: { v: agg } })}>Usar ${agg.toFixed(1).replace('.', ',')} en Promotion Optimizer</button>${E.cfg.measured ? html`<${Badge} tone="ok">En uso: ${E.cfg.measured.v.toFixed(1).replace('.', ',')}<//>` : null}</div>
        ${ms.map(({ a, m }) => html`<section key=${a.id} className="panel"><div className="row-between"><div><h2>${a.name}</h2><span className="muted">${TP.fmt(a.from, E.mk)} → ${TP.fmt(a.to, E.mk)} (${TP.pct(a.to / a.from - 1, 1)})</span></div><div className="capk"><span>Elasticidad observada</span><b>${m.e.toFixed(1).replace('.', ',')}</b><em className="muted sm">IC 90 % ${m.lo.toFixed(1).replace('.', ',')} a ${m.hi.toFixed(1).replace('.', ',')}</em></div></div>
          <${UI.Lines} xs=${m.wk} series=${[{ name: 'Producto con cambio', ys: m.trt, slot: 2 }, { name: 'Control (similares sin cambio)', ys: m.ctl, slot: 1, dash: true }]} markers=${[{ x: 0.5, label: 'Cambio de precio' }]} yFmt=${(v) => Math.round(v)} xLabel="Semanas respecto al cambio" /></section>`)}
        <${Note}>En producción, estas mediciones reentrenan la elasticidad por categoría, ajustan el modelo de homologación con tus correcciones y proponen nuevos atributos cuando el error se concentra en un tipo de producto.<//>
      </div>`}</div>`;
  };

  /* =========================================================
     CONFIGURACIÓN
     ========================================================= */
  A.Config = function ({ E, setCfg, sub, setSub, restart }) {
    const SUB = [['integraciones', 'Integraciones'], ['categorias', 'Categorías y atributos'], ['competidores', 'Competidores'], ['franjas', 'Franjas'], ['politicas', 'Políticas'], ['usuarios', 'Usuarios y roles'], ['transparencia', 'Transparencia del prototipo']];
    const cfg = E.cfg, mk = E.mk;
    const [csv, setCsv] = useState(null);
    const [cc, setCc] = useState(E.cats[0].id);
    const readCsv = (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; const fr = new FileReader(); fr.onload = () => { const lines = String(fr.result).split(/\r?\n/).filter((l) => l.trim()); const sep = (lines[0] || '').includes(';') ? ';' : ','; setCsv({ name: file.name, rows: Math.max(0, lines.length - 1), cols: (lines[0] || '').split(sep).map((x) => x.trim()) }); }; fr.readAsText(file.slice(0, 2e6)); };
    const pol = (k, v) => setCfg({ ...cfg, policy: { ...cfg.policy, [k]: v } });
    const views = {
      integraciones: html`<div className="grid-2"><section className="panel"><h2>Tienda</h2><div className="kv"><div><span>URL</span><b className="mono">${cfg.host}</b></div><div><span>Plataforma</span><b>${cfg.platform}</b></div><div><span>Modo</span><b>Catálogo público</b><${SimTag}>Simulado<//></div></div>
          <button type="button" className="btn sm" onClick=${restart}>Conectar otra tienda (reiniciar onboarding)</button></section>
        <section className="panel"><h2>Costos, ventas e inventario</h2><p className="muted">Necesarios para margen, precio mínimo rentable, rotación, promociones y medición. Nunca se infieren desde la web.</p>
          <div className="mapact">${cfg.privateData ? html`<${Badge} tone="ok">Archivo de demostración cargado<//><button className="btn sm" type="button" onClick=${() => setCfg({ ...cfg, privateData: false })}>Quitar</button>` : html`<button className="btn sm primary" type="button" onClick=${() => setCfg({ ...cfg, privateData: true })}>Cargar archivo de demostración</button>`}<label className="btn sm" htmlFor="cf-csv"><${Icon} n="upload" />Importar tu CSV</label><input id="cf-csv" type="file" accept=".csv,.txt" className="sr" onChange=${readCsv} /></div>
          ${csv ? html`<${Note}>Leímos ${csv.name}: ${csv.rows} filas, columnas ${csv.cols.slice(0, 6).join(', ')}. El mapeo de columnas y la carga requieren backend; no se mezcla con la demo.<//>` : null}</section>
        <section className="panel span2"><h2>Conectores</h2><div className="conns">${[['Shopify', 'E-commerce'], ['VTEX', 'E-commerce'], ['WooCommerce', 'E-commerce'], ['Magento (Adobe Commerce)', 'E-commerce'], ['Siigo', 'ERP'], ['Alegra', 'ERP'], ['World Office', 'ERP'], ['Microsoft Dynamics 365', 'ERP'], ['SAP Business One', 'ERP'], ['POS por archivo', 'Ventas']].map(([n, t]) => html`<div key=${n} className="conn"><b>${n}</b><span className="muted">${t}</span><${Badge} tone="neutral">Requiere backend<//></div>`)}</div></section></div>`,
      categorias: html`<section className="panel"><div className="row-between"><${Select} id="cf-cat" label="Categoría" value=${cc} onChange=${setCc} options=${E.cats.map((c) => ({ v: c.id, l: c.name }))} compact /><span className="muted">Rúbrica propuesta por IA a partir de ${E.own[cc].length + E.pool[cc].length} productos <${SimTag} /></span></div>
        ${(() => { const c = E.D.catById[cc], m = E.model[cc], off = cfg.attrsOff[cc] || []; return html`<div><p className="muted">Modelo actual: ${m.ok ? 'R² validación ' + m.r2cv.toFixed(2).replace('.', ',') + ' · confiabilidad ' + m.reliability.toLowerCase() : TP.REASON_TEXT[m.reason] + ' (' + m.n + ' de ' + m.need + ')'}. Desactivar un atributo reentrena el modelo al instante.</p>
          <div className="tw"><table className="tbl rub"><thead><tr><th>Atributo</th>${[1, 2, 3, 4, 5].map((l) => html`<th key=${l}>Nivel ${l}</th>`)}<th>En el modelo</th></tr></thead><tbody>${c.attrs.map((a) => html`<tr key=${a.id} className=${off.includes(a.id) ? 'muted' : ''}><td><b>${a.name}</b></td>${a.levels.map((l, i) => html`<td key=${i}>${l}</td>`)}<td><label className="tgl" htmlFor=${'att-' + a.id}><input id=${'att-' + a.id} type="checkbox" checked=${!off.includes(a.id)} onChange=${() => setCfg({ ...cfg, attrsOff: { ...cfg.attrsOff, [cc]: off.includes(a.id) ? off.filter((x) => x !== a.id) : [...off, a.id] } })} />Activo</label></td></tr>`)}</tbody></table></div>
          <p className="foot">Tipologías: ${c.typologies.join(', ')} · Materiales: ${c.materials.join(', ')} · Colores estándar: ${c.colors.join(', ')}.</p></div>`; })()}</section>`,
      competidores: html`<section className="panel"><p className="muted">Competidores que alimentan el análisis y el modelo. Desactivar uno recalcula equivalencias, comparables y modelos.</p><div className="tw"><table className="tbl"><thead><tr><th>Marca</th><th>Categorías detectadas</th><th className="num">Productos</th><th className="num">En promoción</th><th>Incluir</th></tr></thead><tbody>
        ${E.D.brands.filter((b) => !b.own).map((b) => { const ps = E.D.products.filter((p) => p.brand === b.id); const on = cfg.comps.includes(b.id); return html`<tr key=${b.id}><td><b>${b.name}</b></td><td>${E.D.labels.filter((l) => l.brand === b.id).map((l) => l.name).join(', ')}</td><td className="num">${ps.length}</td><td className="num">${Math.round((ps.filter((p) => p.promo).length / ps.length) * 100)} %</td><td><label className="tgl" htmlFor=${'cmp-' + b.id}><input id=${'cmp-' + b.id} type="checkbox" checked=${on} disabled=${on && cfg.comps.length <= 2} onChange=${() => setCfg({ ...cfg, comps: on ? cfg.comps.filter((x) => x !== b.id) : [...cfg.comps, b.id] })} />${on ? 'Incluido' : 'Excluido'}</label></td></tr>`; })}
      </tbody></table></div><p className="foot">Marcas ficticias de demostración. En producción, la IA propone competidores por superposición de categorías, precio y audiencia; el negocio decide.</p></section>`,
      franjas: html`<section className="panel">${E.cats.map((c) => html`<div key=${c.id} className="frow"><b>${c.name}</b><${A.BandEditor} E=${E} catId=${c.id} setCfg=${setCfg} /></div>`)}<p className="foot">Por defecto, terciles de los precios de lista de la competencia. Ajustables por categoría, industria o mercado.</p></section>`,
      politicas: html`<section className="panel pols">
        <${Select} id="po-mk" label="Mercado y moneda" value=${cfg.market} onChange=${(v) => setCfg({ ...cfg, market: v })} options=${Object.values(TP.MARKETS).map((m) => ({ v: m.id, l: m.name + ' · ' + m.currency }))} />
        <label className="fld" htmlFor="po-mm"><span>Margen bruto mínimo: <b>${Math.round(cfg.policy.minMargin * 100)} %</b></span><input id="po-mm" type="range" min="0.2" max="0.8" step="0.01" value=${cfg.policy.minMargin} onInput=${(e) => pol('minMargin', +e.target.value)} /></label>
        <label className="fld" htmlFor="po-pm"><span>Margen mínimo en promoción: <b>${Math.round(cfg.policy.promoMinMargin * 100)} %</b></span><input id="po-pm" type="range" min="0.1" max="0.6" step="0.01" value=${cfg.policy.promoMinMargin} onInput=${(e) => pol('promoMinMargin', +e.target.value)} /></label>
        <label className="fld" htmlFor="po-mc"><span>Tope de cambio por ciclo: <b>±${Math.round(cfg.policy.maxChange * 100)} %</b></span><input id="po-mc" type="range" min="0.03" max="0.3" step="0.01" value=${cfg.policy.maxChange} onInput=${(e) => pol('maxChange', +e.target.value)} /></label>
        <${Select} id="po-rd" label="Redondeo" value=${cfg.policy.rounding} onChange=${(v) => pol('rounding', v)} options=${Object.entries(TP.ROUNDING).map(([v, l]) => ({ v, l: v === 'psico' ? l + ': ' + TP.roundingExample(mk) : v === 'multiplo' ? l + ' de ' + TP.fmt(mk.step, mk) : l }))} />
        <p className="muted sm">Cambiar el mercado regenera los datos de demostración en la nueva moneda.</p></section>`,
      usuarios: html`<section className="panel"><${Select} id="us-role" label="Estás usando el prototipo como" value=${cfg.role} onChange=${(v) => setCfg({ ...cfg, role: v })} options=${Object.entries(A.ROLES).map(([v, r]) => ({ v, l: r.l }))} />
        <div className="tw"><table className="tbl"><thead><tr><th>Rol</th><th>Aprobar cambios</th><th>Configurar</th><th>Simular y proponer</th><th>Estudios Pulse</th></tr></thead><tbody>${Object.entries(A.ROLES).map(([k, r]) => html`<tr key=${k} className=${k === cfg.role ? 'ownrow' : ''}><td><b>${r.l}</b></td>${['aprobar', 'configurar', 'simular', 'estudios'].map((x) => html`<td key=${x}>${r.can.includes(x) ? html`<${Icon} n="check" />` : html`<span className="muted">—</span>`}</td>`)}</tr>`)}</tbody></table></div>
        <p className="foot">En producción: SSO, usuarios por cliente, matriz de aprobadores configurable y registro de auditoría (quién, cuándo y por qué).</p></section>`,
      transparencia: html`<div className="grid-3">
        <section className="panel"><h2><${Badge} tone="ok">Funciona en el prototipo<//></h2><ul className="plain"><li>Navegación, filtros compartidos y todas las visualizaciones</li><li>Regresión hedónica log-lineal, validación cruzada en 5 particiones, banda P10–P90, detección de atípicos y abstención</li><li>Similitud producto contra producto y reglas de homologación sobre las señales de los datos</li><li>Diagnóstico, escenarios, piso de rentabilidad, redondeo y tope por ciclo</li><li>Simulador de producto nuevo, promociones con elasticidad, aprobaciones por rol</li><li>Cálculo de Van Westendorp, Gabor-Granger y diferencias en diferencias sobre respuestas y ventas sintéticas</li><li>Copiloto con preguntas predefinidas calculadas sobre los datos</li><li>Lectura local de tu archivo CSV (filas y columnas)</li></ul></section>
        <section className="panel"><h2><${Badge} tone="warn">Simulado<//></h2><ul className="plain"><li>Lectura de la URL y detección de plataforma, país y categorías</li><li>Catálogos propios y de competencia (marcas ficticias)</li><li>Clasificación multimodal de atributos desde imagen y texto</li><li>Señales semánticas para homologar categorías</li><li>Generación de cuestionarios, enlace y respuestas de encuestas</li><li>Costos, ventas e inventario (archivo de demostración)</li><li>Imágenes de producto (ilustraciones)</li><li>Copiloto: reglas, sin modelo de lenguaje conectado</li></ul></section>
        <section className="panel"><h2><${Badge} tone="neutral">Necesario para producción<//></h2><ul className="plain"><li>Backend, base de datos y aislamiento multi-tenant por cliente</li><li>Conectores autenticados de e-commerce y ERP, con escritura de precios aprobados</li><li>Rastreo de competencia con validación legal y respeto de términos de uso</li><li>Pipeline multimodal (LLM con evidencia, umbral de confianza y revisión humana) con proveedor sin retención</li><li>Motor estadístico versionado, monitoreo de deriva y reentrenamiento</li><li>Panel y distribución de encuestas, consentimiento y protección de datos</li><li>SSO, permisos, auditoría, monitoreo y facturación</li></ul></section></div>`,
    };
    return html`<div className="page"><header className="ph"><div><div className="eyebrow">Configuration</div><h1>Configuración</h1><p>Lo que el negocio define y el sistema usa. Todo cambio recalcula el análisis.</p></div></header>
      <nav className="tabs">${SUB.map(([k, l]) => html`<button key=${k} type="button" className=${sub === k ? 'on' : ''} onClick=${() => setSub(k)}>${l}</button>`)}</nav>
      ${views[sub] || views.integraciones}</div>`;
  };
})();
