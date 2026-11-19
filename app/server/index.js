// Tita Pricing Intelligence 360° — servidor HTTP.
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { q, migrate } = require('./db');
const store = require('./store');
const ai = require('./ai');
const log = require('./log');
const bench = require('./bench');
const jobs = require('./jobs');
const connectors = require('./connectors');
const { id, tempPassword, slug } = require('./util');

const PROD = process.env.NODE_ENV === 'production';
const SECRET = process.env.SESSION_SECRET || (PROD ? null : crypto.randomBytes(32).toString('hex'));
if (!SECRET) { console.error('Falta SESSION_SECRET'); process.exit(1); }
const LEVEL = { viewer: 1, analyst: 2, client_admin: 3, tita_admin: 9 };
const WRITE_MIN = { approvals: 2, studies: 2, priv: 3, sales: 3 };
const HIDDEN = { 1: ['priv', 'sales', 'drafts'], 2: ['drafts'], 3: ['drafts'], 9: [] };
const COLLS = new Set(['ws', 'stores', 'catalog', 'cats', 'labelmap', 'cls', 'fixes', 'approvals', 'studies', 'priv', 'sales', 'drafts', 'history']);
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
// En serverless (Vercel) las migraciones y el administrador inicial se preparan en la primera petición.
let booted = null;
const boot = () => booted || (booted = bootstrap().catch((e) => { booted = null; throw e; }));
app.use((req, res, next) => { ai.setOidc(req.headers['x-vercel-oidc-token']); next(); });
app.use((req, res, next) => (req.path.startsWith('/api/') || req.path === '/healthz' ? boot().then(() => next(), (e) => { console.error(e); res.status(503).json({ code: 'db_unavailable', error: 'Base de datos no disponible.' }); }) : next()));
app.use(express.json({ limit: '4mb' }));
// CSRF: las peticiones que cambian datos solo se aceptan desde el mismo origen (además de las cookies SameSite=Lax y cuerpo JSON).
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean));
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(); // clientes sin navegador (cron con secreto, pruebas); las cookies de sesión siguen siendo obligatorias en rutas privadas
  let host; try { host = new URL(origin).host; } catch (e) { host = null; }
  if (host && (host === req.get('host') || ALLOWED_ORIGINS.has(origin))) return next();
  log.warn('csrf_blocked', { origin, path: req.path });
  res.status(403).json({ code: 'forbidden_origin', error: 'Origen no permitido.' });
});
app.use((req, res, next) => { if (req.path.startsWith('/api/') && !req.is('application/json') && ['POST', 'PUT', 'PATCH'].includes(req.method) && req.headers['content-length'] > 0) return res.status(415).json({ code: 'unsupported_media', error: 'Se espera JSON.' }); next(); });
app.use(cookieParser());
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'" });
  next();
});
const audit = (org, user, action, detail) => q('insert into audit (org_id, user_id, action, detail) values ($1,$2,$3,$4)', [org || null, user || null, action, detail || null]).catch(() => {});
// Errores: el detalle técnico queda en el log estructurado (con un id de referencia); el usuario recibe un mensaje claro sin datos internos.
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  const ref = crypto.randomBytes(4).toString('hex');
  if (!e.status) {
    const persistence = /^(08|23|25|40|42|53|57)/.test(String(e.code || '')) || /ECONNREFUSED|connection|timeout/i.test(String(e.message));
    log.error('request_error', { ref, method: req.method, path: req.path, code: e.code, message: String(e.message).slice(0, 300), stack: String(e.stack || '').split('\n').slice(0, 4).join(' | ') });
    return res.status(persistence ? 503 : 500).json({ code: persistence ? 'persistence_error' : 'error', error: persistence ? 'No pudimos guardar o leer los datos en este momento. Intenta de nuevo en unos minutos (ref. ' + ref + ').' : 'Error interno (ref. ' + ref + ').' });
  }
  res.status(e.status).json({ code: e.code || 'error', error: e.message });
});
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

