// Llamadas a Claude desde el servidor. La API key nunca llega al navegador.
const AnthropicMod = require('@anthropic-ai/sdk');
const { q } = require('./db');

const Anthropic = AnthropicMod.default || AnthropicMod;
// Proveedor: 'gateway' = Vercel AI Gateway (créditos de Vercel, autenticación OIDC del despliegue o AI_GATEWAY_API_KEY);
// 'anthropic' = API de Anthropic directa con ANTHROPIC_API_KEY.
const GATEWAY = (process.env.AI_PROVIDER || '').toLowerCase() === 'gateway';
const MODEL = process.env.AI_MODEL || (GATEWAY ? 'google/gemini-2.5-flash' : 'claude-opus-5-5');
let oidc = process.env.VERCEL_OIDC_TOKEN || '';
const setOidc = (t) => { if (t) oidc = t; };
const gwKey = () => process.env.AI_GATEWAY_API_KEY || oidc;
let gwClient = null, gwToken = null;
function getClient() {
  if (!GATEWAY) return anthropicClient;
  const k = gwKey();
  if (!k) return null;
  if (k !== gwToken) { gwToken = k; gwClient = new Anthropic({ apiKey: null, authToken: k, baseURL: process.env.AI_GATEWAY_URL || 'https://ai-gateway.vercel.sh' }); }
  return gwClient;
}
const anthropicClient = !GATEWAY && (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) ? new Anthropic() : null;
const EFFORT = { quick: 'low', default: 'medium', complex: 'high' };

const err = (code, message) => Object.assign(new Error(message || code), { code });

function mapError(e) {
  if (e && e.code) return e;
  if (e) console.error('IA:', e.status, String(e.message).slice(0, 300));
  if (e instanceof Anthropic.RateLimitError) return err('rate_limited', 'Límite de uso de la API alcanzado.');
  if (/free tier/i.test(String(e && e.message))) return err('billing', 'El modelo de IA configurado no está incluido en el plan gratuito de Vercel AI Gateway.');
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return err('sampling_disabled', 'La credencial de IA del servidor no es válida o no tiene permisos.');
  if (e instanceof Anthropic.BadRequestError) {
    if (/credit balance/i.test(String(e.message))) return err('billing', 'La cuenta de Anthropic de Tita no tiene saldo. Hay que recargar créditos en console.anthropic.com (Billing).');
    if (/credit|quota|budget|insufficient/i.test(String(e.message))) return err('billing', 'Se agotaron los créditos gratuitos de IA de este mes. Se renuevan automáticamente; mientras tanto el análisis sigue sin IA.');
    return err('invalid_request', 'La IA rechazó la consulta. Intenta de nuevo.');
  }
  if (e instanceof Anthropic.APIError && (e.status === 402 || /credit|quota|budget/i.test(String(e.message)))) return err('billing', 'Se agotaron los créditos gratuitos de IA de este mes. Se renuevan automáticamente; mientras tanto el análisis sigue sin IA.');
  if (e instanceof Anthropic.APIError) return err('upstream_error', 'Error de la API (' + e.status + ').');
  return err('upstream_error', (e && e.message) || 'Error desconocido');
}

async function call({ messages, system, tools, tier, maxTokens, orgId, userId, kind }) {
  const client = getClient();
  if (!client) throw err('sampling_disabled', 'La IA no está configurada en el servidor.');
  const req = { model: MODEL, max_tokens: maxTokens || 16000, messages };
  // En el gateway: sin razonamiento extendido (consume el límite de salida en modelos como Gemini) y con más margen.
  if (GATEWAY) { req.max_tokens = Math.max(req.max_tokens, Number(process.env.AI_GATEWAY_MAX_TOKENS || 32000)); if (process.env.AI_THINKING !== 'on') req.thinking = { type: 'disabled' }; }
  if (!GATEWAY) Object.assign(req, { output_config: { effort: EFFORT[tier] || 'medium' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  if (system) req.system = system;
  if (tools && tools.length) req.tools = tools;
  let res;
  try { res = GATEWAY ? await client.messages.create(req, { timeout: Number(process.env.AI_TIMEOUT_MS || 280000) }) : await client.beta.messages.create(req); } catch (e) { throw mapError(e); }
  q('insert into ai_usage (org_id, user_id, kind, model, input_tokens, output_tokens) values ($1,$2,$3,$4,$5,$6)', [orgId || null, userId || null, kind || null, res.model, res.usage && res.usage.input_tokens, res.usage && res.usage.output_tokens]).catch(() => {});
  if (res.stop_reason === 'refusal') throw err('refused', 'La IA no procesó este contenido.');
  return res;
}

const textOf = (res) => res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

function parseJson(text) {
  const t = (text || '').trim();
  try { return JSON.parse(t); } catch (e) { /* sigue */ }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) { /* sigue */ } }
  const a = Math.min(...['{', '['].map((c) => { const i = t.indexOf(c); return i < 0 ? Infinity : i; }));
  const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (isFinite(a) && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* sigue */ } }
  throw err('invalid_json', 'La respuesta no llegó en JSON.');
}

async function json(prompt, opts = {}) {
  const content = [];
  (opts.images || []).forEach((im) => content.push({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } }));
  content.push({ type: 'text', text: prompt });
  const res = await call({ messages: [{ role: 'user', content }], tier: opts.tier, maxTokens: opts.maxTokens || 16000, orgId: opts.orgId, userId: opts.userId, kind: opts.kind });
  if (res.stop_reason === 'max_tokens') throw err('invalid_json', 'La respuesta se cortó por longitud; usa un lote más pequeño.');
  return parseJson(textOf(res));
}

// Investigación con búsqueda web (herramienta de servidor de Anthropic); reanuda turnos pausados.
async function research(prompt, opts = {}) {
  let messages = [{ role: 'user', content: prompt }];
  let res;
  for (let i = 0; i < 4; i++) {
    res = await call({ messages, tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: opts.maxUses || 6 }], tier: 'default', maxTokens: 16000, orgId: opts.orgId, userId: opts.userId, kind: opts.kind || 'research' });
    if (res.stop_reason !== 'pause_turn') break;
    messages = [...messages, { role: 'assistant', content: res.content }];
  }
  if (res.stop_reason === 'pause_turn') throw err('upstream_error', 'La búsqueda no terminó.');
  return parseJson(textOf(res));
}

// Fachada compatible con la interfaz que usan los prompts de ingest.js
const facade = (ctx) => ({ json: (prompt, o = {}) => json(prompt, { ...ctx, tier: o.modelTier, kind: o.kind || ctx.kind }) });

module.exports = { call, json, research, facade, textOf, configured: () => !!getClient(), setOidc, GATEWAY, MODEL };
