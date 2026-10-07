// 配信画面に出る「チャンネル独自の言葉」の最低限のチェック。
// 差別語・露骨な性的表現・自傷や暴力をあおる語だけを対象にする（軽い悪態は配信者の判断に任せる）。
// 一覧は検索などに平文で出ないよう base64 にしてある。中身を見るには: node blocklist.js --list
// 試すには: node blocklist.js --check "言葉"
const DATA = JSON.parse(Buffer.from('eyJibG9jayI6IFsiczpuaWdnZXIiLCAiczpuaWdnYSIsICJzOmZhZ2dvdCIsICJ4OmZhZyIsICJzOmtpa2UiLCAiczpjaGluayIsICJ4OnNwaWMiLCAiczpnb29rIiwgInM6dHJhbm55IiwgInM6cmV0YXJkIiwgIng6Y29vbiIsICJzOndldGJhY2siLCAieDpwYWtpIiwgIng6ZHlrZSIsICJzOm5hemkiLCAiczpoaXRsZXIiLCAieDpoZWlsIiwgIng644OK44OBIiwgInM644OS44OI44Op44O8IiwgInM644OL44Ks44O8IiwgIng644OB44On44OzIiwgInM644OB44On44Oz5YWsIiwgInM65pSv6YKj5Lq6IiwgIng644K344OK5Lq6IiwgInM65Zyf5Lq6IiwgInM656mi5aSaIiwgInM66Z2e5Lq6IiwgInM66YOo6JC95rCRIiwgInM644Kt44OB44Ks44KkIiwgInM65rCX6YGV44GEIiwgInM65Z+65Zyw5aSWIiwgInM644Ks44Kk44K4IiwgInM66Lqr6ZqcIiwgIng644GX44KT44GX44KH44GGIiwgInM65rGg5rK8IiwgIng644Ob44OiIiwgIng644Kq44Kr44OeIiwgIng644Os44K6IiwgInM644KB44GP44KJIiwgInM6Y3VudCIsICJ4OmNvY2siLCAiczpwdXNzeSIsICJ4OmRpY2siLCAiczpwZW5pcyIsICJzOnZhZ2luYSIsICJzOmJsb3dqb2IiLCAieDpjdW0iLCAiczpwb3JuIiwgIng6cmFwZSIsICJzOnJhcGlzdCIsICJzOnNsdXQiLCAiczp3aG9yZSIsICJzOmhhbmRqb2IiLCAiczpkaWxkbyIsICJzOuOBoeOCk+OBvSIsICJzOuOBoeOCk+OBkyIsICJzOuOBvuOCk+OBkyIsICJzOuOCu+ODg+OCr+OCuSIsICJzOuODrOOCpOODlyIsICJzOuODleOCp+ODqSIsICJzOuOCquODiuODi+ODvCIsICJzOueyvuWtkCIsICJzOuWwhOeyviIsICJzOuS4reWHuuOBlyIsICJzOuW8t+WnpiIsICJzOuWjsuaYpSIsICJzOuODmuODieODleOCoyIsICJ4OuODmuODiSIsICJzOuWFkOerpeODneODq+ODjiIsICJzOuODneODq+ODjiIsICJzOuOBiuOBo+OBseOBhCIsICJzOuS5s+mmliIsICJzOuOBoeOBj+OBsyIsICJzOuOCouODiuODqyIsICJzOuOCseODhOeptCIsICJzOuOBkeOBpOOBguOBqiIsICJzOuOBjeOCk+OBn+OBviIsICJzOumHkeeOiSIsICJzOuOBoeOCk+OBoeOCkyIsICJzOuODmuODi+OCuSIsICJzOumZsOiMjiIsICJzOuODtOOCoeOCruODiiIsICJzOuiGoyIsICJzOuOCr+ODquODiOODquOCuSIsICJzOuWLg+i1tyIsICJzOuOBvOOBo+OBjSIsICJzOuOCtuODvOODoeODsyIsICJzOuODpOODquODnuODsyIsICJzOuODkeOCpOOCuuODqiIsICJzOuaJi+OCs+OCrSIsICJzOua9ruWQuSIsICJzOuWWmOOBjiIsICJwOuOCqOODrSIsICJ4OuOCqOODg+ODgSIsICJwOuOBiOOBo+OBoeOBqiIsICJzOuW3qOS5syIsICJzOueIhuS5syIsICJzOuaAp+WZqCIsICJzOuaAp+S6pCIsICJzOueXtOa8oiIsICJzOmJvb2IiLCAieDp0aXQiLCAieDp0aXRzIiwgInM6dGl0dGllcyIsICJ4OmFuYWwiLCAiczphbmFsc2V4IiwgIng6YW51cyIsICJzOm5pcHBsZSIsICJzOmJvbmVyIiwgInM6aG9ybnkiLCAiczpqaXp6IiwgIng6c2VtZW4iLCAiczpvcmdhc20iLCAiczptYXN0dXJiYXQiLCAiczpoZW50YWkiLCAiczptaWxmIiwgIng6a3lzIiwgInM6a2lsbHlvdXIiLCAiczpzdWljaWRlIiwgInM65q2744GtIiwgInM65rCP44GtIiwgInA644GX44GtIiwgInM65q6644GZIiwgInA644GT44KN44GZIiwgInM66Ieq5q66IiwgIng644GY44GV44GkIiwgInM644Ks44K55a6kIiwgInM66aaW5ZCKIl0sICJhbGxvdyI6IFsi44OR44OB44Oz44KzIiwgIuOCq+ODleOCp+ODqeODhiIsICLjg5Xjgqfjg6njg7zjg6oiLCAi44Ks44Kk44K444OzIiwgIuOBjOOBhOOBmOOCkyIsICLjg5vjg6LjgrXjg5Tjgqjjg7PjgrkiLCAi44K344ON44OeIiwgIuOBl+OBreOCk+OBm+OBhCIsICLjgarjgovjgbvjgakiLCAi44Ko44Ot44Oz44Ky44O844K344On44OzIl19', 'base64').toString('utf8'));

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', '$': 's', '!': 'i' };
// 表記の違いをならす: 全角半角・大文字小文字・カタカナ・数字や記号の置き換え・間に挟んだ記号や空白・長音
function normalize(text) {
  return String(text).normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
    .replace(/[013457@$!]/g, (c) => LEET[c])
    .replace(/[^\p{L}\p{N}]/gu, '')   // 記号・空白を取り除く
    .replace(/ー/g, '');
}
const squeeze = (s) => s.replace(/(.)\1+/g, '$1'); // 連続した同じ文字を1つに

const RULES = DATA.block.map((e) => { const i = e.indexOf(':'); return { mode: e.slice(0, i), word: normalize(e.slice(i + 1)) }; });
const ALLOW = DATA.allow.map(normalize);

function hit(text, rules) {
  return rules.some(({ mode, word }) =>
    mode === 'x' ? text === word : mode === 'p' ? text.startsWith(word) : text.includes(word));
}
function isBlocked(input) {
  let text = normalize(input);
  for (const ok of ALLOW) text = text.split(ok).join(' '); // 無害だと分かっている語は先に除く
  if (hit(text, RULES)) return true;
  // 「niiiice」のように文字を伸ばしてごまかした場合だけ、伸ばしを詰めてもう一度見る
  if (/(.)\1\1/.test(text)) {
    const long = RULES.filter((r) => r.word.length >= 5).map((r) => ({ mode: r.mode, word: squeeze(r.word) }));
    if (hit(squeeze(text), long)) return true;
  }
  return false;
}

module.exports = { isBlocked, normalize };

if (require.main === module) {
  const [flag, value] = process.argv.slice(2);
  if (flag === '--list') console.log(DATA);
  else if (flag === '--check') console.log(isBlocked(value) ? 'blocked' : 'ok');
}
