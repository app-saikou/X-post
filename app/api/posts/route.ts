import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { createAdminClient } from "@/lib/supabaseAdmin";
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
  const { posts, thread_id } = body as {
    posts: {
      content: string;
      scheduled_at: string;
      thread_order: number;
      images?: string[]; // base64 data URLs
    }[];
    thread_id: string | null;
  };

  if (!posts || posts.length === 0) {
    return NextResponse.json({ error: "posts is required" }, { status: 400 });
  }

  const supabaseAdmin = createAdminClient();

  // 画像を Supabase Storage にアップロードして URL を取得
  const uploadImages = async (
    base64List: string[],
    userId: string,
    postKey: string
  ): Promise<string[]> => {
    const urls: string[] = [];
    for (const base64 of base64List) {
      const match = base64.match(/^data:image\/(\w+);base64,/);
      if (!match) continue;
      const ext = match[1];
      const data = base64.slice(match[0].length);
      const buffer = Buffer.from(data, "base64");
      const path = `${userId}/${postKey}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("post-images")
        .upload(path, buffer, { contentType: `image/${ext}` });

      if (uploadError) {
        console.error("画像アップロードエラー:", uploadError.message);
        continue;
      }

      const { data: urlData } = supabaseAdmin.storage
        .from("post-images")
        .getPublicUrl(path);
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

  // 各投稿の画像をアップロードして records を作成
  const records = await Promise.all(
    posts.map(async (p, i) => {
      const postKey = `${thread_id ?? "single"}-${i}-${Date.now()}`;
      const media_urls = await uploadImages(
        p.images ?? [],
        user.id,
        postKey
      );
      return {
        user_id: user.id,
        content: p.content,
        scheduled_at: p.scheduled_at,
        thread_order: p.thread_order,
        thread_id: thread_id,
        status: "pending" as const,
        media_urls,
      };
    })
  );

  const { data, error } = await supabase
    .from("posts")
    .insert(records)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
