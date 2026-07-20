import { signedInUser } from "@/lib/authUser";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";
import type { BillingCycle } from "@/lib/pricing";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });

// Start a Stripe Checkout Session for Athenia Pro and hand the browser the URL
// to redirect to. You must be signed in — a subscription has to attach to an
// account so the webhook can flip that account to Pro.
export async function POST(req: Request) {
  if (!stripe) {
    return json({ error: "Payments aren't set up yet." }, 503);
  }

  const user = await signedInUser();
  if (!user) {
    // DRAFT COPY — William to reword.
    return json({ error: "Sign in to upgrade to Athenia Pro." }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const cycle: BillingCycle = body.cycle === "monthly" ? "monthly" : "yearly";
  const price = STRIPE_PRICES[cycle];
  if (!price) {
    return json({ error: "That plan isn't available right now." }, 503);
  }

  const origin =
    req.headers.get("origin") ?? new URL(req.url).origin;

  // "elements" renders our own Athenia-styled checkout in the pricing modal
  // (only the card fields are Stripe iframes); "hosted" is the redirect
  // fallback used when the publishable key isn't configured.
  const elements = body.ui === "elements";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      ...(elements
        ? {
            ui_mode: "elements" as const,
            return_url: `${origin}/?upgrade=success`
          }
        : {
            success_url: `${origin}/?upgrade=success`,
            cancel_url: `${origin}/?upgrade=cancelled`
          }),
      customer_email: user.email ?? undefined,
      // Both of these carry our user id back to us in the webhook, so we can
      // match the Stripe subscription to the right Athenia account.
      client_reference_id: user.id,
      metadata: { userId: user.id },
      subscription_data: { metadata: { userId: user.id } },
      allow_promotion_codes: true,
      // A 100%-off promo code brings the total due to $0, and asking someone for
      // a card to be charged nothing is a great way to lose them at the last
      // step. `if_required` skips card collection whenever the amount due is 0
      // and behaves exactly as before when it isn't. Subscription mode only,
      // which is what we're in.
      //
      // The trade-off: a $0 subscription starts with no payment method on file.
      // That's right for a forever-free code, but if a code is 100% off for a
      // limited number of months, the first real invoice has nothing to charge
      // and the subscription lapses to past_due — isProStatus() then correctly
      // drops them off Pro. Stripe emails them to add a card before that.
      payment_method_collection: "if_required"
    });

    if (elements) {
      if (!session.client_secret) return json({ error: "Couldn't start checkout." }, 502);
      return json({ clientSecret: session.client_secret });
    }
    if (!session.url) return json({ error: "Couldn't start checkout." }, 502);
    return json({ url: session.url });
  } catch (err) {
    console.error("[checkout] failed:", (err as Error)?.message ?? err);
    return json({ error: "Couldn't start checkout. Try again." }, 502);
  }
}
