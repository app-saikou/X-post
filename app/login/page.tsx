"use client";

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace("/");
      else setChecking(false);
    });
  }, [router, supabase.auth]);

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "x",
      options: {
        scopes: "tweet.read,tweet.write,users.read,offline.access",
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });
    if (error) {
      console.error("OAuth error:", error.message);
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="bg-zinc-900 rounded-2xl p-10 flex flex-col items-center gap-8 shadow-2xl max-w-sm w-full mx-4">
        {/* X ロゴ */}
        <svg viewBox="0 0 24 24" className="w-12 h-12 fill-white" aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>

        <div className="text-center">
          <h1 className="text-white text-2xl font-bold mb-2">
            X 予約投稿カレンダー
          </h1>
          <p className="text-zinc-400 text-sm">
            カレンダー感覚で予約投稿を管理
          </p>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-white text-black font-bold py-3 px-6 rounded-full flex items-center justify-center gap-3 hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 fill-black"
              aria-hidden
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          )}
          {loading ? "認証中..." : "X でログイン"}
        </button>

        <p className="text-zinc-600 text-xs text-center">
          ログインすることで、投稿の読み取りと書き込み権限を許可します
        </p>
      </div>
    </div>
  );
}
