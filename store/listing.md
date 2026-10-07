# Twitch掲載情報（バージョン詳細に貼り付ける内容）

## 名前
Kankyakuseki

## 概要（最大140文字）
Give lurkers a voice. Viewers sit in your stream as cute mascots and react with one click — no chat message needed.

## 説明（最大1024文字）
Kankyakuseki ("audience seats" in Japanese) puts a row of small mascots on your stream — one for every viewer who is watching. Viewers press a button on the video to make their mascot nod, laugh, gasp or clap, with a dancing speech bubble. Nothing is posted in chat, so even shy viewers and first-timers can react.

For streamers
- See that people are there, even when chat is quiet. Great for small channels.
- Add up to 4 channel words (like "Nice!" or "GG") with their own motions.
- Seasonal hats appear automatically: Halloween, Christmas, cherry blossom, summer.
- Optional: mascots also react to chat messages such as "lol" or "888".
- Reactions are anonymous. No viewer names are shown.

Setup
1. Activate the extension as an Overlay.
2. Open the settings and copy the URL shown there.
3. Add it to OBS as a Browser source (width: your canvas, height: 400).

日本語にも対応しています。視聴者はコメントを書かずに、ボタンひとつで相づちを打てます。

## 視聴者向け概要（最大140文字）
Hover over the video and press a button to make your mascot react on stream. It's anonymous and nothing is posted in chat.

## カテゴリー
Viewer Engagement（視聴者参加に近いものを選ぶ。なければ Other）

## URL
- プライバシーポリシー: https://kankyakuseki.onrender.com/privacy.html
- 利用規約（EULA/ToS）: https://kankyakuseki.onrender.com/terms.html

## 画像
- ロゴ（100x100）: logo-100x100.png
- ディスカバリー画像（300x200）: discovery-300x200.png
- スクリーンショット: screenshot-1-stream.png / screenshot-2-settings.png / screenshot-3-seasons.png
- タスクバーアイコン（24x24、求められた場合のみ）: taskbar-24x24.png

## 審査用：ウォークスルーガイド（Walkthrough Guide and Change Log）
What it does
Kankyakuseki shows audience mascots on the stream via an OBS Browser source, and lets viewers control their own mascot from a video overlay.

How to test
1. Install and activate the extension as Overlay 1.
2. Open the extension configuration. Copy "URL for OBS" and add it to OBS as a Browser source (1920x400).
3. Go live and open the channel page. Hover over the video: a small panel appears on the right with your mascot and four buttons (Yes / Haha / Wow / Clap).
4. Press a button. Your mascot reacts instantly in the panel, and the matching mascot in the OBS source reacts with a speech bubble.
5. In the configuration, add a channel word (e.g. "Nice!"), choose a motion and press Save. Within 20 seconds a new purple button appears in the viewer panel.
6. Change "Seasonal hat" and press Save. Mascots in the OBS source change hats immediately.

Technical notes
- Backend (EBS): https://kankyakuseki.onrender.com — verifies the Twitch JWT on every request. Only the broadcaster role can save settings.
- The free hosting tier sleeps when idle; the first request after a long pause can take up to about a minute.
- No Bits, no subscriptions, no identity linking, no chat messages sent by the extension.
- Data: the opaque user ID is hashed and kept in memory only while the viewer is watching. Channel settings are stored by channel ID.

Change log
0.0.1 — Initial release.
