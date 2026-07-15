import type { createClient } from "@/lib/supabase/client";
import { fromRaw, type Stats } from "@/lib/stats";

// Cloud storage for a signed-in user's stats (mirrors userSettings.ts). Stored
// as one JSON blob in the `user_stats` table, keyed by user id.

type Client = ReturnType<typeof createClient>;

// Read this user's saved stats (null if they have no row yet).
export async function fetchStats(
  client: Client,
  userId: string
): Promise<Stats | null> {
  const { data, error } = await client
    .from("user_stats")
    .select("stats")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return fromRaw(data.stats);
}

// Create or overwrite this user's stats row.
export async function saveStats(
  client: Client,
  userId: string,
  stats: Stats
): Promise<void> {
  await client.from("user_stats").upsert({
    user_id: userId,
    stats,
    updated_at: new Date().toISOString()
  });
}
