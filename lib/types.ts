export type PostStatus = "pending" | "posted" | "failed";

export interface Post {
  id: string;
  user_id: string;
  content: string;
  scheduled_at: string;
  status: PostStatus;
  thread_id: string | null;
  thread_order: number;
  tweet_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserToken {
  id: string;
  x_user_id: string;
  x_username: string;
  x_name: string | null;
  x_avatar_url: string | null;
  x_access_token: string;
  x_refresh_token: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// カレンダー表示用（スレッドは先頭ツイートのみ表示）
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  status: PostStatus;
  threadId: string | null;
  threadCount?: number;
  posts: Post[];
}
