// Servidores simulados para pruebas: tiendas Shopify y la API de Anthropic.
const http = require('http');

function rnd(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function catalog(name, n, eff, lvl, seed) {
  const r = rnd(seed); const g = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const typs = ['Tote', 'Bandolera', 'Clutch'], mats = ['Cuero', 'Sintético', 'Lona'];
  const products = [];
  for (let i = 0; i < n; i++) {
    const lv = [0, 1, 2, 3, 4].map(() => Math.max(1, Math.min(5, Math.round(3 + lvl + g()))));
    const price = Math.round(Math.exp(11.4 + 0.15 * lv[0] + 0.1 * lv[1] + 0.06 * lv[2] + 0.05 * lv[3] + 0.08 * lv[4] + eff + g() * 0.1) / 1000) * 1000 - 100;
    const promo = r() < 0.2;
    products.push({ id: i, title: `${typs[i % 3]} ${name} ${i}`, handle: `p-${i}`, body_html: `<p>Bolso ${typs[i % 3]} en ${mats[i % 3]}. niveles:${lv.join(',')}</p>`, product_type: 'Bolsos', tags: ['mujer'], variants: [{ price: String(promo ? Math.round(price * 0.8) : price) + '.00', compare_at_price: promo ? String(price) + '.00' : null, sku: `${name.slice(0, 3).toUpperCase()}-${i}`, available: true }] });
  }
  products.push({ id: 999, title: 'Llavero metálico ' + name, handle: 'llavero', body_html: 'Accesorio', product_type: 'Accesorios', tags: [], variants: [{ price: '59900.00', sku: 'LL', available: true }] });
  return products;
}
function store(port, name, n, eff, lvl, mode) {
  const all = catalog(name, n, eff, lvl, port);
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    // Modo 'ld': sin API pública (robots la bloquea); solo sitemap y páginas con datos estructurados schema.org
    if (mode === 'ld') {
      if (u.pathname === '/robots.txt') { res.end('User-agent: *\nDisallow: /api/\nDisallow: /products.json\nSitemap: http://127.0.0.1:' + port + '/sitemap.xml\n'); return; }
      if (u.pathname === '/sitemap.xml') { res.end('<?xml version="1.0"?><sitemapindex><sitemap><loc>http://127.0.0.1:' + port + '/sitemap/product-0.xml</loc></sitemap><sitemap><loc>http://127.0.0.1:' + port + '/sitemap/brand-0.xml</loc></sitemap></sitemapindex>'); return; }
      if (u.pathname === '/sitemap/product-0.xml') { res.end('<urlset>' + all.map((p) => '<url><loc>http://127.0.0.1:' + port + '/' + p.handle + '-' + p.title.toLowerCase().replace(/\W+/g, '-') + '/p</loc></url>').join('') + '</urlset>'); return; }
      const m = u.pathname.match(/^\/(p-\d+|llavero)-.*\/p$/);
      if (m) { const p = all.find((x) => x.handle === m[1]); const v = p.variants[0]; const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.title, sku: v.sku, description: p.body_html.replace(/<[^>]+>/g, ''), offers: { '@type': 'AggregateOffer', lowPrice: Number(v.price), offers: [{ '@type': 'Offer', price: Number(v.price), availability: 'https://schema.org/InStock', priceSpecification: v.compare_at_price ? [{ '@type': 'UnitPriceSpecification', priceType: 'https://schema.org/ListPrice', price: Number(v.compare_at_price) }] : [] }] } }; const bc = { '@type': 'BreadcrumbList', itemListElement: [{ name: 'Inicio' }, { name: p.product_type }, { name: p.title }] }; res.setHeader('Content-Type', 'text/html'); res.end('<html><head><script type="application/ld+json">' + JSON.stringify(ld) + '</script><script type="application/ld+json">' + JSON.stringify(bc) + '</script></head><body>x</body></html>'); return; }
      res.statusCode = 404; res.end('no'); return;
    }
    if (u.pathname === '/robots.txt') { res.end('User-agent: *\nDisallow: /admin\n'); return; }
    if (u.pathname === '/products.json') {
      const page = Number(u.searchParams.get('page') || 1), lim = 25;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ products: all.slice((page - 1) * lim, page * lim) }));
      return;
    }
    res.statusCode = 404; res.end('no');
  });
  return new Promise((r) => srv.listen(port, () => r(srv)));
}

