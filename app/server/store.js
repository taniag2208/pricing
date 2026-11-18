// Almacén de documentos por cliente (misma forma de datos que usa el front-end).
const { q } = require('./db');

async function put(org, coll, id, data, by) {
  const r = await q(`insert into docs (org_id, coll, id, data, deleted, version, updated_at, updated_by)
    values ($1,$2,$3,$4,false,1,now(),$5)
    on conflict (org_id, coll, id) do update set data = excluded.data, deleted = false, version = docs.version + 1, updated_at = now(), updated_by = excluded.updated_by
    returning version, updated_at`, [org, coll, id, data, by || null]);
  return r.rows[0];
}
async function del(org, coll, id, by) {
  await q('update docs set deleted = true, data = null, version = version + 1, updated_at = now(), updated_by = $4 where org_id = $1 and coll = $2 and id = $3', [org, coll, id, by || null]);
}
async function get(org, coll, id) {
  const r = await q('select data from docs where org_id = $1 and coll = $2 and id = $3 and not deleted', [org, coll, id]);
  return r.rows[0] ? r.rows[0].data : null;
}
async function since(org, ts, hide) {
  const r = await q(`select coll, id, data, deleted, updated_at from docs where org_id = $1 and updated_at > $2 ${hide && hide.length ? 'and not (coll = any($3))' : ''} order by updated_at`, hide && hide.length ? [org, ts, hide] : [org, ts]);
  return r.rows;
}
// Estado completo con la forma { ws, stores, catalog, ... } que usan los motores
async function snapshot(org) {
  const r = await q('select coll, id, data from docs where org_id = $1 and not deleted', [org]);
  const ws = { ws: {}, stores: {}, catalog: {}, cats: {}, labelmap: {}, cls: {}, fixes: {}, approvals: {}, studies: {}, priv: {}, sales: {}, drafts: {}, history: {} };
  r.rows.forEach((d) => { (ws[d.coll] = ws[d.coll] || {})[d.id] = d.data; });
  return ws;
}
module.exports = { put, del, get, since, snapshot };
