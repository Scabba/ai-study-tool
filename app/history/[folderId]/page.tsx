"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  loadStats,
  renameQuiz,
  renameFolder,
  deleteQuiz,
  deleteFolder,
  removeQuizFromFolder,
  type QuizRecord,
  type Folder
} from "@/lib/stats";
import { fetchStats, saveStats } from "@/lib/userStats";
import { createClient } from "@/lib/supabase/client";

const GREEN = "#57b98a";
const RED = "#e0776b";

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

// Shrink a long quiz name so it fits the card rather than just truncating.
function nameFontSize(name: string): number {
  const n = name.length;
  if (n <= 26) return 17;
  if (n <= 36) return 15;
  if (n <= 48) return 14;
  return 13;
}

const TITLE_MAX = 40; // the heading's ideal size when it fits
const TITLE_MIN = 18; // don't shrink below this; ellipsis takes over instead

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

// "Remove from folder" — an open folder with a minus.
function FolderMinusIcon({ size = 14 }: { size?: number }) {
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
      <path d="M9 14h6" />
    </svg>
  );
}

const quizMenuItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  background: "transparent",
  color: "inherit",
  border: "none",
  fontSize: 14,
  cursor: "pointer"
};

export default function FolderPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = Array.isArray(params.folderId) ? params.folderId[0] : params.folderId;

  const [allRecords, setAllRecords] = useState<QuizRecord[]>([]);
  const [folder, setFolder] = useState<Folder | null>(null);
  const [editingFolder, setEditingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [editingQuiz, setEditingQuiz] = useState<string | null>(null);
  const [quizName, setQuizName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null); // which quiz's ⋯ menu is open
  const [titleSize, setTitleSize] = useState(TITLE_MAX);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const auth = useRef<{ client: ReturnType<typeof createClient>; userId: string } | null>(null);

  useEffect(() => {
    document.title = "Folder — Athenia";
    let active = true;
    const apply = (all: QuizRecord[], folders: Folder[]) => {
      setAllRecords(all);
      setFolder(folders.find((f) => f.id === folderId) ?? null);
    };
    (async () => {
      if (active) {
        const local = loadStats();
        apply(local.history, local.folders);
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
        if (active && cloud) apply(cloud.history, cloud.folders);
      } catch {
        // local is fine
      }
    })();
    return () => {
      active = false;
    };
  }, [folderId]);

  // Fit the folder title to the space between the back arrow and the trash.
  // Character-count sizing can't do this: a short name still overflows on a
  // narrow screen, which is why "Chemistry" was rendering as "Chemi…". So we
  // measure and shrink until it fits (or hit the floor and let ellipsis take
  // over). Re-runs on name change and on resize, since the fit is width-driven.
  useLayoutEffect(() => {
    function fit() {
      const el = titleRef.current;
      if (!el) return;
      let size = TITLE_MAX;
      el.style.fontSize = `${size}px`;
      let guard = 0;
      while (el.scrollWidth > el.clientWidth && size > TITLE_MIN && guard < 40) {
        size -= 1;
        el.style.fontSize = `${size}px`;
        guard += 1;
      }
      setTitleSize(size);
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [folder?.name, editingFolder]);

  // Close the quiz ⋯ menu on an outside click.
  useEffect(() => {
    if (!menuId) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuId(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuId]);

  async function sync() {
    const s = loadStats();
    setAllRecords(s.history);
    setFolder(s.folders.find((f) => f.id === folderId) ?? null);
    if (auth.current) {
      try {
        await saveStats(auth.current.client, auth.current.userId, s);
      } catch {
        // best-effort
      }
    }
  }

  async function commitFolderRename() {
    if (folder) renameFolder(folder.id, folderName);
    setEditingFolder(false);
    await sync();
  }

  async function commitQuizRename(id: string) {
    renameQuiz(id, quizName);
    setEditingQuiz(null);
    await sync();
  }

  async function removeQuiz(id: string) {
    deleteQuiz(id);
    setConfirmDeleteId(null);
    await sync();
  }

  // Take the quiz out of this folder — the quiz itself is kept, it just leaves
  // the folder (so it drops off this page).
  async function removeFromFolder(id: string) {
    if (folder) removeQuizFromFolder(id, folder.id);
    setMenuId(null);
    await sync();
  }

  // Delete the whole folder and go back to the history list. The quizzes it
  // held are kept — deleteFolder only un-files them.
  async function removeFolder() {
    if (folder) deleteFolder(folder.id);
    setConfirmDeleteFolder(false);
    if (auth.current) {
      try {
        await saveStats(auth.current.client, auth.current.userId, loadStats());
      } catch {
        // best-effort
      }
    }
    router.push("/history");
  }

  // Open a saved quiz on the main page in review mode.
  function openQuiz(r: QuizRecord) {
    if (!r.items?.length) return;
    try {
      localStorage.setItem("atheniaViewQuiz", JSON.stringify(r.items));
    } catch {
      return;
    }
    router.push("/");
  }

  const quizzes = folder ? allRecords.filter((r) => folder.quizIds.includes(r.id)) : [];

  // Every missed question across this folder's quizzes.
  const wrong = quizzes.flatMap((r) =>
    r.items
      .filter((it) => it.chosen !== it.correct)
      .map((it) => ({ question: it.question, options: it.options, correct: it.correct }))
  );

  function startRechallenge() {
    const payload = wrong.slice(0, 20);
    if (!payload.length) return;
    try {
      localStorage.setItem("atheniaFolderRechallenge", JSON.stringify(payload));
    } catch {
      return;
    }
    router.push("/");
  }

  return (
    <main style={{ padding: 40, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ position: "relative" }}>
        <Link
          href="/history"
          aria-label="Back to Quiz History"
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
        {editingFolder ? (
          <input
            autoFocus
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onBlur={commitFolderRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitFolderRename();
              if (e.key === "Escape") setEditingFolder(false);
            }}
            style={{
              display: "block",
              margin: "0 auto",
              textAlign: "center",
              fontWeight: "bold",
              fontSize: 34,
              // Same 56px-per-side reservation as the title button, so the
              // rename field can't sit under the back arrow either.
              maxWidth: "min(400px, calc(100% - 112px))",
              width: "100%",
              background: "transparent",
              color: "inherit",
              border: "1px solid #888",
              borderRadius: "var(--btn-radius, 3px)",
              padding: "2px 8px"
            }}
          />
        ) : (
          <button
            onClick={() => {
              setFolderName(folder?.name ?? "");
              setEditingFolder(true);
            }}
            title="Click to rename folder"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              margin: "0 auto",
              // The back arrow is absolutely positioned at left:0, so a long
              // folder name would centre its way right up against it. Reserving
              // 56px at each end keeps a gap no matter how long the name is.
              maxWidth: "calc(100% - 112px)",
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer"
            }}
          >
            <h1
              ref={titleRef}
              style={{
                fontWeight: "bold",
                fontSize: titleSize,
                margin: 0,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {folder ? folder.name : "Folder not found"}
            </h1>
            {folder && (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.5 }}
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            )}
          </button>
        )}

        {/* Delete this folder — red trash top-right of the header. Mirrors the
            back arrow on the left; the title reserves 56px each side for both. */}
        {folder && (
          <button
            onClick={() => setConfirmDeleteFolder(true)}
            aria-label="Delete folder"
            title="Delete folder"
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              padding: 0,
              color: RED,
              cursor: "pointer"
            }}
          >
            <TrashIcon size={24} />
          </button>
        )}
      </div>

      {folder && (
        <button
          onClick={startRechallenge}
          disabled={wrong.length === 0}
          style={{
            display: "block",
            margin: "20px auto 0",
            padding: "10px 22px",
            borderRadius: "var(--btn-radius, 3px)",
            border: "2px solid #c79a34",
            background: "transparent",
            color: wrong.length === 0 ? "#666" : "#d9b45a",
            fontWeight: "bold",
            fontSize: 15,
            cursor: wrong.length === 0 ? "default" : "pointer"
          }}
        >
          {wrong.length === 0
            ? "No missed questions to rechallenge"
            : `Rechallenge ${Math.min(wrong.length, 20)} missed question${
                Math.min(wrong.length, 20) === 1 ? "" : "s"
              }`}
        </button>
      )}

      {quizzes.length === 0 ? (
        <p style={{ textAlign: "center", opacity: 0.7, marginTop: 40 }}>
          {folder ? "No quizzes in this folder yet." : "This folder doesn't exist."}
        </p>
      ) : (
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {quizzes.map((r) => (
            <div
              key={r.id}
              style={{
                position: "relative",
                zIndex: menuId === r.id ? 30 : undefined,
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 34px 14px 16px", // right room for the ⋯ button
                border: "1px solid #888",
                borderRadius: "var(--btn-radius, 3px)"
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                {editingQuiz === r.id ? (
                  <input
                    autoFocus
                    value={quizName}
                    onChange={(e) => setQuizName(e.target.value)}
                    onBlur={() => commitQuizRename(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitQuizRename(r.id);
                      if (e.key === "Escape") setEditingQuiz(null);
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
                      borderRadius: "var(--btn-radius, 3px)"
                    }}
                  />
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, maxWidth: "100%" }}>
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
                  </span>
                )}
                <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
                  {r.subject ?? "General"} · {gradeLabel(r.grade)} · {r.questions} question
                  {r.questions === 1 ? "" : "s"} · {formatDate(r.date)}
                </div>
              </div>
              <div style={{ flexShrink: 0, fontWeight: "bold", fontSize: 22, color: scoreColor(r.score) }}>
                {r.score}%
              </div>

              {/* ⋯ actions, flush in the card's top-right corner */}
              <div
                ref={menuId === r.id ? menuRef : undefined}
                style={{ position: "absolute", top: 0, right: 0 }}
              >
                <button
                  onClick={() => setMenuId(menuId === r.id ? null : r.id)}
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
                      top: -1, // top edge flush with the card's top edge
                      left: "100%", // grows out to the right of the card
                      minWidth: 190,
                      background: "var(--background)",
                      border: "1px solid #888",
                      borderRadius: "0 3px 3px 3px",
                      boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
                      zIndex: 20
                    }}
                  >
                    <button
                      onClick={() => {
                        setQuizName(r.name);
                        setEditingQuiz(r.id);
                        setMenuId(null);
                      }}
                      style={quizMenuItem}
                    >
                      <PencilIcon />
                      Rename
                    </button>
                    <button
                      onClick={() => removeFromFolder(r.id)}
                      style={{ ...quizMenuItem, borderTop: "1px solid #333" }}
                    >
                      <FolderMinusIcon />
                      Remove from folder
                    </button>
                    <button
                      onClick={() => {
                        setConfirmDeleteId(r.id);
                        setMenuId(null);
                      }}
                      style={{ ...quizMenuItem, borderTop: "1px solid #333", color: RED }}
                    >
                      <TrashIcon />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDeleteId && (
        <div
          onClick={() => setConfirmDeleteId(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 20
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 380,
              width: "100%",
              background: "var(--background)",
              color: "var(--foreground)",
              border: "1px solid #888",
              borderRadius: "var(--btn-radius, 3px)",
              padding: 24,
              boxShadow: "0 6px 24px rgba(0,0,0,0.25)"
            }}
          >
            <div style={{ fontSize: 16, lineHeight: 1.4, marginBottom: 18 }}>
              Delete this quiz? This can&apos;t be undone.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{
                  border: "1px solid #888",
                  borderRadius: "var(--btn-radius, 3px)",
                  background: "transparent",
                  color: "inherit",
                  fontSize: 14,
                  padding: "8px 16px",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => removeQuiz(confirmDeleteId)}
                style={{
                  border: `1px solid ${RED}`,
                  borderRadius: "var(--btn-radius, 3px)",
                  background: "transparent",
                  color: RED,
                  fontSize: 14,
                  fontWeight: "bold",
                  padding: "8px 16px",
                  cursor: "pointer"
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteFolder && folder && (
        <div
          onClick={() => setConfirmDeleteFolder(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 20
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 380,
              width: "100%",
              background: "var(--background)",
              color: "var(--foreground)",
              border: "1px solid #888",
              borderRadius: "var(--btn-radius, 3px)",
              padding: 24,
              boxShadow: "0 6px 24px rgba(0,0,0,0.25)"
            }}
          >
            <div style={{ fontSize: 16, lineHeight: 1.4, marginBottom: 18 }}>
              Are you sure you want to delete{" "}
              <span style={{ fontWeight: "bold" }}>&ldquo;{folder.name}&rdquo;</span>?
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDeleteFolder(false)}
                style={{
                  border: "1px solid #888",
                  borderRadius: "var(--btn-radius, 3px)",
                  background: "transparent",
                  color: "inherit",
                  fontSize: 14,
                  padding: "8px 16px",
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={removeFolder}
                style={{
                  border: `1px solid ${RED}`,
                  borderRadius: "var(--btn-radius, 3px)",
                  background: "transparent",
                  color: RED,
                  fontSize: 14,
                  fontWeight: "bold",
                  padding: "8px 16px",
                  cursor: "pointer"
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
