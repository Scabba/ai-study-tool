import Link from "next/link";

export const metadata = { title: "Support — Athenia" };

export default function SupportPage() {
  return (
    <main style={{ padding: 40, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ position: "relative" }}>
        <Link
          href="/"
          aria-label="Back to Athenia"
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            color: "white",
            fontSize: 32,
            lineHeight: 1,
            textDecoration: "none"
          }}
        >
          ←
        </Link>
        <h1
          style={{
            textAlign: "center",
            fontWeight: "bold",
            fontSize: 40,
            margin: 0
          }}
        >
          Support
        </h1>
      </div>

      <section
        style={{
          marginTop: 24,
          padding: 20,
          border: "1px solid #888",
          borderRadius: "var(--btn-radius, 3px)"
        }}
      >
        <p style={{ margin: 0 }}>
          Athenia is in active development. Requesting improvements, reporting
          issues, or even suggesting a next step in development can be extremely
          helpful. The goal of Athenia is to provide students with an amazing
          tool that comes with great customer support.
        </p>
      </section>

      <section
        style={{
          marginTop: 16,
          padding: 20,
          border: "1px solid #888",
          borderRadius: "var(--btn-radius, 3px)"
        }}
      >
        <p style={{ margin: 0 }}>
          If you are unhappy with your experience with Athenia Pro, you may
          request a full refund within 7 days of purchase. You may also cancel
          your subscription at any time, with Pro features continuing to last
          for the remainder of the subscription.
        </p>
      </section>

      <p style={{ textAlign: "right", marginTop: 8, fontSize: 14, opacity: 0.75 }}>
        Contact:{" "}
        <a
          href="mailto:williambilodeau55@gmail.com"
          style={{ color: "#60a5fa" }}
        >
          williambilodeau55@gmail.com
        </a>
      </p>

      {/* Legal */}
      <p
        style={{
          textAlign: "center",
          marginTop: 40,
          fontSize: 14,
          opacity: 0.7,
          display: "flex",
          justifyContent: "center",
          gap: 10
        }}
      >
        <Link href="/privacy" style={{ color: "#60a5fa" }}>
          Privacy Policy
        </Link>
        <span aria-hidden style={{ opacity: 0.5 }}>
          ·
        </span>
        <Link href="/terms" style={{ color: "#60a5fa" }}>
          Terms of Service
        </Link>
      </p>

    </main>
  );
}
