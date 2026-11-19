const crypto = require('crypto');
const id = (p) => (p || '') + crypto.randomBytes(9).toString('base64url');
const tempPassword = () => crypto.randomBytes(9).toString('base64url');
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Palabras que describen el catálogo propio (tipos de producto), para leer de la competencia solo lo comparable.
const STOP = new Set('para con sin por los las del una uno unos unas este esta mujer hombre hombres mujeres nino nina ninos ninas unisex talla tallas color negro negra blanco blanca azul rojo roja gris cafe beige verde rosa dorado plata nuevo nueva coleccion referencia producto productos tienda oferta descuento envio gratis pack combo kit set categoria inicio home sale liquidacion'.split(' '));
function keywordsOf(items) {
  const n = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const cnt = {};
  items.forEach((p) => { const seen = new Set(); (n(p.label) + ' ' + n(p.name).split(/\s+/).slice(0, 3).join(' ')).split(/[^a-z]+/).forEach((w) => { if (w.length < 4 || STOP.has(w) || seen.has(w)) return; seen.add(w); cnt[w] = (cnt[w] || 0) + 1; }); });
  return Object.entries(cnt).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([w]) => (w.length > 5 && /s$/.test(w) ? w.slice(0, -1) : w));
}
module.exports = { id, tempPassword, slug, sleep, keywordsOf };