/* ---------- sesión ---------- */
const attempts = new Map();
function sign(res, u) {
  res.cookie('tps', jwt.sign({ uid: u.id }, SECRET, { expiresIn: '12h' }), { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : PROD, maxAge: 12 * 3600e3 });
}
async function auth(req, res, next) {
  try {
    const t = req.cookies.tps;
    if (!t) {
      // Invitado de un análisis rápido: solo lectura y solo su análisis
      const g = req.cookies.tpg; if (!g) throw 0;
      const { gid, org } = jwt.verify(g, SECRET);
      const o = (await q("select id from orgs where id = $1 and kind = 'quick' and (expires_at is null or expires_at > now())", [org])).rows[0];
      if (!o) throw 0;
      req.user = { id: 'guest:' + gid, email: null, name: 'Invitado', role: 'viewer', org_id: org, must_change: false, guest: true }; req.level = 1; return next();
    }
    const { uid } = jwt.verify(t, SECRET);
    const r = await q('select id, email, name, role, org_id, must_change from users where id = $1', [uid]);
    if (!r.rows[0]) throw 0;
    req.user = r.rows[0]; req.level = LEVEL[req.user.role]; next();
  } catch (e) { res.status(401).json({ code: 'unauthenticated', error: 'Inicia sesión.' }); }
}
const titaOnly = (req, res, next) => (req.level >= 9 ? next() : res.status(403).json({ code: 'forbidden', error: 'Solo administradores de Tita.' }));
const orgAccess = (min) => (req, res, next) => {
  const org = req.params.org;
  if (req.level >= 9 || (req.user.org_id === org && req.level >= (min || 1))) return next();
  res.status(403).json({ code: 'forbidden', error: 'Sin acceso a esta cuenta.' });
};

app.post('/api/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const key = email + '|' + req.ip; const a = attempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) throw fail(429, 'rate_limited', 'Demasiados intentos. Espera 15 minutos.');
  const r = await q('select * from users where email = $1', [email]);
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.pass))) { a.n++; attempts.set(key, a); throw fail(401, 'bad_credentials', 'Correo o contraseña incorrectos.'); }
  attempts.delete(key);
  await q('update users set last_login = now() where id = $1', [u.id]);
  sign(res, u); audit(u.org_id, u.id, 'login');
  res.json({ ok: true });
}));
app.post('/api/logout', (req, res) => { res.clearCookie('tps'); res.clearCookie('tpg'); res.json({ ok: true }); });
app.get('/api/me', auth, wrap(async (req, res) => {
  const org = req.user.org_id ? (await q('select id, name, published from orgs where id = $1', [req.user.org_id])).rows[0] : null;
  const o2 = org ? (await q('select kind, expires_at, meta from orgs where id = $1', [org.id])).rows[0] : null;
  res.json({ user: { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role, mustChange: req.user.must_change, guest: !!req.user.guest }, org: org && { ...org, kind: o2.kind, expiresAt: o2.expires_at, url: o2.meta && o2.meta.url }, ai: ai.configured() });
}));
app.post('/api/me/password', auth, wrap(async (req, res) => {
  const pw = String(req.body.password || '');
  if (pw.length < 10) throw fail(400, 'weak', 'La contraseña debe tener al menos 10 caracteres.');
  const r = await q('select pass from users where id = $1', [req.user.id]);
  if (!req.user.must_change && !(await bcrypt.compare(String(req.body.current || ''), r.rows[0].pass))) throw fail(400, 'bad_current', 'La contraseña actual no coincide.');
  await q('update users set pass = $2, must_change = false where id = $1', [req.user.id, await bcrypt.hash(pw, 11)]);
  res.json({ ok: true });
}));

