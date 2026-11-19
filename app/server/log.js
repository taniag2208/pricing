// Logs estructurados en una línea JSON (Vercel y Docker los indexan). Nunca registrar secretos, cookies ni tokens.
const SECRET_KEYS = /pass|token|secret|authorization|cookie|key/i;
function clean(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 3) return o;
  if (Array.isArray(o)) return o.slice(0, 30).map((x) => clean(x, depth + 1));
  const r = {};
  for (const [k, v] of Object.entries(o)) r[k] = SECRET_KEYS.test(k) ? '[oculto]' : clean(v, depth + 1);
  return r;
}
const out = (level, event, data) => {
  if (process.env.LOG_SILENT === '1') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...clean(data || {}) });
  (level === 'error' ? console.error : console.log)(line);
};
module.exports = { info: (e, d) => out('info', e, d), warn: (e, d) => out('warn', e, d), error: (e, d) => out('error', e, d) };
