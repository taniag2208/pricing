// Carga el motor analítico y los parsers del front-end (mismo código en cliente y servidor).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {}, console, URL, setTimeout, clearTimeout };
vm.createContext(ctx);
for (const f of ['engine.js', 'ingest.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'web', 'js', f), 'utf8'), ctx, { filename: f });
module.exports = ctx.window.TP;
