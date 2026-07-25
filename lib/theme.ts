// Athenia customization: fonts, colour palettes, button shape, and quiz look,
// chosen on the /customize page. Stored in localStorage and applied as CSS
// variables / body font, so every page picks them up. ThemeLoader applies the
// saved theme on each page load (before first paint).

export type ThemeChoice = {
  font: FontId;
  palette: PaletteId;
  buttonShape: ButtonShapeId;
  quizStyle: QuizStyleId;
  gateTrue: string; // True/False game: the "true" gate colour
  gateFalse: string; // ...and the "false" gate colour
  questionBox: boolean; // draw a bordered, filled box around every question
  questionBoxFill: string; // ...and the colour inside it
  questionBoxSize: number; // 0-100 -> box width + padding (see boxMetrics)
  questionFont: QuestionFontId; // font for the question text and its answers
  questionColumns: number; // 1-3 columns of questions (desktop only)
  folderColor: string; // Quiz History folder icons; "" = inherit the text colour
  buttonColorMode: ButtonColorMode;
  buttonAllPalette: boolean; // "all" mode: true = use the palette's accent...
  buttonAllColor: string; // ...false = use this custom colour
  buttonColors: Partial<Record<ButtonId, string>>; // "individual" mode
};

// Defaults for the True/False game gates — Athenia's light blue / muted red.
export const DEFAULT_GATE_TRUE = "#7dd3fc";
export const DEFAULT_GATE_FALSE = "#e0776b";

// Only accept a #rrggbb / #rgb hex so a bad stored value can't inject CSS.
function safeHex(v: unknown, fallback: string): string {
  return typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : fallback;
}

// Slider positions are clamped to 0-100 so a hand-edited value can't blow the
// layout out past the page.
function safeSize(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback;
}

// Keep only entries that name a real button and hold a real hex — anything else
// in storage is dropped rather than written into a CSS variable.
function safeButtonColors(v: unknown): Partial<Record<ButtonId, string>> {
  const out: Partial<Record<ButtonId, string>> = {};
  if (!v || typeof v !== "object") return out;
  const src = v as Record<string, unknown>;
  for (const b of BUTTONS) {
    const c = src[b.id];
    if (typeof c === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) out[b.id] = c;
  }
  return out;
}

// #rgb / #rrggbb -> rgba(), for the translucent button fill.
function tint(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

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
  // `accent` is the palette's own button colour — what "match my palette" means
  // in the button-colour picker.
  { id: "midnight", name: "Midnight", bg: "#000000", fg: "#ededed", accent: "#94a3b8" },
  { id: "slate", name: "Slate", bg: "#0f172a", fg: "#e2e8f0", accent: "#94a3b8" },
  { id: "abyss", name: "Abyss", bg: "#020617", fg: "#dbeafe", accent: "#7dd3fc" },
  { id: "forest", name: "Forest", bg: "#09120c", fg: "#dcefe2", accent: "#6ee7b7" },
  { id: "mocha", name: "Mocha", bg: "#140f0b", fg: "#efe6dc", accent: "#d6b48c" },
  { id: "plum", name: "Plum", bg: "#120915", fg: "#ecdff0", accent: "#c9a0d8" }
] as const;
export type PaletteId = (typeof PALETTES)[number]["id"];

