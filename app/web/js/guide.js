/* Tita Pricing Intelligence 360° — guía: explicaciones de cada campo y resultado («?») y recorridos paso a paso. */
(function () {
  'use strict';
  const { useState, useEffect, useRef, useLayoutEffect } = React;
  const TP = window.TP, UI = TP.ui, html = UI.html;

  /* ---------- glosario: qué significa cada campo y cada resultado ---------- */
  const G = {
    // inicio
    url: ['Dirección de la tienda', 'La página de inicio de la tienda online que quieres analizar, por ejemplo mitienda.com. Puede ser tu tienda o la de un prospecto. Solo leemos lo que la tienda publica: productos, precios y fichas.'],
    // fases
    ph_own: ['Leyendo el catálogo', 'Buscamos los productos y precios que la tienda publica. Probamos varios métodos en orden: la API de la plataforma (Shopify, VTEX, WooCommerce), el mapa del sitio con las fichas de producto y, si hace falta, el texto de las páginas.'],
    ph_discover: ['Buscando competidores', 'La IA busca en la web tiendas que venden lo mismo en tu país y las combina con tiendas que ya verificamos en otros análisis. Antes de mostrártelas comprobamos que cada dirección exista.'],
    ph_confirm: ['Confirmando competidores', 'Tú decides quién es tu competencia. Desmarca las tiendas que no compiten contigo y agrega las que falten. Este paso evita comparar con tiendas equivocadas.'],
    ph_comps: ['Leyendo a la competencia', 'Leemos el catálogo de cada competidor confirmado, solo los productos parecidos a los tuyos. Si una tienda no se deja leer, queda como referencia pendiente con su motivo.'],
    ph_cats: ['Categorías y atributos', 'La IA agrupa tus productos en categorías comparables (por ejemplo, botas o tenis) y define para cada una los atributos que explican el precio, con 5 niveles de menor a mayor valor.'],
    ph_classify: ['Clasificando productos', 'Cada producto, tuyo y de la competencia, recibe su categoría, tipo, material, color y un nivel de 1 a 5 en cada atributo, con la frase de la ficha que lo justifica.'],
    ph_done: ['Construyendo el análisis', 'Con los productos clasificados calculamos la posición de tus precios frente al mercado y las recomendaciones.'],
    // diagnóstico
    d_platform: ['Plataforma', 'El software con el que está hecha la tienda (Shopify, VTEX, WooCommerce…). Lo detectamos en el código de la página; ayuda a elegir la mejor forma de leer el catálogo.'],
    d_country: ['País y moneda', 'Dónde vende la tienda y en qué moneda están sus precios. Solo comparamos precios en la misma moneda: si no la pudimos confirmar, te lo advertimos.'],
    d_method: ['Método de lectura', 'Cómo obtuvimos los productos. La API de la plataforma es la fuente más completa; el sitemap con datos estructurados y el texto de las páginas son alternativas cuando no hay API.'],
    d_found: ['Productos encontrados', 'Cuántos productos leímos. No es necesariamente todo el catálogo: en el análisis rápido tomamos una muestra representativa.'],
    d_priced: ['Con precio válido', 'Productos con un precio que se puede usar. El porcentaje compara con los productos encontrados; los que no tienen precio no entran al análisis.'],
    d_cats: ['Categorías identificadas', 'Cuántas categorías distintas publica la tienda (según sus propias etiquetas).'],
    d_attempts: ['Qué intentamos', 'Cada método de lectura que probamos, en orden, con su resultado. Sirve para entender por qué una tienda no se pudo leer o se leyó parcialmente.'],
    // competidores
    c_verified: ['Dominio verificado', 'Comprobamos que la dirección existe y responde. Las que no responden aparecen desmarcadas: puedes marcarlas igual si sabes que son correctas.'],
    c_source: ['Origen', '«Búsqueda web»: la encontró la IA ahora. «Catálogo verificado antes»: ya la leímos con éxito en otros análisis del mismo país y tipo de producto.'],
    c_type: ['Tipo de competidor', 'Directo: vende lo mismo a precios parecidos. Aspiracional: lo mismo, más caro (marca premium). Económico: lo mismo, más barato. Indirecto: comparte pocas categorías. Referente: otro país o tienda muy grande; sirve de referencia, no para comparar precios.'],
    c_comp: ['Comparabilidad', 'Cuántos productos parecidos a los tuyos tiene: alta (20 o más), media (10 a 19), baja (1 a 9). Con comparabilidad baja los resultados son orientativos.'],
    c_conf: ['Evidencia', 'Puntaje de 0 a 100 que suma las pruebas verificadas: dominio que responde, catálogo leído, productos en común, misma moneda y mismo país. No es una probabilidad; abre «Por qué lo clasificamos así» para ver cada prueba.'],
    c_pending: ['Referencia pendiente', 'No pudimos leer su catálogo (por ejemplo, bloquea las lecturas automáticas). No la borramos: queda anotada con el motivo y puedes reintentar después.'],
    // estrategia
    s_obj: ['Objetivo principal', 'Ordena las recomendaciones según lo que más te importa: ser competitivo, proteger el margen, ganar volumen o reforzar una posición premium.'],
    s_max: ['Cambio máximo por producto', 'El mayor cambio de precio que te sugeriremos de una sola vez. Un tope prudente evita saltos bruscos que confundan a tus clientes.'],
    s_margin: ['Margen mínimo', 'El margen bruto por debajo del cual nunca recomendaremos un precio. Solo se aplica si cargas tus costos; si no los tienes, déjalo vacío.'],
    s_round: ['Redondeo de precios', 'Cómo terminamos los precios sugeridos. «Terminación psicológica» usa finales habituales del mercado (por ejemplo, 349.900 en Colombia).'],
    // Overview
    o_cover: ['Cobertura de datos', 'Con qué información se hizo el análisis: cuántos productos tuyos, cuántos competidores y cuántos productos comparables. Si la cobertura es baja, las conclusiones son menos firmes.'],
    o_estimated: ['Portafolio con precio estimado', 'Cuántos de tus productos tienen un precio de referencia calculado a partir del mercado. Los demás no tienen suficientes productos parecidos para estimarlo.'],
    o_index: ['Índice de precio frente al mercado', '100 significa que tus precios están en la mediana de la competencia. 90 es 10 % más barato y 110 es 10 % más caro, comparando productos de la misma categoría.'],
    o_below: ['Por debajo de su banda', 'Productos más baratos de lo que el mercado cobra por productos con atributos parecidos. Pueden tener espacio para subir sin cambiar el producto.'],
    o_above: ['Por encima de su banda', 'Productos más caros de lo que el mercado cobra por atributos parecidos. Conviene revisar el precio o comunicar mejor por qué valen más.'],
    o_ws: ['Espacios competitivos', 'Combinaciones de tipo de producto y franja de precio donde la competencia tiene oferta y tú casi no. Pueden ser oportunidades de surtido.'],
    o_comps: ['Competidores en el análisis', 'Competidores cuyos precios entran a la comparación. Los demás quedan como referencia (otra moneda, otro país o sin productos comparables) o pendientes de lectura.'],
    o_comparables: ['Productos comparables', 'Productos de la competencia que quedaron en tus categorías y sirven para comparar precios.'],
    o_model: ['Categorías con modelo', 'Categorías con suficientes productos para estimar un precio por atributos (se necesitan unos 48). Las demás usan solo comparaciones directas producto contra producto.'],
    t_gap: ['Brecha', 'Diferencia entre tu precio y el precio estimado para un producto con tus atributos. −20 % significa que estás 20 % por debajo de lo que cobra el mercado.'],
    t_evidence: ['Evidencia', '«Consistente»: el modelo y los productos comparables apuntan en la misma dirección. «Mixta»: no coinciden del todo; revisa antes de decidir.'],
    t_action: ['Sugerencia', 'Lo que sugiere el análisis: evaluar un incremento, evaluar una reducción o mantener. Ninguna sugerencia se aplica sola: requiere aprobación.'],
    // Pricing Advisor
    a_current: ['Precio actual', 'El precio al que hoy se vende el producto (con descuento, si lo tiene).'],
    a_proposed: ['Precio propuesto', 'Un escenario a evaluar, limitado por tu cambio máximo y redondeado según tu regla. Es un punto de partida, no una orden.'],
    a_evidence: ['Evidencia', 'De dónde sale la sugerencia: el modelo de precio por atributos (con su calidad, medida como R² de validación) y los productos comparables usados.'],
    a_conf: ['Confianza', 'Alta, media o baja según la calidad del modelo y si coincide con los comparables. Si no hay evidencia suficiente, no recomendamos mover el precio.'],
    a_impact: ['Impacto estimado', 'Solo mostramos lo que se puede calcular: el cambio de margen si cargaste costos. El efecto en ventas no se estima sin ventas históricas o un experimento.'],
    a_missing: ['Datos que faltan', 'Información que haría la recomendación más sólida: costos, ventas, atributos sin evidencia o comparables poco confiables.'],
  };
  const gloss = (k) => G[k] || null;

  /* ---------- «?»: explicación en el lugar ---------- */
  let seq = 0;
  function Help({ k, t, d }) {
    const g = gloss(k) || [t, d];
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const id = useRef('h' + ++seq).current;
    useEffect(() => {
      if (!open) return undefined;
      const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
      document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
      return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
    }, [open]);
    // Posición fija calculada desde el botón y ajustada a la pantalla (no se corta en móvil ni dentro de tablas).
    const [pos, setPos] = useState(null);
    useLayoutEffect(() => {
      if (!open || !ref.current) return undefined;
      const place = () => { const r = ref.current.getBoundingClientRect(); const vw = window.innerWidth, vh = window.innerHeight; const w = Math.min(300, vw - 24); const left = Math.min(Math.max(12, r.left - 12), vw - w - 12); const below = r.bottom + 8; setPos(below + 160 < vh || r.top < vh / 2 ? { top: below, left, width: w } : { bottom: vh - r.top + 8, left, width: w }); };
      place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
      return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
    }, [open]);
    if (!g || !g[1]) return null;
    return html`<span className="help" ref=${ref}>
      <button type="button" className="help-b" aria-label=${'Qué significa: ' + g[0]} aria-expanded=${open} aria-controls=${id} onClick=${(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}>?</button>
      ${open ? html`<span className="help-p" id=${id} role="note" style=${pos || { visibility: 'hidden' }}><b>${g[0]}</b><span>${g[1]}</span></span>` : null}
    </span>`;
  }

  /* ---------- recorridos guiados ---------- */
  const TOURS = {
    overview: [
      [null, 'Te damos la bienvenida', 'Te mostramos en un minuto qué significa cada parte. Puedes volver a ver esta guía cuando quieras con el botón «Guía» de la barra superior.'],
      ['[data-tour=cover]', 'Cobertura de datos', 'Primero, con qué información se hizo el análisis: tus productos, los competidores que entraron y cuántos productos comparables hay. Abre los detalles para ver cada competidor y el diagnóstico de lectura.'],
      ['[data-tour=kpis]', 'Tu posición en el mercado', 'Índice frente al mercado (100 = mediana de la competencia), productos por debajo o por encima de lo que cobra el mercado por atributos parecidos y espacios donde la competencia vende y tú no. Cada número tiene un «?» con su explicación.'],
      ['[data-tour=decisions]', 'Decisiones para evaluar primero', 'Los productos con la mayor brecha y mejor evidencia. Haz clic en uno para ver por qué se sugiere y con qué productos se compara.'],
      ['[data-tour=alerts]', 'Alertas', 'Avisos sobre los datos: competidores que no se pudieron leer, categorías con poca comparación o promociones de la competencia.'],
      ['[data-tour=nav-market]', 'Market Intelligence', 'Aquí comparas el mercado con gráficos: precio frente a atributos, escalera de precios, rangos, territorios y espacios libres.'],
      ['[data-tour=nav-advisor]', 'Pricing Advisor', 'Producto por producto: precio actual, precio propuesto, evidencia, confianza y datos que faltan. Ninguna sugerencia se aplica sin aprobación.'],
      ['[data-tour=copilot]', 'Copiloto', 'Pregúntale en lenguaje natural sobre tus datos, por ejemplo «¿qué productos tengo más baratos que el mercado?». Responde con los datos de tu análisis y te lleva a la vista que lo respalda.'],
    ],
    advisor: [
      ['[data-tour=advisor-list]', 'Lista de productos', 'Tus productos con su precio actual, el estimado por el mercado, la brecha y la sugerencia. Filtra arriba por grupo: por debajo, por encima o en banda.'],
      ['[data-tour=decision]', 'Ficha de decisión', 'Responde las preguntas clave: de cuánto a cuánto, por qué, con qué evidencia, qué confianza hay, qué impacto se puede calcular y qué datos faltan. Cada campo tiene su «?».'],
      ['[data-tour=strip]', 'Dónde queda el precio', 'La línea muestra tu precio, el estimado, la banda que cobra el mercado y los precios de los comparables.'],
      ['[data-tour=scenario]', 'Escenario', 'Mueve el precio para ver en qué franja queda, si respeta tu tope de cambio y, si cargaste costos, el margen. Puedes enviarlo a aprobación.'],
    ],
    market: [
      ['[data-tour=market-tabs]', 'Vistas del mercado', 'Cada pestaña responde una pregunta: si cobras de acuerdo con tus atributos, cómo se escalonan los precios, qué rangos maneja cada marca y dónde hay espacios libres.'],
      ['[data-tour=market-filters]', 'Filtros', 'Elige categoría, tipo, material y competidores. Los filtros cambian la vista, no los cálculos del modelo.'],
    ],
  };
  const seenKey = (id) => 'tita-tour-' + id;
  const wasSeen = (id) => { try { return localStorage.getItem(seenKey(id)) === '1'; } catch (e) { return true; } };
  const markSeen = (id) => { try { localStorage.setItem(seenKey(id), '1'); } catch (e) { /* sin almacenamiento */ } };

  function Tour({ id, onClose }) {
    const steps = (TOURS[id] || []).filter(([sel]) => !sel || document.querySelector(sel));
    const [i, setI] = useState(0);
    const [box, setBox] = useState(null);
    const card = useRef(null);
    const step = steps[i];
    const close = () => { markSeen(id); onClose(); };
    const next = () => (i < steps.length - 1 ? setI(i + 1) : close());
    useLayoutEffect(() => {
      if (!step) return undefined;
      const el = step[0] && document.querySelector(step[0]);
      const place = () => { if (!el) return setBox(null); const r = el.getBoundingClientRect(); setBox({ top: r.top, left: r.left, width: r.width, height: r.height }); };
      if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      place();
      window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
      if (card.current) card.current.focus();
      return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
    }, [i, id]);
    useEffect(() => { const k = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); });
    if (!step) return null;
    const vw = window.innerWidth, vh = window.innerHeight;
    const cw = Math.min(380, vw - 32);
    let pos;
    if (!box) pos = { top: Math.max(16, vh / 2 - 120), left: (vw - cw) / 2 };
    else {
      const below = box.top + box.height + 14, above = box.top - 14;
      const left = Math.min(Math.max(16, box.left), vw - cw - 16);
      pos = below + 220 < vh ? { top: below, left } : above > 240 ? { top: Math.max(16, above - 220), left } : { top: Math.max(16, vh - 260), left };
    }
    return html`<div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-t">
      ${box ? html`<div className="tour-hole" style=${{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }}></div>` : html`<div className="tour-dim"></div>`}
      <div className="tour-card" ref=${card} tabIndex="-1" style=${{ top: pos.top, left: pos.left, width: cw }}>
        <span className="eyebrow">Guía · ${i + 1} de ${steps.length}</span>
        <h3 id="tour-t">${step[1]}</h3>
        <p>${step[2]}</p>
        <div className="tour-act"><button type="button" className="btn ghost sm" onClick=${close}>Saltar guía</button><span>${i > 0 ? html`<button type="button" className="btn sm" onClick=${() => setI(i - 1)}>Anterior</button>` : null}<button type="button" className="btn primary sm" onClick=${next}>${i < steps.length - 1 ? 'Siguiente' : 'Entendido'}</button></span></div>
      </div>
    </div>`;
  }

  // Abre el recorrido de una vista la primera vez que se visita (cuando sus elementos ya están en pantalla).
  function useAutoTour(id, ready) {
    const [open, setOpen] = useState(false);
    useEffect(() => { if (ready && TOURS[id] && !wasSeen(id)) { const t = setTimeout(() => setOpen(true), 600); return () => clearTimeout(t); } return undefined; }, [id, ready]);
    return [open, setOpen];
  }

  TP.guide = { G, gloss, Help, Tour, TOURS, useAutoTour, wasSeen, markSeen };
})();
