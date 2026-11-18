/* TITA Pricing Intelligence 360° — cliente de la API: sesión, documentos de la cuenta,
   trabajos en segundo plano, permisos y descargas. */
(function () {
  'use strict';
  const { useState, useEffect, useRef } = React;
  const TP = window.TP;
  const L = (TP.live = {});
  const COLLS = ['ws', 'stores', 'catalog', 'cats', 'labelmap', 'cls', 'fixes', 'approvals', 'studies', 'priv', 'sales', 'drafts', 'history'];
  L.CHUNK = 150;
  L.org = null; L.uid = null; L.role = null;
  L.onUnauth = () => {};
  L.toast = () => {};

  L.api = async function (method, path, body) {
    const r = await fetch('/api' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    if (r.status === 401) { L.onUnauth(); throw { code: 'unauthenticated', message: 'Tu sesión terminó.' }; }
    if (!r.ok) throw { code: (j && j.code) || 'error', message: (j && j.error) || 'Error ' + r.status, status: r.status };
    return j;
  };
  L.errText = (e) => (e && e.message) || 'No se pudo guardar. Intenta de nuevo.';

  /* ---------- documentos de la cuenta con sincronización incremental ---------- */
  const listeners = new Set();
  L.useWorkspace = function (org, opts) {
    const empty = () => Object.fromEntries(COLLS.map((c) => [c, {}]));
    const [st, setSt] = useState(() => ({ status: 'loading', ...empty() }));
    const since = useRef(null);
    useEffect(() => {
      let alive = true, timer = null;
      since.current = null;
      setSt({ status: 'loading', ...empty() });
      const apply = (docs, extra) => setSt((s) => {
        const n = { ...s, ...(extra || {}) };
        docs.forEach((d) => { if (!n[d.coll]) n[d.coll] = {}; const c = { ...n[d.coll] }; if (d.deleted) delete c[d.id]; else c[d.id] = d.data; n[d.coll] = c; });
        return n;
      });
      const pull = async () => {
        try {
          const r = await L.api('GET', '/orgs/' + org + '/docs' + (since.current ? '?since=' + encodeURIComponent(since.current) : ''));
          if (!alive) return;
          since.current = r.now;
          apply(r.docs, { status: r.unpublished ? 'unpublished' : 'ready' });
        } catch (e) { if (alive && e.code !== 'unauthenticated') setSt((s) => (s.status === 'loading' ? { ...s, status: 'error', error: e.message } : s)); }
        if (alive) timer = setTimeout(pull, document.hidden ? 30000 : (opts && opts.fast ? 4000 : 12000));
      };
      const local = (coll, id, data) => apply([{ coll, id, data, deleted: data == null }]);
      listeners.add(local);
      pull();
      L.refresh = () => { clearTimeout(timer); pull(); };
      return () => { alive = false; clearTimeout(timer); listeners.delete(local); };
    }, [org]);
    return st;
  };
  const queues = {};
  L.set = function (path, data) {
    const [coll, id] = path.split('/');
    listeners.forEach((f) => f(coll, id, data));
    const prev = queues[path] || Promise.resolve();
    const run = prev.catch(() => {}).then(() => L.api('PUT', '/orgs/' + L.org + '/docs/' + coll + '/' + id, data));
    queues[path] = run;
    return run.catch((e) => { L.toast(L.errText(e), 'bad'); if (L.refresh) L.refresh(); throw e; });
  };
  L.del = function (path) {
    const [coll, id] = path.split('/');
    listeners.forEach((f) => f(coll, id, null));
    return L.api('DELETE', '/orgs/' + L.org + '/docs/' + coll + '/' + id).catch((e) => { L.toast(L.errText(e), 'bad'); throw e; });
  };
  L.saveCatalog = async function (sid, items, prevChunks) {
    const n = Math.ceil(items.length / L.CHUNK);
    for (let k = 0; k < n; k++) await L.set('catalog/' + sid + '-' + k, { sid, k, items: items.slice(k * L.CHUNK, (k + 1) * L.CHUNK) });
    for (let k = n; k < (prevChunks || 0); k++) await L.del('catalog/' + sid + '-' + k);
    return n;
  };
  L.storeItems = (ws, sid) => Object.values(ws.catalog || {}).filter((c) => c.sid === sid).sort((a, b) => a.k - b.k).flatMap((c) => c.items || []);

  /* ---------- trabajos en segundo plano ---------- */
  L.useJobs = function (org, enabled) {
    const [jobs, setJobs] = useState([]);
    useEffect(() => {
      if (!enabled) return undefined;
      let alive = true, timer = null, was = false;
      const pull = async () => {
        let running = false;
        try { const r = await L.api('GET', '/orgs/' + org + '/jobs'); if (alive) setJobs(r); running = r.some((j) => j.status === 'queued' || j.status === 'running'); } catch (e) { /* reintenta */ }
        if (alive) timer = setTimeout(pull, running ? 2500 : 10000);
        if ((running || was) && L.refresh) L.refresh();
        was = running;
      };
      pull();
      L.pullJobs = () => { clearTimeout(timer); pull(); };
      return () => { alive = false; clearTimeout(timer); };
    }, [org, enabled]);
    return jobs;
  };
  L.runJob = async (type, params) => { try { await L.api('POST', '/orgs/' + L.org + '/jobs', { type, params: params || {} }); if (L.pullJobs) L.pullJobs(); return true; } catch (e) { L.toast(e.message, 'bad'); return false; } };
  L.JOB = { ingest: 'Importación desde la URL', propose: 'Propuesta de categorías', map: 'Mapeo de etiquetas', classify: 'Clasificación', refresh: 'Actualización completa' };

  /* ---------- personas, permisos y descargas ---------- */
  let people = null;
  L.useNames = function (ids) {
    const [, force] = useState(0);
    useEffect(() => { if (!people && L.org) L.api('GET', '/orgs/' + L.org + '/people').then((r) => { people = Object.fromEntries(r.map((p) => [p.id, p.name])); force((x) => x + 1); }).catch(() => {}); }, []);
    return (id) => (id && people && people[id]) || (id === 'sistema' ? 'Sistema' : id && id === L.uid ? 'Tú' : 'Alguien del equipo');
  };
  L.resetPeople = () => { people = null; };
  L.perms = (role) => ({ tita: role === 'tita_admin', config: role === 'tita_admin', edit: role === 'tita_admin' || role === 'client_admin', write: role !== 'viewer', priv: role === 'tita_admin' || role === 'client_admin' });
  L.download = async function (filename, text) {
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  };
  L.csv = (rows) => rows.map((r) => r.map((v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\n');
})();
