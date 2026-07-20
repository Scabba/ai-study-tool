import { supabaseAdmin as admin } from "@/lib/supabaseAdmin";

// Server-only daily rate limiting, backed by the `rate_limits` table.
//
// Why the service-role key and not the anon key: the anon key is public (it's
// baked into the browser bundle), so anything the anon key can write, a bot can
// write — including resetting its own counter. The service-role key never leaves
// the server, and the table has RLS on with no policies, so the browser can't
// touch the counters at all.
//
// Why a table and not an in-memory Map: on Vercel each serverless instance has
// its own memory and cold-starts constantly, so an in-memory counter resets
// under the very load it's meant to stop.

export const rateLimitConfigured = !!admin;

// How much a signed-out visitor gets per day, per IP. Signed-in users aren't
// limited here yet — that's the free/premium tier work, not abuse control.
export const ANON_LIMITS = {
  generate: 3, // full quizzes (text only — other sources need an account)
  rechallenge: 10, // extension rounds, ~3 quizzes' worth
  hint: 30, // roughly one per question across those quizzes
  assistant: 10 // chat messages to the AI assistant
};

// The caller's IP as Vercel sees it. x-forwarded-for is a comma-separated chain
// and the client-most entry is the real caller.
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// Buckets roll over at UTC midnight — a fixed line everyone shares, rather than
// a per-visitor timezone we can't trust the client to report honestly.
function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

// `unavailable` means we denied because the limiter itself couldn't run, not
// because the caller actually hit their limit — worth telling apart so a
// misconfiguration doesn't masquerade as normal "you're out of quizzes" copy.
export type LimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  unavailable?: boolean;
};

// Count one use of `name` by `id` today and report whether it's within `limit`.
//
// Fails CLOSED: if the limiter can't run (missing env var, Supabase down) we
// deny rather than wave traffic through. A misconfiguration then shows up
// immediately as "signed-out users can't generate" instead of silently leaving
// the OpenAI key exposed to bots.
export async function bumpDaily(
  name: keyof typeof ANON_LIMITS,
  id: string,
  limit: number
): Promise<LimitResult> {
  if (!admin) {
    console.error("[rateLimit] SUPABASE_SERVICE_ROLE_KEY is not set — denying");
    return { allowed: false, count: 0, limit, unavailable: true };
  }
  try {
    // One atomic insert-or-increment in Postgres: a read-then-write here would
    // let parallel requests slip through the limit.
    const { data, error } = await admin.rpc("bump_rate_limit", {
      p_bucket: `${name}:${id}:${utcDay()}`,
      p_expires: new Date(Date.now() + 2 * 86_400_000).toISOString()
    });
    if (error || typeof data !== "number") {
      console.error("[rateLimit] bump failed:", error?.message ?? "bad response");
      return { allowed: false, count: 0, limit, unavailable: true };
    }
    return { allowed: data <= limit, count: data, limit };
  } catch (err) {
    console.error("[rateLimit] bump threw:", (err as Error)?.message ?? err);
    return { allowed: false, count: 0, limit, unavailable: true };
  }
}
