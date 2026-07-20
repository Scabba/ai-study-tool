import { stripe } from "@/lib/stripe";
import { upsertSubscription } from "@/lib/subscription";
import type Stripe from "stripe";

// Stripe calls this when a subscription starts, renews, changes, or ends. It's
// the source of truth for who's Pro — we verify the signature, then mirror the
// subscription into Supabase. Never trust an unsigned request here: anyone can
// POST to this URL, so the signature check is what makes it safe.
export const runtime = "nodejs"; // Stripe's SDK needs Node, not the edge runtime

// Pull our Athenia user id back out of a Stripe subscription (we stashed it in
// metadata when creating the checkout session).
function mapSub(sub: Stripe.Subscription) {
  return {
    userId: sub.metadata?.userId,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    subscriptionId: sub.id,
    status: sub.status,
    priceId: sub.items.data[0]?.price?.id ?? null,
    currentPeriodEnd: sub.items.data[0]?.current_period_end ?? null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false
  };
}

export async function POST(req: Request) {
  if (!stripe) return new Response("Stripe not configured", { status: 503 });
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whsec) return new Response("Webhook secret not set", { status: 503 });

  // Raw body is required for signature verification — don't JSON.parse it first.
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, whsec);
  } catch (err) {
    console.error("[webhook] signature verification failed:", (err as Error)?.message);
    return new Response("Bad signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const mapped = mapSub(event.data.object);
        if (mapped.userId) await upsertSubscription(mapped);
        break;
      }
      case "checkout.session.completed": {
        // Backstop in case a subscription event is missed: pull the subscription
        // the checkout created and record it.
        const session = event.data.object;
        const userId = session.metadata?.userId ?? session.client_reference_id ?? null;
        if (userId && session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertSubscription({ ...mapSub(sub), userId }); // trust the session's user id
        }
        break;
      }
    }
  } catch (err) {
    console.error("[webhook] handler error:", (err as Error)?.message ?? err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
