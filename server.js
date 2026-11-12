// Trenchline relay server.
// Serves the game page and relays messages between a room's host and its players.
// The host's browser runs the game; this server never simulates anything.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const GAME = path.join(__dirname, 'game.html');
const MAX_PLAYERS = 4;

function page() {
  const body = fs.readFileSync(GAME, 'utf8');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<style>[hidden]{display:none!important}body{margin:0}</style></head><body>' + body + '</body></html>';
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
  res.end(page());
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 });
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

server.listen(PORT, () => console.log('Trenchline running on http://localhost:' + PORT));
