import Link from "next/link";

export const metadata = { title: "Terms of Service — Athenia" };

const EMAIL = "williambilodeau55@gmail.com";
const UPDATED = "July 15, 2026";

const h2: React.CSSProperties = {
  fontSize: 20,
  fontWeight: "bold",
  marginTop: 32,
  marginBottom: 8
};
const p: React.CSSProperties = { margin: "0 0 10px", lineHeight: 1.6 };
// listStyle set explicitly — the global CSS reset strips bullets from ul.
const ul: React.CSSProperties = {
  margin: "0 0 10px",
  paddingLeft: 20,
  lineHeight: 1.6,
  listStyle: "disc"
};

export default function TermsPage() {
  return (
    <main style={{ padding: 40, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ position: "relative" }}>
        <Link
          href="/support"
          aria-label="Back to Support"
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
        <h1 style={{ textAlign: "center", fontWeight: "bold", fontSize: 40, margin: 0 }}>
          Terms of Service
        </h1>
      </div>

      <p style={{ textAlign: "center", opacity: 0.6, fontSize: 14, marginTop: 8 }}>
        Last updated {UPDATED}
      </p>

      <section
        style={{
          marginTop: 24,
          padding: 20,
          border: "1px solid #888",
          borderRadius: "var(--btn-radius, 3px)"
        }}
      >
        <p style={{ ...p, margin: 0 }}>
          These terms cover your use of Athenia. Athenia is a free beta run by an
          individual, not a company. By using it, you agree to what&apos;s below.
          If you don&apos;t agree, please don&apos;t use it.
        </p>
      </section>

      <h2 style={h2}>Who runs Athenia</h2>
      <p style={p}>
        Athenia is operated by William Bilodeau. Contact:{" "}
        <a href={`mailto:${EMAIL}`} style={{ color: "#60a5fa" }}>
          {EMAIL}
        </a>
        .
      </p>

      <h2 style={h2}>Who can use it</h2>
      <p style={p}>
        You must be at least 13 years old. If you are under the age of majority
        where you live, you may only use Athenia with a parent or
        guardian&apos;s permission. Don&apos;t use Athenia where doing so would
        break the law.
      </p>

      <h2 style={h2}>This is a beta</h2>
      <p style={p}>
        Athenia is under active development and provided free of charge. That
        means:
      </p>
      <ul style={ul}>
        <li>Features can change, break, or disappear without notice.</li>
        <li>
          It can go down, and your saved quizzes, stats, or streak could be lost.
          Don&apos;t treat Athenia as the only copy of anything important.
        </li>
        <li>
          Daily generation limits apply, especially if you aren&apos;t signed in,
          and those limits can change.
        </li>
      </ul>

      <h2 style={h2}>AI-generated content</h2>
      <p style={p}>
        Athenia&apos;s questions, answers, and hints are produced by an AI model.
        <strong> They can be wrong, misleading, or incomplete</strong>, including
        marking a correct answer as wrong. Athenia is a practice aid, not a
        source of truth. Always check anything important against your actual
        course material, and don&apos;t rely on Athenia for graded work, exams,
        or any decision that matters. You are responsible for how you use what it
        produces.
      </p>

      <h2 style={h2}>Your content</h2>
      <p style={p}>
        Whatever you paste, upload, or link stays yours. You give me permission
        to store and process it, and to send it to the services Athenia depends
        on (listed in the{" "}
        <Link href="/privacy" style={{ color: "#60a5fa" }}>
          Privacy Policy
        </Link>
        ), purely to generate your questions and run the app. I don&apos;t claim
        ownership of your material and won&apos;t use it to advertise.
      </p>
      <p style={p}>
        You&apos;re responsible for having the right to upload what you upload.
        Don&apos;t upload other people&apos;s copyrighted material without
        permission, recordings of people who didn&apos;t agree to be recorded, or
        anyone else&apos;s private information.
      </p>

      <h2 style={h2}>Fair use of the service</h2>
      <p style={p}>Please don&apos;t:</p>
      <ul style={ul}>
        <li>
          Script, scrape, or automate Athenia, or work around its rate limits.
          Every generation costs me money.
        </li>
        <li>Use Athenia to create illegal, harassing, or harmful content.</li>
        <li>
          Try to break, overload, or gain unauthorised access to Athenia or its
          underlying services.
        </li>
        <li>Resell Athenia or pass its output off as your own original work.</li>
      </ul>
      <p style={p}>
        I can limit or remove access if Athenia is being abused — usually because
        it&apos;s costing money or putting the service at risk.
      </p>

      <h2 style={h2}>Academic honesty</h2>
      <p style={p}>
        Athenia is meant to help you practise. Using it in a way that breaks your
        school&apos;s rules is on you, not me.
      </p>

      <h2 style={h2}>No warranty</h2>
      <p style={p}>
        Athenia is provided &quot;as is&quot; and &quot;as available&quot;,
        without warranties of any kind, express or implied. I don&apos;t promise
        it will be accurate, uninterrupted, secure, or fit for any particular
        purpose.
      </p>

      <h2 style={h2}>Limitation of liability</h2>
      <p style={p}>
        To the fullest extent the law allows, I am not liable for any indirect or
        consequential damages, lost data, lost grades, or lost profits arising
        from your use of Athenia. Since Athenia is free, my total liability to
        you is limited to what you have paid for it, which is nothing. Some
        places don&apos;t allow these limits, so they may not apply to you.
      </p>

      <h2 style={h2}>Ending access</h2>
      <p style={p}>
        You can stop using Athenia whenever you like, and email me to delete your
        account and data. I may suspend or end access if these terms are broken,
        or if I stop running Athenia.
      </p>

      <h2 style={h2}>Governing law</h2>
      <p style={p}>
        These terms are governed by the laws of the Province of Alberta and the
        laws of Canada that apply there, without regard to conflict-of-law rules.
        Any dispute will be handled by the courts located in Alberta, Canada,
        unless the law where you live gives you the right to bring it somewhere
        else.
      </p>

      <h2 style={h2}>Changes to these terms</h2>
      <p style={p}>
        These terms will change as Athenia grows — including if and when paid
        plans arrive, which will have their own terms covering billing and
        refunds. The &quot;last updated&quot; date above reflects the current
        version. Continuing to use Athenia after a change means you accept it.
      </p>

      <h2 style={h2}>Contact</h2>
      <p style={{ ...p, marginBottom: 40 }}>
        Questions about these terms:{" "}
        <a href={`mailto:${EMAIL}`} style={{ color: "#60a5fa" }}>
          {EMAIL}
        </a>
        .
      </p>
    </main>
  );
}
