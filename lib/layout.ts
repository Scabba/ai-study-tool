// Per-page layout: which blocks a page shows and what order they sit in.
//
// Deliberately NOT free positioning. Each page declares a handful of named
// blocks; the editor reorders them and toggles them off. Reordering is applied
// with CSS `order` on a flex column, so nothing is absolutely positioned and
// nothing can end up off-screen or broken at a different window size. Resetting
// a page is just dropping its entry.

export type PageId = "text" | "image" | "audio" | "games" | "settings" | "history" | "customize";

export const PAGES: readonly { id: PageId; name: string }[] = [
  { id: "text", name: "Text" },
  { id: "image", name: "Image" },
  { id: "audio", name: "Audio" },
  { id: "games", name: "Games" },
  { id: "settings", name: "Settings" },
  { id: "history", name: "Quiz History" },
  { id: "customize", name: "Customization" }
];

export type BlockDef = { id: string; name: string };

// A page with no blocks listed here shows up in the picker as "nothing to
// arrange yet" rather than being hidden — so the list matches the real app.
export const PAGE_BLOCKS: Record<PageId, readonly BlockDef[]> = {
  text: [
    { id: "title", name: "Title" },
    { id: "streak", name: "Streak" },
    { id: "input", name: "Text box" },
    { id: "generate", name: "Generate" },
    { id: "questions", name: "Questions" }
  ],
  // Image and audio put their previews and their Generate button in one
  // side-by-side row, so the row moves as a single block rather than splitting
  // the way the text page's stacked box and button do.
  image: [
    { id: "title", name: "Title" },
    { id: "streak", name: "Streak" },
    { id: "input", name: "Upload & Generate" },
    { id: "questions", name: "Questions" }
  ],
  audio: [
    { id: "title", name: "Title" },
    { id: "streak", name: "Streak" },
    { id: "input", name: "Upload & Generate" },
    { id: "questions", name: "Questions" }
  ],
  games: [],
  settings: [],
  history: [],
  customize: []
};

export type PageLayout = { order: string[]; hidden: string[] };
export type LayoutMap = Partial<Record<PageId, PageLayout>>;

// Every block id used by any page. The layout is published as CSS variables
// rather than rendered into React's output, so the server and the first client
// render always agree and only the browser ever sees a customised order.
export const ALL_BLOCK_IDS = ["title", "streak", "input", "generate", "questions"] as const;

// Where each block sits when a page has never been arranged — its source order.
// Used as the CSS fallback, so an untouched page is byte-for-byte as before.
export const DEFAULT_BLOCK_ORDER: Record<string, number> = {
  title: 1,
  streak: 2,
  input: 3,
  generate: 4,
  questions: 5
};

export function applyLayout(map: LayoutMap, page: PageId) {
  const root = document.documentElement;
  const cur = pageLayout(map, page);
  const known = new Set(PAGE_BLOCKS[page].map((b) => b.id));

  for (const id of ALL_BLOCK_IDS) {
    const idx = known.has(id) ? cur.order.indexOf(id) : -1;
    if (idx < 0) root.style.removeProperty(`--blk-${id}-order`);
    else root.style.setProperty(`--blk-${id}-order`, String(idx + 1));

    if (known.has(id) && cur.hidden.includes(id)) {
      root.style.setProperty(`--blk-${id}-display`, "none");
    } else {
      root.style.removeProperty(`--blk-${id}-display`);
    }
  }
}

const KEY = "atheniaLayout";

export function loadLayout(): LayoutMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: LayoutMap = {};
    for (const page of PAGES) {
      const entry = parsed[page.id];
      if (!entry || typeof entry !== "object") continue;
      out[page.id] = clean(page.id, entry.order, entry.hidden);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLayout(map: LayoutMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // storage unavailable — the layout just won't persist
  }
}

// The stored order/hidden for a page, reconciled against the blocks that
// actually exist: unknown ids are dropped and blocks added since the layout was
// saved fall in at the end, so a stale entry can never hide a new block.
export function pageLayout(map: LayoutMap, page: PageId): PageLayout {
  return clean(page, map[page]?.order, map[page]?.hidden);
}

function clean(page: PageId, order: unknown, hidden: unknown): PageLayout {
  const defs = PAGE_BLOCKS[page];
  const known = new Set(defs.map((b) => b.id));
  const kept = Array.isArray(order) ? order.filter((id) => typeof id === "string" && known.has(id)) : [];
  const deduped = [...new Set(kept)];
  for (const b of defs) if (!deduped.includes(b.id)) deduped.push(b.id);
  const off = Array.isArray(hidden) ? hidden.filter((id) => typeof id === "string" && known.has(id)) : [];
  return { order: deduped, hidden: [...new Set(off)] };
}