/* ---------- consola Tita: cuentas y usuarios ---------- */
app.get('/api/admin/orgs', auth, titaOnly, wrap(async (req, res) => {
  const r = await q(`select o.id, o.name, o.published, o.created_at,
      (select count(*) from users u where u.org_id = o.id) as users,
      (select count(*) from docs d where d.org_id = o.id and d.coll = 'stores' and not d.deleted) as stores,
      (select coalesce(sum(jsonb_array_length(d.data->'items')),0) from docs d where d.org_id = o.id and d.coll = 'catalog' and not d.deleted) as products,
      (select max(updated_at) from docs d where d.org_id = o.id) as updated_at,
      (select status from jobs j where j.org_id = o.id order by created_at desc limit 1) as last_job
    from orgs o where o.kind = 'client' order by o.created_at desc`);
  res.json(r.rows);
}));
app.post('/api/admin/orgs', auth, titaOnly, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw fail(400, 'name', 'Escribe el nombre del cliente.');
  let oid = slug(name); const ex = await q('select 1 from orgs where id = $1', [oid]); if (ex.rows[0]) oid += '-' + crypto.randomBytes(2).toString('hex');
  await q('insert into orgs (id, name) values ($1,$2)', [oid, name]);
  audit(oid, req.user.id, 'org.create', { name });
  res.json({ id: oid });
}));
app.patch('/api/admin/orgs/:org', auth, titaOnly, wrap(async (req, res) => {
  const { name, published } = req.body;
  if (name != null) await q('update orgs set name = $2 where id = $1', [req.params.org, String(name)]);
  if (published != null) await q('update orgs set published = $2 where id = $1', [req.params.org, !!published]);
  audit(req.params.org, req.user.id, 'org.update', req.body);
  res.json({ ok: true });
}));
app.get('/api/admin/orgs/:org/users', auth, titaOnly, wrap(async (req, res) => {
  res.json((await q('select id, email, name, role, must_change, last_login, created_at from users where org_id = $1 order by created_at', [req.params.org])).rows);
}));
app.post('/api/admin/orgs/:org/users', auth, titaOnly, wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), name = String(req.body.name || '').trim(), role = req.body.role;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name || !['client_admin', 'analyst', 'viewer'].includes(role)) throw fail(400, 'invalid', 'Revisa nombre, correo y rol.');
  if ((await q('select 1 from users where email = $1', [email])).rows[0]) throw fail(409, 'exists', 'Ya existe un usuario con ese correo.');
  const pw = tempPassword();
  await q('insert into users (id, email, name, pass, role, org_id) values ($1,$2,$3,$4,$5,$6)', [id('u_'), email, name, await bcrypt.hash(pw, 11), role, req.params.org]);
  audit(req.params.org, req.user.id, 'user.create', { email, role });
  res.json({ ok: true, tempPassword: pw });
}));
app.patch('/api/admin/users/:uid', auth, titaOnly, wrap(async (req, res) => {
  const out = { ok: true };
  if (req.body.role && ['client_admin', 'analyst', 'viewer'].includes(req.body.role)) await q("update users set role = $2 where id = $1 and role <> 'tita_admin'", [req.params.uid, req.body.role]);
  if (req.body.resetPassword) { out.tempPassword = tempPassword(); await q('update users set pass = $2, must_change = true where id = $1', [req.params.uid, await bcrypt.hash(out.tempPassword, 11)]); }
  audit(null, req.user.id, 'user.update', { uid: req.params.uid, role: req.body.role, reset: !!req.body.resetPassword });
  res.json(out);
}));
app.delete('/api/admin/users/:uid', auth, titaOnly, wrap(async (req, res) => {
  await q("delete from users where id = $1 and role <> 'tita_admin'", [req.params.uid]);
  res.json({ ok: true });
}));
app.get('/api/admin/team', auth, titaOnly, wrap(async (req, res) => res.json((await q("select id, email, name, last_login from users where role = 'tita_admin' order by created_at")).rows)));
app.post('/api/admin/team', auth, titaOnly, wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), name = String(req.body.name || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) throw fail(400, 'invalid', 'Revisa nombre y correo.');
  if ((await q('select 1 from users where email = $1', [email])).rows[0]) throw fail(409, 'exists', 'Ya existe un usuario con ese correo.');
  const pw = tempPassword();
  await q("insert into users (id, email, name, pass, role) values ($1,$2,$3,$4,'tita_admin')", [id('u_'), email, name, await bcrypt.hash(pw, 11)]);
  res.json({ ok: true, tempPassword: pw });
}));

/* ---------- datos de cada cuenta ---------- */
app.get('/api/orgs/:org', auth, orgAccess(1), wrap(async (req, res) => {
  const r = await q("select id, name, published, kind, expires_at, meta->>'url' as url from orgs where id = $1", [req.params.org]);
  if (!r.rows[0]) throw fail(404, 'not_found', 'Cuenta no encontrada.');
  res.json(r.rows[0]);
}));
app.get('/api/orgs/:org/docs', auth, orgAccess(1), wrap(async (req, res) => {
  if (req.level < 9) { const o = (await q('select published from orgs where id = $1', [req.params.org])).rows[0]; if (!o || !o.published) return res.json({ docs: [], now: new Date().toISOString(), unpublished: true }); }
  // Cursor con 15 s de traslape: un documento escrito durante la lectura no se pierde (los repetidos se sobrescriben).
  const now = (await q("select now() - interval '15 seconds' as t")).rows[0].t;
  const since = req.query.since ? new Date(String(req.query.since)) : new Date(0);
  const rows = await store.since(req.params.org, isNaN(since) ? new Date(0) : since, HIDDEN[req.level]);
  res.json({ docs: rows, now });
}));
app.put('/api/orgs/:org/docs/:coll/:id', auth, orgAccess(1), wrap(async (req, res) => {
  const { org, coll, id: did } = req.params;
  if (!COLLS.has(coll) || !SEG.test(did)) throw fail(400, 'invalid_path', 'Ruta inválida.');
  const data = req.body;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail(400, 'invalid_body', 'Documento inválido.');
  if (JSON.stringify(data).length > 512 * 1024) throw fail(413, 'too_large', 'Documento demasiado grande.');
  const min = WRITE_MIN[coll] || 9;
  if (req.level < min) throw fail(403, 'forbidden', 'Tu rol no permite modificar esta información.');
  if (coll === 'approvals' && req.level < 9) {
    const prev = await store.get(org, coll, did);
    if (!prev) { data.status = 'pendiente'; data.by = req.user.id; delete data.decidedBy; delete data.decidedAt; }
    else if (prev.status !== data.status || prev.decidedBy !== data.decidedBy) { if (req.level < 3) throw fail(403, 'forbidden', 'Solo el administrador de la cuenta puede aprobar.'); data.decidedBy = req.user.id; }
  }
  const r = await store.put(org, coll, did, data, req.user.id);
  if (coll === 'approvals' || coll === 'ws' || coll === 'cats') audit(org, req.user.id, 'doc.' + coll, { id: did, status: data.status });
  res.json({ ok: true, version: r.version, updated_at: r.updated_at });
}));
app.delete('/api/orgs/:org/docs/:coll/:id', auth, orgAccess(1), wrap(async (req, res) => {
  const { org, coll, id: did } = req.params;
  if (!COLLS.has(coll) || !SEG.test(did)) throw fail(400, 'invalid_path', 'Ruta inválida.');
  if (req.level < 9) throw fail(403, 'forbidden', 'Tu rol no permite eliminar información.');
  await store.del(org, coll, did, req.user.id);
  res.json({ ok: true });
}));
app.get('/api/orgs/:org/people', auth, orgAccess(1), wrap(async (req, res) => {
  res.json((await q("select id, name, role from users where org_id = $1 or role = 'tita_admin'", [req.params.org])).rows);
}));

