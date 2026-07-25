"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import type { Appearance, StripePaymentElement } from "@stripe/stripe-js";
import {
  PRICING,
  YEARLY_SAVINGS_PERCENT,
  FREE_FEATURES,
  PRO_FEATURES,
  type BillingCycle
} from "@/lib/pricing";

// Loaded once per page — Stripe's script is heavy and loadStripe caches it.
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

// Athenia's look, applied to the Stripe-hosted card fields so they blend into
// the modal: dark background, #888 hairlines, 3px corners, slate focus.
const APPEARANCE: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: "#7dd3fc",
    colorBackground: "#000000",
    colorText: "#ededed",
    colorTextSecondary: "#a3a3a3",
    colorDanger: "#e0776b",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    borderRadius: "3px",
    focusBoxShadow: "none"
  },
  rules: {
    ".Input": { border: "1px solid #888", backgroundColor: "#000000" },
    ".Input:focus": { border: "1px solid #cbd5e1", outline: "none" },
    ".Label": { color: "#a3a3a3" },
    ".Tab": { border: "1px solid #888", backgroundColor: "transparent" },
    ".Tab--selected": { borderColor: "#cbd5e1" },
    ".Block": { backgroundColor: "transparent", border: "1px solid #333" }
  }
};

// The subset of Stripe's checkout actions we drive from our own buttons.
type CheckoutSessionLite = { total?: { total?: { amount?: string } } };
type CheckoutActions = {
  confirm: (args?: object) => Promise<{ type: string; error?: { message?: string } }>;
  applyPromotionCode: (
    code: string
  ) => Promise<{ type: string; error?: { message?: string }; session?: CheckoutSessionLite }>;
};

// Athenia's light blue — the frozen-streak / selected-folder accent.
const BLUE = "#7dd3fc";

