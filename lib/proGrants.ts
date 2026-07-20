import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Pro time earned from streak milestones, as opposed to Pro bought through
// Stripe. Stored in `pro_grants`, which the browser cannot touch — see
// supabase/pro_grants.sql for why.

export type ProGrant = {
  proUntil: string | null; // ISO timestamp, or null if this user has never earned any
  highestMilestone: number;
};

// Pro days paid for REACHING this streak day. Must stay in step with
// milestoneReward() in lib/stats.ts, which drives what the UI promises.
export function milestoneReward(day: number): number {
  if (day === 7 || day === 14) return 3;
  if (day === 30) return 4;
  if (day === 60) return 5;
  return day > 60 && (day - 60) % 30 === 0 ? 5 : 0; // then every 30 days
}

export async function getGrant(userId: string): Promise<ProGrant> {
  if (!supabaseAdmin) return { proUntil: null, highestMilestone: 0 };
  const { data } = await supabaseAdmin
    .from("pro_grants")
    .select("pro_until, highest_milestone")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    proUntil: data?.pro_until ?? null,
    highestMilestone: data?.highest_milestone ?? 0
  };
}

// Is streak-earned Pro currently live for this user?
export async function hasActiveGrant(userId: string): Promise<boolean> {
  const { proUntil } = await getGrant(userId);
  return !!proUntil && new Date(proUntil).getTime() > Date.now();
}

export type ClaimResult =
  | { ok: true; proUntil: string; awardedDays: number }
  | { ok: false; reason: "unavailable" | "not-a-milestone" | "already-paid" | "too-soon" };

// Claim the Pro days for reaching `milestone`.
//
// The streak itself is computed in the browser, so this endpoint cannot fully
// verify that the user really studied for 60 days — that would need every quiz
// submission recorded server-side. What it CAN do is make cheating no faster
// than honesty:
//
//   * each milestone pays once, ever (highest_milestone only moves up), and
//   * a milestone of N days is refused unless the account is itself N days old.
//
// So the most someone can steal by forging their streak is the difference
// between studying daily and merely owning an old account — bounded, and small
// enough to be worth less than the effort. Raise this to real verification if
// streak-Pro ever becomes a meaningful share of Pro usage.
export async function claimMilestone(
  userId: string,
  accountCreatedAt: string | null,
  milestone: number
): Promise<ClaimResult> {
  if (!supabaseAdmin) return { ok: false, reason: "unavailable" };

  const days = milestoneReward(milestone);
  if (!Number.isInteger(milestone) || milestone <= 0 || days === 0) {
    return { ok: false, reason: "not-a-milestone" };
  }

  const { proUntil, highestMilestone } = await getGrant(userId);
  if (milestone <= highestMilestone) return { ok: false, reason: "already-paid" };

  // You cannot have a 60-day streak on a 3-day-old account.
  if (accountCreatedAt) {
    const ageDays = (Date.now() - new Date(accountCreatedAt).getTime()) / 86_400_000;
    if (ageDays + 1 < milestone) return { ok: false, reason: "too-soon" };
  }

  // Extend from whichever is later: now, or time already banked. Claiming a
  // second milestone while Pro is still running adds to the end rather than
  // throwing away the remainder.
  const from = Math.max(
    Date.now(),
    proUntil ? new Date(proUntil).getTime() : 0
  );
  const next = new Date(from + days * 86_400_000).toISOString();

  const { error } = await supabaseAdmin.from("pro_grants").upsert(
    {
      user_id: userId,
      pro_until: next,
      highest_milestone: milestone,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
  if (error) {
    console.error("[proGrants] claim write failed:", error.message);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, proUntil: next, awardedDays: days };
}
