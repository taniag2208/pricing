/* TITA Pricing Intelligence 360° — Pricing Advisor, Simulador de lanzamiento, Simulador de promociones, Pulse WTP,
   Revenue Learning y Configuración, sobre los datos reales del espacio de trabajo. */
(function () {
  'use strict';
  const { useState, useEffect, useRef } = React;
  const TP = window.TP, UI = TP.ui, html = UI.html, A = TP.app, L = TP.live, I = TP.ingest;
  const { Icon, Badge, Seg, Select, Empty, Note, Thumb } = UI;
  const nowIso = () => new Date().toISOString();
  const fmtDate = (s) => (s ? new Date(s).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '');
  A.propose = (rec) => { const id = 'a' + Date.now() + Math.floor(Math.random() * 1000); return L.set('approvals/' + id, { ...rec, id, by: L.uid, status: 'pendiente', at: nowIso() }); };

  /* =========================================================
     PRICE ADVISOR
     ========================================================= */
  A.Advisor = function ({ E, f, setF, sub, setSub, focus, setFocus, approvals, studies, go, P }) {
    const cat = E.D.catById[f.cat], m = E.model[f.cat];
    const SUB = [['diagnostico', 'Diagnóstico'], ['modelo', 'Calidad del modelo'], ['aprobacion', 'Bandeja de aprobación']];
    const pend = approvals.filter((a) => a.status === 'pendiente').length;
    return html`<div className="page">
      <header className="ph"><div><div className="eyebrow">Pricing Advisor</div><h1>${sub === 'modelo' ? '¿Cuánto confiar en el precio estimado?' : sub === 'aprobacion' ? '¿Qué cambios esperan aprobación?' : '¿Qué precios conviene revisar y por qué?'}</h1><p>Valoración por atributos frente a comparables de tus competidores. Ninguna recomendación se aplica sin aprobación humana.</p></div></header>
      <nav className="tabs">${SUB.map(([k, l]) => html`<button key=${k} type="button" className=${sub === k ? 'on' : ''} onClick=${() => setSub(k)}>${l}${k === 'aprobacion' && pend ? html`<span className="cnt">${pend}</span>` : null}</button>`)}</nav>
      ${sub !== 'aprobacion' ? html`<${A.FilterBar} E=${E} f=${f} setF=${setF} showPrice=${false} />` : null}
      ${sub === 'modelo' ? html`<${ModelView} E=${E} cat=${cat} m=${m} go=${go} P=${P} />` : sub === 'aprobacion' ? html`<${Approvals} E=${E} approvals=${approvals} P=${P} />` : html`<${Diagnosis} E=${E} f=${f} cat=${cat} m=${m} focus=${focus} setFocus=${setFocus} approvals=${approvals} studies=${studies} go=${go} P=${P} />`}
    </div>`;
  };

  function Diagnosis({ E, f, cat, m, focus, setFocus, approvals, studies, go, P }) {
    const [pos, setPos] = useState(f.pos || 'all');
    useEffect(() => { if (f.pos) setPos(f.pos); }, [f.pos]);
    const all = E.diag[f.cat].filter((d) => (f.mat === 'all' || d.p.mat === f.mat) && (f.typ === 'all' || d.p.typ === f.typ));
    const rows = all.filter((d) => pos === 'all' || d.pos === pos).sort((a, b) => b.priority - a.priority || (a.gap || 0) - (b.gap || 0));
    const sel = all.find((d) => d.p.id === focus) || rows[0];
    const cnt = (k) => all.filter((d) => d.pos === k).length;
    const hasSt = all.some((d) => d.p.st != null);
    return html`<div>
      ${!m.ok ? html`<${Note} tone="warn"><b>Sin estimación del modelo en ${cat.name}.</b> ${m.reason === 'muestra' ? `Hay ${m.n} productos comparables y se necesitan ${m.need} para ${m.k} atributos.` : 'La validación cruzada no alcanza la calidad mínima.'} Las sugerencias usan solo comparables directos. <button className="linkbtn" type="button" onClick=${() => go('advisor', { sub: 'modelo' })}>Ver qué falta</button><//>` : null}
      <div className="sumrow">${[['all', 'Todos', all.length], ['below', 'Por debajo', cnt('below')], ['above', 'Por encima', cnt('above')], ['in', 'En banda', cnt('in')], ['na', 'Sin estimación', cnt('na')]].map(([k, l, n]) => html`<button key=${k} type="button" className=${'sumc ' + (pos === k ? 'on' : '')} onClick=${() => setPos(k)}><b>${n}</b><span>${l}</span></button>`)}</div>
      ${all.length ? html`<div className="advgrid">
        <section className="panel"><div className="tw"><table className="tbl"><thead><tr><th>Producto</th><th className="num">Actual</th><th className="num">Estimado</th><th className="num">Brecha</th><th>Sugerencia</th>${hasSt ? html`<th className="num">Rotación</th>` : null}</tr></thead><tbody>
          ${rows.map((d) => html`<tr key=${d.p.id} className=${'click ' + (sel && sel.p.id === d.p.id ? 'sel' : '')} tabIndex="0" onClick=${() => setFocus(d.p.id)} onKeyDown=${(e) => e.key === 'Enter' && setFocus(d.p.id)}>
            <td><div className="pcell"><${Thumb} p=${d.p} size=${32} /><div><b>${d.p.name}</b><small>${d.p.typ} · ${d.p.mat}</small></div></div></td>
            <td className="num">${TP.fmt(d.p.list, E.mk)}</td><td className="num">${d.est ? TP.fmt(d.est, E.mk) : '—'}</td>
            <td className=${'num ' + (d.gap < 0 ? 't-up' : d.gap > 0 ? 't-down' : '')}>${isFinite(d.gap) ? TP.pct(d.gap) : isFinite(d.gapComp) ? TP.pct(d.gapComp) + '*' : '—'}</td>
            <td><${Badge} tone=${d.action === 'up' ? 'up' : d.action === 'down' ? 'down' : 'neutral'}>${A.ACTION[d.action]}<//></td>
            ${hasSt ? html`<td className="num">${d.p.st != null ? Math.round(d.p.st * 100) + ' %' : '—'}</td>` : null}
          </tr>`)}
        </tbody></table></div>${rows.length ? null : html`<${Empty} title="Ningún producto en este grupo" />`}<p className="foot">* Brecha frente a la mediana de comparables cuando no hay modelo.</p></section>
        ${sel ? html`<${Detail} key=${sel.p.id} E=${E} cat=${cat} m=${m} d=${sel} approvals=${approvals} studies=${studies} go=${go} P=${P} />` : null}
      </div>` : html`<${Empty} title="No hay productos tuyos clasificados en esta categoría" action=${html`<button type="button" className="btn primary" onClick=${() => go('data', { sub: 'clasificacion' })}>Clasificar productos</button>`} />`}</div>`;
  }

  function Detail({ E, cat, m, d, approvals, studies, go, P }) {
    const mk = E.mk, pol = E.cfg.policy, p = d.p;
    const [price, setPrice] = useState(d.scenario);
    const [note, setNote] = useState('');
    const [sent, setSent] = useState(false);
    const pending = approvals.find((a) => a.pid === p.id && a.status === 'pendiente');
    const lo = p.list * 0.7, hi = p.list * 1.4;
    const rp = TP.roundPrice(price, mk, pol.rounding);
    const hasCost = p.cost > 0;
    const marg = (v) => (v - p.cost) / v;
    const study = studies.find((s) => s.cat === cat.id && s.result && s.result.range);
    const brandsC = [...new Set(d.comps.map((c) => A.brandName(E, c.q.brand)))];
    let text;
    if (d.action === 'up') text = `Este producto presenta materiales y características similares a ${d.comps.length} referencias comparables${brandsC.length ? ' de ' + brandsC.slice(0, 3).join(', ') : ''}. Su precio publicado está ${TP.pct(Math.abs(isFinite(d.gapComp) ? d.gapComp : d.gap), 0, false)} por debajo de ${isFinite(d.gapComp) ? 'la mediana de ese grupo' : 'su precio estimado'}${d.pos === 'below' ? ' y por debajo de la banda P10–P90 del modelo de atributos' : ''}. Recomendamos evaluar un escenario de incremento, sujeto a validación de demanda y rentabilidad.`;
    else if (d.action === 'down') text = `El precio publicado está ${TP.pct(isFinite(d.gap) ? d.gap : d.gapComp, 0, false)} por encima de lo que el mercado cobra por atributos similares${d.pos === 'above' ? ' y fuera de la banda P10–P90' : ''}. Antes de bajarlo, revisa si hay atributos que el modelo no captura (marca, exclusividad, servicio) y si la rotación confirma una barrera de precio.`;
    else if (d.evidence === 'insuficiente') text = `No hay suficientes productos comparables para opinar sobre este precio: se necesitan al menos 3 referencias muy parecidas de la competencia${d.comps.length ? ' y solo hay ' + d.comps.filter((c) => c.s.score >= 0.75).length : ''}. No se recomienda moverlo con esta información.`;
    else text = `El precio está dentro de la banda que el mercado cobra por productos con atributos similares${d.comps.length ? ' y cerca de la mediana de sus ' + d.comps.length + ' comparables' : ''}. No hay evidencia para moverlo.`;
    if (d.evidence === 'mixta') text += ' Atención: el modelo y los comparables directos no coinciden del todo; la evidencia es mixta.';
    let dx = null;
    if (p.st != null) {
      const lowSt = p.st < 0.45, hiSt = p.st > 0.72;
      if (d.pos === 'above' && lowSt) dx = ['Posible barrera de precio', 'Precio por encima de su banda y rotación baja.'];
      else if (d.pos !== 'above' && lowSt) dx = ['Revisar diseño o surtido', 'El precio está en línea con el mercado pero rota poco: el problema probablemente no es el precio.'];
      else if (d.pos === 'below' && hiSt) dx = ['Oportunidad de precio', 'Rota bien y está por debajo de su banda.'];
      else dx = ['Sin señal de rotación', 'Rotación dentro del rango esperado.'];
    }
    // Ficha de decisión: qué, de cuánto a cuánto, por qué, con qué evidencia, qué confianza, qué impacto y qué falta.
    const proposed = d.action !== 'keep' && d.scenario && d.scenario !== p.list ? d.scenario : null;
    const close = d.comps.filter((c) => c.s.score >= 0.75);
    const evid = d.est ? 'Modelo de precio por atributos con ' + m.n + ' productos de la competencia (R² de validación ' + m.r2cv.toFixed(2) + '); rango esperado ' + TP.fmt(d.lo, mk) + ' a ' + TP.fmt(d.hi, mk) + '.' + (d.comps.length ? ' ' + d.comps.length + ' comparables directos, mediana ' + TP.fmt(d.compMedian, mk) + '.' : '')
      : close.length ? close.length + ' comparables muy parecidos' + (d.compRange ? ', rango central ' + TP.fmt(d.compRange[0], mk) + ' a ' + TP.fmt(d.compRange[1], mk) : '') + ' (sin modelo: la categoría no tiene suficientes productos).' : 'No hay comparables suficientemente parecidos para opinar sobre este precio.';
    const lower = (c) => ({ Alta: 'Media', Media: 'Baja', Baja: 'Baja' }[c] || c);
    const conf = d.evidence === 'insuficiente' ? ['Sin evidencia suficiente', 'neutral', 'no se recomienda moverlo']
      : d.est ? [d.evidence === 'mixta' ? lower(m.reliability) : m.reliability, m.reliability === 'Alta' && d.evidence !== 'mixta' ? 'ok' : 'warn', d.evidence === 'mixta' ? 'modelo y comparables no coinciden del todo' : 'modelo y comparables coinciden']
      : [close.length >= 5 ? 'Media' : 'Baja', 'warn', 'solo comparables directos'];
    const missing = [!hasCost ? 'Costo del producto: sin él no se calcula margen ni precio mínimo rentable.' : null, p.st == null ? 'Ventas o rotación: sin ellas no se estima el efecto en volumen.' : null, p.imputed ? p.imputed + ' atributo(s) sin evidencia en la ficha (se usó la mediana de la categoría).' : null, d.comps.some((c) => c.q.conf === 'baja') ? d.comps.filter((c) => c.q.conf === 'baja').length + ' comparable(s) con clasificación de confianza baja.' : null].filter(Boolean);
    const send = async () => { await A.propose({ pid: p.id, sku: p.sku || null, cat: cat.id, name: p.name, from: p.list, to: rp, kind: 'Precio base', note }); setNote(''); setSent(true); };
    const contrib = m.ok ? m.contributions(p.lv) : [];
    const cmx = Math.max(0.05, ...contrib.map((c) => Math.abs(c.eff)));
    const over = Math.abs(rp / p.list - 1) > pol.maxChange + 0.005;
    return html`<aside className="panel detail" aria-label="Detalle del producto">
      <div className="dhead"><${Thumb} p=${p} size=${64} /><div><span className="eyebrow">${cat.name}${p.collection ? ' · ' + p.collection : ''}</span><h2>${p.name}</h2><div className="muted">${p.typ} · ${p.mat} · ${p.color}${p.url ? html` · <a href=${p.url} target="_blank" rel="noopener noreferrer">ver en la tienda</a>` : null}</div><div className="dbadges"><${Badge} tone=${A.POS[d.pos].tone}>${A.POS[d.pos].t}<//><${Badge} tone=${d.evidence === 'consistente' ? 'ok' : 'warn'}>Evidencia ${d.evidence}<//>${p.imputed ? html`<${Badge} tone="warn">${p.imputed} atributo(s) sin dato<//>` : null}</div></div></div>
      <dl className="decision" aria-label="Ficha de decisión">
        <div><dt>Precio actual</dt><dd className="big">${TP.fmt(p.list, mk)}</dd></div>
        <div><dt>Precio propuesto ${proposed ? html`<span className="kind">escenario</span>` : null}</dt><dd className="big">${proposed ? TP.fmt(proposed, mk) + ' (' + TP.pct(proposed / p.list - 1, 1) + ')' : html`<span className="muted">${d.evidence === 'insuficiente' ? 'Sin recomendación' : 'Mantener'}</span>`}</dd></div>
        <div className="wide"><dt>Evidencia ${d.est ? html`<span className="kind">estimación estadística</span>` : null}</dt><dd>${evid}</dd></div>
        <div><dt>Confianza</dt><dd><${Badge} tone=${conf[1]}>${conf[0]}<//> <span className="sm muted">${conf[2]}</span></dd></div>
        <div><dt>Impacto estimado</dt><dd className="sm">${hasCost && proposed ? html`<span className="kind">cálculo</span> margen unitario ${TP.pct(marg(p.list), 1, false)} → ${TP.pct(marg(proposed), 1, false)}. ` : ''}${'Volumen y ventas: no estimados (requieren ventas históricas o un experimento en Revenue Learning).'}</dd></div>
        ${missing.length ? html`<div className="wide"><dt>Datos que faltan</dt><dd><ul className="missing">${missing.map((x, i) => html`<li key=${i}>${x}</li>`)}</ul></dd></div>` : null}
      </dl>
      <${UI.PriceStrip} mk=${mk} current=${p.list} est=${d.est} lo=${d.lo} hi=${d.hi} comps=${d.comps.map((c) => c.q.list)} floor=${d.floor} wtp=${study && study.result.range} extra=${rp !== p.list ? [{ v: rp, t: 'Escenario', cls: 'scn', y: 16 }] : []} />
      <div className="why"><h3><${Icon} n="spark" />Por qué</h3><p>${text}</p></div>
      ${d.comps.length ? html`<div><h3>Comparables usados</h3><ul className="cp-list">${d.comps.map((c) => html`<li key=${c.q.id}><span><b>${c.q.name}</b> · ${A.brandName(E, c.q.brand)} · ${TP.fmt(c.q.list, mk)} · ${c.s.label}${c.q.url ? html` · <a href=${c.q.url} target="_blank" rel="noopener noreferrer">ver</a>` : null}${c.s.why ? html`<small className="muted" style=${{ display: 'block' }}>${c.s.why.join(' · ')}</small>` : null}</span></li>`)}</ul></div>` : null}
      ${dx ? html`<div className="dx"><b>${dx[0]}</b> · rotación ${Math.round(p.st * 100)} % (vendido sobre planeado) · ${dx[1]}</div>` : null}
      ${contrib.length ? html`<div><h3>Qué explica el estimado</h3><p className="muted sm">Efecto de cada atributo frente al producto promedio de la categoría.</p><div className="contrib">${contrib.map((c) => html`<div key=${c.attr.id} className="cbr"><span>${c.attr.name} <em>nivel ${c.level}</em></span><div className="ctrack"><div className="czero"></div><div className=${'cbar ' + (c.eff < 0 ? 'neg' : '')} style=${{ left: c.eff >= 0 ? '50%' : 50 + (c.eff / cmx) * 50 + '%', width: (Math.abs(c.eff) / cmx) * 50 + '%' }}></div></div><b>${TP.pct(c.eff)}</b></div>`)}</div></div>` : null}
      <div className="scen"><h3>Escenario</h3>
        <label className="fld" htmlFor="sc-price"><span>Precio a evaluar: <b>${TP.fmt(rp, mk)}</b> (${TP.pct(rp / p.list - 1, 1)} · redondeo: ${TP.ROUNDING[pol.rounding].toLowerCase()})</span><input id="sc-price" type="range" min=${lo} max=${hi} step=${(hi - lo) / 200} value=${price} onInput=${(e) => setPrice(+e.target.value)} /></label>
        <div className="kv sm">
          <div><span>Posición en banda</span><b>${d.est ? (rp < d.lo ? 'Debajo' : rp > d.hi ? 'Encima' : 'Dentro') : '—'}</b></div>
          <div><span>Franja resultante</span><b>${TP.BAND_NAMES[TP.bandOf(rp, E.band[cat.id])]}</b></div>
          <div><span>Cambio vs. tope por ciclo</span><b className=${over ? 't-down' : ''}>${TP.pct(rp / p.list - 1, 1)} / ±${Math.round(pol.maxChange * 100)} %</b></div>
          ${hasCost ? html`<div><span>Margen bruto</span><b>${TP.pct(marg(p.list), 1, false)} → ${TP.pct(marg(rp), 1, false)}</b></div><div><span>Precio mínimo rentable</span><b className=${rp < d.floor ? 't-down' : ''}>${TP.fmt(d.floor, mk)}</b></div>` : html`<div className="wide"><span>Margen</span><b className="muted">Requiere el costo de este producto · <button className="linkbtn" type="button" onClick=${() => go(P.config ? 'data' : 'privados', { sub: 'privados' })}>cargar costos</button></b></div>`}
        </div>
        ${hasCost && rp < d.floor ? html`<${Note} tone="warn">El escenario queda por debajo del margen mínimo de ${Math.round(pol.minMargin * 100)} %.<//>` : null}
        ${over ? html`<${Note} tone="warn">El cambio supera el tope por ciclo configurado; requerirá una justificación en la aprobación.<//>` : null}
        <label className="fld" htmlFor="sc-note"><span>Justificación para quien aprueba</span><textarea id="sc-note" rows="2" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="Opcional"></textarea></label>
        <div className="mapact">${pending ? html`<${Badge} tone="info">Pendiente de aprobación: ${TP.fmt(pending.to, mk)}<//>` : html`<button type="button" className="btn primary sm" disabled=${rp === p.list || !P.write} onClick=${send}>Enviar a aprobación</button>`}${sent && !pending ? html`<span className="sm muted">Enviado.</span>` : null}${!P.write ? html`<span className="muted sm">Tu acceso es de solo lectura.</span>` : null}</div>
      </div>
      <details className="assum"><summary>Supuestos y limitaciones</summary><ul>
        <li>El estimado refleja lo que cobra el mercado por atributos similares (regresión hedónica log-lineal entrenada con los precios de venta actuales de tus competidores). No mide disposición a pagar ni es el precio que maximiza utilidad.</li>
        <li>Los atributos fueron calificados por la IA desde el nombre y la ficha publicada; ${d.comps.filter((c) => c.q.conf === 'baja').length} de ${d.comps.length} comparables tienen confianza baja.</li>
        <li>${hasCost ? 'El efecto en volumen no se estima aquí: usa el simulador de promociones o Revenue Learning.' : 'Sin costo no se evalúa margen.'}</li>
        ${study ? html`<li>Incluye el rango aceptable declarado del estudio Pulse «${study.name}» (respuestas de encuesta, no ventas).</li>` : null}
      </ul></details>
    </aside>`;
  }

  function ModelView({ E, cat, m, go, P }) {
    if (!m.ok) {
      return html`<section className="panel abst"><${Icon} n="alert" s=${22} /><div><h2>El modelo se abstiene en ${cat.name}</h2>
        <p>${m.reason === 'muestra' ? `Hay ${m.n} productos comparables de la competencia y, con ${m.k} atributos, se necesitan al menos ${m.need} (8 por coeficiente, mínimo 30). Con menos datos el modelo memoriza en vez de aprender y sus precios no se pueden defender.` : m.reason === 'calidad' ? `La validación cruzada explica ${Math.round((m.r2cv || 0) * 100)} % de la variación del precio en productos que el modelo no vio; el mínimo es 50 %. Revisa la rúbrica: puede faltar un atributo que explique el precio.` : 'No hay atributos activos.'}</p>
        ${!P.config ? html`<p>El equipo de Tita está ampliando la muestra de competencia de esta categoría. Mientras tanto, el Pricing Advisor usa comparables directos.</p>` : null}
        ${P.config ? html`<h3>Qué puedes hacer</h3>` : null}${!P.config ? null : html`<ul>
          <li><button className="linkbtn" type="button" onClick=${() => go('data', { sub: 'clasificacion' })}>Clasificar más productos de la competencia</button>.</li>
          <li><button className="linkbtn" type="button" onClick=${() => go('data', { sub: 'tiendas' })}>Agregar competidores</button> o importar más páginas de sus catálogos.</li>
          <li><button className="linkbtn" type="button" onClick=${() => go('market', { sub: 'homolog', cat: cat.id })}>Revisar equivalencias</button>: aceptar categorías mixtas suma comparables.</li>
          <li><button className="linkbtn" type="button" onClick=${() => go('config', { sub: 'atributos' })}>Reducir atributos del modelo</button> (baja el mínimo requerido).</li></ul>`}</div></section>`;
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
          <ul className="plain"><li>Entrenado con precios <b>de lista</b> de los ${E.cfg.comps.length} competidores activos (los filtros de vista no cambian el modelo).</li><li>Niveles 1 a 5 calificados por la IA con la rúbrica de la categoría y corregidos por tu equipo; ${m.k} atributos activos. Los niveles sin evidencia se imputan con la mediana de la categoría.</li><li>Atípicos excluidos por residuo mayor a 3,5 desviaciones robustas${m.excluded.length ? ': ' + m.excluded.slice(0, 6).map((p) => A.brandName(E, p.brand) + ' ' + p.name).join(', ') : ''}.</li><li>Banda P10–P90 a partir de los errores de validación cruzada.</li><li>Abstención automática si la muestra es menor a ${m.need} o el R² de validación es menor a 0,50.</li></ul>
          <p className="muted sm">Se recalcula en tu navegador cada vez que cambian catálogos, clasificaciones, equivalencias, competidores o atributos.</p></section>
      </div></div>`;
  }

  function Approvals({ E, approvals, P }) {
    const name = L.useNames(approvals.flatMap((a) => [a.by, a.decidedBy]));
    const [exp, setExp] = useState('');
    const decide = (a, status) => L.set('approvals/' + a.id, { ...a, status, decidedBy: L.uid, decidedAt: nowIso() });
    const approved = approvals.filter((a) => a.status === 'aprobado' && a.to);
    const csv = L.csv([['sku', 'producto', 'precio_actual', 'precio_nuevo', 'tipo', 'aprobado_el'], ...approved.map((a) => [a.sku || '', a.name, a.from || '', a.to, a.kind, (a.decidedAt || '').slice(0, 10)])]);
    if (!approvals.length) return html`<${Empty} title="La bandeja está vacía">Envía un escenario desde el diagnóstico de un producto, desde Simulador de lanzamiento o desde Simulador de promociones.<//>`;
    return html`<section className="panel">
      ${!P.edit ? html`<${Note} tone="warn">Solo quienes tienen acceso de edición (Editor o Propietario del espacio) pueden aprobar o rechazar.<//>` : null}
      <div className="tw"><table className="tbl"><thead><tr><th>Cambio</th><th>Tipo</th><th className="num">Actual</th><th className="num">Propuesto</th><th>Propuesto por</th><th>Estado</th><th></th></tr></thead><tbody>
        ${approvals.map((a) => html`<tr key=${a.id}><td><b>${a.name}</b>${a.note ? html`<small>${a.note}</small>` : null}</td><td>${a.kind}</td><td className="num">${a.from != null ? TP.fmt(a.from, E.mk) : '—'}</td><td className="num">${a.to != null ? TP.fmt(a.to, E.mk) : a.detail}</td><td>${name(a.by)}<small>${fmtDate(a.at)}</small></td><td><${Badge} tone=${a.status === 'aprobado' ? 'ok' : a.status === 'rechazado' ? 'down' : 'info'}>${a.status}<//>${a.decidedBy ? html`<small>${name(a.decidedBy)} · ${fmtDate(a.decidedAt)}</small>` : null}</td>
          <td>${a.status === 'pendiente' ? html`<div className="mapact"><button type="button" className="btn sm primary" disabled=${!P.edit} onClick=${() => decide(a, 'aprobado')}>Aprobar</button><button type="button" className="btn sm" disabled=${!P.edit} onClick=${() => decide(a, 'rechazado')}>Rechazar</button></div>` : null}</td></tr>`)}
      </tbody></table></div>
      <div className="mapact"><button type="button" className="btn sm" disabled=${!approved.length} onClick=${async () => setExp((await L.download('precios_aprobados.csv', csv)) ? 'ok' : 'show')}>Descargar archivo de carga (${approved.length})</button><span className="muted sm">CSV con SKU y precio nuevo para cargar en tu ERP o e-commerce.</span></div>
      ${exp === 'show' ? html`<div><p className="sm muted">La descarga no está disponible en esta vista; copia el contenido:</p><textarea className="mono csv" readOnly rows="5" value=${csv} aria-label="Archivo de carga"></textarea></div>` : null}
    </section>`;
  }

  /* =========================================================
     PRODUCT LAUNCH
     ========================================================= */
  A.Launch = function (props) {
    if (!props.E.cats.length) return html`<div className="page"><${Empty} title="Sin categorías analizadas">Completa la clasificación de tus productos.<//></div>`;
    return html`<${LaunchInner} ...${props} />`;
  };
  function LaunchInner({ E, prefill, studies, go, P }) {
    const firstCat = (prefill && E.cats.find((c) => c.id === prefill.cat)) || E.cats[0];
    const [cid, setCid] = useState(firstCat.id);
    const cat = E.D.catById[cid];
    const init = (c) => ({ typ: (prefill && prefill.typ && c.id === prefill.cat && prefill.typ) || c.typologies[0], mat: (prefill && prefill.mat && c.id === prefill.cat && prefill.mat) || c.materials[0], lv: c.attrs.map(() => 3), cost: '', price: '', pos: prefill && prefill.band != null ? prefill.band : 1, img: null, sug: '', desc: '' });
    const [s, setS] = useState(() => init(firstCat));
    const [vars, setVars] = useState([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [sent, setSent] = useState(false);
    const ctl = useRef(null);
    const changeCat = (v) => { setCid(v); setS(init(E.D.catById[v])); };
    const set = (k, v) => setS((o) => ({ ...o, [k]: v }));
    const m = E.model[cid], b = E.band[cid], mk = E.mk, pol = E.cfg.policy;
    const probe = { id: 'nuevo', typ: s.typ, mat: s.mat, lv: s.lv, color: cat.colors[0], list: 1, hasDesc: true, matPublic: true };
    const comps = TP.comparablesFor(cat, probe, E.pool[cid], E.dec.comp, { limit: 8 });
    const pr = m.ok ? m.predict(s.lv) : null;
    const cost = I.parseMoney(s.cost) || 0;
    const floor = cost ? TP.roundPrice(cost / (1 - pol.minMargin), mk, pol.rounding) : null;
    const est = pr ? pr.est : comps.length ? TP.median(comps.map((c) => c.q.list)) : null;
    const sug = est ? TP.roundPrice(Math.max(est, floor || 0), mk, pol.rounding) : null;
    const price = I.parseMoney(s.price) || 0;
    const study = studies.find((x) => x.cat === cid && x.result && x.result.range);
    const posBand = price ? TP.bandOf(price, b) : null;
    const suggest = async () => {
      const sample = await I.sample();
      if (!sample || !s.img) { setErr(!s.img ? 'Carga primero una imagen.' : 'La IA no está disponible en esta vista.'); return; }
      ctl.current = new AbortController(); setBusy(true); setErr('');
      try {
        const o = await I.levelsFromImage(sample, cat, s.img.file, s.desc, ctl.current.signal);
        const pickL = (v, list) => list.find((x) => TP.strip(x) === TP.strip(String(v || ''))) || null;
        setS((x) => ({ ...x, typ: pickL(o.typ, cat.typologies) || x.typ, mat: pickL(o.mat, cat.materials) || x.mat, lv: cat.attrs.map((_, j) => { const v = Array.isArray(o.lv) ? Number(o.lv[j]) : NaN; return v >= 1 && v <= 5 ? Math.round(v) : x.lv[j]; }), sug: String(o.ev || 'Niveles sugeridos por la IA a partir de la imagen.') }));
      } catch (e) { if (e.code !== 'cancelled') setErr(I.errText(e)); }
      setBusy(false);
    };
    const onImg = (e) => { const fl = e.target.files && e.target.files[0]; e.target.value = ''; if (!fl) return; const fr = new FileReader(); fr.onload = () => set('img', { name: fl.name, url: fr.result, file: fl }); fr.readAsDataURL(fl); };
    const saveVar = () => setVars((v) => [...v.slice(-2), { id: Date.now(), name: 'Variante ' + String.fromCharCode(65 + (v.length % 26)), typ: s.typ, mat: s.mat, lv: [...s.lv], est, price, floor }]);
    return html`<div className="page">
      <header className="ph"><div><div className="eyebrow">Simulador · Lanzamiento de producto</div><h1>¿A qué precio debería salir este producto nuevo?</h1><p>Describe el producto, sube una foto o render y su costo. El estimado, la banda, el piso de rentabilidad y los comparables se recalculan en tiempo real.</p></div></header>
      <div className="launch">
        <section className="panel lform">
          <${Select} id="ln-cat" label="Categoría" value=${cid} onChange=${changeCat} options=${E.cats.map((c) => ({ v: c.id, l: c.name }))} />
          <div className="imgin">${s.img ? html`<img src=${s.img.url} alt="Imagen cargada del producto" />` : html`<div className="ph-img"><${Icon} n="upload" s=${20} /><span>Foto o render</span></div>`}
            <div><label className="btn sm" htmlFor="ln-img">${s.img ? 'Cambiar imagen' : 'Cargar imagen'}</label><input id="ln-img" type="file" accept="image/jpeg,image/png,image/webp" className="sr" onChange=${onImg} />
            ${busy ? html`<span className="spin"></span><button type="button" className="btn sm" onClick=${() => ctl.current && ctl.current.abort()}>Detener</button>` : html`<button type="button" className="btn sm" disabled=${!s.img || !P.write} title=${P.write ? '' : 'Disponible en la versión con cuenta'} onClick=${suggest}><${Icon} n="spark" />Sugerir atributos con IA</button>`}
            <p className="muted sm">${s.sug ? html`<b>IA:</b> ${s.sug} ` : 'La IA mira la imagen y la descripción y propone tipo, material y niveles. Revisa y ajusta antes de usarlos.'}</p></div></div>
          ${err ? html`<div className="err">${err}</div>` : null}
          <label className="fld" htmlFor="ln-desc"><span>Descripción (opcional)</span><textarea id="ln-desc" rows="2" value=${s.desc} onInput=${(e) => set('desc', e.target.value)} placeholder="Materiales, construcción, uso…"></textarea></label>
          <div className="two"><${Select} id="ln-typ" label="Tipo" value=${s.typ} onChange=${(v) => set('typ', v)} options=${cat.typologies.map((t) => ({ v: t, l: t }))} /><${Select} id="ln-mat" label="Material" value=${s.mat} onChange=${(v) => set('mat', v)} options=${cat.materials.map((t) => ({ v: t, l: t }))} /></div>
          <h3>Atributos</h3>
          ${cat.attrs.map((a, i) => html`<label key=${a.id} className="lvl" htmlFor=${'ln-a' + i}><span>${a.name}<em>${a.levels[s.lv[i] - 1]}</em></span><input id=${'ln-a' + i} type="range" min="1" max="5" step="1" value=${s.lv[i]} onInput=${(e) => { const lv = [...s.lv]; lv[i] = +e.target.value; setS((o) => ({ ...o, lv })); }} /><b>${s.lv[i]}</b></label>`)}
          <div className="two"><label className="fld" htmlFor="ln-cost"><span>Costo unitario (opcional)</span><input id="ln-cost" type="text" inputMode="decimal" value=${s.cost} onInput=${(e) => set('cost', e.target.value)} placeholder=${'en ' + mk.currency} /></label><label className="fld" htmlFor="ln-price"><span>Precio propuesto</span><input id="ln-price" type="text" inputMode="decimal" value=${s.price} onInput=${(e) => set('price', e.target.value)} placeholder=${sug ? String(Math.round(sug)) : ''} /></label></div>
          <div className="fld"><span>Posicionamiento deseado</span><${Seg} label="Posicionamiento" value=${s.pos} onChange=${(v) => set('pos', v)} options=${TP.BAND_NAMES.map((n, i) => ({ v: i, l: n }))} /></div>
        </section>
        <section className="lout">
          <div className="panel">
            <div className="kpis compact">
              <div className="kpi"><span>Estimado por atributos</span><b>${est ? TP.fmt(est, mk) : '—'}</b><em>${pr ? 'Banda ' + TP.fmt(pr.lo, mk, true) + ' – ' + TP.fmt(pr.hi, mk, true) : comps.length ? 'Mediana de comparables (sin modelo)' : 'Sin evidencia suficiente'}</em></div>
              <div className="kpi"><span>Precio mínimo rentable</span><b>${floor ? TP.fmt(floor, mk) : '—'}</b><em>${floor ? 'margen mínimo ' + Math.round(pol.minMargin * 100) + ' %' : 'ingresa el costo'}</em></div>
              <div className="kpi"><span>Precio sugerido</span><b className="t-acc">${sug ? TP.fmt(sug, mk) : '—'}</b><em>${sug && floor && sug === floor ? 'limitado por el piso de rentabilidad' : 'estimado con el redondeo de tu política'}</em></div>
              <div className="kpi"><span>Costo objetivo</span><b>${price ? TP.fmt(price * (1 - pol.minMargin), mk) : sug ? TP.fmt(sug * (1 - pol.minMargin), mk) : '—'}</b><em>costo máximo para cumplir el margen ${price ? 'al precio propuesto' : 'al sugerido'}</em></div>
            </div>
            ${est ? html`<${UI.PriceStrip} mk=${mk} current=${price || null} currentLabel="Propuesto" est=${est} lo=${pr && pr.lo} hi=${pr && pr.hi} comps=${comps.map((c) => c.q.list)} floor=${floor} wtp=${study && study.result.range} />` : html`<${Empty} title="Sin evidencia para estimar">No hay comparables con similitud suficiente en esta categoría.<//>`}
            <ul className="checks">
              ${price && floor ? html`<li className=${price >= floor ? 'ok' : 'no'}><${Icon} n=${price >= floor ? 'check' : 'alert'} s=${14} />${price >= floor ? 'Cumple el margen mínimo: ' + TP.pct((price - cost) / price, 0, false) : 'Queda por debajo del precio mínimo rentable'}</li>` : null}
              ${price && pr ? html`<li className=${price >= pr.lo && price <= pr.hi ? 'ok' : 'warn'}><${Icon} n=${price >= pr.lo && price <= pr.hi ? 'check' : 'alert'} s=${14} />${price < pr.lo ? 'Por debajo de lo que el mercado cobra por estos atributos' : price > pr.hi ? 'Por encima de la banda del mercado: necesitará un argumento de valor' : 'Dentro de la banda del mercado'} (${TP.pct(price / pr.est - 1)} vs. estimado)</li>` : null}
              ${price ? html`<li className=${posBand === s.pos ? 'ok' : 'warn'}><${Icon} n=${posBand === s.pos ? 'check' : 'alert'} s=${14} />Queda en la franja ${TP.BAND_NAMES[posBand]}${posBand === s.pos ? ', como buscas' : ' y buscas ' + TP.BAND_NAMES[s.pos]}</li>` : null}
              ${study ? html`<li className="ok"><${Icon} n="pulse" s=${14} />Rango aceptable declarado (Pulse): ${TP.fmt(study.result.range[0], mk)} – ${TP.fmt(study.result.range[1], mk)}</li>` : html`<li className="muted"><${Icon} n="pulse" s=${14} />Sin estudio de disposición a pagar para esta categoría. <button className="linkbtn" type="button" onClick=${() => go('pulse', {})}>Crear uno</button></li>`}
            </ul>
            <div className="mapact"><button type="button" className="btn sm" onClick=${saveVar}>Guardar como variante</button><button type="button" className="btn sm primary" disabled=${!price || !P.write} onClick=${async () => { await A.propose({ pid: 'nuevo-' + Date.now(), cat: cid, name: 'Nuevo · ' + s.typ + ' ' + s.mat, from: null, to: TP.roundPrice(price, mk, pol.rounding), kind: 'Producto nuevo', note: 'Estimado ' + (est ? TP.fmt(est, mk) : '—') + (cost ? ' · costo ' + TP.fmt(cost, mk) : '') }); setSent(true); }}>Enviar precio a aprobación</button>${sent ? html`<span className="sm muted">Enviado a la bandeja.</span>` : null}</div>
          </div>
          ${vars.length ? html`<section className="panel"><h2>Variantes (hasta 3)</h2><div className="tw"><table className="tbl"><thead><tr><th>Variante</th><th>Tipo y material</th><th className="num">Estimado</th><th className="num">Propuesto</th><th className="num">Piso</th><th></th></tr></thead><tbody>${vars.map((v) => html`<tr key=${v.id}><td><b>${v.name}</b><small>niveles ${v.lv.join('·')}</small></td><td>${v.typ} · ${v.mat}</td><td className="num">${v.est ? TP.fmt(v.est, mk) : '—'}</td><td className="num">${v.price ? TP.fmt(v.price, mk) : '—'}</td><td className="num">${v.floor ? TP.fmt(v.floor, mk) : '—'}</td><td><button className="linkbtn" type="button" onClick=${() => setVars(vars.filter((x) => x.id !== v.id))}>Quitar</button></td></tr>`)}</tbody></table></div></section>` : null}
          <section className="panel"><h2>Comparables más cercanos (${comps.length})</h2>
            ${comps.length ? html`<div className="mini-comps">${comps.map((c) => html`<div key=${c.q.id} className="mcomp"><${Thumb} p=${c.q} size=${44} /><div><b>${c.q.name}</b><small>${A.brandName(E, c.q.brand)} · ${c.q.mat}</small><span>${TP.fmt(c.q.list, mk)} · <em>${c.s.label}</em>${c.q.url ? html` · <a href=${c.q.url} target="_blank" rel="noopener noreferrer">ver</a>` : null}</span></div></div>`)}</div>` : html`<${Empty} title="Sin comparables cercanos" />`}</section>
        </section>
      </div></div>`;
  }

  /* =========================================================
     PROMOTION OPTIMIZER
     ========================================================= */
  const ELAST = { cons: { l: 'Conservador (−1,2)', v: -1.2 }, med: { l: 'Medio (−2,0)', v: -2.0 }, alto: { l: 'Alto (−3,0)', v: -3.0 } };
  const PromoHead = html`<header className="ph"><div><div className="eyebrow">Simulador · Promociones y margen</div><h1>¿Qué descuento conviene y cuánto margen cuesta?</h1><p>Elasticidad constante sobre tus costos y unidades semanales. La elasticidad es un supuesto explícito, salvo que la midas en Revenue Learning.</p></div></header>`;
  A.Promo = function (props) {
    const { E, go, P } = props;
    if (!E.hasUnits || !E.cats.length) return html`<div className="page">${PromoHead}<${Empty} icon="lock" title="Este módulo necesita costos y unidades semanales" action=${P.priv ? html`<button type="button" className="btn primary" onClick=${() => go(P.config ? 'data' : 'privados', { sub: 'privados' })}>Cargar costos y ventas</button>` : null}>Sube un archivo con costo y unidades semanales por SKU. Sin esos datos no se puede estimar el efecto de un descuento en ingresos ni en margen.<//></div>`;
    return html`<${PromoInner} ...${props} />`;
  };
  function PromoInner({ E, P }) {
    const [cid, setCid] = useState(E.cats[0].id);
    const [scope, setScope] = useState('all');
    const [disc, setDisc] = useState(20);
    const [el, setEl] = useState(E.cfg.measured ? 'measured' : 'med');
    const [saved, setSaved] = useState([]);
    const cat = E.D.catById[cid], mk = E.mk, pol = E.cfg.policy;
    const ev = el === 'measured' && E.cfg.measured ? E.cfg.measured.v : ELAST[el === 'measured' ? 'med' : el].v;
    const prods = (E.own[cid] || []).filter((p) => p.cost > 0 && p.units > 0 && (scope === 'all' || p.collection === scope || TP.BAND_NAMES[TP.bandOf(p.list, E.band[cid])] === scope));
    const calc = (d) => {
      let r0 = 0, r1 = 0, g0 = 0, g1 = 0, u0 = 0, u1 = 0, under = 0;
      prods.forEach((p) => { const u = p.units; const np = TP.roundPrice(p.list * (1 - d), mk, pol.rounding); const nu = u * Math.pow(np / p.list, ev); r0 += p.list * u; r1 += np * nu; g0 += (p.list - p.cost) * u; g1 += (np - p.cost) * nu; u0 += u; u1 += nu; if ((np - p.cost) / np < pol.promoMinMargin) under++; });
      return { r0, r1, g0, g1, u0, u1, under };
    };
    const c = calc(disc / 100);
    const curve = Array.from({ length: 11 }, (_, i) => i * 5).map((d) => ({ d, ...calc(d / 100) }));
    const best = curve.reduce((a, x) => (x.g1 > a.g1 ? x : a), curve[0]);
    const scopes = [{ v: 'all', l: 'Toda la categoría' }, ...[...new Set((E.own[cid] || []).map((p) => p.collection))].slice(0, 12).map((x) => ({ v: x, l: 'Etiqueta ' + x })), ...TP.BAND_NAMES.map((x) => ({ v: x, l: 'Franja ' + x }))];
    return html`<div className="page">${PromoHead}
      <div className="launch">
        <section className="panel lform">
          <${Select} id="pr-cat" label="Categoría" value=${cid} onChange=${(v) => { setCid(v); setScope('all'); }} options=${E.cats.map((x) => ({ v: x.id, l: x.name }))} />
          <${Select} id="pr-scope" label="Alcance" value=${scope} onChange=${setScope} options=${scopes} />
          <label className="fld" htmlFor="pr-d"><span>Descuento: <b>${disc} %</b></span><input id="pr-d" type="range" min="0" max="50" step="5" value=${disc} onInput=${(e) => setDisc(+e.target.value)} /></label>
          <div className="fld"><span>Elasticidad precio</span><${Seg} label="Elasticidad" value=${el} onChange=${setEl} options=${[...Object.entries(ELAST).map(([k, v]) => ({ v: k, l: v.l })), ...(E.cfg.measured ? [{ v: 'measured', l: 'Medida (' + E.cfg.measured.v.toFixed(1).replace('.', ',') + ')' }] : [])]} /></div>
          <p className="muted sm">${prods.length} productos con costo y unidades · margen mínimo en promoción ${Math.round(pol.promoMinMargin * 100)} %.</p>
        </section>
        <section className="lout">${prods.length ? html`<div className="panel">
          <div className="kpis compact">
            <div className="kpi"><span>Ingresos</span><b className=${c.r1 >= c.r0 ? 't-up' : 't-down'}>${TP.pct(c.r1 / c.r0 - 1, 1)}</b><em>${TP.fmt(c.r0, mk, true)} → ${TP.fmt(c.r1, mk, true)} por semana</em></div>
            <div className="kpi"><span>Margen bruto</span><b className=${c.g1 >= c.g0 ? 't-up' : 't-down'}>${TP.pct(c.g1 / c.g0 - 1, 1)}</b><em>${TP.fmt(c.g0, mk, true)} → ${TP.fmt(c.g1, mk, true)}</em></div>
            <div className="kpi"><span>Unidades</span><b>${TP.pct(c.u1 / c.u0 - 1, 0)}</b><em>por semana</em></div>
            <div className="kpi"><span>Bajo el margen mínimo</span><b className=${c.under ? 't-down' : ''}>${c.under}</b><em>productos</em></div>
          </div>
          <${UI.Lines} xs=${curve.map((x) => x.d)} series=${[{ name: 'Ingresos (índice)', ys: curve.map((x) => (x.r1 / x.r0) * 100), slot: 1 }, { name: 'Margen bruto (índice)', ys: curve.map((x) => (x.g1 / x.g0) * 100), slot: 2 }]} markers=${[{ x: disc, label: 'Escenario ' + disc + ' %' }]} yFmt=${(v) => Math.round(v)} xLabel="Descuento (%)" />
          <p className="insight"><${Icon} n="spark" />Con elasticidad ${ev.toFixed(1).replace('.', ',')}, el margen bruto se maximiza con ${best.d} % de descuento en este alcance.${best.d === 0 ? ' Descontar no recupera margen con este supuesto.' : ''}</p>
          <div className="mapact"><button type="button" className="btn sm" disabled=${saved.length >= 3} onClick=${() => setSaved([...saved, { id: Date.now(), cat: cat.short, scope: scopes.find((x) => x.v === scope).l, disc, ev, ...c }])}>Guardar escenario (${saved.length}/3)</button></div>
        </div>` : html`<${Empty} title="Ningún producto con costo y unidades en este alcance" />`}
        ${saved.length ? html`<section className="panel"><h2>Comparar escenarios</h2><div className="tw"><table className="tbl"><thead><tr><th>Escenario</th><th className="num">Descuento</th><th className="num">Elasticidad</th><th className="num">Ingresos</th><th className="num">Margen</th><th className="num">Bajo mínimo</th><th></th></tr></thead><tbody>${saved.map((x) => html`<tr key=${x.id}><td><b>${x.cat}</b><small>${x.scope}</small></td><td className="num">${x.disc} %</td><td className="num">${x.ev.toFixed(1).replace('.', ',')}</td><td className="num">${TP.pct(x.r1 / x.r0 - 1, 1)}</td><td className="num">${TP.pct(x.g1 / x.g0 - 1, 1)}</td><td className="num">${x.under}</td><td><div className="mapact"><button type="button" className="btn sm" disabled=${!P.write} onClick=${() => A.propose({ pid: 'promo-' + x.id, cat: cid, name: 'Promoción ' + x.cat + ' · ' + x.scope, from: null, to: null, detail: '−' + x.disc + ' %', kind: 'Descuento', note: 'Margen ' + TP.pct(x.g1 / x.g0 - 1, 1) + ' · elasticidad ' + x.ev.toFixed(1) })}>A aprobación</button><button className="linkbtn" type="button" onClick=${() => setSaved(saved.filter((y) => y.id !== x.id))}>Quitar</button></div></td></tr>`)}</tbody></table></div></section>` : null}
        </section></div></div>`;
  }

  /* =========================================================
     PULSE WTP (encuestas propias; se importan las respuestas)
     ========================================================= */
  const METHODS = {
    vw: { n: 'Van Westendorp', why: 'Sirve cuando no hay un precio de referencia claro: entrega un rango de precios aceptables.', size: 300 },
    gg: { n: 'Gabor-Granger', why: 'Sirve para elegir entre pocos precios concretos de un producto existente: entrega una curva de intención de compra declarada.', size: 250 },
    cj: { n: 'Conjoint por calificación', why: 'Sirve para decidir qué atributos vale la pena mejorar: estima la importancia relativa de cada atributo y del precio.', size: 200 },
  };
  A.pulseRecs = function (E, extra) {
    const recs = [...(extra || [])];
    E.cats.filter((c) => !E.model[c.id].ok && E.own[c.id].length).forEach((c) => recs.push({ cat: c.id, method: 'vw', target: c.name, why: `En ${c.name} no hay comparables suficientes para estimar precio (${E.model[c.id].n} de ${E.model[c.id].need}). Un Van Westendorp da un rango de referencia mientras se completa la muestra.`, center: TP.median(E.own[c.id].map((p) => p.list)) }));
    let bestCap = null;
    E.cats.filter((c) => E.model[c.id].ok).forEach((c) => { [...new Set(E.own[c.id].map((p) => p.collection))].forEach((k) => { const ds = E.diag[c.id].filter((d) => d.p.collection === k && isFinite(d.gap)); if (ds.length >= 3) { const g = TP.mean(ds.map((d) => d.gap)); if (!bestCap || g < bestCap.g) bestCap = { c, k, g, ds }; } }); });
    if (bestCap && bestCap.g < -0.05) recs.push({ cat: bestCap.c.id, method: 'gg', target: bestCap.k, why: `«${bestCap.k}» en ${bestCap.c.name.toLowerCase()} está en promedio ${TP.pct(Math.abs(bestCap.g), 0, false)} por debajo de su estimado. Antes de subir precios, un Gabor-Granger prueba niveles concretos.`, center: TP.median(bestCap.ds.map((d) => d.est)) });
    const c0 = E.cats.find((c) => E.model[c.id].ok);
    if (c0) recs.push({ cat: c0.id, method: 'cj', target: 'Próxima colección de ' + c0.name.toLowerCase(), why: `El modelo de mercado dice cuánto se cobra por cada atributo en ${c0.name.toLowerCase()}; el Conjoint dice cuánto lo valora tu cliente.`, center: TP.median(E.own[c0.id].map((p) => p.list)) });
    return recs;
  };
  A.Pulse = function ({ E, studies, extraRecs, P }) {
    const [edit, setEdit] = useState(null);
    const recs = A.pulseRecs(E, extraRecs);
    const mk = E.mk;
    const create = async (r) => {
      const id = 's' + Date.now();
      const prices = [0.8, 0.9, 1, 1.1, 1.2].map((f) => TP.roundPrice(r.center * f, mk, 'psico'));
      const cat = E.D.catById[r.cat];
      const st = { id, name: METHODS[r.method].n + ' · ' + r.target, method: r.method, cat: r.cat, target: r.target, why: r.why, center: r.center, prices, design: r.method === 'cj' ? TP.conjointDesign(cat, [prices[0], prices[2], prices[4]], TP.hashStr(id)) : null, sample: { n: METHODS[r.method].size, seg: 'Clientes que compraron en la categoría en los últimos 12 meses', channel: 'base' }, status: 'borrador', step: 0, by: L.uid, at: nowIso() };
      await L.set('studies/' + id, st); setEdit(id);
    };
    const cur = studies.find((s) => s.id === edit);
    return html`<div className="page"><header className="ph"><div><div className="eyebrow">Pulse WTP · Voice of Customer</div><h1>¿Qué decisión necesita validarse con consumidores?</h1><p>Módulo opcional. Se recomienda solo cuando hay una decisión relevante y poca evidencia de mercado. Tú distribuyes la encuesta con tu herramienta (Google Forms, Typeform, correo) e importas las respuestas.</p></div></header>
      ${cur ? html`<${StudyBuilder} E=${E} st=${cur} close=${() => setEdit(null)} P=${P} />` : html`<div>
        <section className="panel"><h2>Estudios recomendados</h2>${recs.length ? html`<div className="recs">${recs.map((r, i) => html`<article key=${i} className="rec"><div><${Badge} tone="info">${METHODS[r.method].n}<//><h3>${r.target}</h3><p>${r.why}</p><p className="muted sm">${METHODS[r.method].why}</p></div><button type="button" className="btn sm primary" disabled=${!P.write} onClick=${() => create(r)}>Crear estudio</button></article>`)}</div>` : html`<p className="muted">Sin recomendaciones por ahora: no hay decisiones con poca evidencia.</p>`}</section>
        <section className="panel"><h2>Estudios del equipo</h2>${studies.length ? html`<div className="tw"><table className="tbl"><thead><tr><th>Estudio</th><th>Categoría</th><th>Estado</th><th>Resultado</th><th></th></tr></thead><tbody>${studies.map((s) => html`<tr key=${s.id}><td><b>${s.name}</b><small>${fmtDate(s.at)}</small></td><td>${(E.D.catById[s.cat] || {}).name || '—'}</td><td><${Badge} tone=${s.result ? 'ok' : 'info'}>${s.status}<//></td><td>${s.result && s.result.range ? TP.fmt(s.result.range[0], mk) + ' – ' + TP.fmt(s.result.range[1], mk) : s.result && s.result.importance ? 'Importancia de atributos' : '—'}</td><td><button type="button" className="btn sm" onClick=${() => setEdit(s.id)}>Abrir</button></td></tr>`)}</tbody></table></div>` : html`<${Empty} icon="pulse" title="Todavía no hay estudios">Crea uno desde una recomendación. Los resultados aparecen en Pricing Advisor y en Simulador de lanzamiento.<//>`}</section>
      </div>`}</div>`;
  };
  function questions(st, E) {
    const mk = E.mk;
    if (st.method === 'vw') return ['¿A qué precio este producto te parecería tan barato que dudarías de su calidad?', '¿A qué precio te parecería una ganga, una buena compra?', '¿A qué precio empezaría a parecerte caro, aunque lo considerarías?', '¿A qué precio sería tan caro que no lo considerarías?'];
    if (st.method === 'gg') return st.prices.map((p) => `Si este producto costara ${TP.fmt(p, mk)}, ¿qué tan probable es que lo compres? (1 = nada probable, 5 = muy probable)`);
    return st.design.profiles.map((p) => `${p.id}: ${st.design.attrs.map((a, j) => a.name + ': ' + a.levels[[1, 3, 5].indexOf(p.lv[j])]).join(' · ')} · precio ${TP.fmt(st.design.prices[p.price], mk)} — Califica de 0 (no lo compraría) a 10 (lo compraría seguro)`);
  }
  function StudyBuilder({ E, st, close, P }) {
    const mk = E.mk, cat = E.D.catById[st.cat] || { name: '' };
    const steps = ['Método', 'Cuestionario', 'Muestra y distribución', 'Respuestas', 'Resultados'];
    const step = st.step || 0;
    const upd = (patch) => L.set('studies/' + st.id, { ...st, ...patch });
    const go = (n) => upd({ step: n });
    const Q = questions(st, E);
    const [err, setErr] = useState('');
    const head = st.method === 'vw' ? ['demasiado_barato', 'barato', 'caro', 'demasiado_caro'] : st.method === 'gg' ? st.prices.map((p) => 'precio_' + Math.round(p)) : st.design.profiles.map((p) => p.id.toLowerCase());
    const tpl = () => L.download('respuestas_' + st.method + '.csv', L.csv([['respondente', ...head]]));
    const copyQ = (e) => { const b = e.currentTarget; const t = Q.map((q, i) => i + 1 + '. ' + q).join('\n'); navigator.clipboard && navigator.clipboard.writeText(t).then(() => (b.textContent = 'Copiado'), () => (b.textContent = 'Selecciona y copia el texto')); };
    const importR = async (e) => {
      const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return; setErr('');
      try {
        const r = await I.readFile(f);
        const rows = r.rows || I.csvRows(r.text);
        const num = (v) => { if (v === 0 || v === '0') return 0; const n = I.parseMoney(v); return n == null ? NaN : n; };
        const mat = rows.map((x) => head.map((h) => { const k = Object.keys(x).find((kk) => TP.strip(kk).trim().replace(/\s+/g, '_') === h); return k ? num(x[k]) : NaN; }));
        let result;
        if (st.method === 'vw') { const v = TP.vwFromResponses(mat); if (v.error) throw new Error(v.error); result = { range: [v.pmc, v.pme], opp: v.opp, ipp: v.ipp, n: v.n, discarded: v.discarded, grid: v.grid.filter((_, i) => i % 3 === 0), curves: Object.fromEntries(Object.entries(v.curves).map(([k, a]) => [k, a.filter((_, i) => i % 3 === 0)])) }; }
        else if (st.method === 'gg') { const g = TP.ggFromResponses(st.prices, mat); if (g.error) throw new Error(g.error); const acc = g.pts.filter((x) => x.s >= 0.45); result = { pts: g.pts, best: g.best, n: g.n, range: acc.length ? [acc[0].p, acc[acc.length - 1].p] : null }; }
        else { const c = TP.conjointEstimate(st.design, mat); if (c.error) throw new Error(c.error); result = { importance: c.importance, rows: c.rows.map((x) => ({ name: x.attr.name, levels: x.levels, pw: x.pw })), pricePw: c.pricePw, n: c.n }; }
        await upd({ result, status: 'resultados', step: 4, importedAt: nowIso() });
      } catch (x) { setErr(x.message || 'No se pudo leer el archivo.'); }
    };
    return html`<section className="panel builder">
      <div className="row-between"><div><span className="eyebrow">${METHODS[st.method].n} · ${cat.name}</span><h2>${st.target}</h2></div><button type="button" className="btn sm ghost" onClick=${close}>Volver a estudios</button></div>
      <ol className="ob-steps small">${steps.map((s, i) => html`<li key=${i} className=${i === step ? 'cur' : i < step ? 'done' : ''}><button type="button" disabled=${i > step && !(i === 4 && st.result)} onClick=${() => go(i)}><span>${i < step ? html`<${Icon} n="check" s=${12} />` : i + 1}</span>${s}</button></li>`)}</ol>
      ${step === 0 ? html`<div><p>${st.why}</p><p className="muted">${METHODS[st.method].why}</p><div className="ob-actions"><button className="btn primary" type="button" disabled=${!P.write} onClick=${() => go(1)}>Ver cuestionario</button></div></div>` : null}
      ${step === 1 ? html`<div><p className="muted">Generado a partir de la categoría, sus atributos y el precio de referencia (${TP.fmt(st.center, mk)}). Muestra una foto o descripción del producto antes de las preguntas.</p><ol className="qlist">${Q.map((q, i) => html`<li key=${i}>${q}</li>`)}</ol><p className="muted sm">Agrega una pregunta filtro (¿compraste en esta categoría en los últimos 12 meses?) y una de control de atención.</p><div className="ob-actions"><button className="btn ghost" type="button" onClick=${copyQ}>Copiar preguntas</button><button className="btn primary" type="button" disabled=${!P.write} onClick=${() => go(2)}>Continuar</button></div></div>` : null}
      ${step === 2 ? html`<div className="two">
        <label className="fld" htmlFor="sb-n"><span>Tamaño de muestra objetivo</span><input id="sb-n" type="number" min="30" max="5000" value=${st.sample.n} onChange=${(e) => upd({ sample: { ...st.sample, n: TP.clamp(+e.target.value || 30, 30, 5000) } })} /></label>
        <${Select} id="sb-ch" label="Distribución" value=${st.sample.channel} onChange=${(v) => upd({ sample: { ...st.sample, channel: v } })} options=${[{ v: 'base', l: 'Base de clientes (correo o WhatsApp)' }, { v: 'panel', l: 'Panel externo de consumidores' }, { v: 'web', l: 'Intercepción en la tienda online' }]} />
        <label className="fld wide" htmlFor="sb-seg"><span>Segmento</span><input id="sb-seg" type="text" value=${st.sample.seg} onChange=${(e) => upd({ sample: { ...st.sample, seg: e.target.value } })} /></label>
        <p className="muted sm wide">Con ${st.sample.n} respuestas, el margen de error de una proporción es cercano a ±${Math.round(98 / Math.sqrt(st.sample.n))} puntos (95 %). Crea la encuesta en tu herramienta con las preguntas del paso anterior y exporta las respuestas con las columnas de la plantilla.</p>
        <div className="ob-actions wide"><button className="btn" type="button" onClick=${tpl}>Descargar plantilla de respuestas</button><button className="btn primary" type="button" disabled=${!P.write} onClick=${() => upd({ step: 3, status: 'en campo' })}>Marcar como en campo</button></div></div>` : null}
      ${step === 3 ? html`<div><p>Columnas esperadas: <span className="mono">${head.join(', ')}</span> (una fila por persona${st.method === 'vw' ? ', precios en ' + mk.currency : st.method === 'gg' ? ', respuestas de 1 a 5' : ', calificaciones de 0 a 10'}).</p>
        <div className="mapact"><label className=${'btn primary ' + (P.write ? '' : 'disabled')} htmlFor="sb-imp"><${Icon} n="upload" />Importar respuestas (CSV o Excel)</label><input id="sb-imp" type="file" accept=".csv,.txt,.xlsx,.xls" className="sr" disabled=${!P.write} onChange=${importR} /><button className="btn" type="button" onClick=${tpl}>Plantilla</button></div>
        ${err ? html`<div className="err">${err}</div>` : null}</div>` : null}
      ${step === 4 && st.result ? html`<${StudyResults} E=${E} st=${st} />` : null}
    </section>`;
  }
  function StudyResults({ E, st }) {
    const mk = E.mk, r = st.result;
    if (st.method === 'vw') return html`<div><p className="muted sm">${r.n} respuestas válidas${r.discarded ? ', ' + r.discarded + ' descartadas por inconsistentes' : ''}.</p>
      <div className="kpis compact"><div className="kpi"><span>Rango aceptable</span><b>${TP.fmt(r.range[0], mk, true)} – ${TP.fmt(r.range[1], mk, true)}</b><em>PMC a PME</em></div><div className="kpi"><span>Precio óptimo (OPP)</span><b>${TP.fmt(r.opp, mk, true)}</b><em>menor rechazo</em></div><div className="kpi"><span>Indiferencia (IPP)</span><b>${TP.fmt(r.ipp, mk, true)}</b><em>tan barato como caro</em></div></div>
      <${UI.Lines} xs=${r.grid} xLog=${true} mk=${mk} yMax=${1} yFmt=${(x) => Math.round(x * 100) + ' %'} series=${[{ name: 'Demasiado barato', ys: r.curves.tooCheap, slot: 1, dash: true }, { name: 'Barato', ys: r.curves.cheap, slot: 1 }, { name: 'Caro', ys: r.curves.expensive, slot: 2 }, { name: 'Demasiado caro', ys: r.curves.tooExpensive, slot: 2, dash: true }]} markers=${[{ x: r.range[0], label: 'PMC' }, { x: r.opp, label: 'OPP' }, { x: r.ipp, label: 'IPP' }, { x: r.range[1], label: 'PME' }]} xLabel="Precio" />
      <details className="assum" open><summary>Limitaciones</summary><ul><li>Mide percepción declarada, no comportamiento de compra.</li><li>No considera la competencia en el momento de la compra; compleméntalo con el modelo de mercado.</li><li>El rango se muestra en Pricing Advisor y Simulador de lanzamiento de esta categoría.</li></ul></details></div>`;
    if (st.method === 'gg') return html`<div><p className="muted sm">${r.n} respuestas válidas.</p>
      <${UI.Lines} xs=${r.pts.map((x) => x.p)} mk=${mk} yMax=${1} yFmt=${(x) => Math.round(x * 100) + ' %'} series=${[{ name: 'Intención de compra declarada (4 y 5)', ys: r.pts.map((x) => x.s), slot: 1 }, { name: 'Ingreso relativo (precio × intención)', ys: r.pts.map((x) => x.rev / r.best.rev), slot: 2, dash: true }]} markers=${[{ x: r.best.p, label: 'Máximo ingreso declarado' }]} xLabel="Precio probado" />
      <p className="insight"><${Icon} n="spark" />El ingreso declarado es máximo en ${TP.fmt(r.best.p, mk)} con ${Math.round(r.best.s * 100)} % de intención. La intención declarada suele sobreestimar la compra real; no la trates como ventas garantizadas.</p></div>`;
    return html`<div><p className="muted sm">${r.n} encuestados.</p>
      <div className="grid-2"><div><h3>Importancia relativa</h3><div className="paired">${r.importance.map((x) => html`<div key=${x.name} className="prow"><div className="plab">${x.name}</div><div className="pbars"><div className="pb mkt" style=${{ width: (x.v * 100) / r.importance[0].v + '%' }}></div></div><div className="pval"><span>${Math.round(x.v * 100)} %</span></div></div>`)}</div></div>
      <div><h3>Utilidades por nivel</h3><div className="tw"><table className="tbl"><thead><tr><th>Atributo</th><th className="num">Bajo</th><th className="num">Medio</th><th className="num">Alto</th></tr></thead><tbody>${r.rows.map((x) => html`<tr key=${x.name}><td>${x.name}</td>${x.pw.map((v, i) => html`<td key=${i} className="num" title=${x.levels[i]}>${v.toFixed(2).replace('.', ',')}</td>`)}</tr>`)}<tr><td>Precio</td>${r.pricePw.map((v, i) => html`<td key=${i} className="num">${v.toFixed(2).replace('.', ',')}</td>`)}</tr></tbody></table></div></div></div>
      <p className="foot">Utilidades en puntos de calificación, centradas en cero. La importancia indica cuánto cambia la calificación al pasar del peor al mejor nivel de cada atributo.</p></div>`;
  }

  /* =========================================================
     REVENUE LEARNING
     ========================================================= */
  A.Learning = function ({ E, ws, approvals, go, P }) {
    const done = approvals.filter((a) => a.status === 'aprobado' && a.from && a.to && E.D.byId[a.pid]);
    const weekly = {};
    const keyOf = (p) => [p.sku && TP.strip(p.sku), TP.strip(p.name)].filter(Boolean);
    const salesRows = {}; Object.values(ws.sales || {}).forEach((d) => Object.assign(salesRows, d.rows || {}));
    E.D.products.filter((p) => p.brand === 'own').forEach((p) => { const k = keyOf(p).find((x) => salesRows[x]); if (k) weekly[p.id] = salesRows[k]; });
    const hasSales = Object.keys(weekly).length > 0;
    const changed = new Set(done.map((a) => a.pid));
    const ms = done.map((a) => { const p = E.D.byId[a.pid]; const ctrls = E.own[p.cat] ? E.own[p.cat].filter((q) => !changed.has(q.id) && weekly[q.id]).map((q) => q.id) : []; return { a, m: TP.did(weekly, { pid: a.pid, at: a.appliedAt || a.decidedAt, from: a.from, to: a.to }, ctrls) }; });
    const ok = ms.filter((x) => !x.m.error);
    const agg = ok.length ? TP.median(ok.map((x) => x.m.e)) : null;
    const corrections = Object.values(E.dec.map).filter(Boolean).length + Object.values(E.dec.comp).filter(Boolean).length + Object.values(ws.fixes || {}).reduce((s, f) => s + Object.keys(f.items || {}).length, 0);
    const setApplied = (a, v) => L.set('approvals/' + a.id, { ...a, appliedAt: v ? new Date(v).toISOString() : null });
    return html`<div className="page"><header className="ph"><div><div className="eyebrow">Revenue Learning</div><h1>¿Qué pasó después de cambiar los precios?</h1><p>Mide cada cambio aprobado contra productos similares que no cambiaron (diferencias en diferencias) y alimenta la elasticidad del Simulador de promociones.</p></div></header>
      <div className="kpis compact"><div className="kpi"><span>Cambios aprobados</span><b>${done.length}</b><em>de productos de tu catálogo</em></div><div className="kpi"><span>Productos con ventas semanales</span><b>${Object.keys(weekly).length}</b><em>${hasSales ? 'cargadas desde tus archivos' : 'sin ventas cargadas'}</em></div><div className="kpi"><span>Elasticidad observada (mediana)</span><b>${agg != null ? agg.toFixed(1).replace('.', ',') : '—'}</b><em>${ok.length} cambios medibles</em></div><div className="kpi"><span>Correcciones del equipo</span><b>${corrections}</b><em>clasificaciones, equivalencias y comparables</em></div></div>
      ${!done.length ? html`<${Empty} icon="learning" title="Aún no hay cambios aprobados para medir" action=${html`<button className="btn primary" type="button" onClick=${() => go('advisor', {})}>Ir al Pricing Advisor</button>`}>Cuando se apruebe un cambio de precio y cargues las ventas semanales, aquí verás su efecto frente a productos similares.<//>` : !hasSales ? html`<${Empty} icon="lock" title="Medir requiere ventas semanales" action=${html`<button className="btn primary" type="button" onClick=${() => go(P.config ? 'data' : 'privados', { sub: 'privados' })}>Cargar ventas</button>`}>Hay ${done.length} cambios aprobados listos para medir.<//>` : html`<div>
        ${agg != null && agg >= 0 ? html`<${Note} tone="warn">La elasticidad observada no es negativa (${agg.toFixed(1).replace('.', ',')}): las ventas no bajaron al subir el precio, o algo más cambió al mismo tiempo (temporada, inventario, campañas). No se recomienda usarla para simular promociones; mide más cambios.<//>` : null}
        ${agg != null && agg < 0 ? html`<div className="mapact"><button type="button" className="btn sm primary" disabled=${!P.write} onClick=${() => A.saveConfig(ws, { measured: { v: agg, at: nowIso(), n: ok.length } })}>Usar ${agg.toFixed(1).replace('.', ',')} en Simulador de promociones</button>${E.cfg.measured ? html`<${Badge} tone="ok">En uso: ${E.cfg.measured.v.toFixed(1).replace('.', ',')}<//>` : null}</div>` : null}
        ${ms.map(({ a, m }) => html`<section key=${a.id} className="panel"><div className="row-between"><div><h2>${a.name}</h2><span className="muted">${TP.fmt(a.from, E.mk)} → ${TP.fmt(a.to, E.mk)} (${TP.pct(a.to / a.from - 1, 1)})</span></div>
            <label className="fld compact" htmlFor=${'ap-' + a.id}><span>Fecha en que se aplicó en tienda</span><input id=${'ap-' + a.id} type="date" value=${(a.appliedAt || a.decidedAt || '').slice(0, 10)} disabled=${!P.write} onChange=${(e) => setApplied(a, e.target.value)} /></label>
            ${!m.error ? html`<div className="capk"><span>Elasticidad observada</span><b>${m.e.toFixed(1).replace('.', ',')}</b><em className="muted sm">IC 90 % ${m.lo.toFixed(1).replace('.', ',')} a ${m.hi.toFixed(1).replace('.', ',')}</em></div>` : null}</div>
          ${m.error ? html`<${Note} tone="warn">${m.error}<//>` : html`<${UI.Lines} xs=${m.weeks.map((t, i) => i)} series=${[{ name: 'Producto con cambio', ys: m.trt.map((v) => v || 0), slot: 2 }, { name: 'Control (similares sin cambio, promedio)', ys: m.ctl.map((v) => (isFinite(v) ? v : 0)), slot: 1, dash: true }]} markers=${[{ x: m.weeks.findIndex((t) => t >= m.t0) - 0.5, label: 'Cambio de precio' }]} yFmt=${(v) => Math.round(v)} xLabel="Semana" />`}</section>`)}
      </div>`}</div>`;
  };

  /* =========================================================
     CONFIGURACIÓN
     ========================================================= */
  A.Config = function ({ E, ws, sub, setSub, P, D }) {
    const SUB = [['competidores', 'Competidores activos'], ['atributos', 'Atributos del modelo'], ['franjas', 'Franjas'], ['politicas', 'Políticas'], ['accesos', 'Accesos'], ['acerca', 'Alcance y límites']];
    const cfg = { ...A.defaultConfig(), ...(ws.ws.config || {}) };
    const mk = TP.MARKETS[cfg.market];
    const save = (patch) => A.saveConfig(ws, patch);
    const pol = (k, v) => save({ policy: { ...cfg.policy, [k]: v } });
    const [cc, setCc] = useState(E && E.cats[0] ? E.cats[0].id : null);
    const views = {
      competidores: html`<section className="panel"><p className="muted">Competidores que alimentan las equivalencias, los comparables y los modelos. Para agregar o importar, ve a Catálogo y clasificación.</p><div className="tw"><table className="tbl"><thead><tr><th>Marca</th><th>Tienda</th><th className="num">Productos</th><th className="num">Clasificados</th><th>Incluir</th></tr></thead><tbody>
        ${Object.entries(ws.stores).filter(([id]) => id !== 'own').map(([id, s]) => { const on = cfg.comps.includes(id); return html`<tr key=${id}><td><b>${s.name}</b></td><td>${s.url ? I.hostOf(s.url) : '—'}</td><td className="num">${s.n || 0}</td><td className="num">${D ? D.products.filter((p) => p.brand === id && p.cat).length : 0}</td><td><label className="tgl" htmlFor=${'cmp-' + id}><input id=${'cmp-' + id} type="checkbox" checked=${on} disabled=${!P.write} onChange=${() => save({ comps: on ? cfg.comps.filter((x) => x !== id) : [...cfg.comps, id] })} />${on ? 'Incluido' : 'Excluido'}</label></td></tr>`; })}
      </tbody></table></div></section>`,
      atributos: E && cc && E.D.catById[cc] ? html`<section className="panel"><${Select} id="cf-cat" label="Categoría" value=${cc} onChange=${setCc} options=${E.cats.map((c) => ({ v: c.id, l: c.name }))} compact />
        ${(() => { const c = E.D.catById[cc], m = E.model[cc] || { ok: false, reason: 'muestra', n: 0, need: 0 }, off = cfg.attrsOff[cc] || []; return html`<div><p className="muted">Modelo actual: ${m.ok ? 'R² validación ' + m.r2cv.toFixed(2).replace('.', ',') + ' · confiabilidad ' + m.reliability.toLowerCase() : TP.REASON_TEXT[m.reason] + ' (' + m.n + ' de ' + m.need + ')'}. Desactivar un atributo reentrena el modelo al instante. Para editar niveles, ve a Catálogo y clasificación › Categorías.</p>
          <div className="tw"><table className="tbl"><thead><tr><th>Atributo</th><th>Niveles</th><th>En el modelo</th></tr></thead><tbody>${c.attrs.map((a) => html`<tr key=${a.id} className=${off.includes(a.id) ? 'muted' : ''}><td><b>${a.name}</b></td><td className="sm">${a.levels.join(' → ')}</td><td><label className="tgl" htmlFor=${'att-' + a.id}><input id=${'att-' + a.id} type="checkbox" checked=${!off.includes(a.id)} disabled=${!P.write} onChange=${() => save({ attrsOff: { ...cfg.attrsOff, [cc]: off.includes(a.id) ? off.filter((x) => x !== a.id) : [...off, a.id] } })} />Activo</label></td></tr>`)}</tbody></table></div></div>`; })()}</section>` : html`<${Empty} title="Sin categorías analizadas" />`,
      franjas: E && E.cats.length ? html`<section className="panel">${E.cats.map((c) => html`<div key=${c.id} className="frow"><b>${c.name}</b><${A.BandEditor} E=${E} catId=${c.id} setCfg=${(n) => save({ franjas: n.franjas })} /></div>`)}<p className="foot">Por defecto, terciles de los precios de lista de la competencia. Ajustables por categoría.</p></section>` : html`<${Empty} title="Sin categorías analizadas" />`,
      politicas: html`<section className="panel pols">
        <${Select} id="po-mk" label="Mercado y moneda de los precios" value=${cfg.market} onChange=${(v) => save({ market: v })} options=${Object.values(TP.MARKETS).map((m) => ({ v: m.id, l: m.name + ' · ' + m.currency }))} />
        <label className="fld" htmlFor="po-mm"><span>Margen bruto mínimo: <b>${Math.round(cfg.policy.minMargin * 100)} %</b></span><input id="po-mm" type="range" min="0.2" max="0.8" step="0.01" value=${cfg.policy.minMargin} disabled=${!P.write} onChange=${(e) => pol('minMargin', +e.target.value)} /></label>
        <label className="fld" htmlFor="po-pm"><span>Margen mínimo en promoción: <b>${Math.round(cfg.policy.promoMinMargin * 100)} %</b></span><input id="po-pm" type="range" min="0.1" max="0.6" step="0.01" value=${cfg.policy.promoMinMargin} disabled=${!P.write} onChange=${(e) => pol('promoMinMargin', +e.target.value)} /></label>
        <label className="fld" htmlFor="po-mc"><span>Tope de cambio por ciclo: <b>±${Math.round(cfg.policy.maxChange * 100)} %</b></span><input id="po-mc" type="range" min="0.03" max="0.3" step="0.01" value=${cfg.policy.maxChange} disabled=${!P.write} onChange=${(e) => pol('maxChange', +e.target.value)} /></label>
        <${Select} id="po-rd" label="Redondeo" value=${cfg.policy.rounding} onChange=${(v) => pol('rounding', v)} options=${Object.entries(TP.ROUNDING).map(([v, l]) => ({ v, l: v === 'psico' ? l + ': ' + TP.roundingExample(mk) : v === 'multiplo' ? l + ' de ' + TP.fmt(mk.step, mk) : l }))} />
        <${Select} id="po-ob" label="Prioridad del equipo" value=${cfg.objective} onChange=${(v) => save({ objective: v })} options=${A.OBJECTIVES.map((o) => ({ v: o.v, l: o.l }))} />
        <p className="muted sm">Los precios importados se interpretan en la moneda elegida; no se convierten.</p></section>`,
      accesos: html`<section className="panel"><p>Los accesos de cada cuenta se crean en <b>Usuarios</b>. Roles:</p><div className="tw"><table className="tbl"><thead><tr><th>Rol</th><th>Ver análisis</th><th>Proponer cambios y estudios</th><th>Aprobar cambios</th><th>Costos y ventas</th><th>Configurar la cuenta</th></tr></thead><tbody>
        <tr><td><b>Administrador Tita</b></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr><tr><td><b>Administrador del cliente</b></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>—</td></tr><tr><td><b>Analista</b></td><td>✓</td><td>✓</td><td>—</td><td>—</td><td>—</td></tr><tr><td><b>Lectura</b></td><td>✓</td><td>—</td><td>—</td><td>—</td><td>—</td></tr></tbody></table></div>
        <p className="muted sm">Los permisos se validan en el servidor; ocultar un botón no es la única protección.</p></section>`,
      acerca: html`<div className="grid-2">
        <section className="panel"><h2><${Badge} tone="ok">Automático<//></h2><ul className="plain"><li>Lectura de catálogos públicos (Shopify, WooCommerce, VTEX) respetando robots.txt, y actualización diaria con registro de cambios de precio</li><li>Mapeo de etiquetas y clasificación de atributos con IA en segundo plano, con evidencia; los dudosos van a revisión</li><li>Homologación, comparables, modelo hedónico con validación cruzada y abstención, diagnóstico y vistas de mercado</li><li>Copiloto con IA sobre los datos de la cuenta</li></ul></section>
        <section className="panel"><h2><${Badge} tone="warn">Manual en esta versión<//></h2><ul className="plain"><li>Tiendas sin catálogo público: importación por archivo o por texto de página (la IA extrae los productos)</li><li>Costos, rotación y ventas: carga de archivos CSV o Excel</li><li>Precios aprobados: archivo CSV para cargar en el ERP o la tienda</li><li>Encuestas Pulse: se distribuyen con la herramienta del cliente y se importan</li><li>Fotos de la competencia: la clasificación usa nombre y ficha</li></ul></section></div>`,
    };
    return html`<div className="page"><header className="ph"><div><div className="eyebrow">Configuration</div><h1>Configuración</h1><p>Lo que el negocio define y el sistema usa. Todo cambio se guarda para el equipo y recalcula el análisis.</p></div></header>
      <nav className="tabs">${SUB.map(([k, l]) => html`<button key=${k} type="button" className=${sub === k ? 'on' : ''} onClick=${() => setSub(k)}>${l}</button>`)}</nav>
      ${views[sub] || views.competidores}</div>`;
  };
})();
