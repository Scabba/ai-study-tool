import { signedInUserId } from "@/lib/authUser";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });

// Send a subscriber to Stripe's customer portal (cancel, change card, invoices).
export async function POST(req: Request) {
  if (!stripe || !supabaseAdmin) return json({ error: "Not configured." }, 503);
  const userId = await signedInUserId();
  if (!userId) return json({ error: "Sign in first." }, 401);

  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.stripe_customer_id) {
    return json({ error: "No subscription found." }, 404);
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: origin
    });
    return json({ url: session.url });
  } catch (err) {
    console.error("[portal] failed:", (err as Error)?.message ?? err);
    return json({ error: "Couldn't open subscription settings." }, 502);
  }
}
