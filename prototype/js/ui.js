/* TITA Pricing Intelligence 360° — componentes base y visualizaciones (SVG propio). */
(function () {
  'use strict';
  const { useState, useMemo, useRef } = React;
  const html = htm.bind(React.createElement);
  const TP = window.TP;
  const UI = (TP.ui = { html });

  /* ---------- íconos (trazo 1.6, 16px) ---------- */
  const P = {
    overview: 'M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z',
    market: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3.5 5.5-2 5-5 2 2-5z',
    advisor: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
    launch: 'M5 19l4-1 9-9a2.8 2.8 0 0 0-4-4l-9 9-1 4zM13 6l4 4',
    promo: 'M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01',
    pulse: 'M4 5h16v11H9l-5 4zM8 10h8M8 13h5',
    learning: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
    config: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6',
    spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    x: 'M6 6l12 12M18 6L6 18',
    chev: 'M9 6l6 6-6 6',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01',
    alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    menu: 'M4 7h16M4 12h16M4 17h16',
    send: 'M4 12l16-8-6 16-2-6z',
    store: 'M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6',
    lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
    flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  };
  UI.Icon = ({ n, s = 16, cls = '' }) => html`<svg className=${'ic ' + cls} width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d=${P[n] || P.info} /></svg>`;

  /* ---------- imagen ilustrativa del producto (no es la foto real) ---------- */
  const COLORS = { Negro: '#2b2b2e', Café: '#6b4428', Camel: '#b98a52', Vino: '#6e1f2e', Beige: '#d8c6a5', 'Verde oliva': '#6b6b3a', 'Azul noche': '#23324f', 'Rosa palo': '#d9a8a5', Blanco: '#ecebe6', Nude: '#d6b49a', Gris: '#8b8d91', Arena: '#cdb994', 'Verde salvia': '#93a48a', Terracota: '#b8613f', 'Azul petróleo': '#2f5a63', Natural: '#c9a77a', Nogal: '#5d4030', Latón: '#b8963e' };
  const KEYS = [['negro', '#2b2b2e'], ['blanco', '#ecebe6'], ['marfil', '#e9e2cf'], ['crema', '#e6dcc3'], ['beige', '#d8c6a5'], ['arena', '#cdb994'], ['nude', '#d6b49a'], ['camel', '#b98a52'], ['cafe', '#6b4428'], ['marron', '#6b4428'], ['chocolate', '#4e3020'], ['cognac', '#9a5a2c'], ['miel', '#c08a3e'], ['vino', '#6e1f2e'], ['burdeo', '#6e1f2e'], ['rojo', '#b3332e'], ['rosa', '#d9a8a5'], ['fucsia', '#c2387a'], ['naranja', '#d9772f'], ['terracota', '#b8613f'], ['mostaza', '#c79a2c'], ['amarillo', '#e3c34a'], ['oliva', '#6b6b3a'], ['salvia', '#93a48a'], ['verde', '#3f7a52'], ['turquesa', '#2f9a9a'], ['petroleo', '#2f5a63'], ['azul', '#2c4f8a'], ['navy', '#23324f'], ['morado', '#6a4a8a'], ['lila', '#a48bc4'], ['gris', '#8b8d91'], ['plata', '#b8bcc2'], ['dorado', '#b8963e'], ['laton', '#b8963e'], ['natural', '#c9a77a'], ['nogal', '#5d4030'], ['madera', '#9a6e45'], ['multicolor', '#8a7aa8']];
  UI.colorHex = (c) => { if (COLORS[c]) return COLORS[c]; const t = TP.strip(String(c || '')); const k = KEYS.find(([w]) => t.includes(w)); return k ? k[1] : '#9aa0a8'; };
  function shape(typ, f) {
    const s = { fill: f, stroke: 'rgba(0,0,0,.35)', strokeWidth: 1 };
    const st = { fill: 'none', stroke: f, strokeWidth: 2.4, strokeLinecap: 'round' };
    const t = TP.strip(typ);
    if (/tote|shopper/.test(t)) return html`<path ...${st} d="M22 26c0-8 20-8 20 0" /><path ...${s} d="M14 26h36l-4 26H18z" />`;
    if (/bandolera/.test(t)) return html`<path ...${st} d="M18 30L32 8l14 22" /><rect ...${s} x="16" y="28" width="32" height="22" rx="5" />`;
    if (/satchel/.test(t)) return html`<path ...${st} d="M26 24c0-6 12-6 12 0" /><rect ...${s} x="14" y="24" width="36" height="26" rx="4" /><path ...${s} d="M14 26h36v9H14z" opacity=".85" />`;
    if (/clutch|billetera larga/.test(t)) return html`<rect ...${s} x="10" y="22" width="44" height="22" rx="3" /><path fill="none" stroke="rgba(0,0,0,.35)" d="M10 23l22 12 22-12" />`;
    if (/tarjetero/.test(t)) return html`<rect ...${s} x="16" y="20" width="32" height="24" rx="3" /><path fill="none" stroke="rgba(255,255,255,.5)" d="M18 27h28M18 33h28" />`;
    if (/monedero/.test(t)) return html`<path ...${s} d="M14 30h36v10a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8z" /><circle cx="28" cy="27" r="3" fill=${f} stroke="rgba(0,0,0,.35)" /><circle cx="36" cy="27" r="3" fill=${f} stroke="rgba(0,0,0,.35)" />`;
    if (/plegable/.test(t)) return html`<rect ...${s} x="14" y="18" width="36" height="28" rx="3" /><path stroke="rgba(0,0,0,.35)" d="M32 18v28" />`;
    if (/botin/.test(t)) return html`<path ...${s} d="M20 12h14v24l16 6v8H14v-8l6-2z" />`;
    if (/sandalia/.test(t)) return html`<path ...${s} d="M10 46h44v4H10z" /><path ...${st} d="M18 46l8-12M30 46l6-12M26 34h12" />`;
    if (/tenis/.test(t)) return html`<path ...${s} d="M10 44c0-8 6-14 14-14l6 4 10 2c8 2 14 4 14 8v6H10z" /><path fill="#f4f2ee" stroke="rgba(0,0,0,.3)" d="M10 46h44v4H10z" />`;
    if (/mocasin|bailarina/.test(t)) return html`<path ...${s} d="M10 46c2-8 10-12 20-12h8c8 0 16 6 16 12z" />`;
    if (/morral/.test(t)) return html`<path ...${st} d="M26 16c0-6 12-6 12 0" /><rect ...${s} x="18" y="16" width="28" height="36" rx="8" /><rect fill="rgba(0,0,0,.18)" x="23" y="34" width="18" height="12" rx="3" />`;
    if (/maleta|duffel/.test(t)) return html`<rect ...${s} x="18" y="16" width="28" height="36" rx="4" /><path ...${st} stroke="#777" d="M27 16v-5h10v5" />`;
    if (/sofa|sala de exterior/.test(t)) return html`<rect ...${s} x="8" y="26" width="48" height="16" rx="4" /><rect ...${s} x="12" y="18" width="40" height="12" rx="4" /><path stroke="#555" strokeWidth="2" d="M14 42v6M50 42v6" />`;
    if (/poltrona/.test(t)) return html`<rect ...${s} x="16" y="16" width="32" height="18" rx="6" /><rect ...${s} x="14" y="30" width="36" height="12" rx="4" /><path stroke="#555" strokeWidth="2" d="M18 42v8M46 42v8" />`;
    if (/mesa de centro/.test(t)) return html`<rect ...${s} x="10" y="30" width="44" height="6" rx="2" /><path stroke=${f} strokeWidth="3" d="M16 36v12M48 36v12" />`;
    if (/comedor/.test(t)) return html`<rect ...${s} x="10" y="26" width="44" height="5" rx="2" /><path stroke=${f} strokeWidth="3" d="M16 31v18M48 31v18" /><rect fill="#bbb" x="4" y="34" width="6" height="14" /><rect fill="#bbb" x="54" y="34" width="6" height="14" />`;
    if (/sencillo|semidoble|doble|queen|king/.test(t)) return html`<rect ...${s} x="8" y="28" width="48" height="14" rx="4" /><path fill="none" stroke="rgba(0,0,0,.2)" d="M10 33h44" />`;
    if (/lampara de pie/.test(t)) return html`<path ...${s} d="M24 10h16l4 12H20z" /><path stroke="#555" strokeWidth="2" d="M32 22v26M24 50h16" />`;
    if (/lampara de mesa/.test(t)) return html`<path ...${s} d="M22 18h20l4 12H18z" /><rect fill="#777" x="28" y="30" width="8" height="14" rx="3" /><path stroke="#555" strokeWidth="2" d="M24 46h16" />`;
    if (/colgante/.test(t)) return html`<path stroke="#555" strokeWidth="2" d="M32 6v14" /><path ...${s} d="M20 34a12 12 0 0 1 24 0z" />`;
    if (/almohada/.test(t)) return html`<rect ...${s} x="12" y="24" width="40" height="18" rx="8" />`;
    return html`<rect ...${s} x="14" y="18" width="36" height="28" rx="4" />`;
  }
  UI.Thumb = ({ p, size = 48, title }) => html`<svg className="thumb" width=${size} height=${size} viewBox="0 0 64 64" role="img" aria-label=${title || 'Imagen ilustrativa: ' + p.typ + ' ' + p.color}><rect width="64" height="64" rx="8" fill="var(--sunk)" />${shape(p.typ, UI.colorHex(p.color))}</svg>`;

  /* ---------- controles ---------- */
  UI.Badge = ({ tone = 'neutral', children, title }) => html`<span className=${'badge b-' + tone} title=${title}>${children}</span>`;
  UI.Seg = ({ options, value, onChange, label, size }) => html`<div className=${'seg ' + (size || '')} role="radiogroup" aria-label=${label}>${options.map((o) => html`<button key=${o.v} type="button" role="radio" aria-checked=${value === o.v} className=${value === o.v ? 'on' : ''} onClick=${() => onChange(o.v)}>${o.l}</button>`)}</div>`;
  UI.Select = ({ id, label, value, onChange, options, compact }) => html`<label className=${'fld ' + (compact ? 'compact' : '')} htmlFor=${id}><span>${label}</span><select id=${id} value=${value} onChange=${(e) => onChange(e.target.value)}>${options.map((o) => html`<option key=${o.v} value=${o.v}>${o.l}</option>`)}</select></label>`;
  UI.Empty = ({ icon = 'info', title, children, action }) => html`<div className="empty"><${UI.Icon} n=${icon} s=${22} /><b>${title}</b><div>${children}</div>${action}</div>`;
  UI.Note = ({ tone = 'info', children }) => html`<div className=${'note n-' + tone}><${UI.Icon} n=${tone === 'warn' ? 'alert' : 'info'} /><div>${children}</div></div>`;
  UI.SimTag = ({ children }) => html`<span className="simtag" title="Esta parte se simula en el prototipo">${children || 'Simulado'}</span>`;

  /* ---------- escalas ---------- */
  function logScale(d0, d1, r0, r1) { const a = Math.log(d0), b = Math.log(d1); const f = (v) => r0 + ((Math.log(v) - a) / (b - a)) * (r1 - r0); f.inv = (x) => Math.exp(a + ((x - r0) / (r1 - r0)) * (b - a)); return f; }
  function linScale(d0, d1, r0, r1) { const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0); return f; }
  function logTicks(lo, hi, max = 6) {
    const out = [];
    for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)); e++) [1, 2, 5].forEach((m) => { const v = m * Math.pow(10, e); if (v >= lo && v <= hi) out.push(v); });
    if (out.length > max) return out.filter((_, i) => i % Math.ceil(out.length / max) === 0);
    if (out.length < 3) { const r = []; for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)); e++) [1, 1.5, 2, 3, 5, 7].forEach((m) => { const v = m * Math.pow(10, e); if (v >= lo && v <= hi) r.push(v); }); return r.slice(0, max + 2); }
    return out;
  }
  UI.logScale = logScale; UI.linScale = linScale; UI.logTicks = logTicks;
  const domain = (vals, pad = 0.08) => { const v = vals.filter((x) => x > 0 && isFinite(x)); const lo = Math.min(...v), hi = Math.max(...v); return [lo / (1 + pad), hi * (1 + pad)]; };
  UI.domain = domain;

  function Axis({ x, ticks, y, mk, w0, w1, h }) {
    return html`<g className="axis">${ticks.map((t) => html`<g key=${t}><line x1=${x(t)} x2=${x(t)} y1=${h != null ? h : 0} y2=${y} className="grid" /><text x=${x(t)} y=${y + 14} textAnchor="middle">${TP.fmt(t, mk, true)}</text></g>`)}</g>`;
  }

  /* hover compartido: una línea de lectura bajo el gráfico */
  function useHover() { const [h, setH] = useState(null); return [h, setH]; }
  UI.Readout = ({ h, hint }) => html`<div className="readout" aria-live="polite">${h || html`<span className="muted">${hint || 'Pasa el cursor o toca un punto para ver el detalle.'}</span>`}</div>`;

  /* ---------- A. Escalera de precios por marca ---------- */
  UI.Ladder = function ({ rows, bands, mk, priceType, onPick, selected }) {
    const [h, setH] = useHover();
    const all = rows.flatMap((r) => r.items.flatMap((i) => [i.p.list, i.p.promo || i.p.list]));
    if (!all.length) return html`<${UI.Empty} title="Sin productos para estos filtros">Amplía los filtros de marca, material o tipología.<//>`;
    const [lo, hi] = domain(all);
    const W = 820, L = 132, R = 16, RH = 30, T = 22, H = T + rows.length * RH + 24;
    const x = logScale(lo, hi, L, W - R);
    const ticks = logTicks(lo, hi, 7);
    return html`<div className="chart">
      <svg viewBox=${`0 0 ${W} ${H}`} className="svgc" role="img" aria-label="Escalera de precios por marca">
        ${[[lo, bands.c1], [bands.c1, bands.c2], [bands.c2, hi]].map(([za, zb], bi) => { const a0 = Math.max(lo, za), b0 = Math.min(hi, zb); return b0 > a0 ? html`<g key=${bi}><rect x=${x(a0)} y=${T - 4} width=${x(b0) - x(a0)} height=${rows.length * RH + 4} className=${'zone z' + bi} /><text x=${(x(a0) + x(b0)) / 2} y=${T - 8} textAnchor="middle" className="zlabel">${TP.BAND_NAMES[bi]}</text></g>` : null; })}
        <${Axis} x=${x} ticks=${ticks} y=${T + rows.length * RH} h=${T - 4} mk=${mk} />
        ${rows.map((r, ri) => { const cy = T + ri * RH + RH / 2; return html`<g key=${r.id}>
          <text x=${L - 10} y=${cy + 4} textAnchor="end" className=${'rl ' + (r.own ? 'own' : '')}>${r.name}</text>
          <line x1=${L} x2=${W - R} y1=${cy} y2=${cy} className="rowline" />
          ${r.items.map((it) => { const p = it.p; const showPromo = priceType === 'promo' && p.promo; const v = showPromo ? p.promo : p.list; const sel = selected === p.id; return html`<g key=${p.id} className="hit" onMouseEnter=${() => setH(html`<b>${p.name}</b> · ${r.name} · ${p.mat} · lista ${TP.fmt(p.list, mk)}${p.promo ? html` · promoción ${TP.fmt(p.promo, mk)}` : ''}`)} onMouseLeave=${() => setH(null)} onClick=${() => onPick && onPick(p)}>
            ${showPromo ? html`<line x1=${x(p.list)} x2=${x(v)} y1=${cy} y2=${cy} className="promoline" />` : null}
            <circle cx=${x(v)} cy=${cy} r="12" fill="transparent" />
            <circle cx=${x(v)} cy=${cy} r=${sel ? 6.5 : 4.5} className=${'dot ' + (r.own ? 'own' : 'mkt') + (showPromo ? ' promo' : '') + (sel ? ' sel' : '')} />
          </g>`; })}
        </g>`; })}
      </svg>
      <div className="legend"><span><i className="sw own"></i>Tu marca</span><span><i className="sw mkt"></i>Competencia</span>${priceType === 'promo' ? html`<span><i className="sw hollow"></i>En promoción (línea desde el precio de lista)</span>` : null}<span className="muted">Eje logarítmico</span></div>
      <${UI.Readout} h=${h} hint="Pasa el cursor sobre un punto; haz clic para abrir sus comparables." />
    </div>`;
  };

  /* ---------- B. Rangos por marca ---------- */
  UI.Ranges = function ({ rows, mk, bands }) {
    const [h, setH] = useHover();
    const [lo, hi] = domain(rows.flatMap((r) => [r.min, r.max]));
    const W = 820, L = 132, R = 110, RH = 30, T = 10, H = T + rows.length * RH + 26;
    const x = logScale(lo, hi, L, W - R);
    return html`<div className="chart"><svg viewBox=${`0 0 ${W} ${H}`} className="svgc" role="img" aria-label="Rango de precio por marca">
      <${Axis} x=${x} ticks=${logTicks(lo, hi, 7)} y=${T + rows.length * RH} h=${T} mk=${mk} />
      ${[bands.c1, bands.c2].map((c, i) => c > lo && c < hi ? html`<line key=${i} x1=${x(c)} x2=${x(c)} y1=${T} y2=${T + rows.length * RH} className="cut" />` : null)}
      ${rows.map((r, i) => { const cy = T + i * RH + RH / 2; return html`<g key=${r.id} className="hit" onMouseEnter=${() => setH(html`<b>${r.name}</b> · ${r.n} productos · mín ${TP.fmt(r.min, mk)} · P25 ${TP.fmt(r.p25, mk)} · mediana ${TP.fmt(r.med, mk)} · P75 ${TP.fmt(r.p75, mk)} · máx ${TP.fmt(r.max, mk)}`)} onMouseLeave=${() => setH(null)}>
        <rect x="0" y=${cy - RH / 2} width=${W} height=${RH} fill="transparent" />
        <text x=${L - 10} y=${cy + 4} textAnchor="end" className=${'rl ' + (r.own ? 'own' : '')}>${r.name}</text>
        <line x1=${x(r.min)} x2=${x(r.max)} y1=${cy} y2=${cy} className=${'whisk ' + (r.own ? 'own' : '')} />
        <rect x=${x(r.p25)} y=${cy - 7} width=${Math.max(3, x(r.p75) - x(r.p25))} height="14" rx="4" className=${'iqr ' + (r.own ? 'own' : 'mkt')} />
        <line x1=${x(r.med)} x2=${x(r.med)} y1=${cy - 9} y2=${cy + 9} className="medtick" />
        <text x=${W - R + 10} y=${cy + 4} className="rlab">${r.cls}</text>
      </g>`; })}
    </svg>
    <div className="legend"><span><i className="sw bar"></i>P25–P75 (territorio central)</span><span><i className="sw line"></i>Mínimo a máximo</span><span><i className="sw tick"></i>Mediana</span><span><i className="sw cut"></i>Cortes de franja</span></div>
    <${UI.Readout} h=${h} /></div>`;
  };

  /* ---------- C. Pirámide ---------- */
  UI.Pyramid = function ({ own, mkt, bands, mk, ownName }) {
    const [h, setH] = useHover();
    const to = TP.sum(own), tm = TP.sum(mkt);
    const so = own.map((v) => v / Math.max(1, to)), sm = mkt.map((v) => v / Math.max(1, tm));
    const mx = Math.max(...so, ...sm, 0.01);
    const W = 640, C = W / 2, RH = 54, T = 10;
    const w = (s) => (s / mx) * (C - 96);
    const order = [2, 1, 0];
    return html`<div className="chart"><svg viewBox=${`0 0 ${W} ${T + 3 * RH + 30}`} className="svgc narrow" role="img" aria-label="Pirámide de oferta por franja">
      <text x=${C - 12} y=${T + 3 * RH + 22} textAnchor="end" className="axl">${ownName} (% de tu portafolio)</text>
      <text x=${C + 12} y=${T + 3 * RH + 22} className="axl">Competencia (% de la oferta)</text>
      ${order.map((bi, i) => { const y = T + i * RH; const range = bi === 0 ? 'hasta ' + TP.fmt(bands.c1, mk, true) : bi === 1 ? TP.fmt(bands.c1, mk, true) + ' – ' + TP.fmt(bands.c2, mk, true) : 'desde ' + TP.fmt(bands.c2, mk, true); return html`<g key=${bi} className="hit" onMouseEnter=${() => setH(html`<b>${TP.BAND_NAMES[bi]}</b> (${range}) · tu portafolio ${own[bi]} productos (${Math.round(so[bi] * 100)} %) · competencia ${mkt[bi]} productos (${Math.round(sm[bi] * 100)} %)`)} onMouseLeave=${() => setH(null)}>
        <rect x=${C - w(so[bi]) - 1} y=${y + 6} width=${w(so[bi])} height=${RH - 14} rx="4" className="bar own" />
        <rect x=${C + 1} y=${y + 6} width=${w(sm[bi])} height=${RH - 14} rx="4" className="bar mkt" />
        <text x=${C - w(so[bi]) - 8} y=${y + RH / 2 + 3} textAnchor="end" className="val">${Math.round(so[bi] * 100)} %</text>
        <text x=${C + w(sm[bi]) + 8} y=${y + RH / 2 + 3} className="val">${Math.round(sm[bi] * 100)} %</text>
        <text x=${8} y=${y + RH / 2 - 4} className="bandl">${TP.BAND_NAMES[bi]}</text>
        <text x=${8} y=${y + RH / 2 + 11} className="bandr">${range}</text>
      </g>`; })}
      <line x1=${C} x2=${C} y1=${T} y2=${T + 3 * RH} className="axisline" />
    </svg><${UI.Readout} h=${h} /></div>`;
  };

  /* ---------- E. Territorios ---------- */
  UI.Territory = function ({ points, mk, line, xLabel }) {
    const [h, setH] = useHover();
    if (!points.length) return html`<${UI.Empty} title="Sin marcas para mostrar" />`;
    const W = 760, H = 360, L = 70, R = 24, T = 16, B = 40;
    const xs = points.map((p) => p.x);
    const x0 = Math.min(...xs) - 0.25, x1 = Math.max(...xs) + 0.25;
    const [lo, hi] = domain(points.map((p) => p.y).concat(line ? line.map((l) => l[1]) : []), 0.15);
    const x = linScale(x0, x1, L, W - R), y = logScale(lo, hi, H - B, T);
    const nmax = Math.max(...points.map((p) => p.n));
    return html`<div className="chart"><svg viewBox=${`0 0 ${W} ${H}`} className="svgc" role="img" aria-label="Territorios de marca: atributos frente a precio">
      ${logTicks(lo, hi, 6).map((t) => html`<g key=${t}><line x1=${L} x2=${W - R} y1=${y(t)} y2=${y(t)} className="grid" /><text x=${L - 8} y=${y(t) + 4} textAnchor="end" className="tick">${TP.fmt(t, mk, true)}</text></g>`)}
      ${[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].filter((v) => v >= x0 && v <= x1).map((v) => html`<text key=${v} x=${x(v)} y=${H - B + 16} textAnchor="middle" className="tick">${String(v).replace('.', ',')}</text>`)}
      <text x=${(L + W - R) / 2} y=${H - 6} textAnchor="middle" className="axl">${xLabel || 'Índice de atributos (promedio de niveles 1 a 5)'}</text>
      ${line ? html`<path d=${line.filter((l) => l[0] >= x0 && l[0] <= x1).map((l, i) => (i ? 'L' : 'M') + x(l[0]) + ' ' + y(l[1])).join(' ')} className="valueline" />` : null}
      ${points.map((p) => { const r = 6 + 14 * Math.sqrt(p.n / nmax); return html`<g key=${p.id} className="hit" onMouseEnter=${() => setH(html`<b>${p.name}</b> · índice de atributos ${p.x.toFixed(2).replace('.', ',')} · mediana ${TP.fmt(p.y, mk)} · ${p.n} productos`)} onMouseLeave=${() => setH(null)}>
        <circle cx=${x(p.x)} cy=${y(p.y)} r=${r} className=${'bub ' + (p.own ? 'own' : 'mkt')} />
        <text x=${x(p.x) + r + 4} y=${y(p.y) + 4} className=${'blab ' + (p.own ? 'own' : '')}>${p.name}</text>
      </g>`; })}
    </svg>
    <div className="legend"><span><i className="sw own"></i>Tu marca</span><span><i className="sw mkt"></i>Competencia (tamaño = número de productos)</span>${line ? html`<span><i className="sw dash"></i>Precio estimado por el modelo de atributos</span>` : null}</div>
    <${UI.Readout} h=${h} hint="Arriba de la línea: la marca cobra más de lo que el mercado paga por sus atributos. Abajo: cobra menos." /></div>`;
  };

  /* ---------- F. Barras pareadas tu portafolio vs mercado ---------- */
  UI.Paired = function ({ items, ownName }) {
    const [h, setH] = useHover();
    const mx = Math.max(0.01, ...items.flatMap((i) => [i.own, i.mkt]));
    return html`<div className="paired">${items.map((i) => html`<div key=${i.label} className="prow" onMouseEnter=${() => setH(html`<b>${i.label}</b> · ${ownName} ${Math.round(i.own * 100)} % · competencia ${Math.round(i.mkt * 100)} % · diferencia ${i.own - i.mkt >= 0 ? '+' : ''}${Math.round((i.own - i.mkt) * 100)} pts`)} onMouseLeave=${() => setH(null)}>
      <div className="plab">${i.sw ? html`<i className="swc" style=${{ background: i.sw }}></i>` : null}${i.label}</div>
      <div className="pbars"><div className="pb own" style=${{ width: (i.own / mx) * 100 + '%' }}></div><div className="pb mkt" style=${{ width: (i.mkt / mx) * 100 + '%' }}></div></div>
      <div className="pval"><span>${Math.round(i.own * 100)} %</span><span className="muted">${Math.round(i.mkt * 100)} %</span></div>
    </div>`)}
    <div className="legend"><span><i className="sw own"></i>${ownName}</span><span><i className="sw mkt"></i>Competencia seleccionada</span></div>
    <${UI.Readout} h=${h} /></div>`;
  };

  /* ---------- banda de precio de un producto (Advisor y Lanzamiento) ---------- */
  UI.PriceStrip = function ({ mk, current, currentLabel, est, lo, hi, comps, floor, wtp, extra }) {
    const vals = [current, est, lo, hi, floor, ...(comps || []), ...(wtp || []), ...(extra || []).map((e) => e.v)].filter((v) => v > 0 && isFinite(v));
    if (!vals.length) return null;
    const [d0, d1] = domain(vals, 0.12);
    const W = 760, L = 16, R = 16, H = 132;
    const x = logScale(d0, d1, L, W - R);
    const c25 = comps && comps.length >= 2 ? TP.quantile(comps, 0.25) : null, c75 = comps && comps.length >= 2 ? TP.quantile(comps, 0.75) : null;
    const lab = (v, txt, yy, cls) => html`<g><line x1=${x(v)} x2=${x(v)} y1="26" y2="92" className=${'mk ' + cls} /><text x=${Math.min(W - 60, Math.max(60, x(v)))} y=${yy} textAnchor="middle" className=${'mkl ' + cls}>${txt}</text></g>`;
    return html`<div className="chart"><svg viewBox=${`0 0 ${W} ${H}`} className="svgc" role="img" aria-label="Precio frente a bandas de referencia">
      ${logTicks(d0, d1, 7).map((t) => html`<g key=${t}><line x1=${x(t)} x2=${x(t)} y1="26" y2="96" className="grid" /><text x=${x(t)} y="112" textAnchor="middle" className="tick">${TP.fmt(t, mk, true)}</text></g>`)}
      ${floor ? html`<rect x=${L} y="34" width=${Math.max(0, x(floor) - L)} height="10" className="floorzone" />` : null}
      ${lo && hi ? html`<rect x=${x(lo)} y="48" width=${x(hi) - x(lo)} height="14" rx="4" className="bandm" />` : null}
      ${c25 ? html`<rect x=${x(c25)} y="66" width=${Math.max(3, x(c75) - x(c25))} height="12" rx="4" className="bandc" />` : null}
      ${(comps || []).map((c, i) => html`<circle key=${i} cx=${x(c)} cy="72" r="3.5" className="cdot" />`)}
      ${wtp && wtp[0] ? html`<rect x=${x(wtp[0])} y="82" width=${x(wtp[1]) - x(wtp[0])} height="8" rx="3" className="bandw" />` : null}
      ${est ? lab(est, 'Estimado ' + TP.fmt(est, mk, true), 16, 'est') : null}
      ${current ? lab(current, (currentLabel || 'Actual') + ' ' + TP.fmt(current, mk, true), 126, 'cur') : null}
      ${(extra || []).map((e, i) => html`<g key=${i}>${lab(e.v, e.t + ' ' + TP.fmt(e.v, mk, true), e.y || 126, e.cls || 'cur')}</g>`)}
    </svg>
    <div className="legend">${lo ? html`<span><i className="sw bandm"></i>Banda del modelo P10–P90</span>` : null}${c25 ? html`<span><i className="sw bandc"></i>Comparables P25–P75 (puntos = cada comparable)</span>` : null}${floor ? html`<span><i className="sw floor"></i>Bajo el piso de rentabilidad</span>` : null}${wtp && wtp[0] ? html`<span><i className="sw bandw"></i>Rango aceptable declarado (Pulse)</span>` : null}</div></div>`;
  };

  /* ---------- coeficientes del modelo ---------- */
  UI.Coefs = function ({ coef }) {
    const mx = Math.max(0.02, ...coef.map((c) => Math.max(Math.abs(c.hi), Math.abs(c.lo))));
    return html`<div className="coefs">${coef.map((c) => html`<div key=${c.attr.id} className="crow">
      <div className="clab">${c.attr.name}</div>
      <div className="ctrack"><div className="czero"></div>
        <div className="cbar" style=${{ left: c.pct >= 0 ? '50%' : 50 + (c.pct / mx) * 50 + '%', width: (Math.abs(c.pct) / mx) * 50 + '%' }}></div>
        <div className="cci" style=${{ left: 50 + (c.lo / mx) * 50 + '%', width: ((c.hi - c.lo) / mx) * 50 + '%' }}></div>
      </div>
      <div className="cval">${TP.pct(c.pct, 1)} <span className="muted">por nivel</span>${!c.sig ? html` <${UI.Badge} tone="warn" title="El intervalo de 90 % incluye cero">no concluyente<//>` : null}</div>
    </div>`)}<div className="legend"><span><i className="sw bar"></i>Prima de precio por cada nivel adicional (exp(β) − 1)</span><span><i className="sw line"></i>Intervalo de 90 %</span></div></div>`;
  };

  /* ---------- precio frente a puntaje de atributos ---------- */
  UI.ValueScatter = function ({ pts, bands, mk, ownName, onPick }) {
    const [h, setH] = useHover();
    const [mode, setMode] = useState('nivel');
    if (pts.length < 3) return html`<${UI.Empty} title="Aún no hay suficientes productos clasificados">Clasifica más productos de tu tienda y de la competencia para ver esta vista.<//>`;
    const W = 860, H = 430, L = 92, R = 20, T = 14, B = 44;
    const ys = pts.map((p) => p.y).filter((v) => v > 0);
    const yMax = TP.quantile(ys, 0.99) * 1.12;
    const x = linScale(1, 5, L, W - R), y = linScale(0, yMax, H - B, T);
    const mkt = pts.filter((p) => !p.own);
    const fx = mkt.map((p) => p.x), fy = mkt.map((p) => p.y);
    const mx = TP.mean(fx), myy = TP.mean(fy);
    const slope = TP.sum(fx.map((v, i) => (v - mx) * (fy[i] - myy))) / Math.max(1e-9, TP.sum(fx.map((v) => (v - mx) ** 2)));
    const icpt = myy - slope * mx;
    const ticks = []; const step = Math.pow(10, Math.floor(Math.log10(yMax / 4))); const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => yMax / s <= 6) || step * 10;
    for (let v = 0; v <= yMax; v += nice) ticks.push(v);
    const brands = [...new Set(mkt.map((p) => p.p.brand))];
    const bIdx = Object.fromEntries(brands.map((b, i) => [b, i]));
    const cls = (p) => (p.own ? 'own' : mode === 'nivel' ? 'g' + p.g : 'b' + (bIdx[p.p.brand] % 3));
    const zone = (a, b2, i, name) => { const y0 = y(Math.min(yMax, b2)), y1 = y(Math.max(0, a)); return y1 > y0 ? html`<g key=${i}><rect x=${L} y=${y0} width=${W - R - L} height=${y1 - y0} className=${'zone z' + i} /><text x=${L - 12} y=${(y0 + y1) / 2 + 4} textAnchor="end" className="zname">${name}</text></g>` : null; };
    const cnt = [0, 1, 2].map((g) => mkt.filter((p) => p.g === g).length);
    return html`<div className="chart">
      <div className="row-between"><h2>Precio frente a puntaje de atributos</h2><${UI.Seg} size="sm" label="Color" value=${mode} onChange=${setMode} options=${[{ v: 'nivel', l: 'Por nivel de marca' }, { v: 'brand', l: 'Por competidor' }]} /></div>
      <svg viewBox=${`0 0 ${W} ${H}`} className="svgc" role="img" aria-label="Precio frente a puntaje de atributos">
        ${zone(0, bands.c1, 0, 'Entrada')}${zone(bands.c1, bands.c2, 1, 'Core')}${zone(bands.c2, yMax, 2, 'Top')}
        ${ticks.map((t) => html`<g key=${t}><line x1=${L} x2=${W - R} y1=${y(t)} y2=${y(t)} className="grid" /><text x=${L + 4} y=${y(t) - 3} className="tick">${TP.fmt(t, mk, true)}</text></g>`)}
        ${[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((v) => html`<text key=${v} x=${x(v)} y=${H - B + 16} textAnchor="middle" className="tick">${String(v).replace('.', ',')}</text>`)}
        <text x=${(L + W - R) / 2} y=${H - 6} textAnchor="middle" className="axl">Puntaje de atributos (1 a 5)</text>
        <line x1=${x(1)} y1=${y(Math.max(0, icpt + slope))} x2=${x(5)} y2=${y(Math.max(0, Math.min(yMax, icpt + slope * 5)))} className="valueline" />
        ${pts.filter((p) => p.y <= yMax).map((p, i) => { const cx = x(p.x), cy = y(p.y); const enter = () => setH(html`<b>${p.p.name}</b> · ${p.own ? ownName : p.brandName || ''} · puntaje ${p.x.toFixed(2).replace('.', ',')} · ${TP.fmt(p.y, mk)}`); return p.own
          ? html`<path key=${'o' + i} d=${`M${cx} ${cy - 6}L${cx + 6} ${cy + 5}L${cx - 6} ${cy + 5}Z`} className="tri hit" onMouseEnter=${enter} onMouseLeave=${() => setH(null)} onClick=${() => onPick && onPick(p.p)} />`
          : html`<circle key=${'m' + i} cx=${cx} cy=${cy} r="4.5" className=${'vdot ' + cls(p)} onMouseEnter=${enter} onMouseLeave=${() => setH(null)} />`; })}
      </svg>
      <div className="legend"><span><i className="sw trio"></i>${ownName} · ${pts.length - mkt.length}</span>${mode === 'nivel' ? html`<span><i className="sw vd g0"></i>Marcas de entrada · ${cnt[0]}</span><span><i className="sw vd g1"></i>Marcas core · ${cnt[1]}</span><span><i className="sw vd g2"></i>Marcas top · ${cnt[2]}</span>` : html`<span className="muted">Competidores en tonos del mismo color; identifica cada uno al pasar el cursor.</span>`}<span><i className="sw dash"></i>Tendencia lineal del mercado</span></div>
      <${UI.Readout} h=${h} /></div>`;
  };

  /* ---------- líneas (Pulse y aprendizaje) ---------- */
  UI.Lines = function ({ xs, series, markers, mk, yFmt, xLog, yMax, xLabel }) {
    const [h, setH] = useHover();
    const W = 760, H = 300, L = 54, R = 20, T = 14, B = 42;
    const x = xLog ? logScale(xs[0], xs[xs.length - 1], L, W - R) : linScale(xs[0], xs[xs.length - 1], L, W - R);
    const ym = yMax || Math.max(...series.flatMap((s) => s.ys)) * 1.08;
    const y = linScale(0, ym, H - B, T);
    const ref = useRef(null);
    const onMove = (e) => {
      const svg = ref.current; if (!svg) return;
      const pt = svg.getBoundingClientRect(); const px = ((e.clientX - pt.left) / pt.width) * W;
      let bi = 0, bd = 1e9; xs.forEach((v, i) => { const d = Math.abs(x(v) - px); if (d < bd) { bd = d; bi = i; } });
      setH({ i: bi });
    };
    const hi = h && h.i;
    const xt = xLog ? logTicks(xs[0], xs[xs.length - 1], 7) : xs.filter((_, i) => i % Math.ceil(xs.length / 8) === 0);
    return html`<div className="chart"><svg ref=${ref} viewBox=${`0 0 ${W} ${H}`} className="svgc" onMouseMove=${onMove} onMouseLeave=${() => setH(null)} role="img" aria-label="Gráfico de líneas">
      ${[0, 0.25, 0.5, 0.75, 1].map((f) => html`<g key=${f}><line x1=${L} x2=${W - R} y1=${y(ym * f)} y2=${y(ym * f)} className="grid" /><text x=${L - 8} y=${y(ym * f) + 4} textAnchor="end" className="tick">${yFmt ? yFmt(ym * f) : Math.round(ym * f)}</text></g>`)}
      ${xt.map((t) => html`<text key=${t} x=${x(t)} y=${H - B + 16} textAnchor="middle" className="tick">${mk ? TP.fmt(t, mk, true) : t}</text>`)}
      ${xLabel ? html`<text x=${(L + W - R) / 2} y=${H - 6} textAnchor="middle" className="axl">${xLabel}</text>` : null}
      ${(markers || []).filter((m) => isFinite(m.x)).map((m, i) => html`<g key=${i}><line x1=${x(m.x)} x2=${x(m.x)} y1=${T} y2=${H - B} className="mline" /><text x=${x(m.x) + 4} y=${T + 12 + (i % 2) * 14} className="mlab">${m.label}</text></g>`)}
      ${series.map((s, si) => html`<path key=${si} d=${s.ys.map((v, i) => (i ? 'L' : 'M') + x(xs[i]) + ' ' + y(v)).join(' ')} className=${'ln s' + (s.slot || si + 1) + (s.dash ? ' dash' : '')} />`)}
      ${hi != null ? html`<line x1=${x(xs[hi])} x2=${x(xs[hi])} y1=${T} y2=${H - B} className="cross" />` : null}
      ${hi != null ? series.map((s, si) => html`<circle key=${si} cx=${x(xs[hi])} cy=${y(s.ys[hi])} r="4" className=${'lnd s' + (s.slot || si + 1)} />`) : null}
    </svg>
    <div className="legend">${series.map((s, si) => html`<span key=${si}><i className=${'sw ln s' + (s.slot || si + 1) + (s.dash ? ' dash' : '')}></i>${s.name}</span>`)}</div>
    <${UI.Readout} h=${hi != null ? html`<b>${mk ? TP.fmt(xs[hi], mk) : xs[hi]}</b> · ${series.map((s) => s.name + ': ' + (yFmt ? yFmt(s.ys[hi]) : s.ys[hi].toFixed(1))).join(' · ')}` : null} hint="Mueve el cursor sobre el gráfico para leer los valores." /></div>`;
  };
})();
