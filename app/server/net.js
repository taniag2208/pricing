// Red segura para leer sitios de terceros (protección SSRF).
// - Solo http/https y puertos 80/443 (en producción).
// - La IP se valida al conectar (no antes), así un DNS que cambia entre la validación y la conexión no sirve para entrar a la red interna.
// - Bloquea loopback, redes privadas, link-local, CGNAT, multicast, metadatos de nube y equivalentes IPv6.
// - Cada redirección se valida igual que la URL original (máximo 5).
// - Tiempo máximo, tamaño máximo de respuesta y reintentos con espera creciente para 429/502/503/504 y fallas de red transitorias.
const dns = require('dns');
const net = require('net');
const { Agent, fetch } = require('undici');

const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_NETWORK === '1'; // solo para pruebas locales con servidores simulados
const MAX_BYTES = Number(process.env.FETCH_MAX_BYTES || 8 * 1024 * 1024);

function ipBlocked(ip) {
  if (ALLOW_PRIVATE) return false;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (m) return ipBlocked(m[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x) || x.startsWith('64:ff9b:') || x.startsWith('2001:db8');
  }
  return true;
}

const blockedErr = (host) => Object.assign(new Error('Destino no permitido: ' + host), { code: 'blocked_destination' });

// lookup que se usa en el momento de conectar
function guardedLookup(hostname, options, cb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(Object.assign(err, { code: err.code || 'ENOTFOUND' }));
    const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: options.family || 4 }];
    const bad = list.find((a) => ipBlocked(a.address));
    if (bad) return cb(blockedErr(hostname));
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}
const agent = new Agent({ connect: { lookup: guardedLookup, timeout: 10000 }, headersTimeout: 20000, bodyTimeout: 25000 });

function checkUrl(raw) {
  let u; try { u = new URL(raw); } catch (e) { throw Object.assign(new Error('URL inválida'), { code: 'invalid_url' }); }
  if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error('Solo se permiten direcciones http o https'), { code: 'invalid_url' });
  if (u.username || u.password) throw Object.assign(new Error('La dirección no puede incluir usuario o contraseña'), { code: 'invalid_url' });
  if (!ALLOW_PRIVATE) {
    if (u.port && !['80', '443'].includes(u.port)) throw blockedErr(u.host);
    const h = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(h) && ipBlocked(h)) throw blockedErr(h);
    if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(h)) throw blockedErr(h);
  }
  return u;
}

// Resolución previa para dar un diagnóstico claro (no reemplaza la validación al conectar).
async function resolveHost(hostname, retry = 1) {
  try {
    const list = await dns.promises.lookup(hostname, { all: true });
    if (list.some((a) => ipBlocked(a.address))) return { ok: false, code: 'blocked_destination' };
    return { ok: true, addresses: list.map((a) => a.address) };
  } catch (e) {
    // un fallo de DNS momentáneo no debe decir que el dominio no existe: se reintenta una vez
    if (retry > 0) { await new Promise((r) => setTimeout(r, 700)); return resolveHost(hostname, retry - 1); }
    return { ok: false, code: e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN' ? 'dns_not_found' : 'dns_error' };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_STATUS = new Set([429, 502, 503, 504]);
const netCode = (e) => (e && (e.code || (e.cause && e.cause.code))) || (e && e.name === 'TimeoutError' ? 'timeout' : 'network');

// Respuesta: { ok, status, url, headers, text, ms, redirects }
async function safeFetch(rawUrl, { headers = {}, timeout = 25000, retries = 1, maxBytes = MAX_BYTES, method = 'GET' } = {}) {
  let attempt = 0;
  for (;;) {
    const t0 = Date.now();
    try {
      let url = checkUrl(rawUrl).href;
      let r, redirects = 0;
      const signal = AbortSignal.timeout(timeout);
      for (;;) {
        r = await fetch(url, { method, headers, redirect: 'manual', signal, dispatcher: agent });
        if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
          if (++redirects > 5) throw Object.assign(new Error('Demasiadas redirecciones'), { code: 'too_many_redirects' });
          url = checkUrl(new URL(r.headers.get('location'), url).href).href;
          try { await r.body?.cancel(); } catch (e) { /* sin cuerpo */ }
          continue;
        }
        break;
      }
      // lectura con límite de tamaño
      let text = '', truncated = false;
      if (r.body) {
        const reader = r.body.getReader(); const dec = new TextDecoder(); let size = 0;
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > maxBytes) { truncated = true; try { await reader.cancel(); } catch (e) { /* cortado */ } break; }
          text += dec.decode(value, { stream: true });
        }
        text += dec.decode();
      }
      const res = { ok: r.ok, status: r.status, url, headers: r.headers, text, ms: Date.now() - t0, redirects, truncated };
      if (RETRY_STATUS.has(r.status) && attempt < retries) { attempt++; await sleep(Math.min(8000, 800 * 2 ** attempt + Math.random() * 300)); continue; }
      return res;
    } catch (e) {
      const code = netCode(e);
      const transient = ['ECONNRESET', 'ETIMEDOUT', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'EAI_AGAIN', 'UND_ERR_HEADERS_TIMEOUT'].includes(code);
      if (transient && attempt < retries) { attempt++; await sleep(Math.min(8000, 800 * 2 ** attempt)); continue; }
      throw Object.assign(e instanceof Error ? e : new Error(String(e)), { code: code === 'AbortError' ? 'timeout' : code, ms: Date.now() - t0 });
    }
  }
}

module.exports = { safeFetch, checkUrl, resolveHost, ipBlocked, ALLOW_PRIVATE };
