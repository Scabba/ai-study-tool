"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  loadStats,
  renameQuiz,
  deleteQuiz,
  createFolder,
  renameFolder,
  reorderFolders,
  addQuizToFolder,
  removeQuizFromFolder,
  type QuizRecord,
  type Folder
} from "@/lib/stats";
import { fetchStats, saveStats } from "@/lib/userStats";
import { createClient } from "@/lib/supabase/client";

const GREEN = "#57b98a";
const RED = "#e0776b";
// Light blue wash marking the folder a quiz is already in, in the folder dropdown.
const FOLDER_SELECTED = "rgba(125, 211, 252, 0.18)";

// How many folder chips a card shows before collapsing the rest behind a "…".
const CHIP_LIMIT = 2;

// Name a brand-new folder starts with. It's created immediately and dropped
// straight into rename mode, so this is only ever visible for a moment.
const NEW_FOLDER_NAME = "New folder";

function scoreColor(pct: number): string {
  if (pct >= 70) return GREEN;
  if (pct < 50) return RED;
  return "#cbd5e1";
}

function formatDate(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function gradeLabel(grade: string): string {
  if (!grade) return "—";
  return /^\d+$/.test(grade) ? `Grade ${grade}` : grade;
}

// Shrink a long quiz name so it fits the card instead of just truncating. The
// card still ellipsises past the smallest size, so this is best-effort.
function nameFontSize(name: string): number {
  const n = name.length;
  if (n <= 26) return 17;
  if (n <= 36) return 15;
  if (n <= 48) return 14;
  return 13;
}

// Sort a numeric grade ("9") ahead of a named one ("Graduate"), so ordering by
// grade level is stable across the two shapes the field can take.
function gradeRank(grade: string): number {
  const n = Number(grade);
  return Number.isFinite(n) ? n : 100;
}

type SortKey = "recent" | "score" | "questions" | "topic" | "grade";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Most recent" },
  { key: "score", label: "Score" },
  { key: "questions", label: "Questions" },
  { key: "topic", label: "Topic" },
  { key: "grade", label: "Grade level" }
];

