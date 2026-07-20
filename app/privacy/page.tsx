import Link from "next/link";

export const metadata = { title: "Privacy Policy — Athenia" };

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

export default function PrivacyPage() {
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
          Privacy Policy
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
          borderRadius: 3
        }}
      >
        <p style={{ ...p, margin: 0 }}>
          Athenia is a study tool that turns your notes into practice questions.
          This policy explains what it collects, why, and who else sees it.
          Athenia is currently a free beta run by an individual, not a company.
        </p>
      </section>

      <h2 style={h2}>Who runs Athenia</h2>
      <p style={p}>
        Athenia is operated by William Bilodeau. There is no company behind it
        yet. You can reach me any time at{" "}
        <a href={`mailto:${EMAIL}`} style={{ color: "#60a5fa" }}>
          {EMAIL}
        </a>
        .
      </p>

      <h2 style={h2}>Age requirement</h2>
      <p style={p}>
        You must be at least 13 to use Athenia. It is not directed at children
        under 13, and accounts for under-13s are not permitted. If you believe
        someone under 13 has created an account, email me and I will delete it.
      </p>

      <h2 style={h2}>What Athenia collects</h2>
      <ul style={ul}>
        <li>
          <strong>Account details</strong> — if you sign in with Google, Athenia
          receives your name, email address, and profile picture. There is no
          password; Google handles sign-in.
        </li>
        <li>
          <strong>Study material you submit</strong> — text you paste, documents
          you upload (PDF, Word, text), photos, audio or video recordings, and
          YouTube links.
        </li>
        <li>
          <strong>Quiz data</strong> — the questions generated for you, the
          answers you picked, your scores, the grade level you chose, and an
          estimated subject.
        </li>
        <li>
          <strong>Settings and usage counts</strong> — your difficulty and grade
          settings, plus counts like quizzes completed, hints taken, and your
          streak.
        </li>
        <li>
          <strong>Technical data</strong> — your IP address (used to limit how
          many quizzes signed-out visitors can generate, and recorded in normal
          server logs), plus basic browser and device information.
        </li>
        <li>
          <strong>Data stored on your own device</strong> — settings, stats, and
          your in-progress quiz are kept in your browser&apos;s local storage so
          they survive a page reload.
        </li>
      </ul>
      <p style={p}>
        Athenia has no ads and does not sell your data or share it with data
        brokers.
      </p>

      <h2 style={h2}>Why Athenia collects it</h2>
      <ul style={ul}>
        <li>To generate questions and hints from the material you give it.</li>
        <li>To save your quiz history, folders, settings, stats, and streak.</li>
        <li>To sign you in and keep your data attached to your account.</li>
        <li>
          To stop bots and abuse. Signed-out visitors are limited by IP address,
          because AI generation costs real money per request.
        </li>
        <li>To understand roughly how the site is used, and to fix problems.</li>
      </ul>

      <h2 style={h2}>Who else sees your data</h2>
      <p style={p}>
        Athenia relies on a handful of services to work. Each only receives what
        it needs:
      </p>
      <ul style={ul}>
        <li>
          <strong>OpenAI</strong> — receives the study material you submit (text,
          images, YouTube captions, and the transcript of any audio) to generate
          questions and hints. Under OpenAI&apos;s API policy this content is not
          used to train their models, and they retain it briefly (currently up to
          30 days) for abuse monitoring.
        </li>
        <li>
          <strong>AssemblyAI</strong> — receives uploaded or recorded audio and
          video to convert it to a text transcript. The file and transcript are
          deleted right after processing and are not used to train their models.
        </li>
        <li>
          <strong>Supabase</strong> — stores your account, settings, quiz
          history, stats, and rate-limit counters, and briefly holds an uploaded
          audio or video file until it is transcribed and deleted.
        </li>
        <li>
          <strong>Vercel</strong> — hosts the site and processes requests. Server
          logs include IP addresses. Vercel Web Analytics also collects
          privacy-friendly, cookie-free usage data such as page views, referrer,
          country, and device type. It does not track you across other sites.
        </li>
        <li>
          <strong>Supadata</strong> — receives a YouTube link when you paste one,
          in order to fetch that video&apos;s captions.
        </li>
        <li>
          <strong>Google</strong> — handles sign-in if you choose to sign in.
        </li>
        <li>
          <strong>Cloudflare</strong> — provides DNS for atheniastudy.com.
        </li>
      </ul>

      <h2 style={h2}>Cookies</h2>
      <p style={p}>
        Athenia uses cookies only to keep you signed in. There are no advertising
        or cross-site tracking cookies. If you never sign in, Athenia does not
        set a sign-in cookie.
      </p>

      <h2 style={h2}>Uploaded audio and video</h2>
      <p style={p}>
        Files you upload go into private storage that is not publicly
        accessible. When you generate a quiz, the recording is transcribed and
        then <strong>deleted immediately</strong> — Athenia does not keep your
        audio or video after processing it. If you remove an upload with the
        &times; button before generating, it is deleted then instead. Only the
        text transcript is used to build your questions.
      </p>

      <h2 style={h2}>How long data is kept</h2>
      <ul style={ul}>
        <li>
          <strong>Quiz history</strong> — your 50 most recent quizzes. Older ones
          drop off automatically. You can delete any quiz at any time.
        </li>
        <li>
          <strong>Account, settings, stats, streak</strong> — kept until you ask
          me to delete your account.
        </li>
        <li>
          <strong>Uploaded audio and video</strong> — deleted automatically as
          soon as your quiz is generated (or when you remove the file, if
          sooner).
        </li>
        <li>
          <strong>Rate-limit records</strong> — an IP address and a count for
          that day, used only to enforce the daily limit.
        </li>
        <li>
          <strong>On-device data</strong> — stays until you clear your browser
          storage.
        </li>
      </ul>

      <h2 style={h2}>Your choices</h2>
      <ul style={ul}>
        <li>Delete individual quizzes from the Quiz History page.</li>
        <li>Remove an uploaded file with the &times; next to it.</li>
        <li>Sign out, or use Athenia signed-out entirely.</li>
        <li>Clear your browser storage to wipe on-device data.</li>
        <li>
          Email me at{" "}
          <a href={`mailto:${EMAIL}`} style={{ color: "#60a5fa" }}>
            {EMAIL}
          </a>{" "}
          to get a copy of your data, correct it, or delete your account and
          everything attached to it. I will action it as quickly as I reasonably
          can.
        </li>
      </ul>
      <p style={p}>
        Athenia is operated from Alberta, Canada, and your data is handled in
        line with Canadian privacy law (PIPEDA and Alberta&apos;s PIPA).
        Depending on where you live you may have additional rights (for example
        under the GDPR or CCPA). Email me and I will honour them regardless of
        where you are.
      </p>

      <h2 style={h2}>Security</h2>
      <p style={p}>
        Sign-in is handled by Google, and your account data is protected so that
        only your account can read it. No service is perfectly secure, and
        Athenia is an early beta run by one person — please don&apos;t upload
        anything highly sensitive.
      </p>

      <h2 style={h2}>Changes</h2>
      <p style={p}>
        Athenia is in active development, so this policy will change as it grows.
        The &quot;last updated&quot; date above always reflects the current
        version.
      </p>

      <h2 style={h2}>Contact</h2>
      <p style={{ ...p, marginBottom: 40 }}>
        Questions, requests, or concerns:{" "}
        <a href={`mailto:${EMAIL}`} style={{ color: "#60a5fa" }}>
          {EMAIL}
        </a>
        .
      </p>
    </main>
  );
}