function respond(t) {
  if (t.includes('proponer las categorías')) return { categories: [{ name: 'Bolsos de mujer', short: 'Bolsos', synonyms: ['bolso', 'cartera', 'bag'], typologies: ['Tote', 'Bandolera', 'Clutch'], materials: ['Cuero', 'Sintético', 'Lona'], colors: ['Negro', 'Café', 'Beige'], attributes: ['Calidad del material', 'Construcción', 'Herrajes', 'Funcionalidad', 'Diseño'].map((n) => ({ name: n, levels: ['Básico', 'Estándar', 'Bueno', 'Superior', 'Excelente'] })) }] };
  if (t.includes('Clasifica cada etiqueta')) { const out = []; t.split('\n').forEach((l) => { const m = l.match(/^(\d+)\. .*«(.*)»/); if (m) out.push({ i: +m[1], cat: m[2] === 'Bolsos' ? 'bolsos-0' : null }); }); return out; }
  if (t.includes('clasificador de atributos')) { const out = []; t.split('\n').forEach((l) => { const m = l.match(/^\[(\d+)\] (.*?) \| etiqueta: (.*?) \| (.*)$/); if (!m) return; const lv = (m[4].match(/niveles:([\d,]+)/) || [])[1]; if (!lv) { out.push({ k: +m[1], cat: null }); return; } const mat = (m[4].match(/en (\w+)/) || [])[1]; out.push({ k: +m[1], cat: 'bolsos-0', typ: m[2].split(' ')[0], mat, color: 'Negro', lv: lv.split(',').map(Number), conf: +m[1] % 7 === 0 ? 'baja' : 'alta', ev: 'niveles en la ficha' }); }); return out; }
  if (t.includes('Mira la imagen')) return { typ: 'Tote', mat: 'Cuero', color: 'Negro', lv: [5, 4, 3, 3, 4], ev: 'Cuero liso' };
  return {};
}
function anthropic(port, log) {
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
      const j = JSON.parse(body || '{}');
      log.push({ path: req.url, model: j.model, beta: req.headers['anthropic-beta'], fallbacks: j.fallbacks, effort: j.output_config && j.output_config.effort, tools: (j.tools || []).length });
      const last = j.messages[j.messages.length - 1];
      const text = typeof last.content === 'string' ? last.content : last.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      let content, stop = 'end_turn';
      if ((j.tools && j.tools.length && String(j.tools[0].type || '').startsWith('web_search')) || /sonar/.test(j.model || '')) {
        if (anthropic.noComps) { log.push({ search: 'nocomps' }); content = [{ type: 'text', text: JSON.stringify({ country: 'CO', storeName: 'Marca Propia', competitors: [{ name: 'Muerta 1', url: 'http://127.0.0.1:4998' }, { name: 'Muerta 2', url: 'http://127.0.0.1:4997' }] }) }]; } else
        content = [{ type: 'text', text: JSON.stringify({ country: 'CO', storeName: 'Marca Propia', competitors: [{ name: 'Alfa', url: 'http://127.0.0.1:4102' }, { name: 'Sin catálogo', url: 'http://127.0.0.1:4999' }, { name: 'Beta', url: 'http://127.0.0.1:4103' }, { name: 'Gama', url: 'http://127.0.0.1:4104' }, { name: 'Extranjera', url: 'http://127.0.0.1:4107' }, { name: 'Lenta', url: 'http://127.0.0.1:4109' }] }) }];
      } else if (j.tools && j.tools.length) {
        const hasResult = Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_result');
        if (!hasResult) { content = [{ type: 'tool_use', id: 'tu_1', name: 'resumen_categorias', input: {} }]; stop = 'tool_use'; }
        else { const r = last.content[0].content; content = [{ type: 'text', text: 'Resumen recibido: ' + String(r).slice(0, 60) + '…' }]; }
      } else content = [{ type: 'text', text: JSON.stringify(respond(text)) }];
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: j.model, content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } }));
    });
  });
  return new Promise((r) => srv.listen(port, () => r(srv)));
}
module.exports = { store, anthropic };
