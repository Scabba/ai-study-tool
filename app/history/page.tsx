"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  loadStats,
  renameQuiz,
  deleteQuiz,
  createFolder,
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

export default function HistoryPage() {
  const router = useRouter();
  const [records, setRecords] = useState<QuizRecord[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const auth = useRef<{ client: ReturnType<typeof createClient>; userId: string } | null>(null);

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
        const { data } = await client.auth.getUser();
        if (!active || !data.user) return;
        auth.current = { client, userId: data.user.id };
        const cloud = await fetchStats(client, data.user.id);
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
    setCreatingFolder(false);
    setNewFolderName("");
  }

  async function addToExisting(quizId: string, folderId: string) {
    addQuizToFolder(quizId, folderId);
    closeMenu();
    await refreshAndSync();
  }

  // Take the quiz out of a folder (the little x in the dropdown). Keeps the
  // dropdown open so you can see the selection clear.
  async function removeFromFolder(quizId: string, folderId: string) {
    removeQuizFromFolder(quizId, folderId);
    await refreshAndSync();
  }

  async function addToNewFolder(quizId: string) {
    if (!newFolderName.trim()) return;
    const folderId = createFolder(newFolderName);
    addQuizToFolder(quizId, folderId);
    closeMenu();
    await refreshAndSync();
  }

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

      {/* Folder bar — each opens that folder's page */}
      {folders.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 24 }}>
          {folders.map((f) => (
            <Link
              key={f.id}
              href={`/history/${f.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                height: 38,
                padding: "0 14px",
                borderRadius: 3,
                border: "2px solid #888",
                background: "transparent",
                color: "inherit",
                fontSize: 15,
                textDecoration: "none"
              }}
            >
              <FolderIcon />
              {f.name}
            </Link>
          ))}
        </div>
      )}

      {records.length === 0 ? (
        <p style={{ textAlign: "center", opacity: 0.7, marginTop: 40 }}>
          No quizzes yet. Complete a quiz and it will show up here.
        </p>
      ) : (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {records.map((r) => (
            <div
              key={r.id}
              style={{
                position: "relative",
                zIndex: menuId === r.id || confirmDeleteId === r.id ? 30 : undefined,
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 34px", // room for the corner x (left) and + (right)
                border: "1px solid #888",
                borderRadius: 3
              }}
            >
              {/* Red x flush in the very top-left corner — deletes the quiz */}
              <div style={{ position: "absolute", top: 0, left: 0 }}>
                <button
                  onClick={() =>
                    confirmDeleteId === r.id ? setConfirmDeleteId(null) : setConfirmDeleteId(r.id)
                  }
                  aria-label="Delete quiz"
                  title="Delete quiz"
                  style={{
                    width: 26,
                    height: 26,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "3px 0 3px 0", // round outer (top-left) + inner (bottom-right)
                    borderRight: "1px solid #888",
                    borderBottom: "1px solid #888",
                    borderTop: "none",
                    borderLeft: "none",
                    background: "transparent",
                    color: RED,
                    fontSize: 18,
                    lineHeight: 1,
                    cursor: "pointer"
                  }}
                >
                  ×
                </button>

                {confirmDeleteId === r.id && (
                  <div
                    style={{
                      position: "absolute",
                      top: -1,
                      right: "100%", // grows out to the left of the card
                      minWidth: 180,
                      background: "var(--background)",
                      border: "1px solid #888",
                      borderRadius: "3px 0 3px 3px",
                      boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
                      zIndex: 20,
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
                          fontWeight: "bold",
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

              {/* + button flush in the very top-right corner (its top/right edges
                  merge with the card border) */}
              <div style={{ position: "absolute", top: 0, right: 0 }}>
                <button
                  onClick={() => (menuId === r.id ? closeMenu() : setMenuId(r.id))}
                  aria-label="Add to folder"
                  title="Add to folder"
                  style={{
                    width: 26,
                    height: 26,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "0 3px 0 3px", // round outer (top-right) + inner (bottom-left) corners
                    borderLeft: "1px solid #888",
                    borderBottom: "1px solid #888",
                    borderTop: "none",
                    borderRight: "none",
                    background: "transparent",
                    color: "inherit",
                    fontSize: 20,
                    lineHeight: 1,
                    cursor: "pointer"
                  }}
                >
                  +
                </button>

                {menuId === r.id && (
                  <div
                    style={{
                      position: "absolute",
                      top: -1, // top edge flush with the card's top edge
                      left: "100%", // left edge flush against the card's right edge
                      minWidth: 180,
                      background: "var(--background)",
                      border: "1px solid #888",
                      borderRadius: "0 3px 3px 3px",
                      boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
                      zIndex: 20,
                      overflow: "hidden"
                    }}
                  >
                    {creatingFolder ? (
                      <div style={{ padding: 10, display: "flex", gap: 6 }}>
                        <input
                          autoFocus
                          value={newFolderName}
                          placeholder="Folder name"
                          onChange={(e) => setNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addToNewFolder(r.id);
                            if (e.key === "Escape") setCreatingFolder(false);
                          }}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 14,
                            padding: "4px 6px",
                            background: "transparent",
                            color: "inherit",
                            border: "1px solid #888",
                            borderRadius: 3
                          }}
                        />
                        <button
                          onClick={() => addToNewFolder(r.id)}
                          style={{
                            border: "1px solid #888",
                            borderRadius: 3,
                            background: "transparent",
                            color: "inherit",
                            fontSize: 13,
                            padding: "4px 8px",
                            cursor: "pointer"
                          }}
                        >
                          Add
                        </button>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => setCreatingFolder(true)} style={menuItem}>
                          + New folder
                        </button>
                        {folders.length > 0 && <div style={{ borderTop: "1px solid #333" }} />}
                        {folders.map((f) => {
                          const inFolder = f.quizIds.includes(r.id);
                          return (
                            <div key={f.id} style={{ position: "relative" }}>
                              <button
                                onClick={() => addToExisting(r.id, f.id)}
                                style={{
                                  ...menuItem,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  // the folder this quiz is already in
                                  background: inFolder ? FOLDER_SELECTED : "transparent",
                                  paddingRight: inFolder ? 24 : 12
                                }}
                              >
                                <FolderIcon />
                                {f.name}
                              </button>
                              {inFolder && (
                                <button
                                  onClick={() => removeFromFolder(r.id, f.id)}
                                  aria-label={`Remove from ${f.name}`}
                                  title="Remove from folder"
                                  style={{
                                    position: "absolute",
                                    top: 1,
                                    right: 3,
                                    width: 18,
                                    height: 18,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    padding: 0,
                                    border: "none",
                                    background: "transparent",
                                    color: "#fff",
                                    fontSize: 17,
                                    lineHeight: 1,
                                    cursor: "pointer"
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>

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
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, maxWidth: "100%" }}>
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
                        fontSize: 17,
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
                    {/* Pencil renames it */}
                    <button
                      onClick={() => {
                        setEditName(r.name);
                        setEditingId(r.id);
                      }}
                      title="Rename"
                      aria-label="Rename quiz"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        color: "inherit",
                        cursor: "pointer",
                        flexShrink: 0
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
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
                    </button>

                    {/* Which folder(s) this quiz is filed under */}
                    {folders
                      .filter((f) => f.quizIds.includes(r.id))
                      .map((f) => (
                        <span
                          key={f.id}
                          title={`In folder: ${f.name}`}
                          style={{
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
                          }}
                        >
                          <FolderIcon size={13} />
                          {f.name}
                        </span>
                      ))}
                  </span>
                )}
                <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
                  {r.subject ?? "General"} · {gradeLabel(r.grade)} · {r.questions} question
                  {r.questions === 1 ? "" : "s"} · {formatDate(r.date)}
                </div>
              </div>

              {/* score */}
              <div style={{ flexShrink: 0, fontWeight: "bold", fontSize: 22, color: scoreColor(r.score) }}>
                {r.score}%
              </div>
            </div>
          ))}
        </div>
      )}

      {(menuId || confirmDeleteId) && (
        <div
          onClick={() => {
            closeMenu();
            setConfirmDeleteId(null);
          }}
          style={{ position: "fixed", inset: 0, zIndex: 10 }}
        />
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
