import Link from "next/link";

export const metadata = { title: "Updates — Athenia" };

// Newest first. Add a new entry at the top each release.
const UPDATES = [
  {
    version: "0.5",
    date: "July 15",
    items: [
      "Quiz History page to organize old quizzes into separate folders to practice more",
      "Stats viewer to show how much studying and practice you've worked on",
      "A streak system to work towards future premium benefits on a free plan",
      "Rechallenge feature to master the topic you're practicing",
      "Hints for explanations of questions",
      "Minor UI improvements"
    ]
  },
  {
    version: "0.4",
    date: "July 9",
    items: [
      "Rebrand from EdForce to Athenia",
      "Paste a YouTube link to generate questions",
      "Upload an audio or video file up to 25 MB to generate questions through audio transcription",
      "UI overhaul for all users (new colors, fonts, and layout)",
      "Complete UI overhaul for mobile accessibility",
      "Sign-In with a Google Account (no use yet)",
      "True/False question type",
    ]
  },
  {
    version: "0.3",
    date: "July 3",
    items: [
      "Generate quizzes from images (photos, diagrams, screenshots)",
      "Difficulty + grade/year settings that tailor the difficulty of questions",
      "Most text file formats are now supported (pdf, docx, txt, md, etc.)",
      "Settings are remembered between visits",
      "Support and Updates pages"
    ]
  },
  {
    version: "0.2",
    date: "June 25",
    items: [
      "Optional instant feedback",
      "Choose how many questions to generate",
      "New animations",
      "UI polish"
    ]
  },
  {
    version: "0.1",
    date: "June 24",
    items: ["Paste notes or a PDF to generate a 5 question multiple-choice quiz"]
  }
];

export default function UpdatesPage() {
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
          Updates
        </h1>
      </div>

      {UPDATES.map((u, i) => (
        <section
          key={u.version}
          style={{
            marginTop: 24,
            padding: 20,
            border: "1px solid #888",
            borderRadius: 3
          }}
        >
          <h2
            style={{
              margin: 0,
              fontWeight: "bold",
              fontSize: 28,
              display: "flex",
              alignItems: "center",
              gap: 10
            }}
          >
            v{u.version}
            {i === 0 && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: "normal",
                  letterSpacing: 0.5,
                  color: "#cbd5e1",
                  background: "rgba(148, 163, 184, 0.18)",
                  borderRadius: 3,
                  padding: "2px 8px"
                }}
              >
                NEW
              </span>
            )}
          </h2>
          <ul
            style={{
              marginTop: 16, // shift the changes down from the version
              marginBottom: 0,
              paddingLeft: 24,
              listStyleType: "disc" // bullet point on each change
            }}
          >
            {u.items.map((it, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {it}
              </li>
            ))}
          </ul>
          <div
            style={{
              marginTop: 12,
              textAlign: "right",
              fontSize: 13,
              color: "#888" // subtle, tucked in the bottom-right
            }}
          >
            {u.date}
          </div>
        </section>
      ))}

    </main>
  );
}