/* ---------- trabajos en segundo plano (solo Tita) ---------- */
app.get('/api/orgs/:org/jobs', auth, orgAccess(1), wrap(async (req, res) => {
  res.json((await q('select id, type, params, status, progress, error, created_at, updated_at from jobs where org_id = $1 order by created_at desc limit 30', [req.params.org])).rows);
}));
app.post('/api/orgs/:org/jobs', auth, titaOnly, wrap(async (req, res) => {
  const { type, params } = req.body;
  if (!['ingest', 'propose', 'map', 'classify', 'refresh'].includes(type)) throw fail(400, 'invalid', 'Tipo de trabajo inválido.');
  if (type !== 'ingest' && type !== 'refresh' && !ai.configured()) throw fail(400, 'sampling_disabled', 'La IA no está configurada en el servidor.');
  res.json({ id: await jobs.enqueue(req.params.org, type, params || {}, req.user.id) });
}));

app.post('/api/orgs/:org/jobs/pump', auth, titaOnly, wrap(async (req, res) => {
  const id = await jobs.step(req.params.org);
  res.json({ ran: id });
}));
// Cron de Vercel: actualización diaria y avance de la cola. Vercel envía Authorization: Bearer CRON_SECRET.
app.get('/api/cron', wrap(async (req, res) => {
  if (!process.env.CRON_SECRET || req.get('authorization') !== 'Bearer ' + process.env.CRON_SECRET) throw fail(401, 'unauthorized', 'No autorizado.');
  // Cron semanal aparte (?bench=1): medición de cobertura de lectura de tiendas.
  if (req.query.bench) return res.json({ bench: (await bench.run(250000)).summary });
  const orgs = await jobs.enqueueRefreshAll();
  const steps = await jobs.drain(null, Number(process.env.CRON_BUDGET_MS || 270000));
  res.json({ orgs, steps });
}));

