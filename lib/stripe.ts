import Stripe from "stripe";

// Server-only Stripe client. Null until the secret key is set, so routes can
// fail cleanly instead of crashing. Never import this from client code — the
// secret key must never reach the browser (no NEXT_PUBLIC_ prefix).
const key = process.env.STRIPE_SECRET_KEY;

export const stripe = key ? new Stripe(key) : null;

// Price IDs for the two billing cycles (safe to expose — price IDs aren't secret).
export const STRIPE_PRICES = {
  monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY,
  yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY
};
