// 観客席 中継サーバー（依存パッケージなし / Node 18以上）
//   視聴者のボタン → このサーバー → OBSのオーバーレイ
// 環境変数:
//   PORT        待ち受けポート（既定 8080）
//   EXT_SECRET  Twitch拡張機能のシークレット(base64)。未設定ならテストモードで動く
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8080;
const SECRET = process.env.EXT_SECRET ? Buffer.from(process.env.EXT_SECRET, 'base64') : null;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = new Set(['nod', 'laugh', 'wow', 'clap']);
const MOTIONS = new Set(['nod', 'laugh', 'wow', 'clap', 'spin', 'wave']);
const SEASONS = new Set(['auto', 'none', 'halloween', 'christmas', 'sakura', 'summer']);
const MAX_CUSTOM = 4;       // チャンネル独自の言葉の数
const MAX_WORD = 8;         // 言葉の最大文字数
const DATA_FILE = path.join(__dirname, 'data', 'rooms.json');
const AWAY_MS = 150000;     // この時間pingが無ければ退席（裏に回ったタブはpingが1分に1回まで遅くなるので長めに）
const REACT_GAP_MS = 400;   // 1人あたりの連打制限
const MAX_VIEWERS = 200;    // 1部屋あたりの上限
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

const rooms = new Map(); // room -> { viewers: Map(id -> {seen, lastReact}), listeners: Set(res) }

// ---- チャンネルごとの設定（独自の言葉・季節の帽子） ----
let configs = {};
try { configs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { /* 初回はファイルなし */ }
const getConfig = (name) => configs[name] || { custom: [], season: 'auto' };
function cleanConfig(c) {
  const custom = [];
  for (const x of Array.isArray(c && c.custom) ? c.custom : []) {
    const word = [...String((x && x.word) || '').replace(/\s+/g, ' ').trim()].slice(0, MAX_WORD).join('');
    if (!word) continue;
    custom.push({ word, motion: MOTIONS.has(x.motion) ? x.motion : 'wow' });
    if (custom.length >= MAX_CUSTOM) break;
  }
  return { custom, season: SEASONS.has(c && c.season) ? c.season : 'auto' };
}
function saveConfig(name, config) {
  configs[name] = config;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(configs, null, 2));
}

const getRoom = (name) => {
  if (!rooms.has(name)) rooms.set(name, { viewers: new Map(), listeners: new Set() });
  return rooms.get(name);
};
const emit = (room, data) => {
  const line = 'data: ' + JSON.stringify(data) + '\n\n';
  for (const res of room.listeners) res.write(line);
};

// ---- 認証: Twitchが視聴者ごとに発行するJWTを検証する ----
function verifyJwt(token) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  try {
    if (JSON.parse(Buffer.from(h, 'base64url')).alg !== 'HS256') return null;
    const sig = Buffer.from(s, 'base64url');
    const want = crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest();
    if (sig.length !== want.length || !crypto.timingSafeEqual(sig, want)) return null;
    const body = JSON.parse(Buffer.from(p, 'base64url'));
    if (!body.exp || body.exp * 1000 < Date.now()) return null;
    if (!body.channel_id || !body.opaque_user_id) return null;
    return { room: String(body.channel_id), user: String(body.opaque_user_id), role: body.role };
  } catch { return null; }
}
function identify(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  let who;
  if (SECRET) who = verifyJwt(m[1]);
  else { // テストモード: "dev.部屋名.適当なID"
    const d = /^dev\.([\w-]{1,40})\.([\w-]{1,40})$/.exec(m[1]);
    who = d && { room: d[1], user: d[2], role: 'broadcaster' };
  }
  if (!who) return null;
  // 画面側にはTwitchのIDを渡さず、ハッシュした短いIDだけを使う
  const id = crypto.createHash('sha256').update(SECRET || 'dev').update(who.room + ':' + who.user)
    .digest('hex').slice(0, 10);
  return { room: who.room, id, role: who.role };
}

