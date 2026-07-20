// Single source of truth for Athenia Pro pricing. The pricing screen and (later)
// the Stripe checkout both read from here, so a price change happens in one place.
//
// NOTE: when Stripe is wired up, the real amounts live in Stripe as Prices; the
// `stripePriceId` fields below get filled with those price IDs. These numbers
// stay as the display values, and must be kept in sync with Stripe.

export type BillingCycle = "monthly" | "yearly";

export const PRICING: Record<
  BillingCycle,
  {
    label: string;
    amount: number; // charged per period, USD
    perMonth: number; // effective monthly cost, for display
    note: string; // small print under the price
    stripePriceId: string | undefined; // filled once Stripe products exist
  }
> = {
  monthly: {
    label: "Monthly",
    amount: 7.99,
    perMonth: 7.99,
    note: "Billed monthly",
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY
  },
  yearly: {
    label: "Yearly",
    amount: 56.99,
    perMonth: 4.75, // 56.99 / 12
    note: "Billed yearly · save 41%",
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY
  }
};

// How much cheaper yearly is than paying monthly for a year, as a whole percent.
export const YEARLY_SAVINGS_PERCENT = Math.round(
  (1 - PRICING.yearly.amount / (PRICING.monthly.amount * 12)) * 100
);

// Shown as bullet points on each plan card. Draft copy — William to finalize.
export const FREE_FEATURES = [
  "Text, image & YouTube quizzes",
  "5 quizzes per day",
  "Hints & Rechallenge",
  "Quiz history, folders & stats",
  "Daily streak"
];

export const PRO_FEATURES = [
  "Everything in Free",
  "Unlimited quizzes",
  "15 hours of audio & video per month",
  "Priority generation",
  "Cancel anytime"
];
