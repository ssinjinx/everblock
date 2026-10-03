#!/usr/bin/env node
// Everblock multiplayer server entry point: serves the game page and runs the shared world over WebSockets.
//   PORT=8080 node index.js        (see SERVER.md for every setting)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

function loadEnvFile(f) { // tiny .env reader so `npm start` works without Docker
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadEnvFile(path.join(__dirname, '.env')); loadEnvFile(path.join(__dirname, '..', '.env'));

const { openStore } = require('./lib/store');
const { EverblockServer, VERSION } = require('./lib/server');
const env = process.env;
const bool = (v, d) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const PORT = +env.PORT || 8080;
const HOST = env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(env.DATA_DIR || path.join(__dirname, 'data'));
const STATIC_DIR = path.resolve(env.STATIC_DIR || [path.join(__dirname, '..'), path.join(__dirname, 'public')].find((p) => fs.existsSync(path.join(p, 'index.html'))) || path.join(__dirname, '..'));
const store = openStore(DATA_DIR, env.STORE);
const srv = new EverblockServer({
  store, seed: env.WORLD_SEED ? (/^\d+$/.test(env.WORLD_SEED) ? +env.WORLD_SEED : require('./lib/shared').EB.util.hashStr(env.WORLD_SEED)) : 1999,
  name: env.SERVER_NAME || 'Everblock', motd: env.MOTD || '',
  admins: (env.ADMINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  allowRegister: bool(env.ALLOW_REGISTER, true), allowBuild: bool(env.ALLOW_BUILD, true),
  maxPlayers: +env.MAX_PLAYERS || 200, maxPerIp: +env.MAX_CONN_PER_IP || 8,
});

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const PUBLIC = new Set(['/index.html', '/manifest.webmanifest', '/sw.js']);
const cache = new Map();
function serveFile(res, rel, method) {
  const file = path.join(STATIC_DIR, rel);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    const key = file + ':' + st.mtimeMs;
    let body = cache.get(key);
    if (!body) { body = fs.readFileSync(file); cache.set(key, body); }
    const ext = path.extname(file);
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'content-length': body.length,
      'cache-control': ext === '.png' ? 'public, max-age=86400' : 'no-cache', 'x-content-type-options': 'nosniff', 'x-everblock-server': VERSION });
    res.end(method === 'HEAD' ? undefined : body);
  });
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/api/info') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); return res.end(JSON.stringify(srv.info())); }
  if (p === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (p === '/' || p === '') p = '/index.html';
  if (PUBLIC.has(p) || /^\/icons\/[a-z0-9_-]+\.png$/i.test(p)) return serveFile(res, p, req.method);
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 65536, perMessageDeflate: { threshold: 512 } });
const TRUST_PROXY = bool(env.TRUST_PROXY, false);
wss.on('connection', (ws, req) => {
  const fwd = TRUST_PROXY && req.headers['x-forwarded-for'];
  const ip = (fwd ? String(fwd).split(',').pop().trim() : req.socket.remoteAddress) || '?'; // the proxy appends the real client address last
  srv.connect(ws, ip);
});
// keepalive: drop dead TCP connections
setInterval(() => { for (const ws of wss.clients) { if (ws.isAlive === false) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) { /* ignore */ } } }, 30000);
wss.on('connection', (ws) => { ws.isAlive = true; ws.on('pong', () => (ws.isAlive = true)); });

server.listen(PORT, HOST, () => {
  console.log(`Everblock server v${VERSION} "${srv.name}" listening on http://${HOST}:${PORT}  (store: ${store.kind}, data: ${DATA_DIR}, page: ${STATIC_DIR})`);
  srv.zone('everblock');
});
let stopping = false;
function stop(sig) {
  if (stopping) return; stopping = true;
  console.log(`[server] ${sig}: saving and shutting down`);
  try { srv.shutdown(); } catch (e) { console.error(e); }
  for (const ws of wss.clients) try { ws.close(1012, 'Server restarting'); } catch (e) { /* ignore */ }
  server.close(); setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', () => stop('SIGINT')); process.on('SIGTERM', () => stop('SIGTERM'));
module.exports = { srv, server };