function Check() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke={BLUE}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, marginTop: 3 }}
      aria-hidden="true"
    >
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((f) => (
        <li key={f} style={{ display: "flex", gap: 8, fontSize: 14, lineHeight: 1.4 }}>
          <Check />
          <span>{f}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PricingModal({
  open,
  onClose,
  isPro = false
}: {
  open: boolean;
  onClose: () => void;
  isPro?: boolean;
}) {
  const [cycle, setCycle] = useState<BillingCycle>("yearly"); // default to the better deal
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // starting checkout
  const [clientSecret, setClientSecret] = useState<string | null>(null); // elements checkout session
  const [payReady, setPayReady] = useState(false); // card fields mounted & actions loaded
  const [paying, setPaying] = useState(false); // confirm() in flight
  const [payError, setPayError] = useState<string | null>(null);
  const [promo, setPromo] = useState(""); // promo code input
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [liveTotal, setLiveTotal] = useState<string | null>(null); // Stripe's total after discounts
  const checkoutHostRef = useRef<HTMLDivElement>(null); // where the card fields mount
  const paymentElRef = useRef<StripePaymentElement | null>(null);
  const actionsRef = useRef<CheckoutActions | null>(null);

  // Mount our native checkout: Stripe's SDK renders ONLY the payment fields
  // (as themed iframes) into our host div; everything else on screen is ours.
  // The `cancelled` flag guards StrictMode's double-run.
  useEffect(() => {
    if (!clientSecret || !stripePromise) return;
    let cancelled = false;
    (async () => {
      const stripe = await stripePromise;
      if (!stripe || cancelled) return;
      try {
        const sdk = stripe.initCheckoutElementsSdk({
          clientSecret,
          elementsOptions: { appearance: APPEARANCE }
        });
        const element = sdk.createPaymentElement();
        if (cancelled || !checkoutHostRef.current) return;
        paymentElRef.current = element;
        element.mount(checkoutHostRef.current);
        sdk.on("change", (session: CheckoutSessionLite) => {
          const amt = session?.total?.total?.amount;
          // Stripe pre-formats this string and may include the currency symbol.
          if (amt != null) setLiveTotal(String(amt).replace(/^[^0-9]*/, ""));
        });
        const loaded = await sdk.loadActions();
        if (cancelled) return;
        if (loaded.type !== "success") throw new Error(loaded.error?.message);
        actionsRef.current = loaded.actions as unknown as CheckoutActions;
        setPayReady(true);
      } catch (err) {
        console.error("[pricing] checkout failed:", err);
        setClientSecret(null);
        setNotice("Couldn't start checkout. Try again."); // DRAFT COPY
      }
    })();
    return () => {
      cancelled = true;
      try {
        paymentElRef.current?.destroy();
      } catch {
        // already gone
      }
      paymentElRef.current = null;
      actionsRef.current = null;
    };
  }, [clientSecret]);

  if (!open) return null;

  const pro = PRICING[cycle];

  // A 100%-off code drives Stripe's running total to zero. The session is
  // created with payment_method_collection: "if_required", so there's genuinely
  // nothing to collect — asking for a card anyway is the fastest way to lose
  // someone at the last step. The fields stay MOUNTED but hidden (not
  // unmounted), so clearing the code brings them straight back and confirm()
  // never loses its element.
  const totalIsZero = liveTotal != null && parseFloat(liveTotal) === 0;

  async function upgrade() {
    if (busy) return;
    // Already subscribed -> manage in Stripe's portal instead of buying again.
    if (isPro) {
      setBusy(true);
      try {
        const res = await fetch("/api/portal", { method: "POST" });
        const data = await res.json().catch(() => null);
        if (data?.url) window.location.href = data.url;
        else setNotice(data?.error ?? "Couldn't open subscription settings."); // DRAFT COPY
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      // No publishable key -> fall back to Stripe's hosted page.
      const ui = stripePromise ? "elements" : "hosted";
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycle, ui })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || (!data?.clientSecret && !data?.url)) {
        // DRAFT COPY — William to reword.
        setNotice(data?.error ?? "Couldn't start checkout. Try again.");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setPayReady(false);
      setPayError(null);
      setPromo("");
      setPromoMsg(null);
      setLiveTotal(null);
      setClientSecret(data.clientSecret); // swaps the cards for the payment form
    } catch {
      setNotice("Couldn't start checkout. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    const actions = actionsRef.current;
    if (!actions || paying) return;
    setPaying(true);
    setPayError(null);
    try {
      const result = await actions.confirm();
      if (result.type === "success") {
        window.location.href = "/?upgrade=success";
        return;
      }
      // DRAFT COPY — William to reword.
      setPayError(result.error?.message ?? "Payment didn't go through. Try again.");
    } catch {
      setPayError("Payment didn't go through. Try again.");
    } finally {
      setPaying(false);
    }
  }

  async function applyPromo() {
    const actions = actionsRef.current;
    const code = promo.trim();
    if (!actions || !code) return;
    setPromoMsg(null);
    const result = await actions.applyPromotionCode(code).catch(() => null);
    // DRAFT COPY — William to reword both messages.
    if (result?.type === "success") setPromoMsg("Code applied ✓");
    else setPromoMsg(result?.error?.message ?? "That code didn't work.");
  }

  function closeAll() {
    setClientSecret(null); // unmounts the payment fields via the effect cleanup
    setNotice(null);
    onClose();
  }

  return (
    <div
      onClick={closeAll}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        justifyContent: "center",
        // Deliberately NOT align-items:center. Centering a flex child that's
        // taller than the scroll container pushes its top above the container's
        // top edge, and overflow in that direction can't be scrolled to — the
        // checkout view (tall payment element) had its header permanently cut
        // off. `margin: auto` on the panel below centers it when it fits and
        // stays reachable when it doesn't.
        zIndex: 2000,
        padding: 20,
        overflowY: "auto"
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: 620,
          maxWidth: "100%",
          margin: "auto",
          background: "var(--background)",
          color: "var(--foreground)",
          border: "1px solid #888",
          borderRadius: "var(--btn-radius, 3px)",
          padding: 28,
          boxShadow: "0 6px 24px rgba(0,0,0,0.25)"
        }}
      >
        {/* close */}
        <button
          onClick={closeAll}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 14,
            width: 28,
            height: 28,
            border: "none",
            background: "transparent",
            color: "inherit",
            fontSize: 22,
            lineHeight: 1,
            cursor: "pointer"
          }}
        >
          ×
        </button>

        <div style={{ textAlign: "center", fontWeight: "bold", fontSize: 24 }}>
          Upgrade to Athenia Pro
        </div>
        <div style={{ textAlign: "center", fontSize: 14, opacity: 0.7, marginTop: 4 }}>
          Study without limits.
        </div>

        {clientSecret ? (
          /* Athenia-native checkout: our summary + button, Stripe's card fields */
          <>
            <button
              onClick={() => setClientSecret(null)}
              style={{
                marginTop: 14,
                padding: "6px 12px",
                border: "1px solid #888",
                borderRadius: "var(--btn-radius, 3px)",
                background: "transparent",
                color: "inherit",
                fontSize: 13,
                cursor: "pointer"
              }}
            >
              ← Back to plans
            </button>

            {/* order summary */}
            <div
              style={{
                marginTop: 14,
                padding: "12px 16px",
                border: "1px solid #888",
                borderRadius: "var(--btn-radius, 3px)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12
              }}
            >
              <div>
                <div style={{ fontWeight: "bold", fontSize: 15 }}>
                  Athenia Pro · {PRICING[cycle].label}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  {cycle === "yearly"
                    ? `$${pro.perMonth.toFixed(2)}/mo effective · save ${YEARLY_SAVINGS_PERCENT}%`
                    : "Billed monthly · cancel anytime"}
                </div>
              </div>
              <div style={{ fontWeight: "bold", fontSize: 20, whiteSpace: "nowrap" }}>
                ${liveTotal ?? pro.amount.toFixed(2)}
                <span style={{ fontSize: 12, opacity: 0.6, fontWeight: "normal" }}>
                  {" "}/ {cycle === "yearly" ? "yr" : "mo"}
                </span>
              </div>
            </div>

            {/* Stripe's card fields mount here, themed to match. Hidden rather
                than unmounted when the total is $0 — see totalIsZero above. */}
            <div style={{ display: totalIsZero ? "none" : undefined }}>
              <div ref={checkoutHostRef} style={{ marginTop: 14, minHeight: 220 }} />
              {!payReady && (
                <div style={{ fontSize: 13, opacity: 0.6, marginTop: 8 }}>
                  Loading secure payment fields…
                </div>
              )}
            </div>
            {totalIsZero && (
              // DRAFT COPY — William to reword.
              <div
                style={{
                  marginTop: 14,
                  padding: "12px 16px",
                  border: "1px solid #888",
                  borderRadius: "var(--btn-radius, 3px)",
                  fontSize: 13,
                  color: BLUE
                }}
              >
                Your code covers the full cost — no card needed.
              </div>
            )}

            {/* promo code (for beta / founding-member codes) */}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyPromo();
                }}
                placeholder="Promo code"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "8px 10px",
                  fontSize: 14,
                  background: "transparent",
                  color: "inherit",
                  border: "1px solid #888",
                  borderRadius: "var(--btn-radius, 3px)",
                  outline: "none"
                }}
              />
              <button
                onClick={applyPromo}
                disabled={!payReady || !promo.trim()}
                style={{
                  padding: "8px 14px",
                  border: "1px solid #888",
                  borderRadius: "var(--btn-radius, 3px)",
                  background: "transparent",
                  color: !payReady || !promo.trim() ? "#666" : "inherit",
                  fontSize: 14,
                  cursor: !payReady || !promo.trim() ? "default" : "pointer"
                }}
              >
                Apply
              </button>
            </div>
            {promoMsg && (
              <div
                style={{
                  fontSize: 13,
                  marginTop: 6,
                  color: promoMsg.endsWith("✓") ? BLUE : "#e0776b"
                }}
              >
                {promoMsg}
              </div>
            )}

            {/* our subscribe button */}
            <button
              onClick={pay}
              disabled={!payReady || paying}
              style={{
                marginTop: 16,
                padding: "11px 0",
                width: "100%",
                border: "none",
                borderRadius: "var(--btn-radius, 3px)",
                background: BLUE,
                color: "#0f172a",
                fontSize: 15,
                fontWeight: "bold",
                cursor: !payReady || paying ? "default" : "pointer",
                opacity: !payReady || paying ? 0.6 : 1
              }}
            >
              {paying
                ? "Processing…"
                : totalIsZero
                  ? // DRAFT COPY — William to reword.
                    "Start Athenia Pro · Free"
                  : `Subscribe · $${liveTotal ?? pro.amount.toFixed(2)}`}
            </button>
            {payError && (
              <div style={{ fontSize: 13, color: "#e0776b", marginTop: 8 }}>
                {payError}
              </div>
            )}
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 10, textAlign: "center" }}>
              Payments processed securely by Stripe. Cancel anytime.
            </div>
          </>
        ) : (
        <>
        {/* Monthly / Yearly toggle */}
        <div
          style={{
            // flex, not inline-flex: auto margins only centre a block-level
            // box, so as an inline box this sat against the left edge.
            display: "flex",
            gap: 4,
            padding: 4,
            border: "1px solid #888",
            borderRadius: "var(--btn-radius, 3px)",
            width: "fit-content",
            margin: "18px auto 0"
          }}
        >
          {(["monthly", "yearly"] as BillingCycle[]).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                border: "none",
                borderRadius: 2,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: cycle === c ? "bold" : "normal",
                background: cycle === c ? "rgba(148,163,184,0.28)" : "transparent",
                color: "inherit"
              }}
            >
              {PRICING[c].label}
              {c === "yearly" && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: "bold",
                    color: BLUE,
                    border: `1px solid ${BLUE}`,
                    borderRadius: 2,
                    padding: "1px 5px"
                  }}
                >
                  Save {YEARLY_SAVINGS_PERCENT}%
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Two plan cards */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            marginTop: 22,
            alignItems: "stretch"
          }}
        >
          {/* Free */}
          <div
            style={{
              flex: "1 1 240px",
              border: "1px solid #888",
              borderRadius: "var(--btn-radius, 3px)",
              padding: 20,
              display: "flex",
              flexDirection: "column"
            }}
          >
            <div style={{ fontWeight: "bold", fontSize: 18 }}>Free</div>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 30, fontWeight: "bold" }}>$0</span>
              <span style={{ opacity: 0.6, fontSize: 14 }}> / forever</span>
            </div>
            <FeatureList items={FREE_FEATURES} />
            <div style={{ flex: 1 }} />
            <button
              disabled
              style={{
                marginTop: 20,
                padding: "10px 0",
                width: "100%",
                border: "1px solid #888",
                borderRadius: "var(--btn-radius, 3px)",
                background: "transparent",
                color: "#888",
                fontSize: 15,
                cursor: "default"
              }}
            >
              Current plan
            </button>
          </div>

          {/* Athenia Pro */}
          <div
            style={{
              flex: "1 1 240px",
              border: `2px solid ${BLUE}`,
              borderRadius: "var(--btn-radius, 3px)",
              padding: 20,
              display: "flex",
              flexDirection: "column"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: "bold", fontSize: 18 }}>Athenia Pro</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 30, fontWeight: "bold" }}>
                ${cycle === "yearly" ? pro.perMonth.toFixed(2) : pro.amount.toFixed(2)}
              </span>
              <span style={{ opacity: 0.6, fontSize: 14 }}> / month</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              {cycle === "yearly"
                ? `$${pro.amount.toFixed(2)} billed yearly · save ${YEARLY_SAVINGS_PERCENT}%`
                : pro.note}
            </div>
            <FeatureList items={PRO_FEATURES} />
            <div style={{ flex: 1 }} />
            <button
              onClick={upgrade}
              disabled={busy}
              style={{
                marginTop: 20,
                padding: "10px 0",
                width: "100%",
                border: "none",
                borderRadius: "var(--btn-radius, 3px)",
                background: BLUE,
                color: "#0f172a", // dark text — white is unreadable on light blue
                fontSize: 15,
                fontWeight: "bold",
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1
              }}
            >
              {busy
                ? "One moment…"
                : isPro
                  ? "Manage subscription"
                  : "Upgrade to Pro"}
            </button>
          </div>
        </div>

        {notice && (
          <div style={{ textAlign: "center", fontSize: 13, opacity: 0.75, marginTop: 16 }}>
            {notice}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
