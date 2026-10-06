// 視聴者側のボタン。Twitchの動画の上（拡張機能）でも、単体のページ（テスト）でも動く。
(() => {
  const SERVER = (window.KANKYAKU_SERVER || location.origin).replace(/\/$/, '');
  const ja = (navigator.language || '').startsWith('ja');
  const LABELS = ja ? { nod: 'うん', laugh: '笑', wow: 'えっ', clap: '拍手' }
                    : { nod: 'Yes', laugh: 'Haha', wow: 'Wow', clap: 'Clap' };
  const dock = document.getElementById('dock');
  const meBox = document.getElementById('me');
  const btns = document.getElementById('btns');
  let token = null, me = null, seat = '', started = false, lastSend = 0;
  let config = { custom: [], season: 'auto' }, shown = '';

  const post = (path, body) => fetch(SERVER + path, {
    method: 'POST', keepalive: true,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

  // ボタンを並べる: 基本の4つ ＋ このチャンネル独自の言葉
  function render() {
    btns.textContent = '';
    const add = (type, label, html, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = label;
      if (cls) b.className = cls;
      if (html) b.innerHTML = html;
      b.appendChild(document.createElement('span')).textContent = label;
      b.addEventListener('click', () => send(type));
      btns.appendChild(b);
    };
    for (const type of Mascot.BASE) add(type, LABELS[type], Mascot.face(type, Mascot.colorFor(seat)));
    config.custom.forEach((c, i) => add('c' + i, c.word, '', 'custom'));
    Mascot.setHat(me, Mascot.seasonHat(config.season));
  }

  // 見ているだけで席に座る。20秒ごとに「まだいます」と伝え、設定の変更も受け取る
  async function ping() {
    try {
      const res = await post('/api/ping');
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      dock.classList.remove('offline');
      if (!me) { // 配信画面の自分と同じ色の分身を出す
        seat = 'x:' + data.id;
        me = Mascot.create(seat);
        meBox.appendChild(me);
      }
      const key = JSON.stringify(data.config);
      if (key !== shown) { shown = key; config = data.config; render(); }
    } catch { dock.classList.add('offline'); }
  }

  function send(type) {
    Mascot.react(me, type, config); // 配信は数秒遅れるので、手元ではすぐ動かす
    const now = Date.now();
    if (now - lastSend < 500) return;
    lastSend = now;
    post('/api/react', { type }).catch(() => dock.classList.add('offline'));
  }

  function start(t) {
    token = t;
    if (started) return;
    started = true;
    ping();
    setInterval(ping, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) ping(); }); // タブに戻ったらすぐ着席し直す
    addEventListener('pagehide', () => { post('/api/leave').catch(() => {}); });
  }

  const inTwitch = window.parent !== window && window.Twitch && window.Twitch.ext;
  if (inTwitch) {
    window.Twitch.ext.onAuthorized((auth) => start(auth.token)); // トークン更新のたびに呼ばれる
  } else {
    // テスト用: タブ1枚が視聴者1人になる
    document.body.classList.add('standalone');
    const room = new URLSearchParams(location.search).get('room') || 'dev';
    document.getElementById('hint').textContent = ja
      ? 'テスト表示（部屋: ' + room + '）。このタブが視聴者1人分です。ボタンを押すとOBS側のマスコットが動きます。'
      : 'Test mode (room: ' + room + '). This tab is one viewer.';
    start('dev.' + room + '.' + Math.random().toString(36).slice(2, 12));
  }
})();
