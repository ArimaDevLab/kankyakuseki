-- 観客席: チャンネルごとの設定（独自の言葉・季節の帽子）を保存する表
-- SupabaseのSQL Editorに貼り付けて実行する
create table if not exists public.rooms (
  room       text primary key,           -- Twitchのチャンネル番号
  config     jsonb not null,             -- { custom: [{word, motion}], season }
  updated_at timestamptz not null default now()
);

-- サーバー（シークレットキーを持つ側）以外からは読み書きできないようにする
alter table public.rooms enable row level security;
