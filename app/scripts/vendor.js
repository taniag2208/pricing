// Copia las librerías del navegador a web/vendor para servirlas como archivos estáticos (build de Vercel).
const fs = require('fs'); const path = require('path');
const out = path.join(__dirname, '..', 'web', 'vendor'); fs.mkdirSync(out, { recursive: true });
const files = { 'react.js': 'react/umd/react.production.min.js', 'react-dom.js': 'react-dom/umd/react-dom.production.min.js', 'htm.js': 'htm/dist/htm.umd.js', 'xlsx.js': 'xlsx/dist/xlsx.full.min.js' };
for (const [to, from] of Object.entries(files)) fs.copyFileSync(path.join(__dirname, '..', 'node_modules', from), path.join(out, to));
console.log('vendor listo:', Object.keys(files).join(', '));
