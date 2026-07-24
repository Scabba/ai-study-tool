"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DEFAULT_GATE_TRUE, DEFAULT_GATE_FALSE } from "@/lib/theme";

// Reads a live CSS variable (set by ThemeLoader from the saved theme), falling
// back to the default. Used for gate colours so they follow /customize.
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

type TFQuestion = { statement: string; truth: boolean };

// A game banner on the menu.
function Banner({
  title,
  subtitle,
  disabled,
  onClick
}: {
  title: string;
  subtitle: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 6,
        width: "100%",
        minHeight: 110,
        padding: "20px 24px",
        textAlign: "left",
        border: "2px solid #888",
        borderRadius: "var(--btn-radius, 3px)",
        background: "transparent",
        color: "inherit",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1
      }}
    >
      <span style={{ fontSize: 22, fontWeight: "bold" }}>{title}</span>
      <span style={{ fontSize: 14, opacity: 0.7 }}>{subtitle}</span>
    </button>
  );
}

export default function GamesPage() {
  const [game, setGame] = useState<null | "true-false">(null);

  useEffect(() => {
    document.title = "Games — Athenia";
  }, []);

  return (
    <main style={{ padding: 40, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ position: "relative", marginBottom: 28 }}>
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
        <h1 style={{ textAlign: "center", fontWeight: "bold", fontSize: 40, margin: 0 }}>
          Games
        </h1>
      </div>

      {game === "true-false" ? (
        <TrueFalseGame onExit={() => setGame(null)} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Banner
            title="True / False"
            subtitle="Run your angels through the gate that matches the statement."
            onClick={() => setGame("true-false")}
          />
          <Banner title="Type Master" subtitle="Coming soon." disabled />
          <Banner title="Coming soon" subtitle="A third game is on the way." disabled />
        </div>
      )}
    </main>
  );
}

// --- True/False "Gate Runner" ------------------------------------------------

const GATE_MS = 3000; // ms per gate (spawn -> reach the Athenias)
const START_ANGELS = 3;
const REWARD = 1; // right gate
const PENALTY = -2; // wrong gate

type Phase = "start" | "loading" | "playing" | "over";

