-- ========================================
-- X カレンダー予約投稿管理アプリ スキーマ
-- ========================================

-- ユーザートークンテーブル（Supabase Authと連携）
CREATE TABLE IF NOT EXISTS user_tokens (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  x_user_id        TEXT NOT NULL,
  x_username       TEXT NOT NULL,
  x_name           TEXT,
  x_avatar_url     TEXT,
  x_access_token   TEXT NOT NULL,
  x_refresh_token  TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- 投稿テーブル
CREATE TABLE IF NOT EXISTS posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content       TEXT NOT NULL CHECK (char_length(content) <= 280),
  scheduled_at  TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'posted', 'failed')),
  thread_id     UUID,             -- スレッドのグループID（thread_order=0 と同一UUIDを使う）
  thread_order  INTEGER NOT NULL DEFAULT 0,
  tweet_id      TEXT,             -- 投稿後のX側のツイートID
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS posts_user_id_idx       ON posts (user_id);
CREATE INDEX IF NOT EXISTS posts_scheduled_at_idx  ON posts (scheduled_at);
CREATE INDEX IF NOT EXISTS posts_status_idx        ON posts (status);
CREATE INDEX IF NOT EXISTS posts_thread_id_idx     ON posts (thread_id);

-- ========================================
-- RLS（Row Level Security）
-- ========================================

ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts        ENABLE ROW LEVEL SECURITY;

-- user_tokens: 自分のレコードのみ操作可能
DROP POLICY IF EXISTS "Users can manage own tokens" ON user_tokens;
CREATE POLICY "Users can manage own tokens"
  ON user_tokens FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- posts: 自分のレコードのみ操作可能
DROP POLICY IF EXISTS "Users can manage own posts" ON posts;
CREATE POLICY "Users can manage own posts"
  ON posts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- updated_at 自動更新トリガー
-- ========================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_tokens_updated_at ON user_tokens;
CREATE TRIGGER user_tokens_updated_at
  BEFORE UPDATE ON user_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS posts_updated_at ON posts;
CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
