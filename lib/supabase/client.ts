import { createBrowserClient } from "@supabase/ssr";

// Supabase client for use in the browser (Client Components).
// Reads the public URL + anon key from the environment. These are safe to
// expose to the browser — row-level security is what protects your data.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
