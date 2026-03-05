/**
 * Netlify Scheduled Function
 * 1分ごとに実行される投稿スケジューラー（OAuth 1.0a・自分のアカウント専用）
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { TwitterApi, SendTweetV2Params } from "twitter-api-v2";
import type { Config } from "@netlify/functions";

type MediaIds =
  | [string]
  | [string, string]
  | [string, string, string]
  | [string, string, string, string];

interface Post {
  id: string;
  user_id: string;
  content: string;
  scheduled_at: string;
  status: string;
  thread_id: string | null;
  thread_order: number;
  media_urls: string[];
}

async function run() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const X_API_KEY = process.env.X_API_KEY;
  const X_API_SECRET = process.env.X_API_SECRET;
  const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
  const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("環境変数が不足しています: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
    throw new Error("環境変数が不足しています: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // OAuth 1.0a クライアント（期限切れなし）
  const client = new TwitterApi({
    appKey: X_API_KEY,
    appSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_TOKEN_SECRET,
  });

  console.log(`\n🕐 スケジューラー開始: ${new Date().toISOString()}`);

  // 送信すべき投稿を取得
  const { data: posts, error: fetchError } = await supabase
    .from("posts")
    .select(`id, user_id, content, scheduled_at, status, thread_id, thread_order, media_urls`)
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true });

  if (fetchError) throw new Error(`Supabase フェッチエラー: ${fetchError.message}`);

  if (!posts || posts.length === 0) {
    console.log("✅ 送信すべき投稿はありません。");
    return;
  }

  console.log(`📝 送信対象: ${posts.length} 件`);

  // thread_id ごとにグループ化（null はそれぞれ単体）
  const threadGroups = new Map<string | null, Post[]>();
  for (const post of posts as Post[]) {
    const arr = threadGroups.get(post.thread_id) ?? [];
    arr.push(post);
    threadGroups.set(post.thread_id, arr);
  }

  for (const [threadId, threadPosts] of threadGroups.entries()) {
    const sorted = [...threadPosts].sort((a, b) => a.thread_order - b.thread_order);
    if (threadId === null) {
      for (const post of sorted) await postSingle(supabase, client, post);
    } else {
      await postThread(supabase, client, sorted);
    }
  }

  console.log(`\n✅ スケジューラー完了: ${new Date().toISOString()}\n`);
}

async function uploadMediaToTwitter(
  client: TwitterApi,
  mediaUrls: string[]
): Promise<MediaIds | []> {
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
  return mediaIds as MediaIds | [];
}

async function postSingle(supabase: SupabaseClient, client: TwitterApi, post: Post) {
  try {
    const mediaIds = await uploadMediaToTwitter(client, post.media_urls);
    const mediaParam: Partial<SendTweetV2Params> | undefined =
      mediaIds.length > 0 ? { media: { media_ids: mediaIds as MediaIds } } : undefined;

    const { data } = await client.v2.tweet(post.content, mediaParam);
    await supabase.from("posts").update({ status: "posted", tweet_id: data.id }).eq("id", post.id);
    console.log(`  ✓ 投稿成功 [${post.id}]: ${post.content.slice(0, 40)}…`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("posts").update({ status: "failed", error_message: message }).eq("id", post.id);
    console.error(`  ✗ 投稿失敗 [${post.id}]: ${message}`);
  }
}

async function postThread(supabase: SupabaseClient, client: TwitterApi, posts: Post[]) {
  let prevTweetId: string | null = null;

  for (const post of posts) {
    try {
      const mediaIds = await uploadMediaToTwitter(client, post.media_urls);
      const mediaParam: Partial<SendTweetV2Params> | undefined =
        mediaIds.length > 0 ? { media: { media_ids: mediaIds as MediaIds } } : undefined;
      const replyParam: Partial<SendTweetV2Params> | undefined = prevTweetId
        ? { reply: { in_reply_to_tweet_id: prevTweetId } }
        : undefined;

      const payload: Partial<SendTweetV2Params> = { ...replyParam, ...mediaParam };
      const { data } = await client.v2.tweet(
        post.content,
        Object.keys(payload).length > 0 ? payload : undefined
      );
      prevTweetId = data.id;

      await supabase.from("posts").update({ status: "posted", tweet_id: data.id }).eq("id", post.id);
      console.log(`  ✓ スレッド [${post.thread_order}] 投稿成功: ${post.content.slice(0, 40)}…`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      for (const remaining of posts.filter((p) => p.thread_order >= post.thread_order)) {
        await supabase.from("posts").update({
          status: "failed",
          error_message: post.thread_order === remaining.thread_order ? message : "前のツイートの投稿が失敗したため中断",
        }).eq("id", remaining.id);
      }
      console.error(`  ✗ スレッド [${post.thread_order}] 投稿失敗: ${message}`);
      break;
    }
  }
}

export default async function() {
  await run();
  return new Response("OK");
}

export const config: Config = {
  schedule: "* * * * *",
};
