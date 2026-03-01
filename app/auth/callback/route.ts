import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // X OAuthのアクセストークンを user_tokens に保存する
      // provider_token は Supabase が X から取得したアクセストークン
      const providerToken = data.session.provider_token;
      const providerRefreshToken = data.session.provider_refresh_token;
      const user = data.session.user;

      if (providerToken && user) {
        const xUserMeta = user.user_metadata;
        await supabase.from("user_tokens").upsert(
          {
            id: user.id,
            x_user_id: xUserMeta?.provider_id ?? xUserMeta?.sub ?? "",
            x_username: xUserMeta?.user_name ?? xUserMeta?.preferred_username ?? "",
            x_name: xUserMeta?.full_name ?? xUserMeta?.name ?? null,
            x_avatar_url: xUserMeta?.avatar_url ?? xUserMeta?.picture ?? null,
            x_access_token: providerToken,
            x_refresh_token: providerRefreshToken ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      }

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=callback_error`);
}
