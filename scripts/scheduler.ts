/**
 * scheduler.ts
 * GitHub Actions の cron (5分ごと) から実行される投稿スケジューラー
 *
 * 実行: npx ts-node --project tsconfig.scripts.json scripts/scheduler.ts
 */

import { createClient } from "@supabase/supabase-js";
import { TwitterApi } from "twitter-api-v2";

// ========================================
// 環境変数チェック
// ========================================
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "❌ 環境変数が不足しています: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

// ========================================
// Supabase Admin Client (RLS回避)
// ========================================
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ========================================
// 型定義
// ========================================
interface PostWithToken {
  id: string;
  user_id: string;
  content: string;
  scheduled_at: string;
  status: string;
  thread_id: string | null;
  thread_order: number;
  media_urls: string[];
  x_access_token: string;
}

// ========================================
// メイン処理
// ========================================
async function run() {
  console.log(`\n🕐 スケジューラー開始: ${new Date().toISOString()}`);

  // 1. 送信すべき投稿を取得（scheduled_at <= now AND status = 'pending'）
  const { data: rawPosts, error: fetchError } = await supabase
    .from("posts")
    .select(`
      id,
      user_id,
      content,
      scheduled_at,
      status,
      thread_id,
      thread_order,
      media_urls,
      user_tokens!inner(x_access_token)
    `)
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true });

  if (fetchError) {
    console.error("❌ Supabase フェッチエラー:", fetchError.message);
    process.exit(1);
  }

  if (!rawPosts || rawPosts.length === 0) {
    console.log("✅ 送信すべき投稿はありません。");
    return;
  }

  console.log(`📝 送信対象: ${rawPosts.length} 件`);

  // user_tokens が JOIN された結果を整形
  const posts: PostWithToken[] = rawPosts.map((p: any) => ({
    id: p.id,
    user_id: p.user_id,
    content: p.content,
    scheduled_at: p.scheduled_at,
    status: p.status,
    thread_id: p.thread_id,
    thread_order: p.thread_order,
    media_urls: p.media_urls ?? [],
    x_access_token: p.user_tokens.x_access_token,
  }));

  // 2. user_id ごとにグループ化
  const userGroups = new Map<string, PostWithToken[]>();
  for (const post of posts) {
    const arr = userGroups.get(post.user_id) ?? [];
    arr.push(post);
    userGroups.set(post.user_id, arr);
  }

  // 3. ユーザーごとに処理
  for (const [userId, userPosts] of userGroups.entries()) {
    const accessToken = userPosts[0].x_access_token;
    const client = new TwitterApi(accessToken);

    // thread_id ごとにグループ化（null はそれぞれ単体）
    const threadGroups = new Map<string | null, PostWithToken[]>();
    for (const post of userPosts) {
      const key = post.thread_id;
      const arr = threadGroups.get(key) ?? [];
      arr.push(post);
      threadGroups.set(key, arr);
    }

    for (const [threadId, threadPosts] of threadGroups.entries()) {
      const sorted = [...threadPosts].sort(
        (a, b) => a.thread_order - b.thread_order
      );

      if (threadId === null) {
        // 単発投稿
        for (const post of sorted) {
          await postSingle(client, post);
        }
      } else {
        // スレッド投稿（連ツイ）
        await postThread(client, sorted);
      }
    }
  }

  console.log(`\n✅ スケジューラー完了: ${new Date().toISOString()}\n`);
}

// ========================================
// 画像を Twitter へアップロードして media_ids を取得
// ========================================
async function uploadMediaToTwitter(
  client: TwitterApi,
  mediaUrls: string[]
): Promise<string[]> {
  const mediaIds: string[] = [];
  for (const url of mediaUrls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`  ⚠️ 画像 fetch 失敗 (${res.status}): ${url}`);
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const mimeType = res.headers.get("content-type") ?? "image/jpeg";
      const mediaId = await client.v1.uploadMedia(buffer, { mimeType });
      mediaIds.push(mediaId);
    } catch (err) {
      console.warn(`  ⚠️ Twitter 画像アップロード失敗: ${err}`);
    }
  }
  return mediaIds;
}

// ========================================
// 単発投稿
// ========================================
async function postSingle(client: TwitterApi, post: PostWithToken) {
  try {
    const mediaIds = await uploadMediaToTwitter(client, post.media_urls);
    const mediaParam =
      mediaIds.length > 0
        ? { media: { media_ids: mediaIds as [string, ...string[]] } }
        : undefined;

    const { data } = await client.v2.tweet(post.content, mediaParam);
    await supabase
      .from("posts")
      .update({ status: "posted", tweet_id: data.id })
      .eq("id", post.id);
    console.log(`  ✓ 投稿成功 [${post.id}]: ${post.content.slice(0, 40)}…`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("posts")
      .update({ status: "failed", error_message: message })
      .eq("id", post.id);
    console.error(`  ✗ 投稿失敗 [${post.id}]: ${message}`);
  }
}

// ========================================
// スレッド投稿（連ツイ）
// ========================================
async function postThread(client: TwitterApi, posts: PostWithToken[]) {
  let prevTweetId: string | null = null;

  for (const post of posts) {
    try {
      const mediaIds = await uploadMediaToTwitter(client, post.media_urls);
      const mediaParam =
        mediaIds.length > 0
          ? { media: { media_ids: mediaIds as [string, ...string[]] } }
          : undefined;

      const replyParam = prevTweetId
        ? { reply: { in_reply_to_tweet_id: prevTweetId } }
        : undefined;

      const payload = { ...replyParam, ...mediaParam };
      const { data } = await client.v2.tweet(
        post.content,
        Object.keys(payload).length > 0 ? payload : undefined
      );
      prevTweetId = data.id;

      await supabase
        .from("posts")
        .update({ status: "posted", tweet_id: data.id })
        .eq("id", post.id);

      console.log(
        `  ✓ スレッド [${post.thread_order}] 投稿成功: ${post.content.slice(0, 40)}…`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // 失敗したら以降のスレッドも失敗扱いにする
      for (const remaining of posts.filter(
        (p) => p.thread_order >= post.thread_order
      )) {
        await supabase
          .from("posts")
          .update({
            status: "failed",
            error_message:
              post.thread_order === remaining.thread_order
                ? message
                : "前のツイートの投稿が失敗したため中断",
          })
          .eq("id", remaining.id);
      }
      console.error(
        `  ✗ スレッド [${post.thread_order}] 投稿失敗: ${message}`
      );
      break;
    }
  }
}

// ========================================
// エントリーポイント
// ========================================
run().catch((err) => {
  console.error("❌ 予期しないエラー:", err);
  process.exit(1);
});