/* ---------- análisis rápido desde un link (público, con topes) ---------- */
const TPI = require('./shared');
const ipOf = (req) => crypto.createHash('sha256').update(String(req.ip || '') + SECRET).digest('hex').slice(0, 24);
async function sessionUser(req) {
  try { const { uid } = jwt.verify(req.cookies.tps || '', SECRET); const r = await q('select id, role from users where id = $1', [uid]); return r.rows[0] || null; } catch (e) { return null; }
}
app.post('/api/quick', wrap(async (req, res) => {
  const origin = TPI.ingest.origin(String(req.body.url || ''));
  if (!origin) throw fail(400, 'invalid_url', 'Escribe una dirección válida, por ejemplo mitienda.com');
  if (!ai.configured()) throw fail(503, 'sampling_disabled', 'El análisis con IA no está disponible en este momento.');
  const u = await sessionUser(req);
  const tita = u && u.role === 'tita_admin';
  if (!tita) {
    const ip = ipOf(req);
    const mine = (await q("select count(*)::int as n from quick_runs where ip = $1 and at > now() - interval '24 hours'", [ip])).rows[0].n;
    if (mine >= Number(process.env.QUICK_PER_IP_DAY || 3)) throw fail(429, 'rate_limited', 'Llegaste al límite de análisis por hoy. Escríbenos para ver más tiendas.');
    const all = (await q("select count(*)::int as n from quick_runs where at > now() - interval '24 hours'")).rows[0].n;
    if (all >= Number(process.env.QUICK_DAILY_CAP || 40)) throw fail(429, 'rate_limited', 'Hoy hay mucha demanda de análisis. Intenta mañana.');
  }
  const host = TPI.ingest.hostOf(origin);
  const oid = 'q-' + crypto.randomBytes(5).toString('hex');
  const token = crypto.randomBytes(18).toString('base64url');
  await q("insert into orgs (id, name, published, kind, expires_at, meta) values ($1,$2,true,'quick', now() + interval '7 days', $3)", [oid, host, { url: origin, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), by: u ? u.id : null }]);
  await q('insert into quick_runs (ip, org_id) values ($1,$2)', [ipOf(req), oid]);
  await store.put(oid, 'stores', 'own', { name: host, url: origin, role: 'own', n: 0, chunks: 0 }, 'sistema');
  await jobs.enqueue(oid, 'quick', {}, u ? u.id : 'invitado');
  if (!u) res.cookie('tpg', jwt.sign({ gid: crypto.randomBytes(6).toString('hex'), org: oid }, SECRET, { expiresIn: '7d' }), { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : PROD, maxAge: 7 * 864e5 });
  res.json({ org: oid, token });
}));
// Abrir un análisis compartido con su link
app.post('/api/quick/open', wrap(async (req, res) => {
  const h = crypto.createHash('sha256').update(String(req.body.token || '')).digest('hex');
  const r = await q("select id from orgs where kind = 'quick' and meta->>'tokenHash' = $1 and expires_at > now()", [h]);
  if (!r.rows[0]) throw fail(404, 'not_found', 'Este análisis no existe o ya expiró.');
  res.cookie('tpg', jwt.sign({ gid: crypto.randomBytes(6).toString('hex'), org: r.rows[0].id }, SECRET, { expiresIn: '7d' }), { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : PROD, maxAge: 7 * 864e5 });
  res.json({ org: r.rows[0].id });
}));
app.get('/api/quick/:org/status', auth, orgAccess(1), wrap(async (req, res) => {
  const r = await q("select status, progress, error, updated_at from jobs where org_id = $1 and type = 'quick' order by created_at desc limit 1", [req.params.org]);
  res.json(r.rows[0] || null);
}));
app.post('/api/quick/:org/pump', auth, orgAccess(1), wrap(async (req, res) => {
  const k = (await q('select kind from orgs where id = $1', [req.params.org])).rows[0];
  if (!k || k.kind !== 'quick') throw fail(400, 'invalid', 'No es un análisis rápido.');
  res.json({ ran: await jobs.step(req.params.org) });
}));
const quickJob = async (org) => {
  const k = (await q('select kind from orgs where id = $1', [org])).rows[0];
  if (!k || k.kind !== 'quick') throw fail(400, 'invalid', 'No es un análisis rápido.');
  const j = (await q("select id, status, progress from jobs where org_id = $1 and type = 'quick' order by created_at desc limit 1", [org])).rows[0];
  if (!j) throw fail(404, 'not_found', 'No hay análisis.');
  return j;
};
const fullUrl = (u) => { u = String(u || '').trim().slice(0, 300); if (!TPI.ingest.origin(u)) return null; const x = new URL(/^https?:/i.test(u) ? u : 'https://' + u); if (!/^https?:$/.test(x.protocol)) return null; return x.origin + (x.pathname.length > 1 ? x.pathname.replace(/\/$/, '') : ''); };
// Confirmación de competidores: los propuestos que el usuario deja marcados más los que agrega. Se conserva la ruta de país (zara.com/co).
app.post('/api/quick/:org/comps', auth, orgAccess(1), wrap(async (req, res) => {
  const j = await quickJob(req.params.org);
  const urls = [...new Set((Array.isArray(req.body.urls) ? req.body.urls : []).map(fullUrl).filter(Boolean))].slice(0, 16);
  if (!urls.length) throw fail(400, 'invalid_url', 'Escribe al menos un link válido, por ejemplo marca.com');
  const p = j.progress || {};
  const prev = Object.fromEntries((p.comps || []).map((c) => [fullUrl(c.url), c]));
  const cand = Object.fromEntries((p.candidates || []).map((c) => [fullUrl(c.url), c]));
  const comps = await Promise.all(urls.map(async (u) => prev[u] || { name: (cand[u] && cand[u].name) || TPI.ingest.hostOf(u), url: u, category: cand[u] && cand[u].category, source: cand[u] ? cand[u].source : 'usuario', verified: cand[u] ? cand[u].verified : await jobs.verifyDomain(u), read: { status: 'pending' } }));
  await q("update jobs set status = 'queued', error = null, lease_until = null, updated_at = now(), progress = $2 where id = $1", [j.id, { ...p, phase: 'comps', manual: true, comps }]);
  res.json({ ok: true, n: comps.length });
}));
// Reintentar solo las lecturas fallidas (todas o las indicadas), también después de terminado el análisis.
app.post('/api/quick/:org/retry', auth, orgAccess(1), wrap(async (req, res) => {
  const j = await quickJob(req.params.org);
  if (['queued', 'running'].includes(j.status)) throw fail(409, 'busy', 'El análisis está en curso; espera a que termine.');
  const p = j.progress || {};
  const only = Array.isArray(req.body.urls) ? req.body.urls.map(fullUrl) : null;
  let n = 0;
  (p.comps || []).forEach((c) => { if (c.read && c.read.status === 'failed' && (!only || only.includes(fullUrl(c.url)))) { c.read = { status: 'pending', retry: (c.read.retry || 0) + 1 }; n++; } });
  if (!n) throw fail(400, 'invalid', 'No hay lecturas fallidas para reintentar.');
  await q("update jobs set status = 'queued', error = null, lease_until = null, updated_at = now(), progress = $2 where id = $1", [j.id, { ...p, phase: 'comps' }]);
  res.json({ ok: true, n });
}));
// Estrategia (paso 4 del onboarding): objetivo y restricciones mínimas. Se puede responder mientras el análisis avanza.
app.post('/api/quick/:org/strategy', auth, orgAccess(1), wrap(async (req, res) => {
  const j = await quickJob(req.params.org);
  const b = req.body || {};
  const num = (v, lo, hi) => (v === '' || v == null || !isFinite(Number(v)) ? null : Math.max(lo, Math.min(hi, Number(v))));
  const sg = { objective: ['competitividad', 'margen', 'volumen', 'posicionamiento'].includes(b.objective) ? b.objective : 'competitividad', maxChange: num(b.maxChange, 0.02, 0.3) || 0.12, minMargin: num(b.minMargin, 0, 0.9), rounding: ['psico', 'multiplo', 'none'].includes(b.rounding) ? b.rounding : 'psico' };
  await q("update jobs set progress = progress || $2, updated_at = now() where id = $1", [j.id, { strategy: sg }]);
  const cfg = await store.get(req.params.org, 'ws', 'config');
  if (cfg) await store.put(req.params.org, 'ws', 'config', { ...cfg, objective: sg.objective, policy: { ...(cfg.policy || {}), maxChange: sg.maxChange, rounding: sg.rounding, ...(sg.minMargin != null ? { minMargin: sg.minMargin } : {}) } }, req.user.id);
  res.json({ ok: true, strategy: sg });
}));
// El usuario elige el sitio de su país (o corrige la dirección) y el análisis vuelve a leer la tienda propia, sin consumir otro análisis.
app.post('/api/quick/:org/own', auth, orgAccess(1), wrap(async (req, res) => {
  const k = (await q('select kind from orgs where id = $1', [req.params.org])).rows[0];
  if (!k || k.kind !== 'quick') throw fail(400, 'invalid', 'No es un análisis rápido.');
  let url = String(req.body.url || '').trim();
  const origin = TPI.ingest.origin(url);
  if (!origin) throw fail(400, 'invalid_url', 'Escribe una dirección válida, por ejemplo mitienda.com');
  if (!/^https?:/i.test(url)) url = 'https://' + url;
  const j = (await q("select id, progress from jobs where org_id = $1 and type = 'quick' order by created_at desc limit 1", [req.params.org])).rows[0];
  if (!j || (j.progress || {}).phase !== 'need_own') throw fail(400, 'invalid', 'El análisis no está esperando la tienda.');
  const s = await store.get(req.params.org, 'stores', 'own');
  await store.put(req.params.org, 'stores', 'own', { ...s, url, name: TPI.ingest.hostOf(origin) }, 'sistema');
  await q("update orgs set name = $2, meta = meta || $3 where id = $1", [req.params.org, TPI.ingest.hostOf(origin), { url: origin }]);
  await q("update jobs set status = 'queued', error = null, lease_until = null, updated_at = now(), progress = '{}'::jsonb where id = $1", [j.id]);
  res.json({ ok: true });
}));
// Conexión autenticada a la tienda propia (Shopify Admin, WooCommerce REST, VTEX). Las credenciales se usan una vez y se descartan.
const connectTries = new Map();
app.post('/api/quick/:org/connect', auth, orgAccess(1), wrap(async (req, res) => {
  const j = await quickJob(req.params.org);
  if (((j.progress || {}).phase) !== 'need_own') throw fail(400, 'invalid', 'El análisis no está esperando la tienda.');
  const k = req.params.org, now = Date.now();
  const tries = (connectTries.get(k) || []).filter((t) => now - t < 3600e3);
  if (tries.length >= 6) throw fail(429, 'rate_limited', 'Demasiados intentos de conexión. Espera una hora.');
  connectTries.set(k, [...tries, now]);
  const b = req.body || {};
  let r;
  try { r = await connectors.readAuthenticated(String(b.platform || ''), { store: b.store, token: b.token, key: b.key, secret: b.secret, account: b.account, appKey: b.appKey, appToken: b.appToken }); }
  catch (e) { throw fail(400, e.code === 'auth_failed' ? 'auth_failed' : 'connect_failed', e.message); }
  if (r.items.length < 8) throw fail(400, 'connect_failed', 'La conexión funcionó, pero encontramos solo ' + r.items.length + ' productos con precio.');
  await saveOwnCatalog(req.params.org, j, r.items, r.method, r.origin);
  res.json({ ok: true, n: r.items.length });
}));
// Guarda el catálogo propio que llega por archivo o por conexión autenticada y continúa con la búsqueda de competidores.
async function saveOwnCatalog(org, j, items, method, origin) {
  const pick = items.length <= 90 ? items : items.filter((_, i) => i % Math.ceil(items.length / 90) === 0).slice(0, 90);
  const now = new Date().toISOString(); pick.forEach((it) => { it.src = it.src || method; it.at = it.at || now; });
  const chunks = await jobs.saveCatalog(org, 'own', pick, 0);
  const s = await store.get(org, 'stores', 'own');
  const label = { file: 'Archivo CSV o Excel', auth_shopify: 'Conexión autenticada Shopify', auth_woocommerce: 'Conexión autenticada WooCommerce', auth_vtex: 'Conexión autenticada VTEX' }[method] || method;
  await store.put(org, 'stores', 'own', { ...s, n: pick.length, total: items.length, chunks, platform: null, method, importedAt: now }, 'sistema');
  const ownDiag = { stage: 'done', status: 'ok', method, methodLabel: label, origin: origin || null, found: items.length, priced: items.length, categories: new Set(items.map((x) => x.label)).size, warnings: method === 'file' ? ['Datos cargados desde un archivo: la fecha de los precios es la de la carga.'] : [], attempts: (((j.progress || {}).ownDiag || {}).attempts || []), at: now };
  await q("update jobs set status = 'queued', error = null, lease_until = null, updated_at = now(), progress = $2 where id = $1", [j.id, { ...(j.progress || {}), phase: 'discover', own: pick.length, ownTotal: items.length, platform: null, method, ownDiag }]);
}
// Catálogo propio subido por el usuario (CSV o Excel ya interpretados en el navegador) cuando la tienda no se puede leer.
app.post('/api/quick/:org/catalog', auth, orgAccess(1), wrap(async (req, res) => {
  const j = await quickJob(req.params.org);
  if (((j.progress || {}).phase) !== 'need_own') throw fail(400, 'invalid', 'El análisis no está esperando la tienda.');
  const raw = Array.isArray(req.body.items) ? req.body.items.slice(0, 3000) : [];
  const items = raw.map((o, i) => TPI.ingest.mkItem({ id: 'f:' + (o.sku || TPI.ingest.slug(String(o.name || '')) + '-' + i), name: o.name, label: o.label, price: Number(o.price), promo: Number(o.promo) > 0 ? Number(o.promo) : null, desc: o.desc, sku: o.sku })).filter((x) => x.name && x.price > 0);
  if (items.length < 8) throw fail(400, 'invalid', 'El archivo necesita al menos 8 productos con nombre y precio.');
  await saveOwnCatalog(req.params.org, j, items, 'file');
  res.json({ ok: true, n: items.length });
}));
app.get('/api/admin/bench', auth, titaOnly, wrap(async (req, res) => res.json(await bench.latest())));
app.post('/api/admin/bench', auth, titaOnly, wrap(async (req, res) => res.json(await bench.run(250000))));
app.get('/api/admin/quick', auth, titaOnly, wrap(async (req, res) => {
  res.json((await q(`select o.id, o.name, o.meta->>'url' as url, o.created_at, o.expires_at,
      (select status from jobs j where j.org_id = o.id and j.type = 'quick' order by created_at desc limit 1) as status,
      (select error from jobs j where j.org_id = o.id and j.type = 'quick' order by created_at desc limit 1) as error
    from orgs o where o.kind = 'quick' order by o.created_at desc limit 50`)).rows);
}));

