// Athenia customization: fonts and color palettes, chosen in the palette panel.
// Stored in localStorage and applied as CSS variables / body font, so every
// page picks them up. ThemeLoader applies the saved theme on each page load.

export type ThemeChoice = { font: FontId; palette: PaletteId };

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

export const DEFAULT_THEME: ThemeChoice = { font: "inter", palette: "midnight" };

const KEY = "atheniaTheme";

export function loadTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_THEME };
    const t = JSON.parse(raw);
    return {
      font: FONTS.some((f) => f.id === t.font) ? t.font : DEFAULT_THEME.font,
      palette: PALETTES.some((p) => p.id === t.palette) ? t.palette : DEFAULT_THEME.palette
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
// whole app already reads; font swaps the body font stack.
export function applyTheme(t: ThemeChoice) {
  const palette = PALETTES.find((p) => p.id === t.palette) ?? PALETTES[0];
  const font = FONTS.find((f) => f.id === t.font) ?? FONTS[0];
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
}
