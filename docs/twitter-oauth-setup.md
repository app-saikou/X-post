# X / Twitter OAuth 2.0 ログイン設定メモ

## 重要: provider 名の使い分け

`@supabase/auth-js` には Twitter 関連の provider が2つある：

| provider 名 | 対応する OAuth | Supabase Dashboard の項目 |
|---|---|---|
| `"twitter"` | OAuth 1.0a | Twitter (Deprecated) |
| `"x"` | OAuth 2.0 | X / Twitter (OAuth 2.0) |

**X / Twitter (OAuth 2.0) を使う場合は必ず `provider: "x"` を指定すること。**

`provider: "twitter"` を使うと Deprecated プロバイダーを参照し、
`"Unsupported provider: provider is not enabled"` エラーになる。

---

## Supabase Dashboard 設定

### Authentication → Providers
- **X / Twitter (OAuth 2.0)**: Enabled ✅
- **Twitter (Deprecated)**: Disabled ✅

### Authentication → URL Configuration
- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: `http://localhost:3000/auth/callback`

---

## Twitter Developer Portal 設定

### アプリ: X-post-tool
- **User Authentication Settings** → セットアップ済み
- **OAuth 2.0**: 有効
- **Type of App**: Web App（機密クライアント）
- **Callback URI**: `https://sjzyegnyqzglxptaeylo.supabase.co/auth/v1/callback`
- **Website URL**: `http://localhost:3000`

### Supabase に登録する認証情報
- **Client ID**: Twitter Developer Portal の OAuth 2.0 セクションに表示される短い値
- **Client Secret**: セットアップ時の一度限りのモーダルに表示される長い値（再表示不可）

---

## コード実装

```typescript
// app/login/page.tsx
const { error } = await supabase.auth.signInWithOAuth({
  provider: "x",  // OAuth 2.0 → "x" を使う（"twitter" は OAuth 1.0a）
  options: {
    scopes: "tweet.read,tweet.write,users.read,offline.access",  // カンマ区切り
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  },
});
```

### スコープについて
- Supabase GoTrue v2 はカンマ区切りを期待する（スペース区切りは不可）
- `offline.access` はリフレッシュトークン取得に必要

---

## トラブルシューティング

### `"Unsupported provider: provider is not enabled"`
→ `provider: "twitter"` になっていないか確認。`provider: "x"` に変更する。

### `{"error":"requested path is invalid"}`
→ Redirect URL が許可リストにない。Supabase Dashboard → URL Configuration を確認。

### Twitter Developer Portal で `Not a valid URL format`
→ 組織のURL・利用規約・プライバシーポリシー欄に `https://` だけ入っている。空欄に戻す。
