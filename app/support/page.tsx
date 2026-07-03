import Link from "next/link";

export const metadata = { title: "Support — EdForce" };

export default function SupportPage() {
  return (
    <main style={{ padding: 40, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ position: "relative" }}>
        <Link
          href="/"
          aria-label="Back to EdForce"
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
          borderRadius: 3
        }}
      >
        <p style={{ margin: 0 }}>
          EdForce is in active development. Requesting improvements, reporting
          issues, or even suggesting a next step in development can be extremely
          helpful. The goal of EdForce is to provide students with an amazing
          tool that comes with great customer support.
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

    </main>
  );
}
