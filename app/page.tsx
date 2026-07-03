"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import WhatsNew from "./WhatsNew";

// The shape of one multiple-choice question coming back from the server
type Question = {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: string;
  difficulty: string;
};

// Most photos you can upload at once
const MAX_IMAGES = 10;

// Difficulty slider stops (index 0 -> 2)
const DIFFICULTIES = ["Middle School", "High School", "University"];

// Grade/Year choices for each difficulty (same index order as DIFFICULTIES)
const GRADE_OPTIONS = [
  ["5", "6", "7", "8"],              // Middle School
  ["9", "10", "11", "12"],           // High School
  ["1", "2", "3", "4", "Graduate"]   // University
];

export default function Home() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"text" | "image">("text"); // which page tab is active
  const [images, setImages] = useState<string[]>([]); // uploaded images on the image page
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null); // image shown fullscreen
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({}); // which letter the user picked per question
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false); // has the user pressed Submit?
  const [instantFeedback, setInstantFeedback] = useState(false); // reveal right/wrong as you answer
  const [toggleError, setToggleError] = useState<string | null>(null); // shown if you try to change instant feedback mid-quiz
  const [genError, setGenError] = useState<string | null>(null); // shown when trying to generate without required settings
  const [amount, setAmount] = useState(5); // how many questions to generate
  const [showNotice, setShowNotice] = useState(false); // the "?" pre-release notice
  const [showSettings, setShowSettings] = useState(false); // the cog settings panel
  const [difficulty, setDifficulty] = useState(1); // 0=Middle School, 1=High School, 2=University
  const [gradeYear, setGradeYear] = useState<string | null>(null); // chosen grade/year within the difficulty
  const [dotCount, setDotCount] = useState(3); // for the animated "paste text here..." dots
  const [flashIndex, setFlashIndex] = useState<number | null>(null); // which question to flash as "missing"
  const fileInputRef = useRef<HTMLInputElement>(null); // hidden PDF file picker
  const imageInputRef = useRef<HTMLInputElement>(null); // hidden image file picker
  const noticeRef = useRef<HTMLDivElement>(null); // the pre-release notice box
  const noticeButtonRef = useRef<HTMLButtonElement>(null); // the "?" button
  const settingsRef = useRef<HTMLDivElement>(null); // the settings panel
  const settingsButtonRef = useRef<HTMLButtonElement>(null); // the cog button
  const skipFirstSave = useRef(true); // don't save settings on the very first render

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

  // Close the settings panel when you click anywhere outside it (or the cog)
  useEffect(() => {
    if (!showSettings) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        settingsRef.current?.contains(target) ||
        settingsButtonRef.current?.contains(target)
      ) {
        return;
      }
      setShowSettings(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSettings]);

  // Animate the placeholder dots (1 -> 2 -> 3 -> 1 ...) while the box is empty
  useEffect(() => {
    if (text !== "") return; // placeholder only shows when empty, so don't bother otherwise
    const id = setInterval(() => {
      setDotCount((c) => (c === 3 ? 1 : c + 1));
    }, 400);
    return () => clearInterval(id); // stop the timer when we're done
  }, [text]);

  // Load the user's saved settings once, on first load
  useEffect(() => {
    try {
      const raw = localStorage.getItem("edforceSettings");
      if (!raw) return;
      const s = JSON.parse(raw);
      // Loading saved settings must happen in an effect (SSR-safe); these
      // one-time setState calls are intentional.
      /* eslint-disable react-hooks/set-state-in-effect */
      if (typeof s.difficulty === "number") setDifficulty(s.difficulty);
      if (s.gradeYear === null || typeof s.gradeYear === "string") setGradeYear(s.gradeYear);
      if (typeof s.instantFeedback === "boolean") setInstantFeedback(s.instantFeedback);
      if (typeof s.amount === "number") setAmount(s.amount);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // ignore bad/missing saved data
    }
  }, []);

  // Save settings whenever they change (skipping the first render, which runs
  // before the saved values have loaded — so we don't overwrite them)
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    try {
      localStorage.setItem(
        "edforceSettings",
        JSON.stringify({ difficulty, gradeYear, instantFeedback, amount })
      );
    } catch {
      // storage might be unavailable — not critical
    }
  }, [difficulty, gradeYear, instantFeedback, amount]);

  const placeholder = "paste text here" + ".".repeat(dotCount);

  function handleSubmit() {
    // Find the first question that hasn't been answered yet
    const missing = questions.findIndex((_, i) => !answers[i]);

    if (missing !== -1) {
      // Scroll that question to the middle of the screen...
      const el = document.getElementById(`question-${missing}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });

      // ...and flash it yellow for three seconds
      setFlashIndex(missing);
      setTimeout(() => setFlashIndex(null), 3000);
      return; // stop here — don't grade an incomplete quiz
    }

    setSubmitted(true);   // everything answered -> grade it
    setToggleError(null); // toggle is usable again now that it's submitted
  }

  // Once at least one answer is picked, the instant-feedback toggle is locked
  const hasAnswered = Object.keys(answers).length > 0;

  // How many did they get right, and that as a percentage
  const score = questions.reduce(
    (total, q, i) => total + (answers[i] === q.answer ? 1 : 0),
    0
  );
  const percent = questions.length
    ? Math.round((score / questions.length) * 100)
    : 0;

  // Turn the difficulty + grade settings into a phrase the AI can target,
  // e.g. "grade 8 (middle school)" or "graduate-level (university)"
  function describeLevel(): string {
    const school = DIFFICULTIES[difficulty];
    if (!gradeYear) return school; // no grade picked yet -> just the school level
    if (difficulty === 2) {
      return gradeYear === "Graduate"
        ? "graduate-level (university)"
        : `year ${gradeYear} university`;
    }
    return `grade ${gradeYear} (${school.toLowerCase()})`;
  }

  // Core generation: send a payload (text OR image) and stream questions in
  async function runGeneration(payload: { text?: string; images?: string[] }) {
    if (!gradeYear) {
      setGenError("Choose grade level in settings to generate questions (top left)");
      return;
    }
    setGenError(null);
    setLoading(true);    // turn the dots ON before we start
    setQuestions([]);    // clear the old quiz right away
    setAnswers({});      // clear any previous selections
    setSubmitted(false); // back to "not submitted yet"
    setToggleError(null); // fresh quiz -> toggle is usable again
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ...payload, count: amount, level: describeLevel() })
      });

      if (!res.body) return;

      // The server sends one JSON line per question as each is ready (or an
      // {error} line if something went wrong). Read them as they stream in.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleLine = async (line: string) => {
        const item = JSON.parse(line);
        if (item.error) {
          setGenError(item.error); // the server told us what went wrong
          return;
        }
        setQuestions((prev) => [...prev, item as Question]);
        await new Promise((r) => setTimeout(r, 250)); // gap so each pops up on its own
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // the last piece might be a half-finished line

        for (const line of lines) {
          if (line.trim()) await handleLine(line);
        }
      }

      if (buffer.trim()) await handleLine(buffer);
    } finally {
      setLoading(false); // turn the dots OFF when done (even if it failed)
    }
  }

  // Generate from whatever text we pass in (defaults to the textarea's text)
  async function generateQuestions(sourceText: string = text) {
    if (!sourceText.trim()) {
      setGenError("Please paste some notes first");
      return;
    }
    await runGeneration({ text: sourceText });
  }

  // Add one or more uploaded images to the list (doesn't generate yet)
  async function addImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (Array.from(files).some((f) => f.size > 10 * 1024 * 1024)) {
      setGenError("Each image must be under 10 MB.");
      return;
    }
    setGenError(null);
    try {
      const dataUrls = await Promise.all(
        Array.from(files).map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            })
        )
      );
      // Skip duplicates, and cap the total at MAX_IMAGES
      const newOnes = dataUrls.filter((url) => !images.includes(url));
      const room = MAX_IMAGES - images.length;
      if (room <= 0) {
        setGenError(`You can only upload up to ${MAX_IMAGES} images.`);
        return;
      }
      if (newOnes.length > room) {
        setGenError(`You can only upload up to ${MAX_IMAGES} images.`);
      }
      setImages([...images, ...newOnes.slice(0, room)]);
    } catch {
      setGenError("Couldn't read one of those images. Try different files.");
    }
  }

  // Generate a quiz from all the uploaded images
  async function generateFromImages() {
    if (images.length === 0) {
      setGenError("Please upload at least one photo first");
      return;
    }
    await runGeneration({ images });
  }

  // Switch between the Text and Image tabs — each is its own fresh page,
  // so clear the current quiz and any messages when you switch
  function switchMode(m: "text" | "image") {
    if (m === mode) return;
    setMode(m);
    setQuestions([]);
    setAnswers({});
    setSubmitted(false);
    setGenError(null);
    setToggleError(null);
    setImages([]);
    setFullscreenImage(null);
  }

  // Pull the text out of a PDF in the browser
  async function extractPdfText(file: File): Promise<string> {
    const pdfjsLib = await import("pdfjs-dist");
    // tell pdf.js where its background "worker" file is
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();

    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

    let fullText = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      fullText +=
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ") + "\n";
    }
    return fullText;
  }

  // Read an uploaded document (PDF, Word .docx, or plain text) and make a quiz
  async function handleFile(file: File) {
    if (!gradeYear) {
      setGenError("Choose grade level in settings to generate questions (top left)");
      return;
    }
    const name = file.name.toLowerCase();
    setLoading(true);
    try {
      let extracted = "";

      if (file.type === "application/pdf" || name.endsWith(".pdf")) {
        extracted = await extractPdfText(file);
      } else if (name.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        extracted = (await mammoth.extractRawText({ arrayBuffer })).value;
      } else if (
        file.type.startsWith("text/") ||
        /\.(txt|md|markdown|csv|text|log)$/.test(name)
      ) {
        extracted = await file.text();
      } else {
        setGenError(
          "Unsupported file. Try a PDF, Word (.docx), or text file — or use the Image page for photos."
        );
        return;
      }

      if (!extracted.trim()) {
        setGenError(
          "Couldn't find any text in that file. If it's a scan or photo, use the Image page."
        );
        return;
      }

      setText(extracted);              // show the extracted text in the box
      await generateQuestions(extracted); // and make questions from it
    } catch {
      setGenError("Couldn't read that file. Try a different one.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 40 }}>
      <WhatsNew />

      {/* Fullscreen image viewer — click anywhere to close */}
      {fullscreenImage && (
        <div
          onClick={() => setFullscreenImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 20,
            cursor: "zoom-out"
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullscreenImage}
            alt="Fullscreen"
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        </div>
      )}

      {/* Updates / Support links, fixed at the top-right just left of the "?" */}
      <div
        style={{
          position: "fixed",
          top: 20,
          right: 68, // just left of the 40px "?" at right:20
          display: "flex",
          gap: 8,
          zIndex: 1000
        }}
      >
        {[
          { label: "Updates", href: "/updates" },
          { label: "Support", href: "/support" }
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              height: 40,
              padding: "0 16px",
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 3,
              border: "2px solid #888",
              background: "transparent",
              color: "inherit",
              fontSize: 16,
              textDecoration: "none",
              cursor: "pointer"
            }}
          >
            {link.label}
          </Link>
        ))}
      </div>

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

      {/* Cog settings circle, fixed to the top-left of the screen */}
      <button
        ref={settingsButtonRef}
        onClick={() => setShowSettings((v) => !v)}
        title="Quiz settings"
        style={{
          position: "fixed",
          top: 20,
          left: 20,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "2px solid #888",
          background: "var(--background)",
          color: "inherit",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 1000
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* The settings panel that expands from the cog */}
      {showSettings && (
        <div
          ref={settingsRef}
          style={{
            position: "fixed",
            top: 70,
            left: 20,
            width: 300,
            background: "var(--background)",
            color: "var(--foreground)",
            border: "1px solid #888",
            borderRadius: 3,
            padding: 20,
            boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: 20
          }}
        >
          <div style={{ fontWeight: "bold", fontSize: 18 }}>Settings</div>

          {/* Instant feedback on/off */}
          <div>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
            >
              {/* the real checkbox, hidden — the label still toggles it */}
              <input
                type="checkbox"
                checked={instantFeedback}
                onChange={(e) => {
                  // Locked only DURING the quiz (answered but not yet submitted).
                  // After submitting, answers are already locked, so it's free again.
                  if (hasAnswered && !submitted) {
                    setToggleError(
                      e.target.checked
                        ? "Cannot be enabled; Complete the questions"
                        : "Cannot be disabled; Complete the questions"
                    );
                    return;
                  }
                  setInstantFeedback(e.target.checked);
                  setToggleError(null);
                }}
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
                  background: instantFeedback ? "#1e40af" : "#000",
                  border: "1px solid #999",
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
            {toggleError && (
              <div style={{ marginTop: 6, color: "#dc2626", fontSize: 14 }}>
                {toggleError}
              </div>
            )}
          </div>

          {/* Question amount: pick one of 5 / 10 / 15 / 20 */}
          <div>
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>Questions</div>
            <div style={{ display: "flex", gap: 8 }}>
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

          {/* Difficulty slider: Middle School / High School / University */}
          <div>
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>Difficulty</div>
            <input
              className="difficulty-slider"
              type="range"
              min={0}
              max={2}
              step={1}
              value={difficulty}
              onChange={(e) => {
                setDifficulty(Number(e.target.value));
                setGradeYear(null); // grade options change with the level, so reset the pick
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                marginTop: 4
              }}
            >
              {DIFFICULTIES.map((label, idx) => (
                <span
                  key={label}
                  style={{
                    fontWeight: difficulty === idx ? "bold" : "normal",
                    opacity: difficulty === idx ? 1 : 0.6
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Grade/Year: choices depend on the difficulty level above */}
          <div>
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>
              {difficulty === 2 ? "Year" : "Grade"}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {GRADE_OPTIONS[difficulty].map((g) => (
                <button
                  key={g}
                  onClick={() => {
                    setGradeYear(g);
                    setGenError(null); // grade chosen -> clear the warning
                  }}
                  style={{
                    minWidth: 40,
                    height: 36,
                    padding: "0 10px",
                    borderRadius: 3,
                    border: "2px solid #888",
                    background: gradeYear === g ? "#1e40af" : "transparent",
                    color: gradeYear === g ? "white" : "inherit",
                    fontWeight: gradeYear === g ? "bold" : "normal",
                    cursor: "pointer"
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <h1
        style={{
          textAlign: "center",
          fontWeight: "bold",
          fontSize: 64,
          marginTop: 0,      // sit up near the top edge
          marginBottom: 32   // matches the gap between the tabs and the image button
        }}
      >
        EdForce
      </h1>

      {/* Tab bar: fixed at the top-left, next to the settings cog */}
      <div
        style={{
          position: "fixed",
          top: 20,
          left: 72, // just right of the 40px cog at left:20
          display: "flex",
          gap: 8,
          zIndex: 1000
        }}
      >
        {(["text", "image"] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 3,
              border: "2px solid #888",
              background: mode === m ? "#1e40af" : "transparent",
              color: mode === m ? "white" : "inherit",
              fontWeight: mode === m ? "bold" : "normal",
              fontSize: 16,
              cursor: "pointer",
              textTransform: "capitalize"
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === "text" && (
        <>
      {/* Hidden file picker — PDFs, Word docs, and text files */}
      <input
        type="file"
        accept=".pdf,.docx,.txt,.md,.markdown,.csv,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = ""; // reset so the same file can be picked again
        }}
      />

      {/* "Add document" icon button: a square with a plus in its top-right corner */}
      <button
        onClick={() => fileInputRef.current?.click()}
        title="Upload a document (PDF, Word, or text)"
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
          "Generate"
        )}
      </button>

      {/* Warning shown if you try to generate without picking a grade */}
      {genError && (
        <div style={{ marginTop: 12, color: "#dc2626", fontSize: 15 }}>
          {genError}
        </div>
      )}
        </>
      )}

      {/* Image page: previews fill the left, upload controls stay centered */}
      {mode === "image" && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginTop: 20 }}>
          {/* Left column: uploaded image previews, tiled to fill the space */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",   // multiple per row on the same y-level
              alignContent: "flex-start",
              gap: 12
            }}
          >
            {images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`Upload ${i + 1}`}
                onClick={() => setFullscreenImage(src)}
                style={{
                  maxWidth: 160,
                  maxHeight: 160,
                  border: "2px solid #888",
                  borderRadius: 3,
                  objectFit: "contain",
                  cursor: "pointer" // click to view fullscreen
                }}
              />
            ))}
          </div>

          {/* Center column: upload controls */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: 48 // keep the upload box near the textarea's height
            }}
          >
            {/* Hidden image picker (can select several at once) */}
            <input
              type="file"
              accept="image/*"
              multiple
              ref={imageInputRef}
              style={{ display: "none" }}
              onChange={(e) => {
                addImages(e.target.files);
                e.target.value = ""; // reset so the same files can be picked again
              }}
            />

            {/* Painting box with a plus — click to add photos */}
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={loading}
              title="Add photos"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 96,
                height: 96,
                background: "transparent",
                border: "2px solid #888",
                borderRadius: 3,
                cursor: loading ? "default" : "pointer",
                color: "inherit"
              }}
            >
              <svg
                width="52"
                height="52"
                viewBox="0 0 32 32"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {/* painting frame */}
                <rect x="4" y="7" width="18" height="17" rx="2.5" />
                {/* sun */}
                <circle cx="9.5" cy="12.5" r="1.8" />
                {/* mountains */}
                <path d="M5 21 l4 -5 3 3 3 -4 6 7" />
                {/* plus, floating just off the top-right corner */}
                <line x1="27" y1="3.5" x2="27" y2="9.5" />
                <line x1="24" y1="6.5" x2="30" y2="6.5" />
              </svg>
            </button>

            <p style={{ opacity: 0.7, marginTop: 12 }}>
              Upload photos to generate questions
            </p>

            {/* Generate button (uses all uploaded photos) */}
            <button
              onClick={() => generateFromImages()}
              disabled={loading}
              style={{
                marginTop: 16,
                padding: "10px 24px",
                minWidth: 190,
                height: 44,
                background: "#1e40af",
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
                "Generate"
              )}
            </button>

            {genError && (
              <div style={{ marginTop: 12, color: "#dc2626", fontSize: 15 }}>
                {genError}
              </div>
            )}
          </div>

          {/* Right column: spacer to keep the controls centered */}
          <div style={{ flex: 1 }} />
        </div>
      )}

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
              style={{ marginBottom: 18, padding: 12, borderRadius: 3 }}
            >
              <p
                style={{
                  fontWeight: "bold",
                  fontSize: 18,
                  color: titleColor,
                  marginBottom: 22 // push the answers down, away from the question
                }}
              >
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
