// マスコットの絵と動き。オーバーレイ(OBS)・視聴者側ボタン・設定画面で共用する。
window.Mascot = (() => {
  const COLORS = ['#FF8FA3', '#FFB86B', '#FFD966', '#8FD694', '#6EC6E6', '#8FA8FF', '#C59CFF', '#F5A3D7'];
  // 動きの一覧と長さ(ms)。BASE は最初から付いている4つのボタン
  const DURATION = { nod: 1000, laugh: 1300, wow: 1100, clap: 1400, spin: 1000, wave: 1500 };
  const BASE = ['nod', 'laugh', 'wow', 'clap'];
  const MOTIONS = Object.keys(DURATION);
  const INK = '#4a3b3b';
  const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; };
  const colorFor = (id) => COLORS[hash(id) % COLORS.length];

  const EYES = {
    open: `<g class="eyes-open" fill="${INK}"><ellipse cx="48" cy="57" rx="4" ry="5.5"/><ellipse cx="72" cy="57" rx="4" ry="5.5"/>
      <circle cx="49.5" cy="55" r="1.4" fill="#fff"/><circle cx="73.5" cy="55" r="1.4" fill="#fff"/></g>`,
    happy: `<g class="eyes-happy" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round">
      <path d="M43 59 Q48 51 53 59"/><path d="M67 59 Q72 51 77 59"/></g>`,
    wide: `<g class="eyes-wide"><circle cx="48" cy="56" r="6.5" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
      <circle cx="72" cy="56" r="6.5" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
      <circle cx="48" cy="56" r="2.4" fill="${INK}"/><circle cx="72" cy="56" r="2.4" fill="${INK}"/></g>`,
  };
  const MOUTH = {
    smile: `<path class="mouth-smile" d="M54 68 Q60 73 66 68" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
    laugh: `<path class="mouth-laugh" d="M52 67 Q60 81 68 67 Z" fill="#C2515B" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,
    o: `<ellipse class="mouth-o" cx="60" cy="71" rx="4" ry="5" fill="#C2515B" stroke="${INK}" stroke-width="2"/>`,
  };
  const STAR = 'M60 68 L62 76 L70 78 L62 80 L60 88 L58 80 L50 78 L58 76 Z';
  const faceBase = (color) => `<circle cx="60" cy="52" r="40" fill="${color}"/>
      <ellipse cx="60" cy="57" rx="30" ry="27" fill="#FFEEDD"/>
      <ellipse cx="40" cy="67" rx="6" ry="4" fill="#FF9AA8" opacity=".6"/>
      <ellipse cx="80" cy="67" rx="6" ry="4" fill="#FF9AA8" opacity=".6"/>`;

  // ---- 季節の帽子 ----
  const HATS = {
    halloween: `<ellipse cx="60" cy="22" rx="42" ry="8" fill="#4b2f7a"/>
      <path d="M38 22 Q54 -4 74 -24 Q72 0 82 22 Z" fill="#5b3b8c"/>
      <path d="M41 15 Q60 22 79 14 L82 22 Q60 30 38 22 Z" fill="#FF9F43"/>
      <rect x="55" y="15" width="10" height="9" rx="2" fill="none" stroke="#FFE066" stroke-width="2.5"/>`,
    christmas: `<path d="M30 26 Q50 -22 94 2 Q78 2 90 26 Z" fill="#E5484D"/>
      <rect x="24" y="17" width="72" height="15" rx="7.5" fill="#fff"/>
      <circle cx="95" cy="3" r="8" fill="#fff"/>`,
    sakura: `<g transform="translate(88 20)" fill="#FFB7CE" stroke="#fff" stroke-width="1.2">
      <circle cx="0" cy="-8" r="6"/><circle cx="7.6" cy="-2.5" r="6"/><circle cx="4.7" cy="6.5" r="6"/>
      <circle cx="-4.7" cy="6.5" r="6"/><circle cx="-7.6" cy="-2.5" r="6"/><circle r="4" fill="#FFE066" stroke="none"/></g>`,
    summer: `<ellipse cx="60" cy="22" rx="48" ry="9" fill="#E3C06A"/>
      <path d="M36 22 Q36 -6 60 -6 Q84 -6 84 22 Z" fill="#F2D98D"/>
      <path d="M36 15 Q60 21 84 15 L84 22 Q60 28 36 22 Z" fill="#E5484D"/>`,
  };
  // 設定値 → 実際にかぶる帽子。'auto' は日付で決める
  const seasonHat = (setting, d = new Date()) => {
    if (HATS[setting]) return setting;
    if (setting !== 'auto') return '';
    const md = (d.getMonth() + 1) * 100 + d.getDate();
    if (md >= 1001 && md <= 1031) return 'halloween';
    if (md >= 1201 && md <= 1225) return 'christmas';
    if (md >= 320 && md <= 410) return 'sakura';
    if (md >= 720 && md <= 831) return 'summer';
    return '';
  };
  const setHat = (el, name) => {
    el.querySelector('.hat').innerHTML = HATS[name] || '';
    el.classList.toggle('has-hat', !!HATS[name]);
  };

  // 全身（動く）
  const svg = (color) => `
<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="60" cy="143" rx="30" ry="5" fill="rgba(0,0,0,.25)"/>
  <g class="fig">
    <ellipse cx="48" cy="137" rx="10" ry="6" fill="#5b4a4a"/><ellipse cx="72" cy="137" rx="10" ry="6" fill="#5b4a4a"/>
    <rect x="36" y="78" width="48" height="58" rx="22" fill="${color}"/>
    <rect x="36" y="78" width="48" height="58" rx="22" fill="rgba(0,0,0,.08)"/>
    <g class="arm armL"><ellipse cx="33" cy="106" rx="7" ry="12" transform="rotate(18 33 106)" fill="${color}"/></g>
    <g class="arm armR"><ellipse cx="87" cy="106" rx="7" ry="12" transform="rotate(-18 87 106)" fill="${color}"/></g>
    <g class="head">${faceBase(color)}${EYES.open}${EYES.happy}${EYES.wide}${MOUTH.smile}${MOUTH.laugh}${MOUTH.o}<g class="hat"></g></g>
  </g>
  <g class="fx fx-clap" fill="#FFE066" stroke="#fff" stroke-width="1.5" stroke-linejoin="round">
    <path d="${STAR}" transform="translate(-34 8)"/><path d="${STAR}" transform="translate(36 2)"/>
  </g>
</svg>`;

  // 顔だけ（ボタン用・動かない）
  const FACES = { nod: ['open', 'smile'], laugh: ['happy', 'laugh'], wow: ['wide', 'o'], clap: ['happy', 'smile'] };
  const still = (s) => s.replace(/ class="[^"]*"/, '');
  const face = (type, color) => {
    const [e, m] = FACES[type];
    const extra = type === 'clap' ? `<path d="${STAR}" transform="translate(34 -52)" fill="#FFE066" stroke="#fff" stroke-width="1.5"/>`
      : type === 'wow' ? `<text x="101" y="30" font-size="30" font-weight="900" fill="#FF5C6C" stroke="#fff" stroke-width="4"
          paint-order="stroke" text-anchor="middle" font-family="Arial Black, Arial, sans-serif">!</text>`
      : type === 'nod' ? `<path d="M96 30 l6 7 l6 -7 M96 42 l6 7 l6 -7" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>` : '';
    return `<svg viewBox="14 6 100 92" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${faceBase(color)}${still(EYES[e])}${still(MOUTH[m])}${extra}</svg>`;
  };

  const create = (id, hat) => {
    const el = document.createElement('div');
    el.className = 'm';
    el.style.setProperty('--d', (-(hash(id) % 30) / 10) + 's');
    el.innerHTML = svg(colorFor(id));
    if (hat) setHat(el, hat);
    return el;
  };

  // ---- 吹き出し ----
  const WORDS = {
    ja: { nod: 'うんうん', laugh: '(笑)', wow: 'えっ!?', clap: '888' },
    en: { nod: 'Yeah', laugh: 'LOL', wow: 'Wow!', clap: 'Clap!' },
  };
  let lang = (navigator.language || '').startsWith('ja') ? 'ja' : 'en';
  let bubbles = true;
  const setLang = (l) => { if (WORDS[l]) lang = l; };
  const setBubbles = (on) => { bubbles = on; };
  const bubble = (el, word, cls) => {
    if (el._bubble) el._bubble.remove();
    const b = document.createElement('div');
    b.className = 'bubble t-' + cls;
    [...word].forEach((ch, i) => {
      const s = document.createElement('span');
      s.textContent = ch === ' ' ? '\u00a0' : ch;
      s.style.animationDelay = (i * 0.09) + 's';
      b.appendChild(s);
    });
    b.addEventListener('animationend', (e) => { if (e.target === b) { b.remove(); if (el._bubble === b) el._bubble = null; } });
    el.appendChild(b);
    el._bubble = b;
  };

  // 動き＋言葉を再生する
  const play = (el, motion, word, cls) => {
    if (!DURATION[motion]) return;
    if (bubbles && word) bubble(el, word, cls || motion);
    el.classList.remove(...MOTIONS.map((m) => 'is-' + m));
    void el.offsetWidth; // 同じ反応を連続で出せるようにリセット
    el.classList.add('is-' + motion);
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('is-' + motion), DURATION[motion]);
  };
  // 反応の種類（nod など、または独自の c0〜c3）を、設定に従って再生する
  const react = (el, type, config) => {
    if (BASE.includes(type)) return play(el, type, WORDS[lang][type]);
    const m = /^c(\d)$/.exec(type || '');
    const c = m && config && config.custom && config.custom[Number(m[1])];
    if (c) play(el, c.motion, c.word, 'custom');
  };

  return { BASE, MOTIONS, colorFor, create, play, react, face, setLang, setBubbles, seasonHat, setHat };
})();
