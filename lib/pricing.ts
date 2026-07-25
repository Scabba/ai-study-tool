// Single source of truth for Athenia Pro pricing. The pricing screen and (later)
// the Stripe checkout both read from here, so a price change happens in one place.
//
// NOTE: when Stripe is wired up, the real amounts live in Stripe as Prices; the
// `stripePriceId` fields below get filled with those price IDs. These numbers
// stay as the display values, and must be kept in sync with Stripe.

export type BillingCycle = "monthly" | "yearly";

// Plan limits. These are the ONE source of truth: the pricing card renders them
// and the API routes enforce them, so the card can't promise something the
// server doesn't do. (It already drifted once — the assistant was still telling
// users "free beta, no limits" after the Free tier shipped.)
//
// Safe to import from both server and client: this file pulls in nothing.
export const FREE_DAILY_QUIZZES = 5;
export const FREE_DAILY_ASSISTANT = 5; // messages to Athenia Assistant per day
export const PRO_AUDIO_HOURS_PER_WEEK = 4; // resets Friday, midnight Eastern

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
  `${FREE_DAILY_QUIZZES} quizzes per day`,
  `${FREE_DAILY_ASSISTANT} assistant messages per day`,
  "Hints & Rechallenge",
  "Quiz history, folders & stats",
  "Daily streak"
];

export const PRO_FEATURES = [
  "Everything in Free",
  "Unlimited quizzes",
  "Unlimited assistant messages",
  `${PRO_AUDIO_HOURS_PER_WEEK} hours of audio & video per week`,
  "Priority generation",
  "Cancel anytime"
];