/* ---------- Claude ---------- */
const chatCount = new Map();
app.post('/api/orgs/:org/ai/json', auth, orgAccess(2), wrap(async (req, res) => {
  const kind = String(req.body.kind || '');
  if (kind !== 'image' && req.level < 9) throw fail(403, 'forbidden', 'Solo administradores de Tita.');
  const prompt = String(req.body.prompt || '');
  if (!prompt || prompt.length > 250000) throw fail(400, 'prompt_too_large', 'Consulta vacía o demasiado larga.');
  const images = (req.body.images || []).slice(0, 3).filter((im) => /^image\/(png|jpeg|webp|gif)$/.test(im.media_type) && typeof im.data === 'string');
  try { res.json({ data: await ai.json(prompt, { tier: req.body.tier, images, orgId: req.params.org, userId: req.user.id, kind }) }); }
  catch (e) { res.status(e.code === 'sampling_disabled' || e.code === 'billing' ? 503 : 502).json({ code: e.code || 'upstream_error', error: e.message }); }
}));
app.post('/api/orgs/:org/ai/chat', auth, orgAccess(1), wrap(async (req, res) => {
  const lim = req.user.guest ? Number(process.env.GUEST_CHAT_PER_HOUR || 15) : Number(process.env.CHAT_PER_HOUR || 60);
  const used = (await q("select count(*)::int as n from ai_usage where user_id = $1 and kind = 'copilot' and at > now() - interval '1 hour'", [req.user.id])).rows[0].n;
  if (used >= lim * 3) throw fail(429, 'rate_limited', 'Límite de preguntas por hora alcanzado. Intenta más tarde.');
  const messages = Array.isArray(req.body.messages) ? req.body.messages.slice(-40) : [];
  const tools = (Array.isArray(req.body.tools) ? req.body.tools : []).slice(0, 12).map((t) => ({ name: String(t.name).slice(0, 64), description: String(t.description || '').slice(0, 1024), input_schema: t.input_schema && typeof t.input_schema === 'object' ? t.input_schema : { type: 'object', properties: {} } }));
  if (!messages.length) throw fail(400, 'invalid', 'Sin mensajes.');
  try { const r = await ai.call({ messages, tools, tier: 'default', maxTokens: 8000, orgId: req.params.org, userId: req.user.id, kind: 'copilot' }); res.json({ content: r.content, stop_reason: r.stop_reason }); }
  catch (e) { res.status(e.code === 'sampling_disabled' || e.code === 'billing' ? 503 : 502).json({ code: e.code || 'upstream_error', error: e.message }); }
}));

