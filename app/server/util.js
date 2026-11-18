const crypto = require('crypto');
const id = (p) => (p || '') + crypto.randomBytes(9).toString('base64url');
const tempPassword = () => crypto.randomBytes(9).toString('base64url');
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = { id, tempPassword, slug, sleep };
