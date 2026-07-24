// Athenia customization: fonts, colour palettes, button shape, and quiz look,
// chosen on the /customize page. Stored in localStorage and applied as CSS
// variables / body font, so every page picks them up. ThemeLoader applies the
// saved theme on each page load (before first paint).

export type ThemeChoice = {
  font: FontId;
  palette: PaletteId;
  buttonShape: ButtonShapeId;
  quizStyle: QuizStyleId;
};

export const FONTS = [
  // All three are already bundled by app/layout.tsx as CSS variables — no new
  // font downloads, no layout shift.
  { id: "inter", name: "Inter", css: "var(--font-inter), Arial, Helvetica, sans-serif" },
  { id: "playfair", name: "Playfair", css: "var(--font-playfair), Georgia, serif" },
  { id: "mono", name: "Mono", css: "var(--font-geist-mono), Consolas, monospace" }
] as const;
export type FontId = (typeof FONTS)[number]["id"];

export const PALETTES = [
  // Dark-tinted only for now: lots of the app's fixed grays (#888 borders,
  // #c7c7c7 answers, white back-arrows) assume a dark backdrop. Light themes
  // need a contrast pass first.
  { id: "midnight", name: "Midnight", bg: "#000000", fg: "#ededed" },
  { id: "slate", name: "Slate", bg: "#0f172a", fg: "#e2e8f0" },
  { id: "abyss", name: "Abyss", bg: "#020617", fg: "#dbeafe" },
  { id: "forest", name: "Forest", bg: "#09120c", fg: "#dcefe2" },
  { id: "mocha", name: "Mocha", bg: "#140f0b", fg: "#efe6dc" },
  { id: "plum", name: "Plum", bg: "#120915", fg: "#ecdff0" }
] as const;
export type PaletteId = (typeof PALETTES)[number]["id"];

// Button corner style, applied app-wide via the --btn-radius CSS variable.
// Buttons that opt in read `var(--btn-radius)` instead of a hard-coded 3.
export const BUTTON_SHAPES = [
  { id: "square", name: "Square", radius: "0px" },
  { id: "sharp", name: "Sharp", radius: "3px" },
  { id: "rounded", name: "Rounded", radius: "10px" }
] as const;
export type ButtonShapeId = (typeof BUTTON_SHAPES)[number]["id"];

// How quiz question cards and their answer options look. Drives --quiz-radius
// (option corners) and --quiz-gap (space between options); the quiz reads both.
export const QUIZ_STYLES = [
  { id: "boxed", name: "Boxed", radius: "3px", gap: "10px" },
  { id: "soft", name: "Soft", radius: "12px", gap: "12px" },
  { id: "compact", name: "Compact", radius: "3px", gap: "4px" }
] as const;
export type QuizStyleId = (typeof QUIZ_STYLES)[number]["id"];

export const DEFAULT_THEME: ThemeChoice = {
  font: "inter",
  palette: "midnight",
  buttonShape: "sharp",
  quizStyle: "boxed"
};

const KEY = "atheniaTheme";

function pick<T extends { id: string }>(list: readonly T[], id: unknown, fallback: T["id"]): T["id"] {
  return list.some((x) => x.id === id) ? (id as T["id"]) : fallback;
}

export function loadTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_THEME };
    const t = JSON.parse(raw);
    return {
      font: pick(FONTS, t.font, DEFAULT_THEME.font),
      palette: pick(PALETTES, t.palette, DEFAULT_THEME.palette),
      buttonShape: pick(BUTTON_SHAPES, t.buttonShape, DEFAULT_THEME.buttonShape),
      quizStyle: pick(QUIZ_STYLES, t.quizStyle, DEFAULT_THEME.quizStyle)
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function saveTheme(t: ThemeChoice) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // storage unavailable — theme just won't persist
  }
}

// Write the choice into the live page: palette overrides the CSS variables the
// whole app already reads; font swaps the body font stack; button shape and
// quiz style publish CSS variables that opted-in elements consume.
export function applyTheme(t: ThemeChoice) {
  const palette = PALETTES.find((p) => p.id === t.palette) ?? PALETTES[0];
  const font = FONTS.find((f) => f.id === t.font) ?? FONTS[0];
  const shape = BUTTON_SHAPES.find((b) => b.id === t.buttonShape) ?? BUTTON_SHAPES[0];
  const quiz = QUIZ_STYLES.find((q) => q.id === t.quizStyle) ?? QUIZ_STYLES[0];
  const root = document.documentElement;

  if (t.palette === DEFAULT_THEME.palette) {
    // Default: clear the overrides so the stock light/dark CSS rules apply.
    root.style.removeProperty("--background");
    root.style.removeProperty("--foreground");
  } else {
    root.style.setProperty("--background", palette.bg);
    root.style.setProperty("--foreground", palette.fg);
  }
  document.body.style.fontFamily = t.font === DEFAULT_THEME.font ? "" : font.css;

  root.style.setProperty("--btn-radius", shape.radius);
  root.style.setProperty("--quiz-radius", quiz.radius);
  root.style.setProperty("--quiz-gap", quiz.gap);
}
