// TITA Pricing Intelligence 360° — servidor HTTP.
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { q, migrate } = require('./db');
const store = require('./store');
const ai = require('./ai');
const jobs = require('./jobs');
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
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'" });
  next();
});
const audit = (org, user, action, detail) => q('insert into audit (org_id, user_id, action, detail) values ($1,$2,$3,$4)', [org || null, user || null, action, detail || null]).catch(() => {});
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { if (!e.status) console.error(e); res.status(e.status || 500).json({ code: e.code || 'error', error: e.status ? e.message : 'Error interno' }); });
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

/* ---------- sesión ---------- */
const attempts = new Map();
function sign(res, u) {
  res.cookie('tps', jwt.sign({ uid: u.id }, SECRET, { expiresIn: '12h' }), { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : PROD, maxAge: 12 * 3600e3 });
}
async function auth(req, res, next) {
  try {
    const t = req.cookies.tps; if (!t) throw 0;
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
app.post('/api/logout', (req, res) => { res.clearCookie('tps'); res.json({ ok: true }); });
app.get('/api/me', auth, wrap(async (req, res) => {
  const org = req.user.org_id ? (await q('select id, name, published from orgs where id = $1', [req.user.org_id])).rows[0] : null;
  res.json({ user: { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role, mustChange: req.user.must_change }, org, ai: ai.configured() });
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
    from orgs o order by o.created_at desc`);
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
  const r = await q('select id, name, published from orgs where id = $1', [req.params.org]);
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
  if (type !== 'ingest' && type !== 'refresh' && !ai.configured()) throw fail(400, 'sampling_disabled', 'Falta configurar ANTHROPIC_API_KEY en el servidor.');
  res.json({ id: await jobs.enqueue(req.params.org, type, params || {}, req.user.id) });
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
  catch (e) { res.status(e.code === 'sampling_disabled' ? 503 : 502).json({ code: e.code || 'upstream_error', error: e.message }); }
}));
app.post('/api/orgs/:org/ai/chat', auth, orgAccess(1), wrap(async (req, res) => {
  const k = req.user.id, now = Date.now(); const c = (chatCount.get(k) || []).filter((t) => now - t < 3600e3);
  if (c.length >= Number(process.env.CHAT_PER_HOUR || 60)) throw fail(429, 'rate_limited', 'Límite de preguntas por hora alcanzado.');
  c.push(now); chatCount.set(k, c);
  const messages = Array.isArray(req.body.messages) ? req.body.messages.slice(-40) : [];
  const tools = (Array.isArray(req.body.tools) ? req.body.tools : []).slice(0, 12).map((t) => ({ name: String(t.name).slice(0, 64), description: String(t.description || '').slice(0, 1024), input_schema: t.input_schema && typeof t.input_schema === 'object' ? t.input_schema : { type: 'object', properties: {} } }));
  if (!messages.length) throw fail(400, 'invalid', 'Sin mensajes.');
  try { const r = await ai.call({ messages, tools, tier: 'default', maxTokens: 8000, orgId: req.params.org, userId: req.user.id, kind: 'copilot' }); res.json({ content: r.content, stop_reason: r.stop_reason }); }
  catch (e) { res.status(e.code === 'sampling_disabled' ? 503 : 502).json({ code: e.code || 'upstream_error', error: e.message }); }
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
    app.listen(port, () => console.log('TITA Pricing Intelligence escuchando en el puerto ' + port));
  }).catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { app, bootstrap };
