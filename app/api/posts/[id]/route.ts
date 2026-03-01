import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

// PUT /api/posts/[id] - 投稿更新
export async function PUT(request: NextRequest, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  // scheduled_at の変更はスレッド全体に反映する（thread_id が同じ全レコード）
  const { data: existing, error: fetchError } = await supabase
    .from("posts")
    .select("thread_id, scheduled_at, thread_order")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // スレッドかつ scheduled_at を変更する場合は全ツイートの日時を更新
  if (
    existing.thread_id &&
    body.scheduled_at &&
    body.scheduled_at !== existing.scheduled_at
  ) {
    await supabase
      .from("posts")
      .update({ scheduled_at: body.scheduled_at })
      .eq("thread_id", existing.thread_id)
      .eq("user_id", user.id);
  }

  const { data, error } = await supabase
    .from("posts")
    .update(body)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/posts/[id] - 投稿削除（スレッドは全ツイート削除）
export async function DELETE(request: NextRequest, { params }: Params) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const deleteThread = searchParams.get("thread") === "true";

  // 対象投稿を取得
  const { data: existing, error: fetchError } = await supabase
    .from("posts")
    .select("thread_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // スレッド全体を削除する場合
  if (deleteThread && existing.thread_id) {
    const { error } = await supabase
      .from("posts")
      .delete()
      .eq("thread_id", existing.thread_id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  // 単体削除
  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
