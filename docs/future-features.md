# 将来実装したい機能メモ

## バズりツイート検索 → 予約投稿

### 概要
キーワードで X を検索してバズっているツイートを一覧表示し、
それを参考に下書きを作成してカレンダーで予約投稿できる機能。

### ユーザーフロー
1. 検索画面でキーワード入力（例: 個人開発）
2. バズり順（いいね数・RT数）で一覧表示
3. 「このツイートを参考に下書き作成」ボタン
4. PostModal に内容を引き継ぎ
5. カレンダーで予約投稿

### 実装メモ

```typescript
// API: GET /2/tweets/search/recent
const results = await client.v2.search('個人開発', {
  max_results: 100,
  'tweet.fields': ['public_metrics', 'created_at', 'author_id'],
  sort_order: 'relevancy',
});

// いいね数でソート（バズり順）
const sorted = results.data.sort(
  (a, b) => b.public_metrics.like_count - a.public_metrics.like_count
);
```

### 必要な追加ファイル
- `app/search/page.tsx` - 検索画面
- `app/api/search/route.ts` - 検索 API Route
- `components/TweetCard.tsx` - ツイート表示カード

### 前提条件
- Twitter API **Basic プラン（$100/月）以上**が必要
  - Free プランは検索 API 非対応
- `tweet.read` スコープは既に取得済み ✅

### 実装タイミング
有料化・公開するタイミングで追加予定。
実装自体は複雑ではないので、プランを上げたときにすぐ入れられる。
