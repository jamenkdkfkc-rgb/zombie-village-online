const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 10000;
const MAX_PLAYERS = 4;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('zombie relay ok');
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // code -> Map(id -> { ws, x, y, z, yaw })

wss.on('connection', ws => {
  let room = null;
  let id = null;

  function leave() {
    if (room && rooms.has(room)) {
      rooms.get(room).delete(id);
      if (rooms.get(room).size === 0) rooms.delete(room);
    }
    room = null;
    id = null;
  }

  ws.on('message', raw => {
    let d;
    try { d = JSON.parse(raw); } catch (e) { return; }

    if (d.t === 'join') {
      if (typeof d.code !== 'string' || !/^\d{4}$/.test(d.code)) return;
      const clean = String(d.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
      if (!clean) return;
      leave();
      if (!rooms.has(d.code)) rooms.set(d.code, new Map());
      const players = rooms.get(d.code);
      if (players.size >= MAX_PLAYERS) {
        ws.send(JSON.stringify({ t: 'full' }));
        return;
      }
      room = d.code;
      id = clean;
      players.set(id, { ws, x: 0, y: 0, z: 0, yaw: 0, of: 0, w: '', dead: false, sc: 0 });
      ws.send(JSON.stringify({ t: 'joined', id }));
    } else if (d.t === 'p' && room && id) {
      const me = rooms.get(room) && rooms.get(room).get(id);
      if (!me) return;
      me.x = Number(d.x) || 0;
      me.y = Number(d.y) || 0;
      me.z = Number(d.z) || 0;
      me.yaw = Number(d.yaw) || 0;
      me.of = (Number(d.of) || 0) | 0;
      me.w = String(d.w || '').slice(0, 12);
      me.dead = !!d.dead;
      me.sc = Number(d.sc) || 0;
    }
  });

  ws.on('close', leave);
});

// ส่งตำแหน่งทุกคนในห้องให้ทุกคนในห้องทุก 100 มิลลิวินาที
setInterval(() => {
  for (const players of rooms.values()) {
    const list = [];
    for (const [pid, p] of players) list.push({ id: pid, x: p.x, y: p.y, z: p.z, yaw: p.yaw, of: p.of, w: p.w, dead: p.dead, sc: p.sc });
    const msg = JSON.stringify({ t: 'L', l: list });
    for (const p of players.values()) {
      if (p.ws.readyState === 1) p.ws.send(msg);
    }
  }
}, 100);

server.listen(PORT, () => console.log('relay listening on ' + PORT));
