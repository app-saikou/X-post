import { TwitterApi } from "twitter-api-v2";

export function createTwitterClient(accessToken: string) {
  return new TwitterApi(accessToken);
}

export async function postTweet(accessToken: string, content: string) {
  const client = createTwitterClient(accessToken);
  const { data } = await client.v2.tweet(content);
  return data;
}

export async function postTweetInReply(
  accessToken: string,
  content: string,
  replyToTweetId: string
) {
  const client = createTwitterClient(accessToken);
  const { data } = await client.v2.tweet(content, {
    reply: { in_reply_to_tweet_id: replyToTweetId },
  });
  return data;
}
