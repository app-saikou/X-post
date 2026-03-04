/**
 * Netlify Scheduled Function
 * 1分ごとに実行される投稿スケジューラー
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { TwitterApi, SendTweetV2Params } from "twitter-api-v2";
import type { Config } from "@netlify/functions";

type MediaIds =
  | [string]
  | [string, string]
  | [string, string, string]
  | [string, string, string, string];

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
  x_refresh_token: string | null;
  token_expires_at: string | null;
}

// ========================================
// トークンリフレッシュ
// ========================================
async function refreshAccessToken(
  supabase: SupabaseClient,
  userId: string,
  currentRefreshToken: string
): Promise<string | null> {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const authClient = new TwitterApi({ clientId, clientSecret });
    const { accessToken, refreshToken: newRefreshToken, expiresIn } =
      await authClient.refreshOAuth2Token(currentRefreshToken);

    const expiresAt = new Date(Date.now() + (expiresIn ?? 7200) * 1000).toISOString();
    await supabase.from("user_tokens").update({
      x_access_token: accessToken,
      x_refresh_token: newRefreshToken ?? currentRefreshToken,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }).eq("id", userId);

    console.log(`  🔄 トークンリフレッシュ成功 (${userId})`);
    return accessToken;
  } catch (err) {
    console.warn(`  ⚠️ トークンリフレッシュ失敗 (${userId}):`, err);
    return null;
  }
}

async function run() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("環境変数が不足しています: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\n🕐 スケジューラー開始: ${new Date().toISOString()}`);

  // 1. 送信すべき投稿を取得
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
      media_urls
    `)
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true });

  if (fetchError) throw new Error(`Supabase フェッチエラー: ${fetchError.message}`);

  if (!rawPosts || rawPosts.length === 0) {
    console.log("✅ 送信すべき投稿はありません。");
    return;
  }

  // 2. 対象ユーザーのトークンを別途取得
  const userIds = [...new Set(rawPosts.map((p) => p.user_id))];
  const { data: tokens, error: tokenError } = await supabase
    .from("user_tokens")
    .select("id, x_access_token, x_refresh_token, token_expires_at")
    .in("id", userIds);

  if (tokenError) throw new Error(`トークン取得エラー: ${tokenError.message}`);

  const tokenMap = new Map(
    tokens?.map((t) => [t.id, {
      accessToken: t.x_access_token,
      refreshToken: t.x_refresh_token as string | null,
      expiresAt: t.token_expires_at as string | null,
    }]) ?? []
  );

  console.log(`📝 送信対象: ${rawPosts.length} 件`);

  const posts: PostWithToken[] = rawPosts
    .filter((p) => tokenMap.has(p.user_id))
    .map((p: any) => {
      const token = tokenMap.get(p.user_id)!;
      return {
        id: p.id,
        user_id: p.user_id,
        content: p.content,
        scheduled_at: p.scheduled_at,
        status: p.status,
        thread_id: p.thread_id,
        thread_order: p.thread_order,
        media_urls: p.media_urls ?? [],
        x_access_token: token.accessToken,
        x_refresh_token: token.refreshToken,
        token_expires_at: token.expiresAt,
      };
    });

  // 3. user_id ごとにグループ化
  const userGroups = new Map<string, PostWithToken[]>();
  for (const post of posts) {
    const arr = userGroups.get(post.user_id) ?? [];
    arr.push(post);
    userGroups.set(post.user_id, arr);
  }

  // 4. ユーザーごとに処理
  for (const [userId, userPosts] of userGroups.entries()) {
    let accessToken = userPosts[0].x_access_token;
    const { x_refresh_token, token_expires_at } = userPosts[0];

    // トークンが期限切れ or 5分以内に期限切れ or 有効期限不明 → リフレッシュ
    const expiresAt = token_expires_at ? new Date(token_expires_at) : null;
    const needsRefresh = !expiresAt || expiresAt <= new Date(Date.now() + 5 * 60 * 1000);

    if (needsRefresh && x_refresh_token) {
      const refreshed = await refreshAccessToken(supabase, userId, x_refresh_token);
      if (refreshed) accessToken = refreshed;
    }

    const client = new TwitterApi(accessToken);

    const threadGroups = new Map<string | null, PostWithToken[]>();
    for (const post of userPosts) {
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

async function postSingle(supabase: SupabaseClient, client: TwitterApi, post: PostWithToken) {
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

async function postThread(supabase: SupabaseClient, client: TwitterApi, posts: PostWithToken[]) {
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
