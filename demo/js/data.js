/* TITA Pricing Intelligence 360° — motor de datos de demostración y analítica.
   Todo lo que hay aquí corre en el navegador sobre datos ficticios generados de forma
   determinística (misma URL + mismo mercado = mismos datos). */
(function () {
  'use strict';
  const TP = (window.TP = {});

  /* ---------- utilidades ---------- */
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : NaN);
  function quantile(arr, p) {
    if (!arr.length) return NaN;
    const s = [...arr].sort((x, y) => x - y);
    const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  }
  const median = (a) => quantile(a, 0.5);
  Object.assign(TP, { hashStr, rng, gauss, clamp, strip, sum, mean, quantile, median });

  /* ---------- mercados ---------- */
  TP.MARKETS = {
    CO: { id: 'CO', name: 'Colombia', currency: 'COP', symbol: '$', fx: 1, locale: 'es-CO', dec: 0, step: 10000 },
    MX: { id: 'MX', name: 'México', currency: 'MXN', symbol: '$', fx: 1 / 215, locale: 'es-MX', dec: 0, step: 50 },
    PE: { id: 'PE', name: 'Perú', currency: 'PEN', symbol: 'S/ ', fx: 1 / 1080, locale: 'es-PE', dec: 2, step: 10 },
    CL: { id: 'CL', name: 'Chile', currency: 'CLP', symbol: '$', fx: 1 / 4.2, locale: 'es-CL', dec: 0, step: 5000 },
  };
  TP.ROUNDING = {
    psico: 'Terminación psicológica del mercado',
    multiplo: 'Múltiplo comercial',
    none: 'Sin redondeo',
  };
  TP.roundingExample = function (mk) {
    return { CO: 'termina en 900 (p. ej. 349.900)', MX: 'termina en 9 (p. ej. 1.899)', PE: 'termina en ,90 (p. ej. 289,90)', CL: 'termina en 990 (p. ej. 79.990)' }[mk.id];
  };
  TP.roundPrice = function (v, mk, mode) {
    if (!(v > 0)) return v;
    if (mode === 'none') return mk.dec ? Math.round(v * 100) / 100 : Math.round(v);
    if (mode === 'multiplo') return Math.max(mk.step, Math.round(v / mk.step) * mk.step);
    switch (mk.id) {
      case 'CO': return Math.max(900, Math.round(v / 1000) * 1000 - 100);
      case 'MX': return Math.max(9, Math.round(v / 10) * 10 - 1);
      case 'PE': return Math.max(0.9, Math.round(v) - 0.1);
      case 'CL': return Math.max(990, Math.round(v / 1000) * 1000 - 10);
      default: return Math.round(v);
    }
  };
  TP.fmt = function (v, mk, compact) {
    if (v == null || !isFinite(v)) return '—';
    if (compact && v >= 100000) {
      if (v >= 1e6) return mk.symbol + (v / 1e6).toLocaleString(mk.locale, { maximumFractionDigits: 1 }) + ' M';
      return mk.symbol + Math.round(v / 1000).toLocaleString(mk.locale) + ' mil';
    }
    return mk.symbol + v.toLocaleString(mk.locale, { minimumFractionDigits: mk.dec, maximumFractionDigits: mk.dec });
  };
  TP.pct = (x, d = 0, signed = true) => { if (x == null || !isFinite(x)) return '—'; if (Math.abs(x * 100) < 0.5 * Math.pow(10, -d)) x = 0; return (signed && x > 0 ? '+' : '') + (x * 100).toFixed(d).replace('.', ',') + ' %'; };

  /* ---------- verticales (catálogos de demostración genéricos) ---------- */
  const L5 = (a) => a; // legibilidad
  TP.VERTICALS = {
    moda: {
      id: 'moda', label: 'Moda, calzado y marroquinería', storeName: 'Atelier Norte',
      unrelated: ['Maleta de cabina', 'Duffel de viaje'],
      collections: ['Esencial', 'Urbana', 'Atelier', 'Resort'],
      categories: [
        {
          id: 'bolsos', name: 'Bolsos de mujer', short: 'Bolsos', syn: ['bolso', 'cartera', 'handbag', 'bag', 'tote'],
          typologies: ['Tote', 'Bandolera', 'Satchel', 'Clutch', 'Shopper'], typEff: [0.04, -0.03, 0.05, -0.06, 0],
          materials: ['Cuero vacuno', 'Cuero sintético', 'Lona encerada', 'Nylon técnico'], matLv: [[4, 5], [1, 2], [2, 3], [2, 3]],
          colors: ['Negro', 'Café', 'Camel', 'Vino', 'Beige', 'Verde oliva', 'Azul noche'],
          base: 420000, sigma: 0.12, ownN: 42, ownTwist: { Tote: -0.14, Satchel: -0.1, Clutch: 0.24 },
          attrs: [
            { id: 'mat', name: 'Calidad del material', b: 0.15, levels: L5(['Sintético básico', 'Sintético premium o lona', 'Cuero corregido', 'Cuero flor', 'Cuero plena flor']) },
            { id: 'con', name: 'Construcción y acabados', b: 0.1, levels: ['Costura simple', 'Costura reforzada', 'Cantos pintados', 'Acabado a mano parcial', 'Acabado artesanal'] },
            { id: 'her', name: 'Herrajes', b: 0.06, levels: ['Plásticos', 'Metal liviano', 'Metal macizo', 'Metal con baño', 'Herraje de diseño propio'] },
            { id: 'fun', name: 'Funcionalidad interior', b: 0.04, levels: ['Un compartimento', 'Bolsillo interno', 'Organizador básico', 'Organizador con cierre', 'Sistema modular'] },
            { id: 'dis', name: 'Diseño y diferenciación', b: 0.09, levels: ['Básico de línea', 'Detalle de temporada', 'Diseño propio', 'Firma reconocible', 'Pieza de autor'] },
            { id: 'tam', name: 'Tamaño y capacidad', b: 0.035, levels: ['Mini', 'Pequeño', 'Mediano', 'Grande', 'Extra grande'] },
          ],
        },
        {
          id: 'billeteras', name: 'Billeteras', short: 'Billeteras', syn: ['billetera', 'wallet', 'tarjetero', 'monedero'],
          typologies: ['Billetera larga', 'Tarjetero', 'Monedero', 'Billetera plegable'], typEff: [0.06, -0.08, -0.06, 0],
          materials: ['Cuero vacuno', 'Cuero sintético', 'Cuero grabado', 'Nylon técnico'], matLv: [[3, 5], [1, 2], [4, 5], [1, 3]],
          colors: ['Negro', 'Café', 'Camel', 'Vino', 'Rosa palo', 'Azul noche'],
          base: 160000, sigma: 0.12, ownN: 24, ownTwist: { Tarjetero: -0.12, 'Billetera larga': 0.2 },
          attrs: [
            { id: 'mat', name: 'Calidad del material', b: 0.14, levels: ['Sintético básico', 'Sintético premium', 'Cuero corregido', 'Cuero flor', 'Cuero plena flor'] },
            { id: 'con', name: 'Construcción y acabados', b: 0.1, levels: ['Costura simple', 'Costura reforzada', 'Cantos pintados', 'Acabado a mano parcial', 'Acabado artesanal'] },
            { id: 'org', name: 'Compartimentos y organización', b: 0.05, levels: ['Básica', 'Estándar', 'Ampliada', 'Con monedero', 'Modular'] },
            { id: 'pro', name: 'Protección y cierre', b: 0.03, levels: ['Sin cierre', 'Broche', 'Cremallera', 'Cremallera + RFID', 'Bloqueo RFID integral'] },
            { id: 'dis', name: 'Diseño y diferenciación', b: 0.08, levels: ['Básico de línea', 'Detalle de temporada', 'Diseño propio', 'Firma reconocible', 'Pieza de autor'] },
          ],
        },
        {
          id: 'calzado', name: 'Calzado de mujer', short: 'Calzado', syn: ['calzado', 'zapato', 'shoe', 'sandalia', 'sneaker', 'boot', 'botin'],
          typologies: ['Botín', 'Mocasín', 'Sandalia', 'Tenis urbano', 'Bailarina'], typEff: [0.08, 0.02, -0.06, 0, -0.04],
          materials: ['Cuero vacuno', 'Gamuza', 'Cuero sintético', 'Textil técnico'], matLv: [[4, 5], [3, 4], [1, 2], [2, 3]],
          colors: ['Negro', 'Café', 'Camel', 'Blanco', 'Vino', 'Nude'],
          base: 300000, sigma: 0.12, ownN: 30, ownTwist: { Botín: -0.12, Sandalia: 0.24 },
          attrs: [
            { id: 'mat', name: 'Material de la capellada', b: 0.13, levels: ['Sintético básico', 'Textil', 'Cuero corregido', 'Cuero flor', 'Cuero plena flor'] },
            { id: 'sue', name: 'Suela', b: 0.07, levels: ['PVC', 'TR', 'Caucho', 'Caucho vulcanizado', 'Cuero y caucho cosido'] },
            { id: 'cnf', name: 'Plantilla y confort', b: 0.06, levels: ['Plana', 'Acolchada', 'Memory foam', 'Anatómica', 'Anatómica removible'] },
            { id: 'con', name: 'Construcción', b: 0.09, levels: ['Pegado básico', 'Pegado reforzado', 'Cosido parcial', 'Cosido Blake', 'Goodyear'] },
            { id: 'dis', name: 'Diseño y diferenciación', b: 0.08, levels: ['Básico de línea', 'Detalle de temporada', 'Diseño propio', 'Firma reconocible', 'Pieza de autor'] },
          ],
        },
        {
          id: 'morrales', name: 'Morrales', short: 'Morrales', syn: ['morral', 'mochila', 'backpack'],
          typologies: ['Morral urbano', 'Morral portátil', 'Mini morral'], typEff: [0, 0.05, -0.06],
          materials: ['Cuero vacuno', 'Nylon técnico', 'Lona encerada', 'Cuero sintético'], matLv: [[4, 5], [2, 3], [2, 3], [1, 2]],
          colors: ['Negro', 'Café', 'Gris', 'Verde oliva', 'Azul noche'],
          base: 280000, sigma: 0.12, ownN: 12, ownTwist: {},
          attrs: [
            { id: 'mat', name: 'Calidad del material', b: 0.13, levels: ['Sintético básico', 'Lona', 'Nylon técnico', 'Cuero flor', 'Cuero plena flor'] },
            { id: 'con', name: 'Construcción y acabados', b: 0.08, levels: ['Costura simple', 'Costura reforzada', 'Cantos pintados', 'Acabado a mano parcial', 'Acabado artesanal'] },
            { id: 'org', name: 'Organización y protección', b: 0.07, levels: ['Un compartimento', 'Bolsillos básicos', 'Funda para portátil', 'Funda + organizador', 'Sistema modular'] },
            { id: 'erg', name: 'Ergonomía', b: 0.05, levels: ['Correas simples', 'Correas acolchadas', 'Espalda acolchada', 'Espalda ventilada', 'Sistema ergonómico'] },
            { id: 'dis', name: 'Diseño y diferenciación', b: 0.06, levels: ['Básico de línea', 'Detalle de temporada', 'Diseño propio', 'Firma reconocible', 'Pieza de autor'] },
          ],
        },
      ],
      brands: [
        { id: 'cuerolab', name: 'Cuerolab', eff: 0.05, lvl: 0.45, promo: 0.12, labels: [['Carteras', { bolsos: 30 }], ['Billeteras y tarjeteros', { billeteras: 16 }], ['Zapatos', { calzado: 22 }]] },
        { id: 'rutasur', name: 'Ruta Sur', eff: -0.07, lvl: 0.25, promo: 0.46, labels: [['Bolsos', { bolsos: 32 }], ['Mochilas', { morrales: 7 }], ['Calzado mujer', { calzado: 26 }]] },
        { id: 'boveda', name: 'Bóveda', eff: 0.0, lvl: 0.0, promo: 0.2, labels: [['Handbags', { bolsos: 26 }], ['Wallets', { billeteras: 14 }]] },
        { id: 'lumen', name: 'Maison Lumen', eff: 0.12, lvl: 1.0, promo: 0.05, labels: [['Bolsos y accesorios', { bolsos: 22, billeteras: 12 }], ['Shoes', { calzado: 14 }]] },
        { id: 'pampa', name: 'Pampa & Co', eff: -0.08, lvl: -0.85, promo: 0.3, labels: [['Bolsos', { bolsos: 28 }], ['Bolsos de viaje', { _x: 12 }], ['Billeteras', { billeteras: 12 }], ['Calzado', { calzado: 24 }]] },
        { id: 'nomada', name: 'Nómada Estudio', eff: 0.02, lvl: -0.1, promo: 0.25, labels: [['Mochilas y bolsos', { morrales: 9, bolsos: 11 }], ['Marroquinería', { billeteras: 10, bolsos: 4 }]] },
        { id: 'verso', name: 'Verso', eff: -0.05, lvl: -0.35, promo: 0.35, labels: [['Carteras', { bolsos: 24 }], ['Sandalias y zapatos', { calzado: 18 }]] },
        { id: 'km0', name: 'Kilómetro Cero', eff: 0.09, lvl: 0.65, promo: 0.1, labels: [['Bags', { bolsos: 16 }], ['Backpacks', { morrales: 6 }], ['Sneakers & boots', { calzado: 12 }]] },
      ],
    },
    hogar: {
      id: 'hogar', label: 'Hogar y muebles', storeName: 'Casa Viento',
      unrelated: ['Sala de exterior', 'Almohada'],
      collections: ['Esencial', 'Nórdica', 'Atelier', 'Contract'],
      categories: [
        {
          id: 'sala', name: 'Muebles de sala', short: 'Sala', syn: ['sala', 'sofa', 'living', 'sillon', 'poltrona'],
          typologies: ['Sofá 3 puestos', 'Sofá modular', 'Poltrona', 'Mesa de centro'], typEff: [0.04, 0.1, -0.1, -0.16],
          materials: ['Tela antifluidos', 'Lino', 'Cuero', 'Microfibra'], matLv: [[2, 4], [3, 4], [4, 5], [1, 2]],
          colors: ['Gris', 'Beige', 'Arena', 'Verde salvia', 'Terracota', 'Azul petróleo'],
          base: 2600000, sigma: 0.12, ownN: 32, ownTwist: { 'Sofá modular': -0.15, Poltrona: 0.24 },
          attrs: [
            { id: 'mat', name: 'Tapicería', b: 0.12, levels: ['Tela básica', 'Microfibra', 'Antifluidos', 'Lino', 'Cuero'] },
            { id: 'est', name: 'Estructura', b: 0.11, levels: ['Aglomerado', 'MDF', 'Pino', 'Madera maciza', 'Maciza secada al horno'] },
            { id: 'cnf', name: 'Espuma y confort', b: 0.08, levels: ['Densidad 18', 'Densidad 23', 'Densidad 26', 'Alta resiliencia', 'Pluma + HR'] },
            { id: 'aca', name: 'Acabados', b: 0.06, levels: ['Básico', 'Estándar', 'Costura doble', 'Detalle artesanal', 'A medida'] },
            { id: 'dis', name: 'Diseño y diferenciación', b: 0.08, levels: ['Básico de línea', 'Detalle de temporada', 'Diseño propio', 'Firma reconocible', 'Pieza de autor'] },
          ],
        },
        {
          id: 'comedor', name: 'Comedores', short: 'Comedores', syn: ['comedor', 'dining'],
          typologies: ['Comedor 4 puestos', 'Comedor 6 puestos', 'Comedor 8 puestos'], typEff: [-0.1, 0.02, 0.12],
          materials: ['Madera maciza', 'MDF enchapado', 'Vidrio templado', 'Sinterizado'], matLv: [[4, 5], [1, 2], [2, 3], [4, 5]],
          colors: ['Natural', 'Nogal', 'Blanco', 'Negro', 'Gris'],
          base: 2300000, sigma: 0.12, ownN: 18, ownTwist: { 'Comedor 6 puestos': -0.12 },
          attrs: [
            { id: 'mat', name: 'Superficie', b: 0.12, levels: ['Melamina', 'MDF enchapado', 'Vidrio templado', 'Madera maciza', 'Sinterizado o mármol'] },
            { id: 'est', name: 'Estructura y patas', b: 0.1, levels: ['Metal liviano', 'MDF', 'Pino', 'Madera maciza', 'Metal forjado o maciza'] },
            { id: 'sil', name: 'Sillas incluidas', b: 0.07, levels: ['Plásticas', 'Tapizado básico', 'Tapizado antifluidos', 'Madera tapizada', 'Diseño de autor'] },
            { id: 'aca', name: 'Acabados', b: 0.06, levels: ['Básico', 'Estándar', 'Laca', 'Detalle artesanal', 'A medida'] },
            { id: 'dis', name: 'Diseño y diferenciación', b: 0.08, levels: ['Básico de línea', 'Detalle de temporada', 'Diseño propio', 'Firma reconocible', 'Pieza de autor'] },
          ],
        },
        {
          id: 'colchones', name: 'Colchones', short: 'Colchones', syn: ['colchon', 'mattress', 'descanso'],
          typologies: ['Sencillo', 'Semidoble', 'Doble', 'Queen', 'King'], typEff: [-0.1, -0.05, 0, 0.05, 0.1],
          materials: ['Espuma', 'Resortes pocket', 'Híbrido', 'Látex'], matLv: [[1, 2], [3, 4], [4, 5], [4, 5]],
          colors: ['Blanco', 'Gris', 'Beige'],
          base: 1500000, sigma: 0.12, ownN: 20, ownTwist: { Queen: -0.14, Sencillo: 0.22 },
          attrs: [
            { id: 'mat', name: 'Sistema de soporte', b: 0.12, levels: ['Espuma básica', 'Espuma HR', 'Resortes bonell', 'Resortes pocket', 'Pocket + látex'] },
            { id: 'cnf', name: 'Capas de confort', b: 0.1, levels: ['Una capa', 'Dos capas', 'Memory foam', 'Látex', 'Pillow top premium'] },
            { id: 'tel', name: 'Tela y acolchado', b: 0.05, levels: ['Básica', 'Tejido de punto', 'Antiácaros', 'Bambú', 'Térmica'] },
            { id: 'gar', name: 'Garantía y durabilidad', b: 0.07, levels: ['1 año', '3 años', '5 años', '8 años', '10 años o más'] },
            { id: 'dis', name: 'Diferenciación', b: 0.05, levels: ['Básico', 'Línea estándar', 'Línea propia', 'Línea premium', 'Línea firma'] },
          ],
        },
        {
          id: 'ilum', name: 'Iluminación', short: 'Iluminación', syn: ['lampara', 'iluminacion', 'lighting', 'luz'],
          typologies: ['Lámpara de pie', 'Lámpara de mesa', 'Lámpara colgante'], typEff: [0.08, -0.1, 0.02],
          materials: ['Metal', 'Madera', 'Cerámica', 'Fibras naturales'], matLv: [[2, 4], [3, 4], [3, 5], [2, 3]],
          colors: ['Negro', 'Natural', 'Blanco', 'Latón'],
          base: 380000, sigma: 0.12, ownN: 10, ownTwist: {},
          attrs: [
            { id: 'mat', name: 'Material', b: 0.12, levels: ['Plástico', 'Metal liviano', 'Madera', 'Cerámica', 'Latón o vidrio soplado'] },
            { id: 'aca', name: 'Acabados', b: 0.08, levels: ['Básico', 'Estándar', 'Pintura electrostática', 'Detalle artesanal', 'Hecho a mano'] },
            { id: 'tec', name: 'Tecnología', b: 0.05, levels: ['Bombillo básico', 'LED', 'LED regulable', 'LED cálido regulable', 'Inteligente'] },
            { id: 'dis', name: 'Diseño y diferenciación', b: 0.08, levels: ['Básico de línea', 'Detalle de temporada', 'Diseño propio', 'Firma reconocible', 'Pieza de autor'] },
          ],
        },
      ],
      brands: [
        { id: 'maderaviva', name: 'Madera Viva', eff: 0.06, lvl: 0.5, promo: 0.12, labels: [['Salas', { sala: 26 }], ['Comedores', { comedor: 20 }]] },
        { id: 'nido', name: 'Nido Hogar', eff: -0.07, lvl: -0.2, promo: 0.45, labels: [['Sofás y sillones', { sala: 30 }], ['Colchones', { colchones: 24 }], ['Muebles de exterior', { _x: 10 }]] },
        { id: 'prisma', name: 'Casa Prisma', eff: 0, lvl: 0.1, promo: 0.2, labels: [['Living', { sala: 22 }], ['Mesas', { comedor: 14, sala: 8 }]] },
        { id: 'habitat', name: 'Habitat Sur', eff: -0.08, lvl: -0.8, promo: 0.3, labels: [['Muebles', { sala: 18, comedor: 12 }], ['Descanso', { colchones: 22, _x: 8 }], ['Lámparas', { ilum: 8 }]] },
        { id: 'forma', name: 'Forma Studio', eff: 0.12, lvl: 1.0, promo: 0.05, labels: [['Sofás', { sala: 18 }], ['Dining', { comedor: 14 }], ['Lighting', { ilum: 9 }]] },
        { id: 'descanso', name: 'Descanso Real', eff: 0.03, lvl: 0.3, promo: 0.25, labels: [['Colchones', { colchones: 30 }]] },
        { id: 'lumbre', name: 'Lumbre', eff: 0, lvl: 0.2, promo: 0.15, labels: [['Iluminación', { ilum: 10 }]] },
        { id: 'atico', name: 'Ático', eff: -0.04, lvl: -0.3, promo: 0.35, labels: [['Salas', { sala: 20 }], ['Comedores', { comedor: 16 }], ['Colchones', { colchones: 14 }]] },
      ],
    },
  };

  const NAMES = ['Alba', 'Brisa', 'Cora', 'Duna', 'Eco', 'Fara', 'Gala', 'Iris', 'Jade', 'Kora', 'Luna', 'Mara', 'Nube', 'Olmo', 'Pía', 'Rumba', 'Sena', 'Tila', 'Vera', 'Zuri', 'Aura', 'Bruma', 'Cira', 'Delta', 'Lía', 'Nora', 'Oda', 'Roble', 'Selva', 'Tierra', 'Ámbar', 'Coral', 'Índigo', 'Milo', 'Sal', 'Trigo'];

  /* ---------- detección desde la URL (simulada, determinística) ---------- */
  TP.detectFromUrl = function (raw) {
    let s = (raw || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    let host;
    try { host = new URL(s).hostname.replace(/^www\./, ''); } catch (e) { return null; }
    if (!host.includes('.')) return null;
    const parts = host.split('.');
    const tld = parts[parts.length - 1];
    const label = parts[0].replace(/[-_]+/g, ' ');
    const name = label.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const k = strip(host);
    const vertical = /(casa|hogar|home|mueble|deco|sofa|colchon|living)/.test(k) ? 'hogar' : 'moda';
    const market = { co: 'CO', mx: 'MX', pe: 'PE', cl: 'CL' }[tld] || 'CO';
    const platforms = ['Shopify', 'VTEX', 'WooCommerce', 'Magento (Adobe Commerce)', 'Plataforma propia'];
    const platform = platforms[hashStr(host) % platforms.length];
    return { host, url: 'https://' + host, name: name || 'Mi tienda', vertical, market, platform, tldKnown: !!{ co: 1, mx: 1, pe: 1, cl: 1 }[tld] };
  };

  /* ---------- generación del dataset ---------- */
  function pickWeighted(r, weights) {
    const t = sum(weights) * r();
    let acc = 0;
    for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (t <= acc) return i; }
    return weights.length - 1;
  }

  TP.buildDataset = function ({ vertical, market, storeName, host }) {
    const V = TP.VERTICALS[vertical];
    const mk = TP.MARKETS[market];
    const r = rng(hashStr(vertical + '|' + market + '|' + (host || storeName)));
    const cats = V.categories.map((c) => ({ ...c, b0: Math.log(c.base) - c.attrs.reduce((s, a) => s + a.b * 3, 0) }));
    const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
    const own = { id: 'own', name: storeName, own: true, eff: -0.04, lvl: 0.2, promo: 0.18 };
    const brands = [own, ...V.brands];
    const products = [];
    const labels = [];
    let nameIdx = Math.floor(r() * NAMES.length);

    function gen(cat, brand, label, opts) {
      const isOwn = !!brand.own;
      const unrelated = opts && opts.unrelated;
      let typ, ti = 0;
      if (unrelated) typ = V.unrelated[Math.floor(r() * V.unrelated.length)];
      else { ti = Math.floor(r() * cat.typologies.length); typ = cat.typologies[ti]; }
      const c = cat || cats[0];
      const mw = c.matLv.map((rg) => Math.exp((brand.lvl || 0) * ((rg[0] + rg[1]) / 2 - 3) * 0.9));
      const mi = pickWeighted(r, mw);
      const rg = c.matLv[mi];
      const collection = isOwn ? V.collections[Math.floor(r() * V.collections.length)] : null;
      const bump = collection === 'Atelier' ? 0.7 : collection === 'Esencial' ? -0.3 : 0;
      const lv = c.attrs.map((a) => (a.id === 'mat' ? rg[0] + Math.floor(r() * (rg[1] - rg[0] + 1)) : clamp(Math.round(3 + (brand.lvl || 0) + bump + gauss(r) * 1.05), 1, 5)));
      let lnp = c.b0 + c.attrs.reduce((s, a, i) => s + a.b * lv[i], 0) + (unrelated ? -0.15 : c.typEff[ti]) + (brand.eff || 0) + gauss(r) * c.sigma;
      let twist = 0;
      if (isOwn) { twist = (c.ownTwist[typ] || 0) + gauss(r) * 0.08; lnp += twist; }
      let list = TP.roundPrice(Math.exp(lnp) * mk.fx, mk, 'psico');
      let promo = null;
      if (r() < (brand.promo || 0)) {
        const d = [0.15, 0.2, 0.25, 0.3, 0.4][Math.floor(r() * 5)];
        promo = TP.roundPrice(list * (1 - d), mk, 'psico');
      }
      const nm = NAMES[nameIdx++ % NAMES.length];
      const p = {
        id: brand.id + '-' + (cat ? cat.id : 'x') + '-' + products.length,
        brand: brand.id, label, cat: unrelated ? null : c.id, srcCat: c.id, typ, mat: unrelated ? 'Poliéster' : c.materials[mi],
        color: c.colors[Math.floor(r() * c.colors.length)], lv, list, promo,
        name: typ + ' ' + nm, hasDesc: r() > 0.13, matPublic: r() > 0.09, collection,
        season: isOwn ? (r() < 0.6 ? 'Permanente' : 'Temporada') : null, _twist: twist,
      };
      if (isOwn) {
        const m = 0.6 + r() * 0.12 + twist * 0.4;
        p.cost = Math.round((list * (1 - clamp(m, 0.45, 0.78))) / (mk.dec ? 0.01 : 1)) * (mk.dec ? 0.01 : 1);
        p.st = clamp(0.62 - 1.6 * twist + (lv[lv.length - 1] - 3) * 0.05 + gauss(r) * 0.07, 0.12, 0.95);
      }
      products.push(p);
      return p;
    }

    // catálogo propio
    cats.forEach((c) => {
      const lab = { key: 'own|' + c.id, brand: 'own', name: c.name, comp: { [c.id]: c.ownN }, ids: [] };
      for (let i = 0; i < c.ownN; i++) lab.ids.push(gen(c, own, lab.key).id);
      labels.push(lab);
    });
    // competencia
    V.brands.forEach((b) => {
      b.labels.forEach(([lname, mix]) => {
        const lab = { key: b.id + '|' + lname, brand: b.id, name: lname, comp: { ...mix }, ids: [] };
        Object.entries(mix).forEach(([cid, n]) => {
          for (let i = 0; i < n; i++) lab.ids.push(gen(cid === '_x' ? catById[Object.keys(mix).find((k) => k !== '_x') || cats[0].id] || cats[0] : catById[cid], b, lab.key, { unrelated: cid === '_x' }).id);
        });
        labels.push(lab);
      });
    });
    // atípicos de captura (p. ej. precio de un set publicado como unitario)
    cats.forEach((c) => {
      const pool = products.filter((p) => p.cat === c.id && p.brand !== 'own');
      if (pool.length > 60) for (let k = 0; k < 2; k++) { const p = pool[Math.floor(r() * pool.length)]; p.list = TP.roundPrice(p.list * 2.7, mk, 'psico'); p.promo = null; p._outlier = true; }
    });
    const byId = Object.fromEntries(products.map((p) => [p.id, p]));
    return { V, mk, cats, catById, brands, brandById: Object.fromEntries(brands.map((b) => [b.id, b])), products, byId, labels };
  };

  /* ---------- homologación de categorías (motor de reglas sobre señales simuladas de IA) ---------- */
  const GENERIC = ['accesorios', 'marroquineria', 'muebles', 'hogar', 'descanso'];
  TP.nameScore = function (label, cat) {
    const t = strip(label);
    if (cat.syn.some((s) => t.includes(s))) return 'alta';
    if (GENERIC.some((g) => t.includes(g))) return 'media';
    return 'baja';
  };
  TP.homologate = function (D) {
    const own = {};
    D.cats.forEach((c) => {
      const ps = D.products.filter((p) => p.brand === 'own' && p.cat === c.id).map((p) => p.list);
      own[c.id] = { lo: quantile(ps, 0.1), hi: quantile(ps, 0.9) };
    });
    const out = [];
    D.labels.filter((l) => l.brand !== 'own').forEach((l) => {
      const ps = l.ids.map((id) => D.byId[id]);
      const total = ps.length;
      D.cats.forEach((c) => {
        const n = ps.filter((p) => p.cat === c.id).length;
        const share = n / total;
        const ns = TP.nameScore(l.name, c);
        let status = null;
        if (share >= 0.85) status = 'equiv';
        else if (share >= 0.2) status = 'partial';
        else if (share === 0 && ns !== 'baja' && ps.some((p) => p.cat === null && p.srcCat === c.id)) status = 'noequiv';
        if (!status) return;
        const typCount = {};
        ps.forEach((p) => (typCount[p.typ] = (typCount[p.typ] || 0) + 1));
        const typs = Object.entries(typCount).sort((a, b) => b[1] - a[1]);
        const matOk = ps.filter((p) => c.materials.includes(p.mat)).length / total;
        const prices = ps.map((p) => p.list);
        const lo = quantile(prices, 0.1), hi = quantile(prices, 0.9);
        const ov = Math.max(0, Math.min(hi, own[c.id].hi) - Math.max(lo, own[c.id].lo)) / Math.max(1, Math.max(hi, own[c.id].hi) - Math.min(lo, own[c.id].lo));
        const outside = typs.filter(([t]) => !c.typologies.includes(t));
        let reason;
        if (status === 'equiv') reason = `El nombre «${l.name}» es ${ns === 'alta' ? 'equivalente' : 'distinto'} al tuyo, pero lo decisivo es el contenido: ${Math.round(share * 100)} % de sus ${total} productos corresponde a tipologías de ${c.name.toLowerCase()} (${typs.slice(0, 3).map((t) => t[0]).join(', ')}).`;
        else if (status === 'partial') reason = `Categoría mixta: ${n} de ${total} productos son de ${c.name.toLowerCase()}; el resto (${outside.slice(0, 2).map((t) => t[0]).join(', ') || 'otras tipologías'}) pertenece a otra categoría. Se propone segmentar y comparar solo las tipologías equivalentes.`;
        else reason = `El nombre se parece a «${c.name}», pero las imágenes y descripciones muestran ${typs.slice(0, 2).map((t) => t[0].toLowerCase()).join(' y ')}: otro uso y otra tipología. No se recomienda compararla.`;
        out.push({ key: l.key + '>' + c.id, label: l, cat: c.id, brand: l.brand, status, share, n, total, ns, typs, matOk, ov, reason, sample: ps.filter((p) => status === 'noequiv' || p.cat === c.id).slice(0, 3) });
      });
    });
    return out;
  };
  // ¿qué productos de competencia entran a una categoría dadas las decisiones del usuario?
  TP.categoryPool = function (D, H, catId, comps, mapDec) {
    const ids = new Set();
    H.filter((h) => h.cat === catId && comps.includes(h.brand)).forEach((h) => {
      const d = mapDec[h.key];
      if (d === 'reject') return;
      if (h.status === 'noequiv' && d !== 'accept' && d !== 'all') return;
      const all = d === 'all' || h.status === 'noequiv';
      h.label.ids.forEach((id) => { const p = D.byId[id]; if (all || p.cat === catId) ids.add(id); });
    });
    return [...ids].map((id) => D.byId[id]);
  };

  /* ---------- álgebra lineal mínima ---------- */
  function invert(M) {
    const n = M.length, A = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r2 = c + 1; r2 < n; r2++) if (Math.abs(A[r2][c]) > Math.abs(A[piv][c])) piv = r2;
      if (Math.abs(A[piv][c]) < 1e-12) return null;
      [A[c], A[piv]] = [A[piv], A[c]];
      const d = A[c][c];
      for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (let r2 = 0; r2 < n; r2++) if (r2 !== c) { const f = A[r2][c]; if (f) for (let j = 0; j < 2 * n; j++) A[r2][j] -= f * A[c][j]; }
    }
    return A.map((row) => row.slice(n));
  }
  function ols(X, y, lambda) {
    const k = X[0].length;
    const XtX = Array.from({ length: k }, () => Array(k).fill(0));
    const Xty = Array(k).fill(0);
    for (let i = 0; i < X.length; i++) for (let a = 0; a < k; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b]; }
    for (let a = 1; a < k; a++) XtX[a][a] += lambda;
    const inv = invert(XtX);
    if (!inv) return null;
    const beta = inv.map((row) => sum(row.map((v, j) => v * Xty[j])));
    return { beta, inv };
  }
  const dot = (a, b) => sum(a.map((v, i) => v * b[i]));

  /* ---------- modelo hedónico log-lineal con validación cruzada y abstención ---------- */
  TP.minSample = (k) => Math.max(30, 8 * (k + 1));
  TP.fitModel = function (cat, pool, attrsOn) {
    const idx = cat.attrs.map((a, i) => i).filter((i) => attrsOn.includes(cat.attrs[i].id));
    const k = idx.length;
    const need = TP.minSample(k);
    const base = { cat: cat.id, k, need, idx, nRaw: pool.length };
    if (k === 0) return { ...base, ok: false, reason: 'sin-atributos', n: pool.length };
    if (pool.length < need) return { ...base, ok: false, reason: 'muestra', n: pool.length };
    const row = (p) => [1, ...idx.map((i) => p.lv[i])];
    let data = pool.map((p) => ({ p, x: row(p), y: Math.log(p.list) }));
    // primera pasada para detectar atípicos (residuo > 3,5 MAD)
    const f0 = ols(data.map((d) => d.x), data.map((d) => d.y), 0.01);
    if (!f0) return { ...base, ok: false, reason: 'calidad', n: pool.length };
    const res0 = data.map((d) => d.y - dot(d.x, f0.beta));
    const med0 = median(res0), mad = median(res0.map((r) => Math.abs(r - med0))) * 1.4826;
    const excluded = data.filter((d, i) => Math.abs(res0[i] - med0) > 3.5 * mad).map((d) => d.p);
    data = data.filter((d, i) => Math.abs(res0[i] - med0) <= 3.5 * mad);
    const n = data.length;
    if (n < need) return { ...base, ok: false, reason: 'muestra', n, excluded };
    const fit = ols(data.map((d) => d.x), data.map((d) => d.y), 0.01);
    const yhat = data.map((d) => dot(d.x, fit.beta));
    const ym = mean(data.map((d) => d.y));
    const sst = sum(data.map((d) => (d.y - ym) ** 2));
    const sse = sum(data.map((d, i) => (d.y - yhat[i]) ** 2));
    const r2 = 1 - sse / sst;
    const s2 = sse / Math.max(1, n - k - 1);
    // validación cruzada en 5 particiones (orden determinístico por hash del id)
    const order = data.map((d, i) => [hashStr(d.p.id), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const cvRes = Array(n).fill(0);
    for (let f = 0; f < 5; f++) {
      const test = new Set(order.filter((_, j) => j % 5 === f));
      const tr = data.filter((_, i) => !test.has(i));
      const ff = ols(tr.map((d) => d.x), tr.map((d) => d.y), 0.01);
      test.forEach((i) => (cvRes[i] = data[i].y - dot(data[i].x, ff.beta)));
    }
    const r2cv = 1 - sum(cvRes.map((r) => r * r)) / sst;
    const mape = mean(cvRes.map((r) => Math.abs(Math.exp(-r) - 1)));
    const q10 = quantile(cvRes, 0.1), q90 = quantile(cvRes, 0.9);
    const coverage = mean(cvRes.map((r) => (r >= q10 && r <= q90 ? 1 : 0)));
    const coef = idx.map((ai, j) => {
      const b = fit.beta[j + 1], se = Math.sqrt(Math.max(0, s2 * fit.inv[j + 1][j + 1]));
      return { attr: cat.attrs[ai], b, se, pct: Math.exp(b) - 1, lo: Math.exp(b - 1.645 * se) - 1, hi: Math.exp(b + 1.645 * se) - 1, sig: Math.abs(b) > 1.645 * se };
    });
    const ok = r2cv >= 0.5;
    const reliability = !ok ? 'Insuficiente' : r2cv >= 0.75 && n >= need * 1.5 ? 'Alta' : r2cv >= 0.62 ? 'Media' : 'Baja';
    const means = idx.map((i) => mean(data.map((d) => d.p.lv[i])));
    return {
      ...base, ok, reason: ok ? null : 'calidad', n, excluded, beta: fit.beta, r2, r2cv, mape, q10, q90, coverage, coef, reliability, means,
      predict(lv) {
        const x = [1, ...idx.map((i) => lv[i])];
        const l = dot(x, fit.beta);
        return { est: Math.exp(l), lo: Math.exp(l + q10), hi: Math.exp(l + q90) };
      },
      contributions(lv) {
        return idx.map((i, j) => ({ attr: cat.attrs[i], level: lv[i], eff: Math.exp(fit.beta[j + 1] * (lv[i] - means[j])) - 1 }));
      },
    };
  };
  TP.REASON_TEXT = {
    muestra: 'Muestra insuficiente',
    calidad: 'Calidad del modelo insuficiente',
    'sin-atributos': 'Sin atributos activos',
  };

  /* ---------- similitud producto contra producto ---------- */
  TP.similarity = function (cat, a, b) {
    const sameTyp = a.typ === b.typ;
    const sameMat = a.mat === b.mat;
    const diffs = a.lv.map((v, i) => b.lv[i] - v);
    const mad = mean(diffs.map(Math.abs));
    const score = (sameTyp ? 0.4 : 0.05) + (sameMat ? 0.15 : 0.04) + 0.45 * (1 - mad / 4);
    const shared = cat.attrs.filter((_, i) => diffs[i] === 0).map((x) => x.name);
    const differ = cat.attrs.map((x, i) => ({ attr: x, d: diffs[i] })).filter((x) => Math.abs(x.d) >= 1);
    const label = score >= 0.85 ? 'Muy similar' : score >= 0.72 ? 'Similar' : 'Parcial';
    let conf = 'Clasificación con evidencia completa';
    if (!b.hasDesc && !b.matPublic) conf = 'Atributos inferidos solo de imagen';
    else if (!b.hasDesc || !b.matPublic) conf = 'Evidencia parcial: revisar';
    return { score, sameTyp, sameMat, shared, differ, label, conf };
  };
  TP.comparablesFor = function (cat, p, pool, compDec, opts) {
    const lim = (opts && opts.limit) || 5;
    return pool
      .map((q) => ({ q, s: TP.similarity(cat, p, q), key: p.id + '>' + q.id }))
      .filter((x) => x.s.score >= 0.7 && compDec[x.key] !== 'reject')
      .sort((a, b) => b.s.score - a.s.score || a.q.id.localeCompare(b.q.id))
      .slice(0, lim);
  };

  /* ---------- franjas ---------- */
  TP.bands = function (pool, conf) {
    const prices = pool.map((p) => p.list);
    if (conf && conf.mode === 'abs' && conf.c1 > 0 && conf.c2 > conf.c1) return { c1: conf.c1, c2: conf.c2, mode: 'abs' };
    const p1 = conf && conf.p1 ? conf.p1 : 33, p2 = conf && conf.p2 ? conf.p2 : 67;
    return { c1: quantile(prices, p1 / 100), c2: quantile(prices, p2 / 100), mode: 'pct', p1, p2 };
  };
  TP.BAND_NAMES = ['Entrada', 'Core', 'Premium'];
  TP.bandOf = (price, b) => (price < b.c1 ? 0 : price < b.c2 ? 1 : 2);

  /* ---------- diagnóstico por producto ---------- */
  TP.diagnose = function (cat, model, p, comps, policy, mk) {
    const out = { p, comps };
    const cm = comps.length ? median(comps.map((c) => c.q.list)) : NaN;
    out.compMedian = cm;
    out.gapComp = comps.length >= 2 ? p.list / cm - 1 : NaN;
    if (model && model.ok) {
      const pr = model.predict(p.lv);
      Object.assign(out, pr);
      out.gap = p.list / pr.est - 1;
      out.pos = p.list < pr.lo ? 'below' : p.list > pr.hi ? 'above' : 'in';
    } else out.pos = 'na';
    const agreeUp = out.gapComp <= -0.08, agreeDown = out.gapComp >= 0.08;
    if (out.pos === 'below') { out.action = 'up'; out.evidence = agreeUp ? 'consistente' : 'mixta'; }
    else if (out.pos === 'above') { out.action = 'down'; out.evidence = agreeDown ? 'consistente' : 'mixta'; }
    else if (out.pos === 'in') { out.action = 'keep'; out.evidence = 'consistente'; }
    else { out.action = isFinite(out.gapComp) && Math.abs(out.gapComp) >= 0.15 ? (out.gapComp < 0 ? 'up' : 'down') : 'keep'; out.evidence = 'solo comparables'; }
    const mc = policy.maxChange;
    if (out.action === 'up') out.scenario = TP.roundPrice(Math.min(isFinite(out.est) ? out.est : cm, p.list * (1 + mc)), mk, policy.rounding);
    else if (out.action === 'down') out.scenario = TP.roundPrice(Math.max(isFinite(out.est) ? out.est : cm, p.list * (1 - mc)), mk, policy.rounding);
    else out.scenario = p.list;
    out.floor = policy.useCost && p.cost != null ? TP.roundPrice(p.cost / (1 - policy.minMargin), mk, policy.rounding) : null;
    if (out.floor && out.scenario < out.floor) out.scenario = out.floor;
    const mag = isFinite(out.gap) ? Math.abs(out.gap) : isFinite(out.gapComp) ? Math.abs(out.gapComp) * 0.6 : 0;
    out.priority = out.action === 'keep' ? 0 : mag * (out.evidence === 'consistente' ? 1 : 0.55);
    return out;
  };

  /* ---------- white spaces ---------- */
  TP.whiteSpaces = function (cat, ownPool, mktPool, bands, dim, model) {
    const keys = dim === 'mat' ? cat.materials : cat.typologies;
    const get = (p) => (dim === 'mat' ? p.mat : p.typ);
    const cells = [];
    keys.forEach((k) => {
      [0, 1, 2].forEach((bi) => {
        const m = mktPool.filter((p) => get(p) === k && TP.bandOf(p.list, bands) === bi);
        const o = ownPool.filter((p) => get(p) === k && TP.bandOf(p.list, bands) === bi);
        const mShare = m.length / Math.max(1, mktPool.length), oShare = o.length / Math.max(1, ownPool.length);
        const cell = { key: k, band: bi, m: m.length, o: o.length, mShare, oShare, gap: null };
        if (mShare >= 0.05 && oShare <= mShare * 0.45) {
          // ¿productos propios que el modelo ubica en esta franja pero se publican más abajo?
          const repos = model && model.ok ? ownPool.filter((p) => get(p) === k && TP.bandOf(model.predict(p.lv).est, bands) === bi && TP.bandOf(p.list, bands) < bi) : [];
          const mAttr = mean(m.map((p) => mean(p.lv)));
          const ownSame = ownPool.filter((p) => get(p) === k);
          const oAttr = ownSame.length ? mean(ownSame.map((p) => mean(p.lv))) : NaN;
          if (repos.length >= 1) cell.gap = { type: 'posicionamiento', repos };
          else if (o.length === 0 && ownSame.length === 0) cell.gap = { type: 'surtido' };
          else if (isFinite(oAttr) && mAttr - oAttr >= 0.6) cell.gap = { type: 'atributos', mAttr, oAttr };
          else cell.gap = { type: 'surtido' };
          cell.mAttr = mAttr;
        }
        cells.push(cell);
      });
    });
    return cells;
  };
  TP.GAP_TEXT = {
    surtido: { t: 'Brecha de surtido', d: 'El mercado tiene oferta en este espacio y tu portafolio casi no.' },
    posicionamiento: { t: 'Brecha de posicionamiento', d: 'Tienes productos con atributos de esta franja, pero publicados a un precio de una franja inferior.' },
    atributos: { t: 'Diferencia de atributos', d: 'La oferta del mercado aquí tiene niveles de atributos superiores a los de tus productos del mismo tipo.' },
  };

  /* ---------- Pulse WTP: respuestas sintéticas determinísticas ---------- */
  TP.simulateVW = function (center, n, seed) {
    const r = rng(seed);
    const resp = [];
    for (let i = 0; i < n; i++) {
      const c = center * Math.exp(gauss(r) * 0.22);
      const tc = c * (0.55 + r() * 0.12), ch = c * (0.78 + r() * 0.1), ex = c * (1.12 + r() * 0.12), te = c * (1.38 + r() * 0.2);
      resp.push([tc, ch, ex, te]);
    }
    const lo = center * 0.35, hi = center * 2.2, steps = 90;
    const grid = Array.from({ length: steps + 1 }, (_, i) => lo * Math.pow(hi / lo, i / steps));
    const share = (fn) => grid.map((p) => resp.filter((x) => fn(x, p)).length / n);
    const curves = {
      tooCheap: share((x, p) => x[0] >= p),
      cheap: share((x, p) => x[1] >= p),
      expensive: share((x, p) => x[2] <= p),
      tooExpensive: share((x, p) => x[3] <= p),
    };
    const notCheap = curves.cheap.map((v) => 1 - v), notExp = curves.expensive.map((v) => 1 - v);
    const cross = (a, b) => { for (let i = 1; i < grid.length; i++) if ((a[i - 1] - b[i - 1]) * (a[i] - b[i]) <= 0) { const t = (a[i - 1] - b[i - 1]) / ((a[i - 1] - b[i - 1]) - (a[i] - b[i]) || 1); return grid[i - 1] + (grid[i] - grid[i - 1]) * t; } return NaN; };
    return { grid, curves, n, pmc: cross(curves.tooCheap, notCheap), pme: cross(curves.tooExpensive, notExp), opp: cross(curves.tooCheap, curves.tooExpensive), ipp: cross(curves.cheap, curves.expensive) };
  };
  TP.simulateGG = function (prices, center, n, seed) {
    const r = rng(seed);
    const wtp = Array.from({ length: n }, () => center * Math.exp(0.08 + gauss(r) * 0.28));
    const pts = prices.map((p) => { const s = wtp.filter((w) => w >= p).length / n; return { p, s, rev: p * s }; });
    const best = pts.reduce((a, b) => (b.rev > a.rev ? b : a), pts[0]);
    return { pts, best, n };
  };
  TP.simulateConjoint = function (cat, model, n, seed) {
    const r = rng(seed);
    const attrs = cat.attrs.slice(0, 4);
    const rows = attrs.map((a, i) => {
      const b = model && model.ok ? (model.coef.find((c) => c.attr.id === a.id) || { b: a.b }).b : a.b;
      const pw = [1, 3, 5].map((l) => (l - 3) * b * (5 + gauss(r) * 0.6));
      return { attr: a, levels: [a.levels[0], a.levels[2], a.levels[4]], pw };
    });
    const pricePw = [0.55, 0, -0.75].map((v) => v * (1 + gauss(r) * 0.08));
    const ranges = rows.map((x) => Math.max(...x.pw) - Math.min(...x.pw));
    const pr = Math.max(...pricePw) - Math.min(...pricePw);
    const tot = sum(ranges) + pr;
    return { rows, pricePw, importance: [...rows.map((x, i) => ({ name: x.attr.name, v: ranges[i] / tot })), { name: 'Precio', v: pr / tot }].sort((a, b) => b.v - a.v), n };
  };
})();