// Every button the colour picker can target, grouped the way the dropdown lists
// them. Adding one here + a `...btnColors("id")` spread at the call site is all
// it takes to make a new button customisable.
export const BUTTONS = [
  { id: "text", name: "Text", group: "Navigation" },
  { id: "image", name: "Image", group: "Navigation" },
  { id: "audio", name: "Audio", group: "Navigation" },
  { id: "games", name: "Games", group: "Navigation" },
  { id: "updates", name: "Updates", group: "Navigation" },
  { id: "support", name: "Support", group: "Navigation" },
  { id: "settings", name: "Quiz settings", group: "Toolbar" },
  { id: "stats", name: "Stats", group: "Toolbar" },
  { id: "customize", name: "Customize", group: "Toolbar" },
  { id: "history", name: "Quiz history", group: "Toolbar" },
  { id: "account", name: "Account", group: "Toolbar" },
  { id: "help", name: "Help", group: "Toolbar" },
  { id: "generate", name: "Generate", group: "Quiz" },
  { id: "clear", name: "Clear quiz", group: "Quiz" },
  { id: "submit", name: "Submit", group: "Quiz" },
  { id: "rechallenge", name: "Rechallenge", group: "Quiz" },
  { id: "hint", name: "Hint", group: "Quiz" }
] as const;
export type ButtonId = (typeof BUTTONS)[number]["id"];

// Where a button's colour comes from: the app's own styling, one colour for
// every button, or a per-button choice.
export type ButtonColorMode = "default" | "all" | "individual";

// Buttons that are solid-filled by default. The outlined ones take a colour as
// a translucent fill + matching border and label; giving these the same
// treatment would erase them (no border to carry the colour), so they get the
// colour at full strength with a contrasting label instead.
const SOLID_BUTTONS: ReadonlySet<string> = new Set(["generate", "submit", "clear"]);

// Rough perceptual luminance -> pick near-black or white for the label on top.
function readableOn(hex: string): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#12181f" : "#ffffff";
}

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

// The question box: an optional bordered card around each question. The size
// slider drives width and padding together — one number, so every question is
// laid out identically no matter how much text it holds.
export const QUESTION_FONTS = [{ id: "match", name: "Match page", css: "" }, ...FONTS] as const;
export type QuestionFontId = (typeof QUESTION_FONTS)[number]["id"];

export const DEFAULT_QUESTION_FILL = "#111827";

// Slider 0-100 -> the box's max width and its padding. The floor (340px / 10px)
// is the narrowest that still fits the longest answer row without the text
// running under the border; the ceiling (1000px / 28px) is as wide as the
// question column can go before it outruns the page padding on a large screen.
export function boxMetrics(size: number): { width: number; pad: number } {
  const t = Math.min(100, Math.max(0, size)) / 100;
  return { width: Math.round(340 + t * 660), pad: Math.round(10 + t * 18) };
}

export const DEFAULT_THEME: ThemeChoice = {
  font: "inter",
  palette: "midnight",
  buttonShape: "sharp",
  quizStyle: "boxed",
  gateTrue: DEFAULT_GATE_TRUE,
  gateFalse: DEFAULT_GATE_FALSE,
  questionBox: false,
  questionBoxFill: DEFAULT_QUESTION_FILL,
  questionBoxSize: 50,
  questionFont: "match",
  questionColumns: 1,
  folderColor: "",
  buttonColorMode: "default",
  buttonAllPalette: true,
  buttonAllColor: "#7dd3fc",
  buttonColors: {}
};

