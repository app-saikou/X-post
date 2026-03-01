import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";

// GET /api/posts - 投稿一覧取得
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("user_id", user.id)
    .order("scheduled_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/posts - 投稿作成（単発 or スレッド）
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  // body.posts: Array<{ content: string; scheduled_at: string; thread_order: number }>
  // body.thread_id: string | null (スレッドの場合は共通UUID)
  const { posts, thread_id } = body as {
    posts: { content: string; scheduled_at: string; thread_order: number }[];
    thread_id: string | null;
  };

  if (!posts || posts.length === 0) {
    return NextResponse.json({ error: "posts is required" }, { status: 400 });
  }

  const records = posts.map((p) => ({
    user_id: user.id,
    content: p.content,
    scheduled_at: p.scheduled_at,
    thread_order: p.thread_order,
    thread_id: thread_id,
    status: "pending" as const,
  }));

  const { data, error } = await supabase
    .from("posts")
    .insert(records)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
