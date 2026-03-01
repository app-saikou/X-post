# セットアップチェックリスト

## 1. Supabase

### プロジェクト作成
- [ ] https://supabase.com でプロジェクト新規作成
- [ ] Project URL と anon key をメモ（後で使う）
- [ ] `supabase/schema.sql` の内容を **SQL Editor** で実行

### X OAuth 設定
- [ ] Dashboard → **Authentication → Providers → Twitter** をON
- [ ] Client ID / Client Secret を入力（手順2で取得）
- [ ] Callback URL をメモ: `https://xxxx.supabase.co/auth/v1/callback`

---

## 2. X Developer Portal

- [ ] https://developer.twitter.com でアプリ作成
- [ ] **User authentication settings** を設定
  - App permissions: **Read and write**
  - Type of App: **Web App**
  - Callback URI: Supabase の Callback URL（手順1でメモしたもの）
  - Website URL: Netlify のデプロイ URL（後で更新してもOK）
- [ ] **OAuth 2.0 Client ID と Client Secret** をメモ
- [ ] それを Supabase の Twitter Provider に入力（手順1に戻る）

---

## 3. ローカル開発

- [ ] `.env.local.example` をコピーして `.env.local` を作成
  ```bash
  cp .env.local.example .env.local
  ```
- [ ] `.env.local` に値を埋める
  ```
  NEXT_PUBLIC_SUPABASE_URL=     # Supabase Project URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anon key
  SUPABASE_SERVICE_ROLE_KEY=    # Supabase service_role key
  X_CLIENT_ID=                  # X OAuth 2.0 Client ID
  X_CLIENT_SECRET=              # X OAuth 2.0 Client Secret
  NEXT_PUBLIC_APP_URL=http://localhost:3000
  ```
- [ ] 起動確認
  ```bash
  npm run dev
  ```
- [ ] ブラウザで http://localhost:3000 → **「X でログイン」** が表示される
- [ ] ログイン → カレンダーが表示される
- [ ] Supabase の **Table Editor → user_tokens** にレコードが保存されている

---

## 4. GitHub

- [ ] GitHubで新規リポジトリ作成（**Public** 推奨 → Actions が無制限）
- [ ] リモートを追加してプッシュ
  ```bash
  git remote add origin https://github.com/yourname/x-calendar-scheduler.git
  git add .
  git commit -m "初回コミット"
  git push -u origin master
  ```
- [ ] **Settings → Secrets and variables → Actions** で以下を登録
  | Secret 名 | 値 |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
  | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |

---

## 5. Netlify デプロイ

- [ ] https://netlify.com → **Add new site → Import an existing project**
- [ ] GitHub リポジトリを選択
- [ ] ビルド設定（自動検出されるが念のため確認）
  - Build command: `npm run build`
  - Publish directory: `.next`
- [ ] **Site configuration → Environment variables** で以下を登録
  | 変数名 | 値 |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
  | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
  | `X_CLIENT_ID` | X OAuth Client ID |
  | `X_CLIENT_SECRET` | X OAuth Client Secret |
  | `NEXT_PUBLIC_APP_URL` | Netlify の URL（例: https://xxx.netlify.app） |
- [ ] デプロイ実行 → エラーがないか確認
- [ ] Netlify の URL で動作確認

---

## 6. 本番 URL の反映

デプロイ後、URL が確定したら各サービスに反映する。

- [ ] X Developer Portal → Callback URI に Netlify URL を追加
  ```
  https://xxx.netlify.app  （Website URL）
  ```
- [ ] `.env.local` の `NEXT_PUBLIC_APP_URL` を本番 URL に更新（ローカル開発用なので任意）

---

## 7. スケジューラー動作確認

- [ ] Supabase でテスト用の予約投稿を過去の日時で作成
- [ ] GitHub Actions → **scheduler** ワークフローを手動実行（`workflow_dispatch`）
- [ ] X 上に投稿されているか確認
- [ ] Supabase の posts テーブルで `status = 'posted'` になっているか確認
- [ ] 5分後に cron が自動実行されるか確認

---

## 完了 🎉

すべてチェックできたら運用開始です。
