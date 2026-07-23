"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FONTS,
  PALETTES,
  BUTTON_SHAPES,
  QUIZ_STYLES,
  DEFAULT_THEME,
  applyTheme,
  loadTheme,
  saveTheme,
  type ThemeChoice
} from "@/lib/theme";

const BLUE = "#7dd3fc";

// The customization screen: font, palette, button shape and quiz look, each
// applied live (and persisted) as it's picked, with a preview that shows the
// buttons and a mock quiz reacting in real time.
export default function CustomizePage() {
  // Read the saved theme lazily (client-only; SSR gets the default and the
  // first client render corrects it — no setState-in-effect needed).
  const [theme, setTheme] = useState<ThemeChoice>(() =>
    typeof window === "undefined" ? DEFAULT_THEME : loadTheme()
  );

  useEffect(() => {
    document.title = "Customize — Athenia";
  }, []);

  function pick(patch: Partial<ThemeChoice>) {
    setTheme((prev) => {
      const next = { ...prev, ...patch };
      applyTheme(next);
      saveTheme(next);
      return next;
    });
  }

  const swatchCard = (selected: boolean): React.CSSProperties => ({
    border: selected ? `2px solid ${BLUE}` : "1px solid #888",
    borderRadius: 3,
    background: "transparent",
    color: "inherit",
    cursor: "pointer"
  });

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
          Customize
        </h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 320px)",
          gap: 28,
          alignItems: "start"
        }}
      >
        {/* --- Controls --------------------------------------------------- */}
        <div>
          <Section title="Font">
            <div style={{ display: "flex", gap: 8 }}>
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => pick({ font: f.id })}
                  style={{
                    ...swatchCard(theme.font === f.id),
                    flex: 1,
                    padding: "12px 0",
                    fontSize: 15,
                    fontFamily: f.css
                  }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Palette">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {PALETTES.map((pal) => (
                <button
                  key={pal.id}
                  onClick={() => pick({ palette: pal.id })}
                  style={{
                    ...swatchCard(theme.palette === pal.id),
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    padding: "12px 0 9px"
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 4,
                      background: pal.bg,
                      border: "1px solid #888",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: pal.fg }} />
                  </span>
                  <span style={{ fontSize: 12 }}>{pal.name}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Button shape">
            <div style={{ display: "flex", gap: 8 }}>
              {BUTTON_SHAPES.map((b) => (
                <button
                  key={b.id}
                  onClick={() => pick({ buttonShape: b.id })}
                  style={{
                    ...swatchCard(theme.buttonShape === b.id),
                    flex: 1,
                    padding: "12px 0",
                    fontSize: 14
                  }}
                >
                  {/* A little pill previewing the shape */}
                  <span
                    style={{
                      display: "block",
                      margin: "0 auto 8px",
                      width: 46,
                      height: 18,
                      background: BLUE,
                      borderRadius: b.radius
                    }}
                  />
                  {b.name}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Quiz look">
            <div style={{ display: "flex", gap: 8 }}>
              {QUIZ_STYLES.map((q) => (
                <button
                  key={q.id}
                  onClick={() => pick({ quizStyle: q.id })}
                  style={{
                    ...swatchCard(theme.quizStyle === q.id),
                    flex: 1,
                    padding: "12px 0 10px",
                    fontSize: 14
                  }}
                >
                  {/* Three rows previewing the option density/rounding */}
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: q.gap === "4px" ? 3 : q.gap === "12px" ? 7 : 5,
                      width: 46,
                      margin: "0 auto 8px"
                    }}
                  >
                    {[0, 1, 2].map((n) => (
                      <span
                        key={n}
                        style={{ height: 6, background: "#888", borderRadius: q.radius }}
                      />
                    ))}
                  </span>
                  {q.name}
                </button>
              ))}
            </div>
          </Section>

          <button
            onClick={() => pick({ ...DEFAULT_THEME })}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "10px 0",
              border: "1px solid #888",
              borderRadius: 3,
              background: "transparent",
              color: "inherit",
              fontSize: 13,
              cursor: "pointer",
              opacity: 0.8
            }}
          >
            Reset to default
          </button>
        </div>

        {/* --- Live preview ---------------------------------------------- */}
        <div
          style={{
            position: "sticky",
            top: 20,
            border: "1px solid #888",
            borderRadius: 3,
            padding: 20
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 14 }}>Preview</div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            <span
              style={{
                padding: "10px 22px",
                background: BLUE,
                color: "#0f172a",
                fontWeight: "bold",
                fontSize: 15,
                borderRadius: "var(--btn-radius, 3px)"
              }}
            >
              Generate
            </span>
            <span
              style={{
                padding: "10px 20px",
                background: "transparent",
                color: "#e9a05c",
                fontWeight: "bold",
                fontSize: 15,
                border: "2px solid #a9773f",
                borderRadius: "var(--btn-radius, 3px)"
              }}
            >
              Rechallenge
            </span>
          </div>

          {/* Mock quiz */}
          <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 14 }}>
            1. What powers photosynthesis?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--quiz-gap, 10px)" }}>
            {[
              ["A", "Sunlight", true],
              ["B", "Moonlight", false],
              ["C", "Static electricity", false],
              ["D", "Heat from the core", false]
            ].map(([letter, text, correct]) => (
              <span
                key={letter as string}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "fit-content" }}
              >
                <span
                  style={{
                    width: 13,
                    height: 13,
                    flexShrink: 0,
                    borderRadius: "50%",
                    border: correct ? "none" : "2px solid #888",
                    background: correct ? "#57b98a" : "transparent"
                  }}
                />
                <span style={{ color: "#c7c7c7", fontSize: 15 }}>
                  {letter}. {text}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
