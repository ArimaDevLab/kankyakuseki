// 観客席 中継サーバー（依存パッケージなし / Node 18以上）
//   視聴者のボタン → このサーバー → OBSのオーバーレイ
// 環境変数:
//   PORT        待ち受けポート（既定 8080）
//   EXT_SECRET  Twitch拡張機能のシークレット(base64)。未設定ならテストモードで動く
//   SUPABASE_URL / SUPABASE_KEY  設定の保存先（Supabase）。未設定なら data/rooms.json に保存する
//   SUPABASE_TABLE  表の名前（既定 rooms）。既存のプロジェクトに同居させるときに変える
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isBlocked } = require('./blocklist');

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
// 保存先はSupabase（環境変数があるとき）か、手元のファイル。読んだものは configs に覚えておく
const DB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const DB_KEY = process.env.SUPABASE_KEY || '';
const USE_DB = Boolean(DB_URL && DB_KEY);
const DB_TABLE = /^\w+$/.test(process.env.SUPABASE_TABLE || '') ? process.env.SUPABASE_TABLE : 'rooms'; // 表の名前
const DB_HEADERS = { apikey: DB_KEY, Authorization: 'Bearer ' + DB_KEY, 'Content-Type': 'application/json' };
let configs = {};
if (!USE_DB) { try { configs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { /* 初回はファイルなし */ } }
const getConfig = (name) => configs[name] || { custom: [], season: 'auto' };

// その部屋の設定をまだ読んでいなければ、Supabaseから読む（部屋ごとに1回だけ）
const loaded = new Set();
const loading = new Map();
function ensureConfig(name) {
  if (!USE_DB || loaded.has(name)) return Promise.resolve();
  if (!loading.has(name)) {
    const url = DB_URL + '/rest/v1/' + DB_TABLE + '?select=config&room=eq.' + encodeURIComponent(name);
    loading.set(name, fetch(url, { headers: DB_HEADERS, signal: AbortSignal.timeout(8000) })
      .then(async (r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const rows = await r.json();
        if (rows[0]) configs[name] = cleanConfig(rows[0].config);
        loaded.add(name);
        stats.dbError = '';
      })
      .catch((e) => { stats.dbError = 'load: ' + e.message; console.error('config load failed:', e.message); }) // 次回また試す
      .finally(() => loading.delete(name)));
  }
  return loading.get(name);
}
function cleanConfig(c) {
  const custom = [];
  for (const x of Array.isArray(c && c.custom) ? c.custom : []) {
    const word = [...String((x && x.word) || '').replace(/\s+/g, ' ').trim()].slice(0, MAX_WORD).join('');
    if (!word || isBlocked(word)) continue; // 登録できない言葉は捨てる（保存時は先にエラーで知らせる）
    custom.push({ word, motion: MOTIONS.has(x.motion) ? x.motion : 'wow' });
    if (custom.length >= MAX_CUSTOM) break;
  }
  return { custom, season: SEASONS.has(c && c.season) ? c.season : 'auto' };
}
async function saveConfig(name, config) {
  if (USE_DB) {
    const r = await fetch(DB_URL + '/rest/v1/' + DB_TABLE, {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { ...DB_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ room: name, config, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    loaded.add(name);
    configs[name] = config;
    return;
  }
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

// 動作確認用の数字（個人や部屋を特定する情報は含めない）。GET /api/status で見られる
const stats = { started: Date.now(), pings: 0, reacts: 0, authFailed: 0, lastAuthError: '', dbError: '' };
const authError = (why) => { stats.authFailed++; stats.lastAuthError = why; return null; };

// ---- 認証: Twitchが視聴者ごとに発行するJWTを検証する ----
function verifyJwt(token) {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return authError('not a JWT');
  try {
    if (JSON.parse(Buffer.from(h, 'base64url')).alg !== 'HS256') return authError('wrong alg');
    const sig = Buffer.from(s, 'base64url');
    const want = crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest();
    if (sig.length !== want.length || !crypto.timingSafeEqual(sig, want)) return authError('bad signature (EXT_SECRET mismatch?)');
    const body = JSON.parse(Buffer.from(p, 'base64url'));
    if (!body.exp || body.exp * 1000 < Date.now()) return authError('expired');
    if (!body.channel_id || !body.opaque_user_id) return authError('missing channel_id/opaque_user_id');
    return { room: String(body.channel_id), user: String(body.opaque_user_id), role: body.role };
  } catch { return authError('malformed'); }
}
function identify(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return authError('no token');
  let who;
  if (SECRET) who = verifyJwt(m[1]);
  else { // テストモード: "dev.部屋名.適当なID"
    const d = /^dev\.([\w-]{1,40})\.([\w-]{1,40})$/.exec(m[1]);
    who = d ? { room: d[1], user: d[2], role: 'broadcaster' } : authError('not a test token');
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
    await ensureConfig(name);
    const room = getRoom(name);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('data: ' + JSON.stringify({ t: 'sync', ids: [...room.viewers.keys()], config: getConfig(name) }) + '\n\n');
    room.listeners.add(res);
    req.on('close', () => room.listeners.delete(res));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    let viewers = 0, overlays = 0;
    for (const r of rooms.values()) { viewers += r.viewers.size; overlays += r.listeners.size; }
    return json(res, 200, { mode: SECRET ? 'twitch' : 'test', uptimeSec: Math.round((Date.now() - stats.started) / 1000),
      rooms: rooms.size, viewers, overlays, pings: stats.pings, reacts: stats.reacts,
      authFailed: stats.authFailed, lastAuthError: stats.lastAuthError,
      storage: USE_DB ? 'supabase' : 'file', dbError: stats.dbError });
  }

  // 設定の読み出し（誰でも）
  if (req.method === 'GET' && url.pathname === '/api/config') {
    const name = url.searchParams.get('room') || '';
    if (!/^[\w-]{1,40}$/.test(name)) return json(res, 400, { error: 'room' });
    await ensureConfig(name);
    return json(res, 200, getConfig(name));
  }

  // 視聴者側（拡張機能）から
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    const who = identify(req);
    if (!who) return json(res, 401, { error: 'auth' });
    await ensureConfig(who.room);
    const room = getRoom(who.room);
    if (url.pathname === '/api/leave') {
      if (room.viewers.delete(who.id)) emit(room, { t: 'leave', id: who.id });
      return json(res, 200, {});
    }
    if (url.pathname === '/api/config') { // 設定の保存は配信者だけ
      if (who.role !== 'broadcaster') return json(res, 403, { error: 'broadcaster only' });
      const body = await readJson(req);
      const bad = (Array.isArray(body.custom) ? body.custom : []).map((x) => String((x && x.word) || '').trim()).filter((w) => w && isBlocked(w));
      if (bad.length) return json(res, 400, { error: 'blocked', words: bad });
      const config = cleanConfig(body);
      try { await saveConfig(who.room, config); stats.dbError = ''; } catch (e) {
        stats.dbError = 'save: ' + e.message;
        console.error('config save failed:', e.message);
        return json(res, 502, { error: 'storage' });
      }
      emit(room, { t: 'config', config });
      return json(res, 200, config);
    }
    const v = touch(room, who.id);
    if (!v) return json(res, 503, { error: 'full' });
    if (url.pathname === '/api/ping') stats.pings++;
    if (url.pathname === '/api/ping') return json(res, 200, { id: who.id, config: getConfig(who.room) });
    if (url.pathname === '/api/react') {
      const { type } = await readJson(req);
      const c = /^c([0-3])$/.exec(type || '');
      if (!TYPES.has(type) && !(c && Number(c[1]) < getConfig(who.room).custom.length)) return json(res, 400, { error: 'type' });
      const now = Date.now();
      if (now - v.lastReact < REACT_GAP_MS) return json(res, 429, { error: 'slow down' });
      v.lastReact = now;
      stats.reacts++;
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
  console.log(`kankyakuseki server: http://localhost:${PORT}  (${SECRET ? 'Twitch mode' : 'TEST mode - no EXT_SECRET'}, settings in ${USE_DB ? 'Supabase' : 'data/rooms.json'})`);
  console.log(`  viewer : http://localhost:${PORT}/viewer.html`);
  console.log(`  settings: http://localhost:${PORT}/settings.html`);
  console.log(`  overlay: http://localhost:${PORT}/overlay.html?room=dev`);
});