// Style fragment for a button that can be recoloured. Each button reads its own
// three CSS vars and falls back to whatever the call site already used, so an
// uncoloured button is byte-for-byte what it was before.
export function btnColors(
  id: ButtonId,
  fallback: { bg?: string; border?: string; text?: string; width?: number } = {}
): { background: string; border: string; color: string } {
  return {
    background: `var(--bc-${id}, ${fallback.bg ?? "transparent"})`,
    border: `${fallback.width ?? 2}px solid var(--bcl-${id}, ${fallback.border ?? "#888"})`,
    color: `var(--bct-${id}, ${fallback.text ?? "inherit"})`
  };
}

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
      quizStyle: pick(QUIZ_STYLES, t.quizStyle, DEFAULT_THEME.quizStyle),
      gateTrue: safeHex(t.gateTrue, DEFAULT_GATE_TRUE),
      gateFalse: safeHex(t.gateFalse, DEFAULT_GATE_FALSE),
      questionBox: t.questionBox === true,
      questionBoxFill: safeHex(t.questionBoxFill, DEFAULT_QUESTION_FILL),
      questionBoxSize: safeSize(t.questionBoxSize, DEFAULT_THEME.questionBoxSize),
      questionFont: pick(QUESTION_FONTS, t.questionFont, DEFAULT_THEME.questionFont),
      questionColumns: [1, 2, 3].includes(t.questionColumns) ? t.questionColumns : 1,
      folderColor: /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t.folderColor) ? t.folderColor : "",
      buttonColorMode:
        t.buttonColorMode === "all" || t.buttonColorMode === "individual"
          ? t.buttonColorMode
          : "default",
      buttonAllPalette: t.buttonAllPalette !== false,
      buttonAllColor: safeHex(t.buttonAllColor, DEFAULT_THEME.buttonAllColor),
      buttonColors: safeButtonColors(t.buttonColors)
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
  root.style.setProperty("--gate-true", safeHex(t.gateTrue, DEFAULT_GATE_TRUE));
  root.style.setProperty("--gate-false", safeHex(t.gateFalse, DEFAULT_GATE_FALSE));

  // Question box. Off = clear every var so the cards fall back to their stock
  // borderless, full-width look. On = one width/padding pair for all of them,
  // which is what keeps every question the same size.
  const qFont = QUESTION_FONTS.find((f) => f.id === t.questionFont);
  root.style.setProperty("--q-font", qFont && qFont.css ? qFont.css : "inherit");

  // Questions flow across this many columns on a wide screen. The quiz grid
  // ignores it on mobile, where there's never room for a second column.
  const cols = [1, 2, 3].includes(t.questionColumns) ? t.questionColumns : 1;
  root.style.setProperty("--q-cols", `repeat(${cols}, minmax(0, 1fr))`);

  // Folder icons stroke themselves with this; unset means they keep inheriting
  // the surrounding text colour.
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t.folderColor)) {
    root.style.setProperty("--folder-color", t.folderColor);
  } else {
    root.style.removeProperty("--folder-color");
  }

  if (!t.questionBox) {
    root.style.removeProperty("--qbox-border");
    root.style.removeProperty("--qbox-fill");
    root.style.removeProperty("--qbox-pad");
    root.style.removeProperty("--qbox-width");
  } else {
    const { width, pad } = boxMetrics(t.questionBoxSize);
    root.style.setProperty("--qbox-border", "1px solid #888");
    root.style.setProperty("--qbox-fill", safeHex(t.questionBoxFill, DEFAULT_QUESTION_FILL));
    root.style.setProperty("--qbox-pad", `${pad}px`);
    root.style.setProperty("--qbox-width", `${width}px`);
  }

  // Button colours. A button with no colour has its vars removed entirely, so
  // the fallback baked into btnColors() applies and it looks stock.
  for (const b of BUTTONS) {
    const colour =
      t.buttonColorMode === "all"
        ? t.buttonAllPalette
          ? palette.accent
          : safeHex(t.buttonAllColor, DEFAULT_THEME.buttonAllColor)
        : t.buttonColorMode === "individual"
          ? t.buttonColors[b.id]
          : undefined;

    if (!colour) {
      root.style.removeProperty(`--bc-${b.id}`);
      root.style.removeProperty(`--bcl-${b.id}`);
      root.style.removeProperty(`--bct-${b.id}`);
    } else if (SOLID_BUTTONS.has(b.id)) {
      root.style.setProperty(`--bc-${b.id}`, colour);
      root.style.setProperty(`--bcl-${b.id}`, colour);
      root.style.setProperty(`--bct-${b.id}`, readableOn(colour));
    } else {
      root.style.setProperty(`--bc-${b.id}`, tint(colour, 0.18));
      root.style.setProperty(`--bcl-${b.id}`, colour);
      root.style.setProperty(`--bct-${b.id}`, colour);
    }
  }
}
