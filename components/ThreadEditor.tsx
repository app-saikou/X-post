"use client";

import { useCallback } from "react";

interface TweetDraft {
  content: string;
  order: number;
}

interface ThreadEditorProps {
  tweets: TweetDraft[];
  onChange: (tweets: TweetDraft[]) => void;
}

const MAX_LENGTH = 280;

export default function ThreadEditor({ tweets, onChange }: ThreadEditorProps) {
  const updateContent = useCallback(
    (index: number, content: string) => {
      const updated = tweets.map((t, i) =>
        i === index ? { ...t, content } : t
      );
      onChange(updated);
    },
    [tweets, onChange]
  );

  const addTweet = useCallback(() => {
    onChange([...tweets, { content: "", order: tweets.length }]);
  }, [tweets, onChange]);

  const removeTweet = useCallback(
    (index: number) => {
      if (tweets.length <= 1) return;
      onChange(
        tweets
          .filter((_, i) => i !== index)
          .map((t, i) => ({ ...t, order: i }))
      );
    },
    [tweets, onChange]
  );

  const moveTweet = useCallback(
    (index: number, direction: "up" | "down") => {
      const newTweets = [...tweets];
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= newTweets.length) return;
      [newTweets[index], newTweets[swapIndex]] = [
        newTweets[swapIndex],
        newTweets[index],
      ];
      onChange(newTweets.map((t, i) => ({ ...t, order: i })));
    },
    [tweets, onChange]
  );

  return (
    <div className="space-y-3">
      {tweets.map((tweet, index) => {
        const remaining = MAX_LENGTH - tweet.content.length;
        const isOverLimit = remaining < 0;

        return (
          <div key={index} className="relative">
            {/* スレッド連結線 */}
            {index > 0 && (
              <div className="absolute -top-3 left-4 w-0.5 h-3 bg-zinc-600" />
            )}

            <div className="bg-zinc-800 rounded-xl p-3 border border-zinc-700">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-zinc-500 text-xs font-mono mt-1 w-6 shrink-0">
                  {index + 1}
                </span>
                <textarea
                  value={tweet.content}
                  onChange={(e) => updateContent(index, e.target.value)}
                  placeholder={
                    index === 0
                      ? "最初のツイートを入力..."
                      : `${index + 1}ツイート目を入力...`
                  }
                  rows={3}
                  className="flex-1 bg-transparent text-white text-sm resize-none outline-none placeholder-zinc-600"
                />
              </div>

              <div className="flex items-center justify-between">
                {/* 文字数カウンター */}
                <span
                  className={`text-xs font-mono ${
                    isOverLimit
                      ? "text-red-400"
                      : remaining <= 20
                      ? "text-yellow-400"
                      : "text-zinc-500"
                  }`}
                >
                  {remaining}
                </span>

                {/* 操作ボタン */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveTweet(index, "up")}
                    disabled={index === 0}
                    className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
                    title="上へ移動"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTweet(index, "down")}
                    disabled={index === tweets.length - 1}
                    className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
                    title="下へ移動"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {tweets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTweet(index)}
                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                      title="削除"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* ツイートを追加ボタン */}
      <button
        type="button"
        onClick={addTweet}
        className="w-full py-2 border border-dashed border-zinc-700 rounded-xl text-zinc-500 text-sm hover:border-blue-500 hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        ツイートを追加（スレッド化）
      </button>
    </div>
  );
}
