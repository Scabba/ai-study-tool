import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase client for use on the server (Route Handlers, Server Components,
// Server Actions). In Next.js 16 `cookies()` is async, so this must be awaited.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component where cookies can't be set.
            // Safe to ignore — the Proxy (proxy.ts) refreshes the session.
          }
        },
      },
    }
  );
}
