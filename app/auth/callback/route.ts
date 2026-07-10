import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google redirects the user back here after they approve sign-in. Supabase
// hands us a one-time `code`; we exchange it for a real session (stored in
// cookies) and then send the user back to wherever they started.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Supabase/Google can also come back with an error instead of a code.
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");

  if (providerError) {
    console.error("[auth/callback] provider error:", providerError);
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent(providerError)}`
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] exchange failed:", error.message);
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent(error.message)}`
    );
  }

  console.error("[auth/callback] no code and no error in callback URL");
  return NextResponse.redirect(`${origin}/?auth_error=no_code`);
}
