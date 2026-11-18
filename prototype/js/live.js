/* TITA Pricing Intelligence 360° — capa de datos en vivo: base de datos compartida del espacio
   de trabajo (capability db), identidad (user), descargas y escritura segura. */
(function () {
  'use strict';
  const { useState, useEffect } = React;
  const TP = window.TP;
  const L = (TP.live = {});
  const COLLS = ['ws', 'stores', 'catalog', 'cats', 'labelmap', 'cls', 'fixes', 'approvals', 'studies', 'priv', 'sales'];
  L.CHUNK = 150;

  L.useWorkspace = function () {
    const [st, setSt] = useState({ status: 'loading', loaded: {}, ws: {}, stores: {}, catalog: {}, cats: {}, labelmap: {}, cls: {}, fixes: {}, approvals: {}, studies: {}, priv: {}, sales: {} });
    useEffect(() => {
      let alive = true; const uns = [];
      const timer = setTimeout(() => alive && setSt((s) => (s.status === 'loading' ? { ...s, status: 'slow' } : s)), 10000);
      (async () => {
        let db = null;
        try { db = await claude.use('db'); } catch (e) { db = null; }
        if (!alive) return;
        if (!db) { clearTimeout(timer); setSt((s) => ({ ...s, status: 'nodb' })); return; }
        L.db = db;
        try { L.user = await claude.use('user'); } catch (e) { L.user = null; }
        try { L.uid = L.user ? await L.user.id() : null; } catch (e) { L.uid = null; }
        COLLS.forEach((name) => {
          uns.push(db.collection(name).onSnapshot((snap) => {
            if (!alive) return;
            const m = {}; snap.docs.forEach((d) => { m[d.id] = d.data(); });
            setSt((s) => {
              const loaded = snap.metadata.fromCache ? s.loaded : { ...s.loaded, [name]: true };
              const all = COLLS.every((c) => loaded[c]);
              if (all) clearTimeout(timer);
              return { ...s, [name]: m, loaded, status: all ? 'ready' : s.status === 'slow' && !all ? 'slow' : all ? 'ready' : 'loading' };
            });
          }, (e) => { if (alive) { clearTimeout(timer); setSt((s) => ({ ...s, status: e.code === 'revoked' ? 'revoked' : 'error', error: e.code })); } }));
        });
      })();
      return () => { alive = false; clearTimeout(timer); uns.forEach((u) => u()); };
    }, []);
    return st;
  };

  /* ---------- escritura: una a la vez por documento, errores legibles ---------- */
  const queues = {};
  L.errText = (e) => ({
    invalid_argument: 'Tu nivel de acceso no permite guardar cambios en este espacio de trabajo (o el documento es demasiado grande).',
    quota_exceeded: 'La base de datos del espacio de trabajo está llena. Elimina tiendas o catálogos que ya no uses.',
    resource_exhausted: 'Demasiadas operaciones seguidas. Espera unos segundos e intenta de nuevo.',
    revoked: 'Se retiró tu acceso a este espacio de trabajo.',
  }[e && e.code] || 'No se pudo guardar (' + ((e && e.code) || 'error') + '). Intenta de nuevo.');
  L.toast = () => {};
  L.set = function (path, data) {
    if (!L.db) return Promise.reject({ code: 'unavailable' });
    const prev = queues[path] || Promise.resolve();
    const run = prev.catch(() => {}).then(async () => {
      try { await L.db.doc(path).set(data); }
      catch (e) { if (e && e.code === 'unavailable') { await new Promise((r) => setTimeout(r, 400 + Math.random() * 600)); await L.db.doc(path).set(data); } else throw e; }
    });
    queues[path] = run;
    return run.catch((e) => { L.toast(L.errText(e), 'bad'); throw e; });
  };
  L.del = function (path) { return L.db ? L.db.doc(path).delete().catch((e) => { L.toast(L.errText(e), 'bad'); throw e; }) : Promise.resolve(); };

  L.saveCatalog = async function (sid, items, prevChunks) {
    const n = Math.ceil(items.length / L.CHUNK);
    for (let k = 0; k < n; k++) await L.set('catalog/' + sid + '-' + k, { sid, k, items: items.slice(k * L.CHUNK, (k + 1) * L.CHUNK) });
    for (let k = n; k < (prevChunks || 0); k++) await L.del('catalog/' + sid + '-' + k);
    return n;
  };
  L.storeItems = (ws, sid) => Object.values(ws.catalog || {}).filter((c) => c.sid === sid).sort((a, b) => a.k - b.k).flatMap((c) => c.items || []);

  // Solo se guardan ids; los nombres se resuelven al mostrar (pueden cambiar y difieren por lector)
  L.useNames = function (ids) {
    const key = [...new Set(ids.filter(Boolean))].sort().join(',');
    const [names, setNames] = useState({});
    useEffect(() => {
      let alive = true;
      (async () => { try { if (!L.user || !key) return; const ps = await L.user.profiles(key.split(',')); if (alive) setNames(Object.fromEntries(Object.entries(ps).map(([k, v]) => [k, (v && v.name) || '']))); } catch (e) { /* sin nombres */ } })();
      return () => { alive = false; };
    }, [key]);
    return (id) => (id && names[id]) || (id && id === L.uid ? 'Tú' : 'Alguien del equipo');
  };
  L.canEdit = async function () { try { return L.user ? !!(await L.user.canEdit()) : false; } catch (e) { return false; } };
  L.canWrite = async function () { try { if (!L.user) return null; const v = await L.user.can('data.write'); return v; } catch (e) { return null; } };

  L.download = async function (filename, text) {
    try {
      const d = await claude.use('downloads');
      if (!d) return false;
      await d.save({ filename, data: new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }) });
      return true;
    } catch (e) { return false; }
  };
  L.csv = (rows) => rows.map((r) => r.map((v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\n');
})();
