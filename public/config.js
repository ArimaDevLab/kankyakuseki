// 中継サーバーのURL。
// ・Twitchに置いたとき（〜.ext-twitch.tv から読み込まれる）は、本番のサーバーを指す
// ・それ以外（Renderや手元のPCから直接開いたとき）は空 = このページと同じ場所を使う
window.KANKYAKU_SERVER = /\.ext-twitch\.tv$/.test(location.hostname) ? 'https://kankyakuseki.onrender.com' : '';
