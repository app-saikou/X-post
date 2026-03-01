"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamicImport from "next/dynamic";
import { createClient } from "@/lib/supabase";
import { CalendarEvent, Post, UserToken } from "@/lib/types";
import PostModal from "@/components/PostModal";

// FullCalendar は SSR 非対応のため dynamic import
const CalendarView = dynamicImport(() => import("@/components/CalendarView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>
  ),
});

interface TweetDraft {
  content: string;
  order: number;
}

function groupPostsToEvents(posts: Post[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const threadMap = new Map<string, Post[]>();

  for (const post of posts) {
    if (post.thread_id) {
      const arr = threadMap.get(post.thread_id) ?? [];
      arr.push(post);
      threadMap.set(post.thread_id, arr);
    } else {
      events.push({
        id: post.id,
        title: post.content.slice(0, 60) + (post.content.length > 60 ? "…" : ""),
        start: post.scheduled_at,
        status: post.status,
        threadId: null,
        posts: [post],
      });
    }
  }

  for (const [threadId, threadPosts] of Array.from(threadMap.entries())) {
    const sorted = [...threadPosts].sort((a, b) => a.thread_order - b.thread_order);
    const first = sorted[0];
    events.push({
      id: threadId,
      title: `🧵 ${first.content.slice(0, 50)}${first.content.length > 50 ? "…" : ""}`,
      start: first.scheduled_at,
      status: first.status,
      threadId: threadId,
      threadCount: sorted.length,
      posts: sorted,
    });
  }

  return events;
}

export default function HomePage() {
  const supabase = createClient();
  const router = useRouter();

  const [user, setUser] = useState<UserToken | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  // モーダル状態
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<Post[] | null>(null);
  const [clickedDate, setClickedDate] = useState<string | null>(null);

  // 認証チェック + データ取得
  useEffect(() => {
    const init = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.replace("/login");
        return;
      }

      // user_tokens 取得
      const { data: tokenData } = await supabase
        .from("user_tokens")
        .select("*")
        .eq("id", authUser.id)
        .single();
      setUser(tokenData ?? null);

      // 投稿一覧取得
      await fetchPosts();
      setLoading(false);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPosts = async () => {
    const res = await fetch("/api/posts");
    if (res.ok) {
      const data: Post[] = await res.json();
      setPosts(data);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  // カレンダーの日付クリック
  const handleDateClick = useCallback((date: string) => {
    setSelectedPosts(null);
    setClickedDate(date);
    setModalOpen(true);
  }, []);

  // カレンダーのイベントクリック（編集）
  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedPosts(event.posts);
    setClickedDate(null);
    setModalOpen(true);
  }, []);

  // ドラッグ&ドロップ
  const handleEventDrop = useCallback(
    async (eventId: string, newStart: string) => {
      // イベントIDはスレッドの場合 thread_id、単発の場合 post.id
      const event = calendarEvents.find((e) => e.id === eventId);
      if (!event) return;

      const firstPost = event.posts[0];
      await fetch(`/api/posts/${firstPost.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: newStart }),
      });
      await fetchPosts();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts]
  );

  // 保存（新規 or 更新）
  const handleSave = async (
    tweets: TweetDraft[],
    scheduledAt: string,
    threadId: string | null
  ) => {
    const isEditing = !!selectedPosts;

    if (isEditing && selectedPosts) {
      // 更新: 先頭ツイートを PUT で更新（日時変更はスレッド全体に反映）
      const firstPost = selectedPosts[0];
      await fetch(`/api/posts/${firstPost.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: tweets[0].content,
          scheduled_at: scheduledAt,
        }),
      });
      // スレッドの場合、残りのツイートも更新
      for (let i = 1; i < tweets.length; i++) {
        const post = selectedPosts[i];
        if (post) {
          await fetch(`/api/posts/${post.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: tweets[i].content }),
          });
        }
      }
    } else {
      // 新規作成
      await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posts: tweets.map((t) => ({
            content: t.content,
            scheduled_at: scheduledAt,
            thread_order: t.order,
          })),
          thread_id: threadId,
        }),
      });
    }

    await fetchPosts();
  };

  // 削除
  const handleDelete = async (threadDelete: boolean) => {
    if (!selectedPosts || selectedPosts.length === 0) return;
    const firstPost = selectedPosts[0];
    const url = `/api/posts/${firstPost.id}${threadDelete ? "?thread=true" : ""}`;
    await fetch(url, { method: "DELETE" });
    setModalOpen(false);
    await fetchPosts();
  };

  const calendarEvents = groupPostsToEvents(posts);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ヘッダー */}
      <header className="sticky top-0 z-40 bg-black/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span className="font-bold text-sm hidden sm:block">
              予約投稿カレンダー
            </span>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2">
                {user.x_avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.x_avatar_url}
                    alt={user.x_username}
                    className="w-7 h-7 rounded-full"
                  />
                )}
                <span className="text-zinc-400 text-sm hidden sm:block">
                  @{user.x_username}
                </span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="text-zinc-500 text-sm hover:text-white transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* 凡例 */}
        <div className="flex items-center gap-4 mb-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            予約中
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-500 inline-block" />
            投稿済み
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
            失敗
          </span>
          <span className="text-zinc-600 ml-auto">
            日付クリックで新規作成 / イベントクリックで編集
          </span>
        </div>

        {/* カレンダー */}
        <div className="bg-zinc-950 rounded-2xl border border-zinc-800 p-4 overflow-hidden">
          <CalendarView
            events={calendarEvents}
            onDateClick={handleDateClick}
            onEventClick={handleEventClick}
            onEventDrop={handleEventDrop}
          />
        </div>
      </main>

      {/* 投稿モーダル */}
      <PostModal
        open={modalOpen}
        initialPosts={selectedPosts}
        initialDate={clickedDate}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDelete={selectedPosts ? handleDelete : undefined}
      />
    </div>
  );
}