function TrueFalseGame({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>("start");
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(10);
  const [leftKey, setLeftKey] = useState("a");
  const [rightKey, setRightKey] = useState("d");
  const [error, setError] = useState<string | null>(null);

  // Gate colours, read live so they follow the customize page. Read once on
  // mount (ThemeLoader has applied the saved theme by then).
  const [colors, setColors] = useState({ t: DEFAULT_GATE_TRUE, f: DEFAULT_GATE_FALSE });
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the applied CSS vars */
    setColors({ t: cssVar("--gate-true", DEFAULT_GATE_TRUE), f: cssVar("--gate-false", DEFAULT_GATE_FALSE) });
  }, []);

  const [questions, setQuestions] = useState<TFQuestion[]>([]);
  const [angels, setAngels] = useState(START_ANGELS);
  const [index, setIndex] = useState(0);
  const [lane, setLane] = useState<0 | 1>(0); // 0 = left (true), 1 = right (false)
  const [gateY, setGateY] = useState(0); // 0 (top) -> 1 (at the angels)
  const [flash, setFlash] = useState<null | "right" | "wrong">(null);

  // Refs mirror state for the animation loop (which shouldn't re-subscribe).
  const laneRef = useRef(lane);
  const angelsRef = useRef(angels);
  const rafRef = useRef<number>(0);
  const gateStartRef = useRef(0);
  useEffect(() => {
    laneRef.current = lane;
  }, [lane]);
  useEffect(() => {
    angelsRef.current = angels;
  }, [angels]);

  // Fetch the true/false statements for the game.
  async function start() {
    if (!prompt.trim()) {
      setError("Paste something to play with.");
      return;
    }
    setError(null);
    setPhase("loading");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt, count: 0, tfCount: count, writtenCount: 0, level: "" })
      });
      const text = await res.text();
      const qs: TFQuestion[] = [];
      let apiError: string | null = null;
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const o = JSON.parse(line);
          if (o.type === "tf" && typeof o.question === "string") {
            qs.push({ statement: o.question, truth: String(o.answer).toLowerCase() === "true" });
          } else if (typeof o.error === "string") {
            apiError = o.error; // rate limit, gibberish, etc.
          }
        } catch {
          // skip malformed lines
        }
      }
      if (qs.length === 0) {
        setPhase("start");
        // Surface the real reason (daily limit, sign-in needed, unusable notes).
        setError(apiError ?? "Couldn't make questions from that. Try different notes.");
        return;
      }
      setQuestions(qs);
      setAngels(START_ANGELS);
      setIndex(0);
      setLane(0);
      setGateY(0);
      setPhase("playing");
    } catch {
      setPhase("start");
      setError("Something went wrong starting the game.");
    }
  }

  // Resolve the current gate: reward the matching lane, penalise the other.
  const resolveGate = useCallback(
    (i: number) => {
      const q = questions[i];
      if (!q) return;
      // Left lane (blue) answers "true", right lane (red) answers "false".
      const correct = (laneRef.current === 0) === q.truth;
      setFlash(correct ? "right" : "wrong");
      setTimeout(() => setFlash(null), 500);
      const next = Math.max(0, angelsRef.current + (correct ? REWARD : PENALTY));
      setAngels(next);
      if (next <= 0) {
        setPhase("over");
        return;
      }
      if (i + 1 >= questions.length) {
        setPhase("over");
        return;
      }
      setIndex(i + 1);
      setGateY(0);
      gateStartRef.current = 0; // restart the timer for the next gate
    },
    [questions]
  );

  // The gate animation loop — advances the current gate from top to the angels
  // over GATE_MS, then resolves it.
  useEffect(() => {
    if (phase !== "playing") return;
    let resolvedFor = -1;
    function tick(now: number) {
      if (!gateStartRef.current) gateStartRef.current = now;
      const p = Math.min(1, (now - gateStartRef.current) / GATE_MS);
      setGateY(p);
      if (p >= 1 && resolvedFor !== index) {
        resolvedFor = index;
        resolveGate(index);
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    gateStartRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, index, resolveGate]);

  // Keyboard: move between lanes with the chosen keys (+ arrows always work).
  useEffect(() => {
    if (phase !== "playing") return;
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === leftKey || e.key === "ArrowLeft") setLane(0);
      else if (k === rightKey || e.key === "ArrowRight") setLane(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, leftKey, rightKey]);

  // --- Start screen ---------------------------------------------------------
  if (phase === "start" || phase === "loading") {
    const box: React.CSSProperties = {
      width: 90,
      height: 44,
      borderRadius: "var(--btn-radius, 3px)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "bold",
      color: "#0f172a"
    };
    return (
      <div>
        <button
          onClick={onExit}
          style={{
            marginBottom: 16,
            padding: "6px 12px",
            border: "1px solid #888",
            borderRadius: "var(--btn-radius, 3px)",
            background: "transparent",
            color: "inherit",
            fontSize: 13,
            cursor: "pointer"
          }}
        >
          ← Games
        </button>
        <h2 style={{ fontSize: 24, fontWeight: "bold", margin: "0 0 4px" }}>True / False</h2>
        <p style={{ opacity: 0.7, marginTop: 0 }}>
          Read the statement, then run your angels into the gate that matches.
        </p>

        {/* Colour example — shows meaning by colour, never by the word */}
        <div style={{ display: "flex", gap: 14, alignItems: "center", margin: "16px 0" }}>
          <span style={{ ...box, background: colors.t }}>True</span>
          <span style={{ ...box, background: colors.f }}>False</span>
        </div>
        <p style={{ fontSize: 13, opacity: 0.7, marginTop: -6 }}>
          Customize gate colors through the customization page!
        </p>

        <div style={{ fontSize: 13, opacity: 0.6, margin: "18px 0 6px" }}>Paste your notes</div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Paste text to turn into true/false gates…"
          rows={4}
          style={{
            width: "100%",
            padding: 10,
            fontSize: 15,
            fontFamily: "inherit",
            background: "transparent",
            color: "inherit",
            border: "1px solid #888",
            borderRadius: "var(--quiz-radius, 3px)",
            outline: "none",
            resize: "vertical"
          }}
        />

        <div style={{ fontSize: 13, opacity: 0.6, margin: "18px 0 6px" }}>Questions</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[5, 10, 15, 20].map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              style={{
                width: 44,
                height: 36,
                borderRadius: "var(--btn-radius, 3px)",
                border: "2px solid #888",
                background: count === n ? "#7dd3fc" : "transparent",
                color: count === n ? "#0f172a" : "inherit",
                fontWeight: count === n ? "bold" : "normal",
                cursor: "pointer"
              }}
            >
              {n}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 13, opacity: 0.6, margin: "18px 0 6px" }}>Controls</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <KeyField label="Move left" value={leftKey} onChange={setLeftKey} />
          <KeyField label="Move right" value={rightKey} onChange={setRightKey} />
        </div>
        <p style={{ fontSize: 12, opacity: 0.55, marginTop: 8 }}>
          Arrow keys always work too. Left gate = matches a true statement; right gate = matches a false one.
        </p>

        {error && <div style={{ color: "#e0776b", fontSize: 14, marginTop: 12 }}>{error}</div>}

        <button
          onClick={start}
          disabled={phase === "loading"}
          style={{
            marginTop: 18,
            padding: "12px 28px",
            border: "none",
            borderRadius: "var(--btn-radius, 3px)",
            background: "#57b98a",
            color: "white",
            fontWeight: "bold",
            fontSize: 16,
            cursor: phase === "loading" ? "default" : "pointer"
          }}
        >
          {phase === "loading" ? (
            <span className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
          ) : (
            "Start"
          )}
        </button>
      </div>
    );
  }

  // --- Game over ------------------------------------------------------------
  if (phase === "over") {
    const survived = angels > 0;
    return (
      <div style={{ textAlign: "center", paddingTop: 20 }}>
        <div style={{ fontSize: 48 }}>{survived ? "😇" : "💀"}</div>
        <h2 style={{ fontSize: 26, fontWeight: "bold", margin: "8px 0" }}>
          {survived ? "You made it!" : "Your Athenias fell"}
        </h2>
        <p style={{ opacity: 0.75 }}>
          {survived
            ? `You finished with ${angels} Athenia${angels === 1 ? "" : "s"}.`
            : "Try again with fresh notes."}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
          <button
            onClick={() => setPhase("start")}
            style={{
              padding: "10px 22px",
              border: "none",
              borderRadius: "var(--btn-radius, 3px)",
              background: "#57b98a",
              color: "white",
              fontWeight: "bold",
              fontSize: 15,
              cursor: "pointer"
            }}
          >
            Play again
          </button>
          <button
            onClick={onExit}
            style={{
              padding: "10px 22px",
              border: "1px solid #888",
              borderRadius: "var(--btn-radius, 3px)",
              background: "transparent",
              color: "inherit",
              fontSize: 15,
              cursor: "pointer"
            }}
          >
            Games
          </button>
        </div>
      </div>
    );
  }

  // --- Playing --------------------------------------------------------------
  const q = questions[index];
  const flashGlow =
    flash === "right"
      ? "0 0 0 2px #57b98a, 0 0 26px rgba(87,185,138,0.55)"
      : flash === "wrong"
        ? "0 0 0 2px #e0776b, 0 0 26px rgba(224,119,107,0.55)"
        : "none";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: "bold", fontSize: 17 }}>
          <AthenaIcon size={22} />
          <span>Athenias × {angels}</span>
        </span>
        <span style={{ opacity: 0.55, fontVariantNumeric: "tabular-nums" }}>
          {index + 1} / {questions.length}
        </span>
      </div>

      {/* Statement above the gate — FIXED height so it never reflows the field */}
      <div
        style={{
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontWeight: "bold",
          fontSize: 18,
          lineHeight: 1.25,
          padding: "0 12px",
          marginBottom: 10,
          overflow: "hidden"
        }}
      >
        {q?.statement}
      </div>

      {/* Playfield — fixed size; a deep panel with a lane divider and a floor */}
      <div
        style={{
          position: "relative",
          height: 400,
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #2a2f3a",
          background: "linear-gradient(180deg, #0b0e14 0%, #131824 100%)",
          boxShadow: flashGlow,
          transition: "box-shadow 0.15s"
        }}
      >
        {/* faint lane tints + centre divider */}
        <div style={{ position: "absolute", inset: 0, display: "flex", pointerEvents: "none" }}>
          <div style={{ flex: 1, background: hexToRgba(colors.t, 0.05) }} />
          <div style={{ flex: 1, background: hexToRgba(colors.f, 0.05) }} />
        </div>
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "50%",
            width: 2,
            marginLeft: -1,
            background: "rgba(255,255,255,0.06)",
            pointerEvents: "none"
          }}
        />

        {/* The two gates, descending together — rounded, glowing bars */}
        <div
          style={{
            position: "absolute",
            top: `calc(${gateY * 100}% - 52px)`,
            left: 0,
            right: 0,
            height: 52,
            display: "flex",
            gap: 8,
            padding: "0 8px",
            boxSizing: "border-box"
          }}
        >
          <Gate color={colors.t} />
          <Gate color={colors.f} />
        </div>

        {/* Athenias — stacked vertically at the bottom of their lane */}
        <div
          style={{
            position: "absolute",
            bottom: 14,
            left: lane === 0 ? "25%" : "75%",
            transform: "translateX(-50%)",
            transition: "left 0.11s ease-out",
            display: "flex",
            flexDirection: "column-reverse",
            alignItems: "center"
          }}
        >
          {Array.from({ length: Math.min(angels, 6) }).map((_, i) => (
            <div key={i} style={{ marginTop: i === 0 ? 0 : -14 }}>
              <AthenaIcon size={38} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <button onMouseDown={() => setLane(0)} style={laneBtn}>
          ◀ {leftKey.toUpperCase()}
        </button>
        <button onMouseDown={() => setLane(1)} style={laneBtn}>
          {rightKey.toUpperCase()} ▶
        </button>
      </div>
    </div>
  );
}

// A single glowing gate bar.
function Gate({ color }: { color: string }) {
  return (
    <div
      style={{
        flex: 1,
        borderRadius: 8,
        background: `linear-gradient(180deg, ${color} 0%, ${hexToRgba(color, 0.75)} 100%)`,
        border: "2px solid rgba(255,255,255,0.65)",
        boxShadow: `0 0 18px ${hexToRgba(color, 0.6)}, inset 0 0 12px rgba(255,255,255,0.25)`,
        boxSizing: "border-box"
      }}
    />
  );
}

// A low-poly, black-and-white "Athenia" (winged figure), faceted for a
// polygonal look rather than a flat silhouette.
function AthenaIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 52" aria-hidden="true">
      {/* halo */}
      <ellipse cx="24" cy="5" rx="6.5" ry="2.2" fill="none" stroke="#111" strokeWidth="1.4" />
      {/* left wing (two facets) */}
      <polygon points="24,22 5,11 11,29" fill="#ffffff" stroke="#111" strokeWidth="1" />
      <polygon points="24,22 11,29 24,31" fill="#c9c9c9" stroke="#111" strokeWidth="0.8" />
      {/* right wing (two facets) */}
      <polygon points="24,22 43,11 37,29" fill="#ffffff" stroke="#111" strokeWidth="1" />
      <polygon points="24,22 37,29 24,31" fill="#a9a9a9" stroke="#111" strokeWidth="0.8" />
      {/* head */}
      <polygon points="24,8 28,14 20,14" fill="#ffffff" stroke="#111" strokeWidth="1" />
      {/* robe/body (faceted) */}
      <polygon points="24,15 32,46 24,44" fill="#ededed" stroke="#111" strokeWidth="1" />
      <polygon points="24,15 24,44 16,46" fill="#bdbdbd" stroke="#111" strokeWidth="1" />
    </svg>
  );
}

// #rgb / #rrggbb -> rgba() with the given alpha.
function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const laneBtn: React.CSSProperties = {
  padding: "10px 24px",
  border: "1px solid #888",
  borderRadius: "var(--btn-radius, 3px)",
  background: "transparent",
  color: "inherit",
  fontSize: 15,
  cursor: "pointer"
};

function KeyField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "inline-flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <input
        value={value}
        maxLength={1}
        onChange={(e) => onChange((e.target.value || "a").toLowerCase())}
        style={{
          width: 54,
          height: 36,
          textAlign: "center",
          textTransform: "uppercase",
          fontWeight: "bold",
          background: "transparent",
          color: "inherit",
          border: "1px solid #888",
          borderRadius: "var(--btn-radius, 3px)",
          outline: "none"
        }}
      />
    </label>
  );
}
