import type { createClient } from "@/lib/supabase/client";

// The settings we sync to a signed-in user's account. Stored as one JSON blob
// in the `user_settings` table so adding a field later needs no DB migration.
export type Settings = {
  difficulty: number;
  gradeYear: string | null;
  instantFeedback: boolean;
  amount: number;
  tfAmount: number;
  writtenAmount: number;
};

type Client = ReturnType<typeof createClient>;

// Only accept known fields with the right types, so a malformed or outdated
// row can't push bad values into the UI. Returns null if there's nothing usable.
export function sanitize(raw: unknown): Settings | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const out: Settings = {
    difficulty: typeof s.difficulty === "number" ? s.difficulty : 1,
    gradeYear:
      s.gradeYear === null || typeof s.gradeYear === "string"
        ? (s.gradeYear as string | null)
        : null,
    instantFeedback: typeof s.instantFeedback === "boolean" ? s.instantFeedback : false,
    amount: typeof s.amount === "number" ? s.amount : 5,
    tfAmount: typeof s.tfAmount === "number" ? s.tfAmount : 0,
    writtenAmount: typeof s.writtenAmount === "number" ? s.writtenAmount : 0
  };
  return out;
}

// Read this user's saved settings (null if they have no row yet).
export async function fetchSettings(
  client: Client,
  userId: string
): Promise<Settings | null> {
  const { data, error } = await client
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return sanitize(data.settings);
}

// Create or overwrite this user's settings row.
export async function saveSettings(
  client: Client,
  userId: string,
  settings: Settings
): Promise<void> {
  await client.from("user_settings").upsert({
    user_id: userId,
    settings,
    updated_at: new Date().toISOString()
  });
}
