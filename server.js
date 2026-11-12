// Trenchline relay server.
// Serves the game page and relays messages between a room's host and its players.
// The host's browser runs the game; this server never simulates anything.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const GAME = path.join(__dirname, 'game.html');
const MAX_PLAYERS = 4;

// Optional password gate. Set GAME_PASSWORD in Render's Environment settings to turn it on.
// Leave it unset and the game is open to anyone with the link.
const PASSWORD = process.env.GAME_PASSWORD || '';
const TOKEN = PASSWORD ? crypto.createHmac('sha256', PASSWORD).update('trenchline-ok').digest('hex') : '';

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function allowed(req) {
  if (!PASSWORD) return true;
  const got = Buffer.from(cookies(req).tl || '');
  const want = Buffer.from(TOKEN);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
function passwordOk(given) {
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
function loginPage(wrong) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Trenchline</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#22183d;color:#fbf4ff;font:18px system-ui,sans-serif;padding:16px;box-sizing:border-box}' +
    'form{background:#2f2352;border:3px solid #4a3a78;border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:10px;width:min(340px,100%)}' +
    'h1{margin:0;font-size:28px;color:#5ab4ff}h1 span{color:#ff6b8a}input,button{font:inherit;padding:8px 10px;border-radius:8px;border:2px solid #4a3a78}' +
    'input{background:#140e26;color:#fbf4ff}button{background:#ffe66b;color:#2a1838;border:0;font-weight:700;cursor:pointer}p{margin:0;color:#ff8fa8;min-height:1.2em}</style></head><body>' +
    '<form method="post" action="/login"><h1>Trench<span>line</span></h1><label for="pw">Password</label>' +
    '<input id="pw" name="pw" type="password" autocomplete="current-password" autofocus required><input type="hidden" name="h" id="h">' +
    '<button>Enter</button><p>' + (wrong ? 'That password is not right.' : '') + '</p></form>' +
    '<script>document.getElementById("h").value=location.hash.slice(1);</script></body></html>';
}

function page() {
  const body = fs.readFileSync(GAME, 'utf8');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + body + '</body></html>';
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (PASSWORD && req.method === 'POST' && req.url === '/login') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      const f = new URLSearchParams(body);
      if (!passwordOk(f.get('pw') || '')) { res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' }); res.end(loginPage(true)); return; }
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      const room = /^[A-Za-z]{4}$/.test(f.get('h') || '') ? '#' + f.get('h').toUpperCase() : '';
      res.writeHead(303, { 'set-cookie': 'tl=' + TOKEN + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000' + secure, location: '/' + room });
      res.end();
    });
    return;
  }
  if (!allowed(req)) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(loginPage(false)); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
  res.end(page());
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024, verifyClient: info => allowed(info.req) });
const rooms = new Map();
let nextId = 1;

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

wss.on('connection', ws => {
  ws.id = nextId++;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'host') {
      const code = newCode();
      const room = { code, host: ws, peers: new Map() };
      rooms.set(code, room);
      ws.room = room; ws.isHost = true;
      send(ws, { t: 'room', code, id: ws.id });
    } else if (m.t === 'join') {
      const room = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!room) return send(ws, { t: 'err', msg: 'No room with that code.' });
      if (room.peers.size >= MAX_PLAYERS - 1) return send(ws, { t: 'err', msg: 'That room is full.' });
      room.peers.set(ws.id, ws);
      ws.room = room;
      send(ws, { t: 'joined', code: room.code, id: ws.id });
      send(room.host, { t: 'peer', id: ws.id, name: String(m.name || '').slice(0, 12) });
    } else if (m.t === 'tohost' && ws.room && !ws.isHost) {
      send(ws.room.host, { t: 'from', id: ws.id, d: m.d });
    } else if (m.t === 'send' && ws.isHost) {
      const data = JSON.stringify({ t: 'msg', d: m.d });
      if (m.to === -1) { for (const p of ws.room.peers.values()) if (p.readyState === 1) p.send(data); }
      else { const p = ws.room.peers.get(m.to); if (p && p.readyState === 1) p.send(data); }
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    if (ws.isHost) {
      for (const p of room.peers.values()) send(p, { t: 'closed' });
      rooms.delete(room.code);
    } else {
      room.peers.delete(ws.id);
      send(room.host, { t: 'left', id: ws.id });
    }
  });
});

// Drop dead connections so rooms do not linger.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log('Trenchline running on http://localhost:' + PORT + (PASSWORD ? ' (password on)' : ' (no password)')));
