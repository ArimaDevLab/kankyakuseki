// 配信者用の設定画面。チャンネル独自の言葉と、季節の帽子を決める。
// Twitchの拡張機能の設定画面としても、単体のページ（テスト）としても動く。
(() => {
  const SERVER = (window.KANKYAKU_SERVER || location.origin).replace(/\/$/, '');
  const ja = (navigator.language || '').startsWith('ja');
  const T = ja ? {
    title: '観客席の設定', words: 'チャンネル独自の言葉',
    wordsNote: '視聴者のボタンに追加されます（最大4つ・8文字まで）。空欄の行は使われません。チャットにこの言葉が書かれたときも反応します。',
    season: '季節の帽子', seasonNote: '「自動」にすると、時期に合わせてマスコットが帽子をかぶります。',
    save: '保存', saved: '保存しました', failed: '保存できませんでした', loading: '読み込み中…', try: '試す',
    ph: ['例: ナイス！', '例: かわいい', '', ''],
    motions: { wow: 'ジャンプ', spin: 'くるっと回る', wave: '手を振る', clap: '拍手', laugh: '笑う', nod: 'うなずく' },
    seasons: { auto: '自動（日付で切り替え）', none: 'なし', halloween: 'ハロウィン（10月）', christmas: 'クリスマス（12月）', sakura: '桜（春）', summer: '麦わら帽子（夏）' },
  } : {
    title: 'Kankyakuseki settings', words: 'Channel words',
    wordsNote: 'Added to the viewer buttons (up to 4, 8 characters each). Empty rows are ignored. Chat messages containing a word trigger it too.',
    season: 'Seasonal hat', seasonNote: '"Auto" picks a hat for the time of year.',
    save: 'Save', saved: 'Saved', failed: 'Could not save', loading: 'Loading…', try: 'Try',
    ph: ['e.g. Nice!', 'e.g. Cute', '', ''],
    motions: { wow: 'Jump', spin: 'Spin', wave: 'Wave', clap: 'Clap', laugh: 'Laugh', nod: 'Nod' },
    seasons: { auto: 'Auto (by date)', none: 'None', halloween: 'Halloween (Oct)', christmas: 'Christmas (Dec)', sakura: 'Cherry blossom (spring)', summer: 'Straw hat (summer)' },
  };
  document.documentElement.lang = ja ? 'ja' : 'en';
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = T[el.dataset.t];

  const rowsEl = document.getElementById('rows');
  const seasonEl = document.getElementById('season');
  const statusEl = document.getElementById('status');
  const mascot = Mascot.create('preview');
  document.getElementById('preview').appendChild(mascot);

  const option = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; };
  for (const [v, label] of Object.entries(T.seasons)) seasonEl.appendChild(option(v, label));
  const showHat = () => Mascot.setHat(mascot, Mascot.seasonHat(seasonEl.value));
  seasonEl.addEventListener('change', showHat);

  const rows = [];
  for (let i = 0; i < 4; i++) {
    const row = document.createElement('div');
    row.className = 'row';
    const word = document.createElement('input');
    word.maxLength = 8;
    word.placeholder = T.ph[i];
    word.setAttribute('aria-label', T.words + ' ' + (i + 1));
    const motion = document.createElement('select');
    for (const [v, label] of Object.entries(T.motions)) motion.appendChild(option(v, label));
    const tryBtn = document.createElement('button');
    tryBtn.type = 'button';
    tryBtn.textContent = T.try;
    const preview = () => Mascot.play(mascot, motion.value, word.value.trim() || word.placeholder.replace(/^.*: |^e\.g\. /, '') || '…', 'custom');
    tryBtn.addEventListener('click', preview);
    motion.addEventListener('change', preview);
    row.append(word, motion, tryBtn);
    rowsEl.appendChild(row);
    rows.push({ word, motion });
  }

  function fill(config) {
    rows.forEach((r, i) => {
      const c = config.custom[i];
      r.word.value = c ? c.word : '';
      r.motion.value = c ? c.motion : 'wow';
    });
    seasonEl.value = config.season;
    showHat();
  }

  let token = null;
  async function load(room) {
    statusEl.textContent = T.loading;
    try {
      fill(await (await fetch(SERVER + '/api/config?room=' + encodeURIComponent(room))).json());
      statusEl.textContent = '';
    } catch { statusEl.textContent = ''; showHat(); }
  }
  document.getElementById('save').addEventListener('click', async () => {
    statusEl.className = '';
    try {
      const res = await fetch(SERVER + '/api/config', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ season: seasonEl.value, custom: rows.map((r) => ({ word: r.word.value, motion: r.motion.value })) }),
      });
      if (!res.ok) throw new Error(res.status);
      fill(await res.json()); // サーバーが整えた結果（空行を詰める等）を表示し直す
      statusEl.textContent = T.saved;
    } catch { statusEl.className = 'error'; statusEl.textContent = T.failed; }
  });

  const inTwitch = window.parent !== window && window.Twitch && window.Twitch.ext;
  if (inTwitch) {
    let loaded = false;
    window.Twitch.ext.onAuthorized((auth) => { token = auth.token; if (!loaded) { loaded = true; load(auth.channelId); } });
  } else {
    const room = new URLSearchParams(location.search).get('room') || 'dev';
    token = 'dev.' + room + '.streamer';
    load(room);
  }
})();
