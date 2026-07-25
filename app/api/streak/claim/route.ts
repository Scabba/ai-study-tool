import { claimMilestone, getGrant } from "@/lib/proGrants";
import { createClient } from "@/lib/supabase/server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });

// Read the caller's account, including when it was created — the age check in
// claimMilestone needs it, and it has to come from Supabase rather than the
// request body or it would be trivially forged.
async function callerAccount(): Promise<{ id: string; createdAt: string | null } | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, createdAt: data.user.created_at ?? null };
  } catch {
    return null;
  }
}

// How much streak-earned Pro this account has left. Drives the countdown in the
// streak info popover.
export async function GET() {
  const account = await callerAccount();
  if (!account) return json({ proUntil: null });
  const { proUntil } = await getGrant(account.id);
  return json({ proUntil });
}

// Claim the Pro days for a streak milestone the user just reached.
export async function POST(req: Request) {
  const account = await callerAccount();
  if (!account) return json({ error: "Sign in to earn Pro days." }, 401); // DRAFT COPY

  const body = await req.json().catch(() => ({}));
  const milestone = Math.floor(Number(body.milestone));

  const result = await claimMilestone(account.id, account.createdAt, milestone);
  if (!result.ok) {
    // These are all expected outcomes rather than faults — a client that
    // re-sends a milestone it already banked is the common case — so they
    // answer 200 with the current state instead of an error the UI must handle.
    const { proUntil } = await getGrant(account.id);
    return json({ claimed: false, reason: result.reason, proUntil });
  }

  return json({
    claimed: true,
    proUntil: result.proUntil,
    awardedDays: result.awardedDays
  });
}
