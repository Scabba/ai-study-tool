import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service-role key. Bypasses RLS and can
// read the private `audio` bucket. Never import this from client code — the
// key must not reach the browser (it has no NEXT_PUBLIC_ prefix, so Next.js
// won't inline it into the bundle even by accident).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin =
  url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : null;