/* ---------- archivos estáticos ---------- */
const nm = (p) => path.join(__dirname, '..', 'node_modules', p);
const vendor = { 'react.js': 'react/umd/react.production.min.js', 'react-dom.js': 'react-dom/umd/react-dom.production.min.js', 'htm.js': 'htm/dist/htm.umd.js', 'xlsx.js': 'xlsx/dist/xlsx.full.min.js' };
app.get('/vendor/:f', (req, res) => (vendor[req.params.f] ? res.sendFile(nm(vendor[req.params.f]), { maxAge: '7d' }) : res.status(404).end()));
app.get('/healthz', wrap(async (req, res) => { await q('select 1'); res.json({ ok: true, ai: ai.configured() }); }));
app.use(express.static(path.join(__dirname, '..', 'web'), { maxAge: PROD ? '1h' : 0 }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'web', 'index.html')));

async function bootstrap() {
  await migrate();
  const r = await q("select count(*)::int as n from users where role = 'tita_admin'");
  if (!r.rows[0].n) {
    const email = (process.env.ADMIN_EMAIL || '').toLowerCase(), pw = process.env.ADMIN_PASSWORD;
    if (!email || !pw) { console.warn('No hay administradores de Tita: define ADMIN_EMAIL y ADMIN_PASSWORD para crear el primero.'); return; }
    await q("insert into users (id, email, name, pass, role, must_change) values ($1,$2,$3,$4,'tita_admin', true)", [id('u_'), email, process.env.ADMIN_NAME || 'Administrador Tita', await bcrypt.hash(pw, 11)]);
    console.log('Administrador inicial creado:', email);
  }
}

if (require.main === module) {
  bootstrap().then(() => {
    jobs.start();
    const port = Number(process.env.PORT || 3000);
    app.listen(port, () => console.log('Tita Pricing Intelligence escuchando en el puerto ' + port));
  }).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { app, bootstrap };
