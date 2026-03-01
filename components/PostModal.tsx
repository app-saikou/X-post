"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ThreadEditor from "./ThreadEditor";
import { Post } from "@/lib/types";

interface TweetDraft {
  content: string;
  order: number;
  images?: string[]; // base64
}

interface PostModalProps {
  open: boolean;
  initialPosts: Post[] | null;
  initialDate: string | null;
  onClose: () => void;
  onSave: (
    tweets: TweetDraft[],
    scheduledAt: string,
    threadId: string | null
  ) => Promise<void>;
  onDelete?: (threadDelete: boolean) => Promise<void>;
}

function toLocalDatetimeValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetimeValue(value: string): string {
  return new Date(value).toISOString();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PostModal({
  open,
  initialPosts,
  initialDate,
  onClose,
  onSave,
  onDelete,
}: PostModalProps) {
  const [tweets, setTweets] = useState<TweetDraft[]>([
    { content: "", order: 0 },
  ]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // thread_order → File[] のマップ
  const [draftImages, setDraftImages] = useState<Map<number, File[]>>(new Map());
  const backdropRef = useRef<HTMLDivElement>(null);

  // 初期値セット
  useEffect(() => {
    if (!open) return;
    setShowDeleteConfirm(false);
    setDraftImages(new Map());

    if (initialPosts && initialPosts.length > 0) {
      const sorted = [...initialPosts].sort(
        (a, b) => a.thread_order - b.thread_order
      );
      setTweets(sorted.map((p) => ({ content: p.content, order: p.thread_order })));
      setScheduledAt(toLocalDatetimeValue(sorted[0].scheduled_at));
    } else {
      setTweets([{ content: "", order: 0 }]);
      if (initialDate) {
        setScheduledAt(toLocalDatetimeValue(initialDate));
      } else {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(10, 0, 0, 0);
        setScheduledAt(toLocalDatetimeValue(d.toISOString()));
      }
    }
  }, [open, initialPosts, initialDate]);

  const handleImagesChange = useCallback((order: number, files: File[]) => {
    setDraftImages((prev) => {
      const next = new Map(prev);
      if (files.length === 0) {
        next.delete(order);
      } else {
        next.set(order, files);
      }
      return next;
    });
  }, []);

  const isEditing = !!initialPosts;
  const hasThread = tweets.length > 1;
  const hasOverLimit = tweets.some((t) => t.content.length > 280);
  const hasEmpty = tweets.some((t) => t.content.trim() === "");
  const canSave = !hasOverLimit && !hasEmpty && scheduledAt;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      // File → base64 変換
      const tweetsWithImages: TweetDraft[] = await Promise.all(
        tweets.map(async (t) => {
          const files = draftImages.get(t.order) ?? [];
          const images = await Promise.all(files.map(fileToBase64));
          return { ...t, images };
        })
      );

      const threadId =
        isEditing && initialPosts
          ? initialPosts[0].thread_id
          : hasThread
          ? crypto.randomUUID()
          : null;
      await onSave(tweetsWithImages, fromLocalDatetimeValue(scheduledAt), threadId);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="bg-zinc-900 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl border border-zinc-800">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-white font-bold text-lg">
            {isEditing ? "投稿を編集" : "新規予約投稿"}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ボディ */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* スレッドエディター */}
          <ThreadEditor
            tweets={tweets}
            onChange={setTweets}
            draftImages={draftImages}
            onImagesChange={handleImagesChange}
          />

          {/* 日時ピッカー */}
          <div>
            <label className="text-zinc-400 text-sm block mb-1">
              予約日時
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full bg-zinc-800 text-white rounded-xl px-4 py-2.5 text-sm outline-none border border-zinc-700 focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* フッター */}
        <div className="px-5 py-4 border-t border-zinc-800 flex items-center justify-between gap-3">
          {/* 削除ボタン（編集時のみ） */}
          {isEditing && onDelete && (
            <div>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 text-xs">
                    {hasThread ? "スレッド全体を削除?" : "削除する?"}
                  </span>
                  <button
                    onClick={() => onDelete(hasThread)}
                    className="text-red-400 text-xs font-bold hover:text-red-300"
                  >
                    削除
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="text-zinc-500 text-xs"
                  >
                    キャンセル
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-zinc-600 text-sm hover:text-red-400 transition-colors"
                >
                  削除
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-zinc-400 text-sm hover:text-white transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="px-5 py-2 bg-blue-500 text-white text-sm font-bold rounded-full hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "保存中..." : isEditing ? "更新" : "予約する"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
