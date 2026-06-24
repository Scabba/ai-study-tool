"use client";

import { useState, useEffect, useRef } from "react";

// The shape of one multiple-choice question coming back from the server
type Question = {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: string;
  difficulty: string;
};

export default function Home() {
  const [text, setText] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({}); // which letter the user picked per question
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false); // has the user pressed Submit?
  const [dotCount, setDotCount] = useState(3); // for the animated "paste text here..." dots
  const [flashIndex, setFlashIndex] = useState<number | null>(null); // which question to flash as "missing"
  const fileInputRef = useRef<HTMLInputElement>(null); // hidden PDF file picker

  // Animate the placeholder dots (1 -> 2 -> 3 -> 1 ...) while the box is empty
  useEffect(() => {
    if (text !== "") return; // placeholder only shows when empty, so don't bother otherwise
    const id = setInterval(() => {
      setDotCount((c) => (c === 3 ? 1 : c + 1));
    }, 400);
    return () => clearInterval(id); // stop the timer when we're done
  }, [text]);

  const placeholder = "paste text here" + ".".repeat(dotCount);

  function handleSubmit() {
    // Find the first question that hasn't been answered yet
    const missing = questions.findIndex((_, i) => !answers[i]);

    if (missing !== -1) {
      // Scroll that question to the middle of the screen...
      const el = document.getElementById(`question-${missing}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });

      // ...and flash it yellow for one second
      setFlashIndex(missing);
      setTimeout(() => setFlashIndex(null), 1000);
      return; // stop here — don't grade an incomplete quiz
    }

    setSubmitted(true); // everything answered -> grade it
  }

  // How many did they get right, and that as a percentage
  const score = questions.reduce(
    (total, q, i) => total + (answers[i] === q.answer ? 1 : 0),
    0
  );
  const percent = questions.length
    ? Math.round((score / questions.length) * 100)
    : 0;

  // Generate from whatever text we pass in (defaults to the textarea's text)
  async function generateQuestions(sourceText: string = text) {
    setLoading(true); // turn the dots ON before we start
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: sourceText })
      });

      const data = await res.json();
      setQuestions(data.questions);
      setAnswers({});       // clear any previous selections
      setSubmitted(false);  // back to "not submitted yet"
    } finally {
      setLoading(false); // turn the dots OFF when done (even if it failed)
    }
  }

  // Read a PDF in the browser, pull out its text, then generate questions
  async function handlePdf(file: File) {
    setLoading(true);
    try {
      const pdfjsLib = await import("pdfjs-dist");
      // tell pdf.js where its background "worker" file is
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();

      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

      // walk every page and collect its text
      let fullText = "";
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        fullText += pageText + "\n";
      }

      setText(fullText);              // show the extracted text in the box
      await generateQuestions(fullText); // and make questions from it
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 40 }}>
      <h1
        style={{ textAlign: "center", fontWeight: "bold", fontSize: 64 }}
      >
        EdForce
      </h1>

      {/* Hidden file picker — only accepts PDFs */}
      <input
        type="file"
        accept="application/pdf"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handlePdf(file);
          e.target.value = ""; // reset so the same file can be picked again
        }}
      />

      {/* "Add PDF" icon button: a square with a plus in its top-right corner */}
      <button
        onClick={() => fileInputRef.current?.click()}
        title="Upload a PDF"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 48,
          height: 48,
          marginBottom: 12,
          background: "transparent",
          border: "2px solid #888",
          borderRadius: 8,
          cursor: "pointer",
          color: "inherit"
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 32 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <rect x="4" y="9" width="17" height="17" rx="3" />
          <line x1="25" y1="4" x2="25" y2="12" />
          <line x1="21" y1="8" x2="29" y2="8" />
        </svg>
      </button>

      <textarea
        style={{
          width: "100%",
          height: 200,
          border: "2px solid #888",
          borderRadius: 8,
          padding: 12,
          fontSize: 16
        }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
      />

      <br />

      <button
        onClick={() => generateQuestions()}
        disabled={loading}
        style={{
          marginTop: 12,
          padding: "10px 24px",
          minWidth: 190,
          height: 44,
          background: "#2563eb", // blue
          color: "white",
          border: "none",
          borderRadius: 8,
          fontSize: 16,
          cursor: loading ? "default" : "pointer"
        }}
      >
        {loading ? (
          <span className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </span>
        ) : (
          "Generate Questions"
        )}
      </button>

      <div style={{ marginTop: 32 }}>
        {questions.map((q, i) => {
          // After submitting, colour the title green (right) or red (wrong)
          const titleColor = submitted
            ? answers[i] === q.answer
              ? "green"
              : "red"
            : undefined;

          return (
            <div
              key={i}
              id={`question-${i}`}
              className={flashIndex === i ? "flash-missing" : undefined}
              style={{ marginBottom: 40, padding: 12, borderRadius: 8 }}
            >
              <p style={{ fontWeight: "bold", fontSize: 18, color: titleColor }}>
                {i + 1}. {q.question}
              </p>

              {(["A", "B", "C", "D"] as const).map((letter) => {
                // Show the green dot in the circle ONLY for the correct option
                // on a question the user got wrong.
                const showGreenDot =
                  submitted && answers[i] !== q.answer && letter === q.answer;

                return (
                  <label
                    key={letter}
                    style={{
                      display: "flex",       // sits on its own line...
                      width: "fit-content",  // ...but only as wide as its content (so you click the dot/letter/text, not the whole row)
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 10,
                      cursor: submitted ? "default" : "pointer"
                    }}
                  >
                    {showGreenDot ? (
                      // A green filled circle that sits where the radio dot would be
                      <span
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: "50%",
                          background: "green",
                          flexShrink: 0
                        }}
                      />
                    ) : (
                      <input
                        type="radio"
                        name={`question-${i}`}
                        checked={answers[i] === letter}
                        onChange={() => {
                          // lock answers once submitted, but DON'T disable the
                          // radio (disabled greys out the user's yellow dot)
                          if (!submitted) setAnswers({ ...answers, [i]: letter });
                        }}
                        style={{ accentColor: "#eab308", margin: 0 }} // yellow selection dot
                      />
                    )}

                    <span>{letter}. {q.options[letter]}</span>
                  </label>
                );
              })}
            </div>
          );
        })}

        {/* Submit button — turns into the grade once pressed */}
        {questions.length > 0 && (
          <button
            onClick={handleSubmit}
            disabled={submitted}
            style={{
              marginTop: 8,
              padding: "12px 28px",
              background: "#16a34a", // green
              color: "white",
              fontWeight: "bold",
              border: "none",
              borderRadius: 8,
              fontSize: submitted ? 20 : 16, // grade shows a touch bigger
              cursor: submitted ? "default" : "pointer"
            }}
          >
            {submitted
              ? `${score}/${questions.length} (${percent}%)`
              : "Submit"}
          </button>
        )}
      </div>
    </main>
  );
}
