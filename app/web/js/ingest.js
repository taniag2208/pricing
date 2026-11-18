/* TITA Pricing Intelligence 360° — ingesta de catálogos reales y tareas de IA.
   Formatos: Shopify (/products.json), WooCommerce (Store API), VTEX (catalog search),
   CSV/TSV, Excel y texto de una página (extracción con IA). */
(function () {
  'use strict';
  const TP = window.TP;
  const I = (TP.ingest = {});
  const strip = TP.strip;

  /* ---------- utilidades ---------- */
  I.origin = function (raw) {
    let s = (raw || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try { const u = new URL(s); if (!u.hostname.includes('.')) return null; return u.origin; } catch (e) { return null; }
  };
  I.hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; } };
  I.slug = (s) => strip(String(s || '')).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
  const clean = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  I.clean = clean;
  I.parseMoney = function (v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) && v > 0 ? v : null;
    let s = String(v).replace(/[^\d.,-]/g, '');
    if (!s) return null;
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (lc > -1) s = /,\d{3}$/.test(s) && (s.match(/,/g) || []).length >= 1 && s.length - lc === 4 ? s.replace(/,/g, '') : s.replace(',', '.');
    else if (ld > -1 && /\.\d{3}$/.test(s) && (s.match(/\./g).length > 1 || s.length - ld === 4)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isFinite(n) && n > 0 ? n : null;
  };
  const pricePair = (price, compare) => {
    const p = I.parseMoney(price), c = I.parseMoney(compare);
    if (!p && !c) return null;
    if (c && p && c > p * 1.005) return { price: c, promo: p };
    return { price: p || c, promo: null };
  };
  const mk = (o) => ({
    id: String(o.id || '').slice(0, 120),
    name: String(o.name || '').slice(0, 140),
    label: String(o.label || 'Sin categoría').slice(0, 80),
    price: o.price, promo: o.promo || null,
    url: o.url || null, desc: clean(o.desc).slice(0, 420),
    tags: (o.tags || []).slice(0, 6).map((t) => String(t).slice(0, 40)),
    sku: o.sku ? String(o.sku).slice(0, 60) : null,
    avail: o.avail == null ? null : !!o.avail,
  });

  /* ---------- enlaces a los catálogos públicos de cada plataforma ---------- */
  I.links = function (origin) {
    return [
      { platform: 'Shopify', note: 'Hasta 250 productos por página; cambia page=2, 3…', url: origin + '/products.json?limit=250&page=1' },
      { platform: 'WooCommerce', note: 'Hasta 100 por página; cambia page=2, 3…', url: origin + '/wp-json/wc/store/v1/products?per_page=100&page=1' },
      { platform: 'VTEX', note: 'Hasta 50 por página; cambia _from y _to (50–99, 100–149…)', url: origin + '/api/catalog_system/pub/products/search?_from=0&_to=49' },
    ];
  };

  /* ---------- parsers ---------- */
  function fromShopify(j, origin) {
    return (j.products || []).map((p) => {
      const vs = p.variants || [];
      const v = vs.find((x) => x.available !== false) || vs[0] || {};
      const pp = pricePair(v.price, v.compare_at_price);
      if (!pp) return null;
      const tags = Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
      return mk({ id: 'h:' + p.handle, name: p.title, label: p.product_type || tags[0], ...pp, url: origin ? origin + '/products/' + p.handle : null, desc: p.body_html, tags, sku: v.sku, avail: vs.some((x) => x.available) });
    }).filter(Boolean);
  }
  function fromWoo(arr) {
    return arr.map((p) => {
      const pr = p.prices || {};
      const d = Math.pow(10, pr.currency_minor_unit || 0);
      const reg = pr.regular_price ? Number(pr.regular_price) / d : null, cur = pr.price ? Number(pr.price) / d : null;
      const pp = pricePair(cur, reg);
      if (!pp) return null;
      return mk({ id: 'w:' + (p.id || p.slug), name: clean(p.name), label: (p.categories && p.categories[0] && clean(p.categories[0].name)) || null, ...pp, url: p.permalink, desc: p.short_description || p.description, tags: (p.tags || []).map((t) => t.name), sku: p.sku, avail: p.is_in_stock });
    }).filter(Boolean);
  }
  function fromVtex(arr) {
    return arr.map((p) => {
      const it = (p.items || [])[0] || {};
      const off = ((it.sellers || [])[0] || {}).commertialOffer || {};
      const pp = pricePair(off.Price, off.ListPrice);
      if (!pp) return null;
      const cat = (p.categories || [])[0] || '';
      const parts = cat.split('/').filter(Boolean);
      return mk({ id: 'v:' + p.productId, name: p.productName, label: parts[parts.length - 1] || null, ...pp, url: p.link, desc: p.description || p.metaTagDescription, sku: it.itemId, avail: off.AvailableQuantity > 0 });
    }).filter(Boolean);
  }
  const COLS = {
    name: ['nombre', 'name', 'title', 'titulo', 'producto', 'product', 'descripcion corta'],
    price: ['precio lista', 'precio_lista', 'list price', 'compare_at_price', 'precio regular', 'regular price', 'precio', 'price', 'pvp'],
    promo: ['precio promocion', 'precio_promocion', 'precio oferta', 'sale price', 'precio rebajado', 'promo'],
    label: ['categoria', 'category', 'product_type', 'tipo', 'tipo de producto', 'linea', 'coleccion', 'collection'],
    desc: ['descripcion', 'description', 'body_html', 'detalle', 'ficha'],
    url: ['url', 'link', 'enlace', 'permalink'],
    sku: ['sku', 'referencia', 'codigo', 'code', 'id'],
  };
  function pick(row, keys) {
    const ks = Object.keys(row);
    for (const k of keys) { const f = ks.find((x) => strip(x).trim() === k); if (f && row[f] !== '' && row[f] != null) return row[f]; }
    for (const k of keys) { const f = ks.find((x) => strip(x).includes(k)); if (f && row[f] !== '' && row[f] != null) return row[f]; }
    return null;
  }
  I.fromRows = function (rows) {
    return rows.map((r, i) => {
      const name = pick(r, COLS.name);
      const listRaw = pick(r, COLS.price), promoRaw = pick(r, COLS.promo);
      const pp = pricePair(promoRaw || listRaw, promoRaw ? listRaw : null);
      if (!name || !pp) return null;
      const sku = pick(r, COLS.sku);
      return mk({ id: 'c:' + (sku || I.slug(name) + '-' + i), name, label: pick(r, COLS.label), ...pp, url: pick(r, COLS.url), desc: pick(r, COLS.desc), sku });
    }).filter(Boolean);
  };
  I.csvRows = function (text) {
    const first = text.split(/\r?\n/)[0] || '';
    const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const out = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some((c) => c.trim())) out.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    row.push(cell); if (row.some((c) => c.trim())) out.push(row);
    const head = (out.shift() || []).map((h) => h.trim());
    return out.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
  };
  // Devuelve {format, items} o {format:'text'} cuando hace falta extraer con IA
  I.parseText = function (text, origin) {
    const t = (text || '').trim();
    if (!t) return { format: 'vacío', items: [] };
    if (/^[[{]/.test(t)) {
      let j;
      try { j = JSON.parse(t); } catch (e) { return { format: 'json-inválido', items: [], error: 'El texto parece JSON pero está incompleto. Copia toda la página (Ctrl+A, Ctrl+C).' }; }
      if (j && Array.isArray(j.products)) return { format: 'Shopify', items: fromShopify(j, origin) };
      const arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : Array.isArray(j.items) ? j.items : null;
      if (arr && arr.length && arr[0].prices) return { format: 'WooCommerce', items: fromWoo(arr) };
      if (arr && arr.length && arr[0].productName) return { format: 'VTEX', items: fromVtex(arr) };
      if (arr && arr.length && typeof arr[0] === 'object') return { format: 'JSON', items: I.fromRows(arr) };
      return { format: 'JSON', items: [], error: 'No reconocimos productos en este JSON.' };
    }
    const lines = t.split(/\r?\n/);
    if (lines.length > 1 && /[;,\t]/.test(lines[0]) && lines[0].length < 600) {
      const items = I.fromRows(I.csvRows(t));
      if (items.length) return { format: 'CSV', items };
    }
    return { format: 'text', items: [] };
  };
  I.readFile = function (file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      const isX = /\.xlsx?$/i.test(file.name);
      fr.onerror = () => rej(new Error('No se pudo leer el archivo.'));
      fr.onload = () => {
        if (isX) {
          if (!window.XLSX) return rej(new Error('El lector de Excel no cargó. Exporta el archivo como CSV.'));
          const wb = window.XLSX.read(new Uint8Array(fr.result), { type: 'array' });
          const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
          res({ rows, text: null });
        } else res({ rows: null, text: String(fr.result) });
      };
      if (isX) fr.readAsArrayBuffer(file); else fr.readAsText(file.slice(0, 8e6));
    });
  };

  /* ---------- IA (capability sample) ---------- */
  const errText = (e) => ({
    not_granted: 'Tu rol no permite usar esta función de IA.',
    forbidden: 'Tu rol no permite usar esta función de IA.',
    sampling_disabled: 'La IA no está configurada en el servidor. Avísale al equipo de Tita.',
    rate_limited: 'Se alcanzó el límite de uso de la IA por ahora. Espera un momento e intenta de nuevo.',
    invalid_json: 'La respuesta de la IA no llegó en el formato esperado. Intenta de nuevo; si se repite, usa un lote más pequeño.',
    prompt_too_large: 'Demasiado texto para una sola consulta. Usa un lote más pequeño o pega menos texto.',
    refused: 'La IA no procesó este contenido. Revisa el texto pegado.',
    cancelled: 'Cancelado.',
    session_expired: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  }[e && e.code] || (e && e.message) || 'No se pudo completar la consulta a la IA. Intenta de nuevo.');
  I.errText = errText;
  // Claude se llama a través del servidor (la API key nunca llega al navegador).
  const toB64 = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  I.sample = async function () {
    const L = TP.live;
    if (!L || !L.org) return null;
    const json = async (prompt, opts = {}) => {
      const imgs = opts.images ? (Array.isArray(opts.images) ? opts.images : [opts.images]) : [];
      const images = await Promise.all(imgs.map(async (b) => ({ media_type: b.type || 'image/jpeg', data: await toB64(b) })));
      if (opts.signal && opts.signal.aborted) throw { code: 'cancelled' };
      const r = await L.api('POST', '/orgs/' + L.org + '/ai/json', { prompt, tier: opts.modelTier, kind: opts.kind, images });
      return r.data;
    };
    // Bucle de herramientas para el copiloto: el servidor llama a Claude; las herramientas corren aquí.
    const chat = async (input, opts = {}) => {
      const turns = (typeof input === 'string' ? [{ role: 'user', content: input }] : input).reduce((acc, m) => { const last = acc[acc.length - 1]; if (last && last.role === m.role) last.content += '\n\n' + m.content; else acc.push({ role: m.role, content: m.content }); return acc; }, []);
      const tools = (opts.tools || []).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema || { type: 'object', properties: {} } }));
      let text = '';
      for (let round = 0; round < 6; round++) {
        if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', text };
        const r = await L.api('POST', '/orgs/' + L.org + '/ai/chat', { messages: turns, tools });
        const t = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        if (t) { text = text ? text + '\n\n' + t : t; opts.onText && opts.onText({ text, delta: t }); }
        turns.push({ role: 'assistant', content: r.content });
        const uses = r.content.filter((b) => b.type === 'tool_use');
        if (r.stop_reason !== 'tool_use' || !uses.length) break;
        const results = await Promise.all(uses.map(async (u) => {
          const tool = (opts.tools || []).find((x) => x.name === u.name);
          try { const out = tool ? await tool.execute(u.input || {}, { signal: opts.signal }) : 'Herramienta desconocida'; return { type: 'tool_result', tool_use_id: u.id, content: typeof out === 'string' ? out : JSON.stringify(out).slice(0, 30000) }; }
          catch (e) { return { type: 'tool_result', tool_use_id: u.id, content: 'Error: ' + (e.message || e), is_error: true }; }
        }));
        turns.push({ role: 'user', content: results });
      }
      if (!text) throw { code: 'empty_completion' };
      return { text, truncated: false };
    };
    chat.json = json;
    chat.limits = async () => ({ maxPromptBytes: 250000, tools: { maxCount: 12 }, images: { maxCount: 3, maxInputBytes: 8e6, mediaTypes: ['image/png', 'image/jpeg', 'image/webp'] } });
    return chat;
  };

  I.extractFromText = async function (sample, text, origin, signal) {
    const body = text.replace(/\s+/g, ' ').slice(0, 60000);
    const out = await sample.json(
      'Eres un extractor de catálogos de e-commerce. Del texto de una página de tienda (copiado por el usuario) extrae SOLO los productos a la venta. ' +
      'Ignora menús, filtros, banners y textos legales. No inventes datos: si un campo no aparece, usa null. ' +
      'Responde solo con un arreglo JSON de objetos {"name": string, "price": number (precio de venta actual), "listPrice": number|null (precio tachado o antes del descuento), "category": string|null, "url": string|null}. ' +
      'Los precios como número sin símbolos ni separadores de miles.\n\nTEXTO DE LA PÁGINA (' + (origin || 'tienda') + '):\n' + body,
      { modelTier: 'quick', signal, kind: 'extract' });
    if (!Array.isArray(out)) throw { code: 'invalid_json' };
    return out.map((p, i) => { const pp = pricePair(p.price, p.listPrice); if (!p.name || !pp) return null; return mk({ id: 't:' + I.slug(p.name) + '-' + i, name: p.name, label: p.category, ...pp, url: p.url && /^https?:/.test(p.url) ? p.url : p.url && origin ? origin + (p.url.startsWith('/') ? '' : '/') + p.url : null }); }).filter(Boolean);
  };

  function labelSummary(items, max) {
    const g = {};
    items.forEach((p) => { (g[p.label] = g[p.label] || []).push(p); });
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length).slice(0, max).map(([l, ps]) => `- «${l}» (${ps.length}): ${ps.slice(0, 5).map((p) => p.name).join('; ')}`).join('\n');
  }
  I.proposeCategories = async function (sample, own, comps, ctx, signal) {
    const ex = own.filter((p) => p.desc).slice(0, 30).map((p) => `· ${p.name}: ${p.desc.slice(0, 220)}`).join('\n');
    const out = await sample.json(
      'Actúas como analista de pricing de retail en Latinoamérica. Debes proponer las categorías de análisis de precios de la tienda «' + ctx.storeName + '» y, para cada una, una rúbrica de atributos que explique el precio.\n\n' +
      'Reglas:\n1. Entre 2 y 7 categorías basadas en el catálogo PROPIO; cada una debe agrupar productos comparables entre sí (mismo uso). No mezcles productos de usos distintos.\n' +
      '2. Para cada categoría: "name" (español), "short" (1-2 palabras), "synonyms" (5-10 palabras en minúscula y singular que otras tiendas usan para esa categoría, incluido inglés), "typologies" (3-7 tipos de producto), "materials" (3-6), "colors" (4-8 colores estándar).\n' +
      '3. "attributes": 4 a 6 atributos que el cliente percibe y que explican diferencias de precio. El PRIMERO siempre es la calidad del material principal. Cada atributo con exactamente 5 "levels" ordenados del menor al mayor valor, de 2 a 6 palabras, concretos y verificables en una ficha o foto.\n' +
      '4. No uses nombres de marcas en categorías ni niveles.\n\n' +
      'Responde solo JSON: {"categories":[{"name","short","synonyms":[],"typologies":[],"materials":[],"colors":[],"attributes":[{"name","levels":["","","","",""]}]}]}\n\n' +
      'CATÁLOGO PROPIO por etiqueta (cantidad: ejemplos):\n' + labelSummary(own, 40) + '\n\nEJEMPLOS DE FICHAS PROPIAS:\n' + ex + '\n\nETIQUETAS DE LA COMPETENCIA:\n' + labelSummary(comps, 40),
      { signal, kind: 'propose' });
    const cats = (out && out.categories) || [];
    if (!cats.length) throw { code: 'invalid_json' };
    return cats.map((c, i) => ({
      id: I.slug(c.short || c.name) + '-' + i, name: String(c.name), short: String(c.short || c.name), order: i,
      syn: (c.synonyms || []).map((s) => strip(String(s))).filter(Boolean),
      typologies: (c.typologies || []).map(String).slice(0, 8), materials: (c.materials || []).map(String).slice(0, 8), colors: (c.colors || []).map(String).slice(0, 10),
      attrs: (c.attributes || []).slice(0, 6).map((a, j) => ({ id: j === 0 ? 'mat' : I.slug(a.name).slice(0, 12) + j, name: String(a.name), levels: (a.levels || []).map(String).concat(['', '', '', '', '']).slice(0, 5), weight: 1 })),
    })).filter((c) => c.attrs.length >= 3 && c.typologies.length);
  };

  I.mapLabels = async function (sample, groups, cats, signal) {
    // groups: [{key, store, label, n, examples}]
    const out = await sample.json(
      'Clasifica cada etiqueta de catálogo (de tiendas distintas) en la categoría de análisis que corresponde por el USO real de sus productos, no solo por el nombre. ' +
      'Usa "mixed" si la etiqueta mezcla productos de varias categorías, y null si sus productos no pertenecen a ninguna.\n\n' +
      'CATEGORÍAS:\n' + cats.map((c) => `${c.id}: ${c.name} (tipos: ${c.typologies.join(', ')})`).join('\n') + '\n\nETIQUETAS:\n' +
      groups.map((g, i) => `${i}. ${g.store} · «${g.label}» (${g.n}): ${g.examples.join('; ')}`).join('\n') +
      '\n\nResponde solo JSON: un arreglo con un objeto por etiqueta, {"i": número, "cat": "id de categoría" | "mixed" | null}.',
      { modelTier: 'quick', signal, kind: 'map' });
    if (!Array.isArray(out)) throw { code: 'invalid_json' };
    const res = {};
    out.forEach((o) => { const g = groups[Number(o.i)]; if (g) res[g.key] = o.cat === 'mixed' ? 'mixed' : cats.some((c) => c.id === o.cat) ? o.cat : null; });
    return res;
  };

  I.classifyBatch = async function (sample, cats, items, signal) {
    const catTxt = cats.map((c) => `### ${c.id} — ${c.name}\ntipos: ${c.typologies.join(' | ')}\nmateriales: ${c.materials.join(' | ')}\ncolores: ${c.colors.join(' | ')}\natributos (niveles 1→5):\n` + c.attrs.map((a, j) => `  a${j} ${a.name}: ` + a.levels.map((l, k) => k + 1 + '=' + l).join('; ')).join('\n')).join('\n\n');
    const itTxt = items.map((p, k) => `[${k}] ${p.name} | etiqueta: ${p.label} | ${(p.desc || '').slice(0, 320)}`).join('\n');
    const out = await sample.json(
      'Eres el clasificador de atributos de un sistema de pricing. Para cada producto: elige su categoría (o null si no pertenece a ninguna), su tipo, material y color DE LAS LISTAS, y califica cada atributo de la categoría con el nivel 1 a 5 de la rúbrica.\n' +
      'Reglas: usa solo la evidencia del nombre y la descripción; si un atributo no se puede inferir, pon null (no adivines). "conf" es "alta" si casi todo está explícito, "media" si inferiste varios niveles, "baja" si hay poca información. "ev" es una cita breve (máx. 12 palabras) del texto que más justifica la calificación.\n\n' +
      'CATEGORÍAS Y RÚBRICAS:\n' + catTxt + '\n\nPRODUCTOS:\n' + itTxt +
      '\n\nResponde solo un arreglo JSON, un objeto por producto en el mismo orden: {"k": n, "cat": "id"|null, "typ": string, "mat": string, "color": string, "lv": [n|null, …uno por atributo], "conf": "alta"|"media"|"baja", "ev": string}.',
      { signal, kind: 'classify' });
    if (!Array.isArray(out)) throw { code: 'invalid_json' };
    const res = {};
    out.forEach((o) => {
      const p = items[Number(o.k)]; if (!p) return;
      const c = cats.find((x) => x.id === o.cat);
      if (!c) { res[p.id] = { cat: null, conf: o.conf || 'media' }; return; }
      const near = (v, list) => list.find((x) => strip(x) === strip(String(v || ''))) || list.find((x) => strip(String(v || '')).includes(strip(x)) || strip(x).includes(strip(String(v || '')))) || (v ? String(v).slice(0, 30) : null);
      const lv = c.attrs.map((_, j) => { const v = Array.isArray(o.lv) ? Number(o.lv[j]) : NaN; return v >= 1 && v <= 5 ? Math.round(v) : null; });
      res[p.id] = { cat: c.id, typ: near(o.typ, c.typologies) || c.typologies[0], mat: near(o.mat, c.materials), color: near(o.color, c.colors), lv, conf: ['alta', 'media', 'baja'].includes(o.conf) ? o.conf : 'media', ev: String(o.ev || '').slice(0, 120) };
    });
    return res;
  };

  I.levelsFromImage = async function (sample, cat, image, desc, signal) {
    const out = await sample.json(
      'Mira la imagen de un producto nuevo de la categoría «' + cat.name + '». ' + (desc ? 'Descripción del diseñador: ' + desc.slice(0, 600) + '. ' : '') +
      'Elige tipo, material y color de las listas y califica cada atributo con la rúbrica (1 a 5). Si algo no se ve, usa null.\n' +
      'tipos: ' + cat.typologies.join(' | ') + '\nmateriales: ' + cat.materials.join(' | ') + '\ncolores: ' + cat.colors.join(' | ') + '\n' +
      cat.attrs.map((a, j) => `a${j} ${a.name}: ` + a.levels.map((l, k) => k + 1 + '=' + l).join('; ')).join('\n') +
      '\nResponde solo JSON: {"typ","mat","color","lv":[…],"ev": "qué ves que justifica los niveles (máx. 30 palabras)"}',
      { images: image, signal, kind: 'image' });
    return out || {};
  };

  /* ---------- construcción del dataset analítico desde la base de datos ---------- */
  I.allItems = function (ws) {
    const by = {};
    Object.values(ws.catalog || {}).forEach((ch) => { if (!ch || !ch.sid) return; (ch.items || []).forEach((it) => { by[ch.sid + '~' + it.id] = { ...it, sid: ch.sid, pid: ch.sid + '~' + it.id }; }); });
    return by;
  };
  I.classMap = function (ws) {
    const m = {};
    Object.values(ws.cls || {}).sort((a, b) => (a.at || '').localeCompare(b.at || '')).forEach((b) => Object.assign(m, b.items || {}));
    Object.values(ws.fixes || {}).forEach((f) => Object.entries(f.items || {}).forEach(([pid, v]) => { m[pid] = { ...(m[pid] || {}), ...v, fixed: true }; }));
    return m;
  };
  I.labelMap = function (ws) { const m = {}; Object.values(ws.labelmap || {}).forEach((d) => Object.assign(m, d.items || {})); return m; };
  I.privMap = function (ws) { const m = {}; Object.values(ws.priv || {}).forEach((d) => Object.assign(m, d.items || {})); return m; };

  I.buildDataset = function (ws) {
    const cfg = ws.config || {};
    const mkt = TP.MARKETS[cfg.market || 'CO'];
    const cats = Object.entries(ws.cats || {}).map(([id, c]) => ({ ...c, id, syn: [...new Set([...(c.syn || []), ...strip(c.name).split(/\s+/).filter((w) => w.length > 3)])] })).sort((a, b) => (a.order || 0) - (b.order || 0));
    const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
    const stores = ws.stores || {};
    const brands = [{ id: 'own', name: (stores.own && stores.own.name) || cfg.storeName || 'Mi tienda', own: true }, ...Object.entries(stores).filter(([id]) => id !== 'own').map(([id, s]) => ({ id, name: s.name, url: s.url }))];
    const items = I.allItems(ws), cm = I.classMap(ws), lm = I.labelMap(ws), pm = I.privMap(ws);
    const products = [];
    let pending = 0;
    Object.values(items).forEach((it) => {
      if (!stores[it.sid]) return;
      const c = cm[it.pid];
      if (!c) { if (lm[it.sid + '|' + it.label] !== null) pending++; return; }
      const cat = c.cat ? catById[c.cat] : null;
      if (c.cat && !cat) { pending++; return; }
      const labelKey = it.sid + '|' + it.label;
      const p = { id: it.pid, brand: it.sid === 'own' ? 'own' : it.sid, label: labelKey, cat: cat ? cat.id : null, srcCat: lm[labelKey] && lm[labelKey] !== 'mixed' ? lm[labelKey] : null, typ: c.typ || 'Otro', mat: c.mat || '—', color: c.color || '—', lvRaw: cat ? (c.lv || []).slice(0, cat.attrs.length) : [], list: it.price, promo: it.promo, name: it.name, url: it.url, hasDesc: !!it.desc, matPublic: true, conf: c.conf, ev: c.ev, fixed: !!c.fixed, collection: it.label, season: null, sku: it.sku };
      if (p.brand === 'own') {
        const pr = (it.sku && pm[strip(it.sku)]) || pm[strip(it.name)];
        if (pr) { if (pr.cost > 0) p.cost = pr.cost; if (pr.sold != null && pr.planned > 0) p.st = TP.clamp(pr.sold / pr.planned, 0, 1.5); if (pr.weekly != null) p.units = pr.weekly; }
      }
      products.push(p);
    });
    // imputar niveles faltantes con la mediana de la categoría (se marca cuántos)
    cats.forEach((c) => {
      const ps = products.filter((p) => p.cat === c.id);
      const med = c.attrs.map((_, j) => { const v = ps.map((p) => p.lvRaw[j]).filter((x) => x >= 1); return v.length ? Math.round(TP.median(v)) : 3; });
      ps.forEach((p) => { p.imputed = 0; p.lv = c.attrs.map((_, j) => { const v = p.lvRaw[j]; if (v >= 1) return v; p.imputed++; return med[j]; }); p.matPublic = p.lvRaw[0] >= 1; });
    });
    const labels = {};
    products.forEach((p) => { const l = (labels[p.label] = labels[p.label] || { key: p.label, brand: p.brand, name: p.label.split('|').slice(1).join('|'), comp: {}, ids: [] }); l.ids.push(p.id); const k = p.cat || '_x'; l.comp[k] = (l.comp[k] || 0) + 1; });
    const byId = Object.fromEntries(products.map((p) => [p.id, p]));
    return { mk: mkt, cats, catById, brands, brandById: Object.fromEntries(brands.map((b) => [b.id, b])), products, byId, labels: Object.values(labels), pending, totalItems: Object.keys(items).length, V: { collections: [...new Set(products.filter((p) => p.brand === 'own').map((p) => p.collection))].slice(0, 12) } };
  };

  // productos candidatos a clasificar: no clasificados y en etiquetas mapeadas a alguna categoría (o mixtas / sin mapear)
  I.queue = function (ws, activeStores) {
    const items = I.allItems(ws), cm = I.classMap(ws), lm = I.labelMap(ws);
    return Object.values(items).filter((it) => activeStores.includes(it.sid) && !cm[it.pid] && lm[it.sid + '|' + it.label] !== null);
  };
})();