function touch(room, id) {
  let v = room.viewers.get(id);
  if (!v) {
    if (room.viewers.size >= MAX_VIEWERS) return null;
    v = { seen: 0, lastReact: 0 };
    room.viewers.set(id, v);
    emit(room, { t: 'join', id });
  }
  v.seen = Date.now();
  return v;
}

setInterval(() => {
  const limit = Date.now() - AWAY_MS;
  for (const [name, room] of rooms) {
    for (const [id, v] of room.viewers) {
      if (v.seen < limit) { room.viewers.delete(id); emit(room, { t: 'leave', id }); }
    }
    for (const res of room.listeners) res.write(': keepalive\n\n');
    if (!room.viewers.size && !room.listeners.size) rooms.delete(name);
  }
}, 10000);

const readJson = (req) => new Promise((resolve) => {
  let buf = '';
  req.on('data', (c) => { buf += c; if (buf.length > 4096) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(buf || '{}')); } catch { resolve({}); } });
  req.on('error', () => resolve({}));
});
const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // OBSのオーバーレイが購読する
  if (req.method === 'GET' && url.pathname === '/api/events') {
    const name = url.searchParams.get('room') || '';
    if (!/^[\w-]{1,40}$/.test(name)) return json(res, 400, { error: 'room' });
    const room = getRoom(name);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('data: ' + JSON.stringify({ t: 'sync', ids: [...room.viewers.keys()], config: getConfig(name) }) + '\n\n');
    room.listeners.add(res);
    req.on('close', () => room.listeners.delete(res));
    return;
  }

  // 設定の読み出し（誰でも）
  if (req.method === 'GET' && url.pathname === '/api/config') {
    const name = url.searchParams.get('room') || '';
    if (!/^[\w-]{1,40}$/.test(name)) return json(res, 400, { error: 'room' });
    return json(res, 200, getConfig(name));
  }

  // 視聴者側（拡張機能）から
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    const who = identify(req);
    if (!who) return json(res, 401, { error: 'auth' });
    const room = getRoom(who.room);
    if (url.pathname === '/api/leave') {
      if (room.viewers.delete(who.id)) emit(room, { t: 'leave', id: who.id });
      return json(res, 200, {});
    }
    if (url.pathname === '/api/config') { // 設定の保存は配信者だけ
      if (who.role !== 'broadcaster') return json(res, 403, { error: 'broadcaster only' });
      const config = cleanConfig(await readJson(req));
      saveConfig(who.room, config);
      emit(room, { t: 'config', config });
      return json(res, 200, config);
    }
    const v = touch(room, who.id);
    if (!v) return json(res, 503, { error: 'full' });
    if (url.pathname === '/api/ping') return json(res, 200, { id: who.id, config: getConfig(who.room) });
    if (url.pathname === '/api/react') {
      const { type } = await readJson(req);
      const c = /^c([0-3])$/.exec(type || '');
      if (!TYPES.has(type) && !(c && Number(c[1]) < getConfig(who.room).custom.length)) return json(res, 400, { error: 'type' });
      const now = Date.now();
      if (now - v.lastReact < REACT_GAP_MS) return json(res, 429, { error: 'slow down' });
      v.lastReact = now;
      emit(room, { t: 'react', id: who.id, type });
      return json(res, 200, { id: who.id });
    }
    return json(res, 404, { error: 'not found' });
  }

  // 画面のファイル
  if (req.method === 'GET') {
    const rel = url.pathname === '/' ? '/viewer.html' : decodeURIComponent(url.pathname);
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
    return fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }
  res.writeHead(405); res.end();
}).listen(PORT, () => {
  console.log(`kankyakuseki server: http://localhost:${PORT}  (${SECRET ? 'Twitch mode' : 'TEST mode - no EXT_SECRET'})`);
  console.log(`  viewer : http://localhost:${PORT}/viewer.html`);
  console.log(`  settings: http://localhost:${PORT}/settings.html`);
  console.log(`  overlay: http://localhost:${PORT}/overlay.html?room=dev`);
});
