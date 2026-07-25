"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FONTS,
  PALETTES,
  BUTTON_SHAPES,
  QUIZ_STYLES,
  QUESTION_FONTS,
  BUTTONS,
  DEFAULT_THEME,
  applyTheme,
  btnColors,
  boxMetrics,
  loadTheme,
  saveTheme,
  type ButtonId,
  type ThemeChoice
} from "@/lib/theme";

// The dropdown groups, in the order BUTTONS declares them.
const BUTTON_GROUPS = [...new Set(BUTTONS.map((b) => b.group))];

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

  // Which button the "one by one" colour picker is currently pointed at. Purely
  // a UI cursor — nothing about it is saved with the theme.
  const [pickedButton, setPickedButton] = useState<ButtonId>("text");

  useEffect(() => {
    document.title = "Customize — Athenia";
  }, []);

  const paletteAccent = PALETTES.find((p) => p.id === theme.palette) ?? PALETTES[0];
  const pickedName = BUTTONS.find((b) => b.id === pickedButton)?.name ?? "";

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
    borderRadius: "var(--btn-radius, 3px)",
    background: "transparent",
    color: "inherit",
    cursor: "pointer"
  });

  return (
    <main style={{ padding: 40 }}>
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

          <Section title="Button colors">
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {(
                [
                  ["default", "Default"],
                  ["all", "All the same"],
                  ["individual", "One by one"]
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => pick({ buttonColorMode: id })}
                  style={{
                    ...swatchCard(theme.buttonColorMode === id),
                    flex: 1,
                    padding: "12px 0",
                    fontSize: 14
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* One colour for every button: either the palette's own accent or
                a colour picked here. */}
            {theme.buttonColorMode === "all" && (
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  {(
                    [
                      [true, `Match ${paletteAccent.name}`],
                      [false, "Custom color"]
                    ] as const
                  ).map(([usePalette, label]) => (
                    <button
                      key={String(usePalette)}
                      onClick={() => pick({ buttonAllPalette: usePalette })}
                      style={{
                        ...swatchCard(theme.buttonAllPalette === usePalette),
                        flex: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        padding: "11px 0",
                        fontSize: 13
                      }}
                    >
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          border: "1px solid #888",
                          background: usePalette ? paletteAccent.accent : theme.buttonAllColor
                        }}
                      />
                      {label}
                    </button>
                  ))}
                </div>
                {!theme.buttonAllPalette && (
                  <ColorField
                    label="Button color"
                    value={theme.buttonAllColor}
                    onChange={(v) => pick({ buttonAllColor: v })}
                  />
                )}
              </>
            )}

            {/* Per-button: pick a button from the dropdown, then a colour. */}
            {theme.buttonColorMode === "individual" && (
              <>
                <select
                  value={pickedButton}
                  onChange={(e) => setPickedButton(e.target.value as ButtonId)}
                  aria-label="Button to customize"
                  style={{
                    width: "100%",
                    padding: "10px 8px",
                    border: "1px solid #888",
                    borderRadius: "var(--btn-radius, 3px)",
                    background: "var(--background)",
                    color: "inherit",
                    fontSize: 14,
                    cursor: "pointer"
                  }}
                >
                  {BUTTON_GROUPS.map((group) => (
                    <optgroup key={group} label={group}>
                      {BUTTONS.filter((b) => b.group === group).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                          {theme.buttonColors[b.id] ? " •" : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <ColorField
                  label={`${pickedName} color`}
                  value={theme.buttonColors[pickedButton] ?? paletteAccent.accent}
                  onChange={(v) =>
                    pick({ buttonColors: { ...theme.buttonColors, [pickedButton]: v } })
                  }
                />

                {theme.buttonColors[pickedButton] && (
                  <button
                    onClick={() => {
                      const next = { ...theme.buttonColors };
                      delete next[pickedButton];
                      pick({ buttonColors: next });
                    }}
                    style={{
                      marginTop: 10,
                      padding: "7px 14px",
                      border: "1px solid #888",
                      borderRadius: "var(--btn-radius, 3px)",
                      background: "transparent",
                      color: "inherit",
                      fontSize: 13,
                      cursor: "pointer",
                      opacity: 0.8
                    }}
                  >
                    Reset {pickedName}
                  </button>
                )}
              </>
            )}
          </Section>

          <Section title="Question font">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {QUESTION_FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => pick({ questionFont: f.id })}
                  style={{
                    ...swatchCard(theme.questionFont === f.id),
                    padding: "12px 0",
                    fontSize: 14,
                    fontFamily: f.css || "inherit"
                  }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Question box">
            <div style={{ display: "flex", gap: 8, marginBottom: theme.questionBox ? 14 : 0 }}>
              {[
                ["Off", false],
                ["On", true]
              ].map(([label, on]) => (
                <button
                  key={String(label)}
                  onClick={() => pick({ questionBox: on as boolean })}
                  style={{
                    ...swatchCard(theme.questionBox === on),
                    flex: 1,
                    padding: "12px 0",
                    fontSize: 14
                  }}
                >
                  {label as string}
                </button>
              ))}
            </div>

            {/* Size and fill only mean anything once there's a box to size/fill. */}
            {theme.questionBox && (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 13,
                    opacity: 0.6,
                    marginBottom: 6
                  }}
                >
                  <span>Box size</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {boxMetrics(theme.questionBoxSize).width}px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={theme.questionBoxSize}
                  onChange={(e) => pick({ questionBoxSize: Number(e.target.value) })}
                  aria-label="Question box size"
                  style={{ width: "100%", accentColor: BLUE, cursor: "pointer" }}
                />
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 14,
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="color"
                    value={theme.questionBoxFill}
                    onChange={(e) => pick({ questionBoxFill: e.target.value })}
                    style={{
                      width: 40,
                      height: 32,
                      padding: 0,
                      border: "1px solid #888",
                      borderRadius: "var(--btn-radius, 3px)",
                      background: "transparent",
                      cursor: "pointer"
                    }}
                  />
                  <span style={{ fontSize: 14 }}>Inside the box</span>
                </label>
              </>
            )}
          </Section>

          <Section title="Question layout">
            <div style={{ display: "flex", gap: 8 }}>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => pick({ questionColumns: n })}
                  style={{
                    ...swatchCard(theme.questionColumns === n),
                    flex: 1,
                    padding: "12px 0 10px",
                    fontSize: 14
                  }}
                >
                  {/* n columns of stacked rows, previewing the flow */}
                  <span
                    style={{
                      display: "flex",
                      gap: 4,
                      width: 46,
                      height: 22,
                      margin: "0 auto 8px"
                    }}
                  >
                    {Array.from({ length: n }).map((_, c) => (
                      <span
                        key={c}
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          gap: 3
                        }}
                      >
                        <span style={{ flex: 1, background: "#888", borderRadius: 1 }} />
                        <span style={{ flex: 1, background: "#888", borderRadius: 1 }} />
                      </span>
                    ))}
                  </span>
                  {n === 1 ? "1 column" : `${n} columns`}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>
              Wide screens only — phones always use one column.
            </div>
          </Section>

          <Section title="Folder color (Quiz History)">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ColorField
                label="Folder icon"
                value={theme.folderColor || "#ededed"}
                onChange={(v) => pick({ folderColor: v })}
              />
              {theme.folderColor && (
                <button
                  onClick={() => pick({ folderColor: "" })}
                  style={{
                    marginTop: 12,
                    padding: "7px 14px",
                    border: "1px solid #888",
                    borderRadius: "var(--btn-radius, 3px)",
                    background: "transparent",
                    color: "inherit",
                    fontSize: 13,
                    cursor: "pointer",
                    opacity: 0.8
                  }}
                >
                  Default
                </button>
              )}
            </div>
          </Section>

          <Section title="Gate colors (True/False game)">
            <div style={{ display: "flex", gap: 20 }}>
              {(
                [
                  ["gateTrue", "True gate"],
                  ["gateFalse", "False gate"]
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                >
                  <input
                    type="color"
                    value={theme[key]}
                    onChange={(e) => pick({ [key]: e.target.value })}
                    style={{
                      width: 40,
                      height: 32,
                      padding: 0,
                      border: "1px solid #888",
                      borderRadius: "var(--btn-radius, 3px)",
                      background: "transparent",
                      cursor: "pointer"
                    }}
                  />
                  <span style={{ fontSize: 14 }}>{label}</span>
                </label>
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
              borderRadius: "var(--btn-radius, 3px)",
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
            borderRadius: "var(--btn-radius, 3px)",
            padding: 20
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 14 }}>Preview</div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            <span
              style={{
                padding: "10px 22px",
                ...btnColors("generate", { width: 0, bg: BLUE, text: "#0f172a" }),
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
                ...btnColors("rechallenge", { text: "#e9a05c", border: "#a9773f" }),
                fontWeight: "bold",
                fontSize: 15,
                borderRadius: "var(--btn-radius, 3px)"
              }}
            >
              Rechallenge
            </span>
          </div>

          {/* Mock quiz — reads the same box vars the real questions do, so the
              border, fill and padding preview live. Width is capped by the panel
              rather than by --qbox-width; the slider shows the real number. */}
          <div
            style={{
              padding: "var(--qbox-pad, 12px)",
              border: "var(--qbox-border, none)",
              background: "var(--qbox-fill, transparent)",
              borderRadius: "var(--btn-radius, 3px)",
              fontFamily: "var(--q-font, inherit)",
              margin: "0 -12px"
            }}
          >
          <div
            style={{
              fontWeight: "bold",
              fontSize: 16,
              marginBottom: 14
            }}
          >
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
      </div>
    </main>
  );
}

function ColorField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      style={{ display: "inline-flex", alignItems: "center", gap: 10, marginTop: 12, cursor: "pointer" }}
    >
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 40,
          height: 32,
          padding: 0,
          border: "1px solid #888",
          borderRadius: "var(--btn-radius, 3px)",
          background: "transparent",
          cursor: "pointer"
        }}
      />
      <span style={{ fontSize: 14 }}>{label}</span>
    </label>
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
