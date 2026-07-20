import { supabaseAdmin as admin } from "@/lib/supabaseAdmin";
import { PRO_AUDIO_HOURS_PER_WEEK } from "@/lib/pricing";

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

// --- Pro audio/video meter ---------------------------------------------------
//
// Pro includes 4 hours of transcription a week, resetting each Friday. Metered
// in SECONDS in the same `rate_limits` table (count holds seconds, not uses),
// under a bucket keyed by the Friday that started the current week.
//
// Two things worth knowing about this meter:
//
//   * The week boundary is midnight EASTERN, matching the streak's day boundary
//     (lib/stats.ts). UTC would roll over at 8pm ET Thursday, so a user told
//     "resets Friday" would see it reset on Thursday evening.
//   * A file's length is only known once AssemblyAI has transcribed it, so the
//     check is "block if already over" and the charge lands afterwards. Someone
//     at 3h50m can start a 2-hour file and land at 5h50m. They can't start
//     another one that week. Eating one overage beats rejecting a paid upload
//     for being too long.
export const PRO_AUDIO_SECONDS_PER_WEEK = PRO_AUDIO_HOURS_PER_WEEK * 60 * 60;

// The Friday (YYYY-MM-DD) that began the current week, in Eastern time.
function etWeekStart(now: number = Date.now()): string {
  const etDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(now)); // YYYY-MM-DD in ET
  // Anchor at noon UTC so a DST shift can't nudge this onto the wrong weekday.
  const d = new Date(`${etDate}T12:00:00Z`);
  const daysSinceFriday = (d.getUTCDay() - 5 + 7) % 7; // getUTCDay: Fri = 5
  d.setUTCDate(d.getUTCDate() - daysSinceFriday);
  return d.toISOString().slice(0, 10);
}

function audioBucket(userId: string): string {
  return `audio:u:${userId}:w${etWeekStart()}`;
}

// Seconds of audio this user has burned this month, or null if the meter can't
// be read. Null is deliberately distinct from 0 so the caller can decide — for a
// paying customer we let the upload through rather than block on our own outage.
export async function audioSecondsUsed(userId: string): Promise<number | null> {
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from("rate_limits")
      .select("count")
      .eq("bucket", audioBucket(userId))
      .maybeSingle();
    if (error) {
      console.error("[audioMeter] read failed:", error.message);
      return null;
    }
    return typeof data?.count === "number" ? data.count : 0;
  } catch (err) {
    console.error("[audioMeter] read threw:", (err as Error)?.message ?? err);
    return null;
  }
}

// Charge `seconds` to this month's meter. Read-then-write rather than an atomic
// bump: `bump_rate_limit` only ever adds 1, and adding an arbitrary amount would
// need a new RPC. The race needs one user transcribing two files at the same
// instant, and the cost of losing that race is undercounting one file — not
// worth a schema migration.
export async function addAudioSeconds(userId: string, seconds: number): Promise<void> {
  if (!admin || !Number.isFinite(seconds) || seconds <= 0) return;
  try {
    const current = (await audioSecondsUsed(userId)) ?? 0;
    const { error } = await admin.from("rate_limits").upsert(
      {
        bucket: audioBucket(userId),
        count: current + Math.round(seconds),
        // Keep a finished week around a while for support questions, then let
        // whatever prunes this table reclaim it.
        expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString()
      },
      { onConflict: "bucket" }
    );
    if (error) console.error("[audioMeter] write failed:", error.message);
  } catch (err) {
    console.error("[audioMeter] write threw:", (err as Error)?.message ?? err);
  }
}