// Minimalist outline folder icon
function FolderIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function PencilIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function Chevron({ dir = "right", size = 14 }: { dir?: "left" | "right"; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d={dir === "right" ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
    </svg>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [records, setRecords] = useState<QuizRecord[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  // Which card's "Add to folder" submenu is open (same id as menuId when shown).
  const [folderSubmenu, setFolderSubmenu] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // A folder being renamed in the folder bar — also how a new folder is named.
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  // Cards whose full folder list is showing.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [sortOpen, setSortOpen] = useState(false);
  // Whether the folder strip overflows, and which way it can scroll.
  const [scroll, setScroll] = useState({ left: false, right: false });
  // The folder currently being dragged to reorder the strip (its id).
  const [draggingFolder, setDraggingFolder] = useState<string | null>(null);

  const auth = useRef<{ client: ReturnType<typeof createClient>; userId: string } | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Quiz History — Athenia";
    let active = true;
    (async () => {
      if (active) {
        const local = loadStats();
        setRecords(local.history);
        setFolders(local.folders);
      }
      try {
        const client = createClient();
        // getSession reads the locally stored session (no network), so a flaky
        // connection can't break the page — RLS still enforces access.
        const { data } = await client.auth.getSession();
        const user = data.session?.user;
        if (!active || !user) return;
        auth.current = { client, userId: user.id };
        const cloud = await fetchStats(client, user.id);
        if (active && cloud) {
          setRecords(cloud.history);
          setFolders(cloud.folders);
        }
      } catch {
        // not signed in / Supabase not configured — local is fine
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Close the card menu / sort menu on an outside click.
  useEffect(() => {
    if (!menuId && !sortOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (menuId && !menuRef.current?.contains(t)) closeMenu();
      if (sortOpen && !sortRef.current?.contains(t)) setSortOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuId, sortOpen]);

  // Track whether the folder strip has anything hidden off either end, so the
  // scroll arrows only appear when they'd actually do something.
  function syncScroll() {
    const el = stripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScroll({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }

  useEffect(() => {
    syncScroll();
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(syncScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [folders.length]);

  function scrollStrip(dir: 1 | -1) {
    stripRef.current?.scrollBy({ left: dir * 180, behavior: "smooth" });
  }

  async function refreshAndSync() {
    const s = loadStats();
    setRecords(s.history);
    setFolders(s.folders);
    if (auth.current) {
      try {
        await saveStats(auth.current.client, auth.current.userId, s);
      } catch {
        // best-effort sync
      }
    }
  }

  async function commitRename(id: string) {
    renameQuiz(id, editName);
    setEditingId(null);
    await refreshAndSync();
  }

  async function removeQuiz(id: string) {
    deleteQuiz(id);
    setConfirmDeleteId(null);
    await refreshAndSync();
  }

  // Open a saved quiz on the main page in review mode (hands the questions +
  // the user's answers over via localStorage, then navigates).
  function openQuiz(r: QuizRecord) {
    if (!r.items?.length) return;
    try {
      localStorage.setItem("atheniaViewQuiz", JSON.stringify(r.items));
    } catch {
      return;
    }
    router.push("/");
  }

  function closeMenu() {
    setMenuId(null);
    setFolderSubmenu(false);
  }

  async function toggleFolder(quizId: string, folderId: string, inFolder: boolean) {
    if (inFolder) removeQuizFromFolder(quizId, folderId);
    else addQuizToFolder(quizId, folderId);
    await refreshAndSync();
  }

  // Create a folder and drop straight into renaming it, so the preset name is
  // just a placeholder the user types over.
  async function startNewFolder(quizId?: string) {
    const id = createFolder(NEW_FOLDER_NAME);
    if (quizId) addQuizToFolder(quizId, id);
    closeMenu();
    await refreshAndSync();
    setFolderName(NEW_FOLDER_NAME);
    setEditingFolderId(id);
    // Let the new button render before scrolling it into view.
    requestAnimationFrame(() => {
      stripRef.current?.scrollTo({ left: stripRef.current.scrollWidth, behavior: "smooth" });
      syncScroll();
    });
  }

  async function commitFolderName(id: string) {
    renameFolder(id, folderName.trim() || NEW_FOLDER_NAME);
    setEditingFolderId(null);
    await refreshAndSync();
  }

  // Live-reorder the strip as a dragged folder is hovered over another: move
  // the dragged folder to the hovered one's slot. Only touches local state;
  // persisted on drop.
  function reorderOnHover(targetId: string) {
    if (!draggingFolder || draggingFolder === targetId) return;
    setFolders((prev) => {
      const from = prev.findIndex((f) => f.id === draggingFolder);
      const to = prev.findIndex((f) => f.id === targetId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  // Commit the current strip order once the drag ends.
  async function commitOrder() {
    reorderFolders(folders.map((f) => f.id));
    setDraggingFolder(null);
    if (auth.current) {
      try {
        await saveStats(auth.current.client, auth.current.userId, loadStats());
      } catch {
        // best-effort
      }
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sorted = useMemo(() => {
    const list = [...records];
    switch (sortBy) {
      case "score":
        return list.sort((a, b) => b.score - a.score);
      case "questions":
        return list.sort((a, b) => b.questions - a.questions);
      case "topic":
        return list.sort((a, b) =>
          (a.subject ?? "General").localeCompare(b.subject ?? "General")
        );
      case "grade":
        return list.sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade));
      default:
        return list.sort((a, b) => b.date - a.date);
    }
  }, [records, sortBy]);

  const scrollBtn: React.CSSProperties = {
    flexShrink: 0,
    width: 30,
    height: 38,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 3,
    border: "2px solid #888",
    background: "var(--background)",
    color: "inherit",
    cursor: "pointer"
  };

  return (
    <main style={{ padding: 40, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ position: "relative" }}>
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
          Quiz History
        </h1>
      </div>

      {/* Folder bar: the folders scroll, the + and the sort menu don't. The sort
          control sits outside the scrolling strip so it stays reachable. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 24 }}>
        {scroll.left && (
          <button onClick={() => scrollStrip(-1)} aria-label="Scroll folders left" style={scrollBtn}>
            <Chevron dir="left" />
          </button>
        )}

        <div
          ref={stripRef}
          onScroll={syncScroll}
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            scrollbarWidth: "none",
            flex: 1,
            minWidth: 0
          }}
        >
          {folders.map((f) =>
            editingFolderId === f.id ? (
              <input
                key={f.id}
                autoFocus
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onBlur={() => commitFolderName(f.id)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitFolderName(f.id);
                  if (e.key === "Escape") setEditingFolderId(null);
                }}
                style={{
                  flexShrink: 0,
                  width: 150,
                  height: 38,
                  padding: "0 12px",
                  borderRadius: 3,
                  border: "2px solid #888",
                  background: "transparent",
                  color: "inherit",
                  fontSize: 15,
                  outline: "none"
                }}
              />
            ) : (
              <Link
                key={f.id}
                href={`/history/${f.id}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", f.id); // Firefox needs data set
                  setDraggingFolder(f.id);
                }}
                onDragOver={(e) => {
                  if (!draggingFolder) return;
                  e.preventDefault(); // mark this a valid drop target
                  reorderOnHover(f.id);
                }}
                onDrop={(e) => {
                  if (draggingFolder) e.preventDefault();
                }}
                onDragEnd={commitOrder}
                title="Drag to reorder"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  flexShrink: 0,
                  height: 38,
                  padding: "0 14px",
                  borderRadius: 3,
                  border: "2px solid #888",
                  background: draggingFolder === f.id ? "rgba(136,136,136,0.15)" : "transparent",
                  color: "inherit",
                  fontSize: 15,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  cursor: "grab",
                  opacity: draggingFolder === f.id ? 0.4 : 1
                }}
              >
                <FolderIcon />
                {f.name}
              </Link>
            )
          )}

          {/* New folder — sits just right of the last folder */}
          <button
            onClick={() => startNewFolder()}
            aria-label="New folder"
            title="New folder"
            style={{
              flexShrink: 0,
              width: 38,
              height: 38,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 3,
              border: "2px solid #888",
              background: "transparent",
              color: "inherit",
              fontSize: 20,
              lineHeight: 1,
              cursor: "pointer"
            }}
          >
            +
          </button>
        </div>

        {scroll.right && (
          <button onClick={() => scrollStrip(1)} aria-label="Scroll folders right" style={scrollBtn}>
            <Chevron dir="right" />
          </button>
        )}

        {/* Sort — outside the scrolling strip so it never scrolls away */}
        <div ref={sortRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setSortOpen((v) => !v)}
            title="Sort quizzes"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 38,
              padding: "0 12px",
              borderRadius: 3,
              border: "2px solid #888",
              background: "transparent",
              color: "inherit",
              fontSize: 14,
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            {SORTS.find((s) => s.key === sortBy)?.label}
            <span style={{ opacity: 0.6, fontSize: 10 }}>▼</span>
          </button>
          {sortOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                minWidth: 160,
                background: "var(--background)",
                border: "1px solid #888",
                borderRadius: 3,
                boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
                zIndex: 40,
                overflow: "hidden"
              }}
            >
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => {
                    setSortBy(s.key);
                    setSortOpen(false);
                  }}
                  style={{
                    ...menuItem,
                    background: sortBy === s.key ? FOLDER_SELECTED : "transparent"
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {records.length === 0 ? (
        <p style={{ textAlign: "center", opacity: 0.7, marginTop: 40 }}>
          No quizzes yet. Complete a quiz and it will show up here.
        </p>
      ) : (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {sorted.map((r) => {
            const inFolders = folders.filter((f) => f.quizIds.includes(r.id));
            const isExpanded = expanded.has(r.id);
            const shown = isExpanded ? inFolders : inFolders.slice(0, CHIP_LIMIT);
            const hidden = inFolders.length - shown.length;

            return (
              <div
                key={r.id}
                style={{
                  position: "relative",
                  zIndex: menuId === r.id || confirmDeleteId === r.id ? 30 : undefined,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 34px 14px 14px", // right room for the ⋯ button
                  border: "1px solid #888",
                  borderRadius: 3
                }}
              >
                {/* name + meta */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  {editingId === r.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => commitRename(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(r.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      style={{
                        width: "100%",
                        maxWidth: 260,
                        fontSize: 17,
                        fontWeight: "bold",
                        padding: "2px 6px",
                        background: "transparent",
                        color: "inherit",
                        border: "1px solid #888",
                        borderRadius: 3
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        maxWidth: "100%"
                      }}
                    >
                      {/* Name opens the quiz in review mode */}
                      <button
                        onClick={() => openQuiz(r)}
                        title="Open quiz"
                        style={{
                          minWidth: 0,
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          color: "inherit",
                          fontSize: nameFontSize(r.name),
                          fontWeight: "bold",
                          cursor: "pointer",
                          textAlign: "left",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {r.name}
                      </button>

                      {/* Folder chips — only the first few, so a quiz filed in
                          many folders doesn't push the name out of the card. */}
                      {!isExpanded &&
                        shown.map((f) => (
                          <span key={f.id} title={`In folder: ${f.name}`} style={chip}>
                            <FolderIcon size={13} />
                            {f.name}
                          </span>
                        ))}
                      {!isExpanded && hidden > 0 && (
                        <button
                          onClick={() => toggleExpanded(r.id)}
                          title={`Show ${hidden} more folder${hidden === 1 ? "" : "s"}`}
                          aria-label={`Show ${hidden} more folders`}
                          style={{
                            ...chip,
                            border: "1px solid #888",
                            borderRadius: 3,
                            padding: "0 6px",
                            height: 20,
                            background: "transparent",
                            cursor: "pointer"
                          }}
                        >
                          ⋯ {hidden}
                        </button>
                      )}
                    </span>
                  )}

                  <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
                    {r.subject ?? "General"} · {gradeLabel(r.grade)} · {r.questions} question
                    {r.questions === 1 ? "" : "s"} · {formatDate(r.date)}
                  </div>

                  {/* Expanded: every folder, wrapping onto its own rows, plus
                      the control to fold it back up. */}
                  {isExpanded && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 8
                      }}
                    >
                      {inFolders.map((f) => (
                        <span key={f.id} style={chip}>
                          <FolderIcon size={13} />
                          {f.name}
                        </span>
                      ))}
                      <button
                        onClick={() => toggleExpanded(r.id)}
                        style={{
                          ...chip,
                          border: "1px solid #888",
                          borderRadius: 3,
                          padding: "0 6px",
                          height: 20,
                          background: "transparent",
                          cursor: "pointer"
                        }}
                      >
                        Collapse
                      </button>
                    </div>
                  )}
                </div>

                {/* score */}
                <div
                  style={{
                    flexShrink: 0,
                    fontWeight: "bold",
                    fontSize: 22,
                    color: scoreColor(r.score)
                  }}
                >
                  {r.score}%
                </div>

                {/* ⋯ actions, flush in the card's top-right corner */}
                <div
                  ref={menuId === r.id ? menuRef : undefined}
                  style={{ position: "absolute", top: 0, right: 0 }}
                >
                  <button
                    onClick={() => {
                      setFolderSubmenu(false);
                      setMenuId(menuId === r.id ? null : r.id);
                    }}
                    aria-label="Quiz actions"
                    title="Quiz actions"
                    style={{
                      width: 26,
                      height: 26,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "0 3px 0 3px",
                      borderLeft: "1px solid #888",
                      borderBottom: "1px solid #888",
                      borderTop: "none",
                      borderRight: "none",
                      background: "transparent",
                      color: "inherit",
                      fontSize: 16,
                      lineHeight: 1,
                      cursor: "pointer"
                    }}
                  >
                    ⋯
                  </button>

                  {menuId === r.id && (
                    <div
                      style={{
                        position: "absolute",
                        top: -1,
                        left: "100%",
                        minWidth: 190,
                        background: "var(--background)",
                        border: "1px solid #888",
                        borderRadius: "0 3px 3px 3px",
                        boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
                        zIndex: 20
                      }}
                    >
                      {/* Add to folder — opens the folder list to the right */}
                      <div style={{ position: "relative" }}>
                        <button
                          onClick={() => setFolderSubmenu((v) => !v)}
                          style={{
                            ...menuItem,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            background: folderSubmenu ? FOLDER_SELECTED : "transparent"
                          }}
                        >
                          <FolderIcon size={14} />
                          <span style={{ flex: 1 }}>Add to folder</span>
                          <Chevron />
                        </button>

                        {folderSubmenu && (
                          <div
                            style={{
                              position: "absolute",
                              top: -1,
                              left: "100%",
                              minWidth: 190,
                              maxHeight: 260,
                              overflowY: "auto",
                              background: "var(--background)",
                              border: "1px solid #888",
                              borderRadius: 3,
                              boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
                              zIndex: 30
                            }}
                          >
                            {folders.length === 0 ? (
                              <button onClick={() => startNewFolder(r.id)} style={menuItem}>
                                + New folder
                              </button>
                            ) : (
                              folders.map((f) => {
                                const inFolder = f.quizIds.includes(r.id);
                                return (
                                  <button
                                    key={f.id}
                                    onClick={() => toggleFolder(r.id, f.id, inFolder)}
                                    title={inFolder ? "Remove from folder" : "Add to folder"}
                                    style={{
                                      ...menuItem,
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      background: inFolder ? FOLDER_SELECTED : "transparent"
                                    }}
                                  >
                                    <FolderIcon size={14} />
                                    <span
                                      style={{
                                        flex: 1,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis"
                                      }}
                                    >
                                      {f.name}
                                    </span>
                                    {inFolder && <span style={{ opacity: 0.7 }}>✓</span>}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          setEditName(r.name);
                          setEditingId(r.id);
                          closeMenu();
                        }}
                        style={{
                          ...menuItem,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          borderTop: "1px solid #333"
                        }}
                      >
                        <PencilIcon />
                        Rename
                      </button>

                      <button
                        onClick={() => {
                          setConfirmDeleteId(r.id);
                          closeMenu();
                        }}
                        style={{
                          ...menuItem,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          borderTop: "1px solid #333",
                          color: RED
                        }}
                      >
                        <TrashIcon />
                        Delete
                      </button>
                    </div>
                  )}

                  {confirmDeleteId === r.id && (
                    <div
                      style={{
                        position: "absolute",
                        top: -1,
                        left: "100%",
                        minWidth: 190,
                        background: "var(--background)",
                        border: "1px solid #888",
                        borderRadius: "0 3px 3px 3px",
                        boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
                        zIndex: 30,
                        padding: 12
                      }}
                    >
                      <div style={{ fontSize: 14, marginBottom: 10 }}>
                        Delete this quiz? This can&apos;t be undone.
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          style={{
                            border: "1px solid #888",
                            borderRadius: 3,
                            background: "transparent",
                            color: "inherit",
                            fontSize: 13,
                            padding: "4px 10px",
                            cursor: "pointer"
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => removeQuiz(r.id)}
                          style={{
                            border: `1px solid ${RED}`,
                            borderRadius: 3,
                            background: "transparent",
                            color: RED,
                            fontSize: 13,
                            padding: "4px 10px",
                            cursor: "pointer"
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </main>
  );
}

const menuItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  background: "transparent",
  color: "inherit",
  border: "none",
  fontSize: 14,
  cursor: "pointer"
};

// A folder tag shown on a quiz card.
const chip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  flexShrink: 0,
  fontSize: 13,
  fontWeight: "normal",
  color: "#888",
  maxWidth: 140,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
