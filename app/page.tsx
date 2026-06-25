"use client";

import { useState, useEffect, useRef } from "react";
import WhatsNew from "./WhatsNew";

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
  const [instantFeedback, setInstantFeedback] = useState(false); // reveal right/wrong as you answer
  const [amount, setAmount] = useState(5); // how many questions to generate
  const [showNotice, setShowNotice] = useState(false); // the "?" pre-release notice
  const [dotCount, setDotCount] = useState(3); // for the animated "paste text here..." dots
  const [flashIndex, setFlashIndex] = useState<number | null>(null); // which question to flash as "missing"
  const fileInputRef = useRef<HTMLInputElement>(null); // hidden PDF file picker
  const noticeRef = useRef<HTMLDivElement>(null); // the pre-release notice box
  const noticeButtonRef = useRef<HTMLButtonElement>(null); // the "?" button

  // Close the notice when you click anywhere outside it (or its button)
  useEffect(() => {
    if (!showNotice) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        noticeRef.current?.contains(target) ||
        noticeButtonRef.current?.contains(target)
      ) {
        return; // clicked the notice or the "?" — leave it to their own handlers
      }
      setShowNotice(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotice]);

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
    setLoading(true);    // turn the dots ON before we start
    setQuestions([]);    // clear the old quiz right away
    setAnswers({});      // clear any previous selections
    setSubmitted(false); // back to "not submitted yet"
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: sourceText, count: amount })
      });

      if (!res.body) return;

      // The server sends one question per line, as each is ready. Read them
      // as they stream in and add each to the screen one at a time.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Add a single question, then pause briefly so the next one pops up on its own
      const addOne = async (q: Question) => {
        setQuestions((prev) => [...prev, q]);
        await new Promise((r) => setTimeout(r, 250)); // gap between questions so each animates in on its own
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // the last piece might be a half-finished line

        for (const line of lines) {
          if (!line.trim()) continue;
          await addOne(JSON.parse(line) as Question);
        }
      }

      // handle any leftover line after the stream ends
      if (buffer.trim()) {
        await addOne(JSON.parse(buffer) as Question);
      }
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
      <WhatsNew />

      {/* "?" help circle, fixed to the top-right of the screen */}
      <button
        ref={noticeButtonRef}
        onClick={() => setShowNotice((v) => !v)}
        title="About this version"
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "2px solid #888",
          background: "var(--background)",
          color: "inherit",
          fontSize: 20,
          fontWeight: "bold",
          cursor: "pointer",
          zIndex: 1000
        }}
      >
        ?
      </button>

      {/* The notice that appears just below the "?" when it's clicked */}
      {showNotice && (
        <div
          ref={noticeRef}
          style={{
            position: "fixed",
            top: 70,
            right: 20,
            maxWidth: 280,
            background: "var(--background)",
            color: "var(--foreground)",
            border: "1px solid #888",
            borderRadius: 3,
            padding: 16,
            boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
            zIndex: 1000
          }}
        >
          Notice: this is a pre-release version of EdForce. Many updates are
          still necessary to create the perfect study tool 🙂
        </div>
      )}

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
          borderRadius: 3,
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
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* file/document with a folded top-right corner */}
          <path d="M7 6 H17 L22 11 V26 H7 Z" />
          <path d="M17 6 V11 H22" />
          {/* plus sign floating just off the top-right corner */}
          <line x1="27" y1="3.5" x2="27" y2="9.5" />
          <line x1="24" y1="6.5" x2="30" y2="6.5" />
        </svg>
      </button>

      <textarea
        style={{
          width: "100%",
          height: 200,
          border: "2px solid #888",
          borderRadius: 3,
          padding: 12,
          fontSize: 16
        }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
      />

      <br />

      {/* Settings row: instant feedback toggle + how many questions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          marginTop: 12,
          flexWrap: "wrap"
        }}
      >
        {/* Instant feedback on/off */}
        <label
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        >
          {/* the real checkbox, hidden — the label still toggles it */}
          <input
            type="checkbox"
            checked={instantFeedback}
            onChange={(e) => setInstantFeedback(e.target.checked)}
            style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
          />
          {/* our custom box with a white checkmark when on */}
          <span
            style={{
              width: 18,
              height: 18,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: instantFeedback ? "#1e40af" : "#000", // black when empty
              border: "1px solid #999",    // light grey outline
              borderRadius: 3
            }}
          >
            {instantFeedback && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12 l5 5 l9 -11" />
              </svg>
            )}
          </span>
          Instant feedback
        </label>

        {/* Question amount: pick one of 5 / 10 / 15 / 20 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Questions:</span>
          {[5, 10, 15, 20].map((n) => (
            <button
              key={n}
              onClick={() => setAmount(n)}
              style={{
                width: 44,
                height: 36,
                borderRadius: 3,
                border: "2px solid #888",
                background: amount === n ? "#1e40af" : "transparent",
                color: amount === n ? "white" : "inherit",
                fontWeight: amount === n ? "bold" : "normal",
                cursor: "pointer"
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => generateQuestions()}
        disabled={loading}
        style={{
          marginTop: 12,
          padding: "10px 24px",
          minWidth: 190,
          height: 44,
          background: "#1e40af", // darker blue
          color: "white",
          border: "none",
          borderRadius: 3,
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
          // Reveal right/wrong either after Submit, OR instantly once this
          // question is answered (when instant feedback is turned on).
          const revealed =
            submitted || (instantFeedback && answers[i] != null);

          // Colour the title green (right) or red (wrong) once revealed
          const titleColor = revealed
            ? answers[i] === q.answer
              ? "green"
              : "red"
            : undefined;

          return (
            <div
              key={i}
              id={`question-${i}`}
              className={`q-card${flashIndex === i ? " flash-missing" : ""}`}
              style={{ marginBottom: 40, padding: 12, borderRadius: 3 }}
            >
              <p style={{ fontWeight: "bold", fontSize: 18, color: titleColor }}>
                {i + 1}. {q.question}
              </p>

              {(["A", "B", "C", "D"] as const).map((letter) => {
                // Show the green dot in the circle ONLY for the correct option
                // on a question the user got wrong (once revealed).
                const showGreenDot =
                  revealed && answers[i] !== q.answer && letter === q.answer;

                return (
                  <label
                    key={letter}
                    style={{
                      display: "flex",       // sits on its own line...
                      width: "fit-content",  // ...but only as wide as its content (so you click the dot/letter/text, not the whole row)
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 10,
                      cursor: revealed ? "default" : "pointer"
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
                          // lock a question once its answer is revealed, but
                          // DON'T disable the radio (disabled greys out the
                          // user's yellow dot)
                          if (!revealed) setAnswers({ ...answers, [i]: letter });
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
            disabled={submitted || loading}
            style={{
              marginTop: 8,
              padding: "12px 28px",
              background: "#16a34a", // green
              color: "white",
              fontWeight: "bold",
              border: "none",
              borderRadius: 3,
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
