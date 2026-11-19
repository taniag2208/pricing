// Validación del motor analítico con datos simulados de parámetros conocidos.
global.window = global; require('../web/js/engine.js'); const TP = global.TP;
const r = TP.rng(42);
// 1) Hedónico: ln P = 11 + 0.10*a0 + 0.05*a1 + 0*a2 + ruido(0.08)
const cat = { id: 'c', attrs: [0, 1, 2].map((i) => ({ id: 'a' + i, name: 'A' + i, levels: ['1', '2', '3', '4', '5'] })) };
const pool = Array.from({ length: 120 }, (_, i) => { const lv = [1 + Math.floor(r() * 5), 1 + Math.floor(r() * 5), 1 + Math.floor(r() * 5)]; return { id: 'p' + i, lv, lvRaw: lv, list: Math.exp(11 + 0.1 * lv[0] + 0.05 * lv[1] + 0.08 * TP.gauss(r)) }; });
pool[5].list *= 4; // atípico
const m = TP.fitModel(cat, pool, ['a0', 'a1', 'a2']);
console.log('HEDÓNICO ok', m.ok, 'n', m.n, 'excluidos', m.excluded.length, 'R2cv', m.r2cv.toFixed(2), 'cobertura P10-P90 fuera de muestra', (m.coverage * 100).toFixed(0) + '%');
m.coef.forEach((c) => console.log('  ', c.attr.id, 'beta', c.b.toFixed(3), 'IC90', [Math.log(1 + c.lo).toFixed(3), Math.log(1 + c.hi).toFixed(3)].join('..'), 'sig', c.sig));
// 2) Conjoint: utilidades verdaderas por nivel (1,3,5): attr0 0/1/2, attr1 0/0.5/1, attr2 0/0/0, attr3 0/2/3; precio 0/-1/-2.5
const ccat = { attrs: [0, 1, 2, 3].map((i) => ({ id: 'a' + i, name: 'A' + i, levels: ['1', '2', '3', '4', '5'] })) };
const d = TP.conjointDesign(ccat, [100, 120, 140], 3);
const U = [[0, 1, 2], [0, 0.5, 1], [0, 0, 0], [0, 2, 3]], PU = [0, -1, -2.5];
const ratings = Array.from({ length: 60 }, () => d.profiles.map((p) => Math.max(0, Math.min(10, 5 + p.lv.reduce((s, l, j) => s + U[j][[1, 3, 5].indexOf(l)], 0) + PU[p.price] - 1.5 + 0.8 * TP.gauss(r)))));
const c = TP.conjointEstimate(d, ratings);
c.rows.forEach((x, j) => console.log('CONJOINT', x.attr.id, 'estimado', x.pw.map((v) => v.toFixed(2)).join(' '), '· verdadero (centrado)', U[j].map((v) => (v - TP.mean(U[j])).toFixed(2)).join(' ')));
console.log('CONJOINT precio estimado', c.pricePw.map((v) => v.toFixed(2)).join(' '), '· verdadero', PU.map((v) => (v - TP.mean(PU)).toFixed(2)).join(' '));
// 3) Van Westendorp con respuestas centradas en 100
const vw = TP.vwFromResponses(Array.from({ length: 200 }, () => { const b = 100 * Math.exp(0.15 * TP.gauss(r)); return [b * 0.6, b * 0.85, b * 1.2, b * 1.5]; }));
console.log('VW PMC', vw.pmc.toFixed(1), 'OPP', vw.opp.toFixed(1), 'IPP', vw.ipp.toFixed(1), 'PME', vw.pme.toFixed(1), '(orden esperado PMC<OPP<IPP<PME)');
// 4) DiD: tratado baja 10% de precio y vende +20% (elasticidad ≈ -1.73); control estable
const wk = {}; const days = Array.from({ length: 12 }, (_, i) => '2026-0' + (1 + Math.floor(i / 4)) + '-0' + (1 + (i % 4) * 2));
wk.t = Object.fromEntries(days.map((dd, i) => [dd, (i < 6 ? 100 : 120) * (1 + 0.05 * TP.gauss(r))]));
wk.c = Object.fromEntries(days.map((dd) => [dd, 80 * (1 + 0.05 * TP.gauss(r))]));
const did = TP.did(wk, { pid: 't', at: days[6], from: 100, to: 90 }, ['c']);
console.log('DiD elasticidad', did.e.toFixed(2), 'IC90', did.lo.toFixed(2) + '..' + did.hi.toFixed(2), '(verdadero ≈ ' + (Math.log(1.2) / Math.log(0.9)).toFixed(2) + ')');

const near = (a, b, tol) => Math.abs(a - b) <= tol;
// 5) Homologación: el tamaño declarado en el nombre impide comparar productos de distinta talla
const hc = { attrs: [0, 1, 2].map((i) => ({ id: 'a' + i, name: 'A' + i })) };
const mkp = (name, lv) => ({ name, typ: 'Colchón', mat: 'Espuma', lv, lvRaw: lv });
const sKing = TP.similarity(hc, mkp('Colchón Nube King 200x200', [3, 3, 3]), mkp('Colchón Brisa Sencillo 100x190', [3, 3, 3]));
const sSame = TP.similarity(hc, mkp('Colchón Nube Queen 160x190', [3, 3, 3]), mkp('Colchón Brisa Queen 160 x 190 cm', [3, 4, 3]));
const vol = TP.sizeOf('Shampoo nutritivo 400 ml'), vol2 = TP.sizeOf('Shampoo nutritivo 1 L');
console.log('HOMOLOGACIÓN king vs sencillo', sKing.score.toFixed(2), sKing.why.join(' | '), '· queen vs queen', sSame.score.toFixed(2), '· volumen', vol.v, vol2.v);
const checks = [
  m.ok && near(m.coef[0].b, 0.1, 0.02) && near(m.coef[1].b, 0.05, 0.02) && !m.coef[2].sig && m.excluded.length >= 1,
  m.coverage > 0.65 && m.coverage < 0.92,
  c.rows.every((x, j) => x.pw.every((v, i) => near(v, U[j][i] - TP.mean(U[j]), 0.2))) && c.pricePw.every((v, i) => near(v, PU[i] - TP.mean(PU), 0.2)),
  vw.pmc < vw.opp && vw.opp < vw.ipp && vw.ipp < vw.pme,
  did.lo < Math.log(1.2) / Math.log(0.9) && did.hi > Math.log(1.2) / Math.log(0.9),
  sKing.sizeMismatch && sKing.score < 0.7 && !sSame.sizeMismatch && sSame.score >= 0.7 && vol.v === 400 && vol2.v === 1000,
];
console.log(checks.every(Boolean) ? 'OK' : 'FALLÓ ' + JSON.stringify(checks));
process.exit(checks.every(Boolean) ? 0 : 1);
