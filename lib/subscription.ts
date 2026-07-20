import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hasActiveGrant } from "@/lib/proGrants";

// A user's subscription, mirrored from Stripe into the `subscriptions` table by
// the webhook. The app reads this to decide who's Pro; Stripe stays the source
// of truth and the webhook keeps this in sync.

export type SubscriptionRow = {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: string;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

// A subscription counts as "Pro" while it's active or in a trial. past_due,
// canceled, unpaid, etc. do not.
export function isProStatus(status?: string | null): boolean {
  return status === "active" || status === "trialing";
}

export async function upsertSubscription(row: {
  userId: string;
  customerId: string;
  subscriptionId: string;
  status: string;
  priceId: string | null;
  currentPeriodEnd: number | null; // unix seconds, as Stripe sends it
  cancelAtPeriodEnd: boolean;
}): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: row.userId,
      stripe_customer_id: row.customerId,
      stripe_subscription_id: row.subscriptionId,
      status: row.status,
      price_id: row.priceId,
      current_period_end: row.currentPeriodEnd
        ? new Date(row.currentPeriodEnd * 1000).toISOString()
        : null,
      cancel_at_period_end: row.cancelAtPeriodEnd,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
}

// Is this user currently Pro? Server-side check via the service-role client.
//
// Two ways to be Pro: a live Stripe subscription, or unexpired Pro time earned
// from streak milestones. Stripe is checked first because it's the common case
// and the paid one.
export async function isUserPro(userId: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (isProStatus(data?.status)) return true;
  return hasActiveGrant(userId);
}
