"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  loadStats,
  renameQuiz,
  renameFolder,
  deleteQuiz,
  deleteFolder,
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

// Same idea for the big folder-name heading, scaled up.
function titleFontSize(name: string): number {
  const n = name.length;
  if (n <= 18) return 40;
  if (n <= 28) return 32;
  if (n <= 40) return 26;
  return 22;
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
              borderRadius: 3,
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
              style={{
                fontWeight: "bold",
                fontSize: titleFontSize(folder ? folder.name : "Folder not found"),
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
            borderRadius: 3,
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
                zIndex: confirmDeleteId === r.id ? 30 : undefined,
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 16px",
                border: "1px solid #888",
                borderRadius: 3
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
                      borderRadius: 3
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
                    <button
                      onClick={() => {
                        setQuizName(r.name);
                        setEditingQuiz(r.id);
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
                    {/* Delete — red trash, just right of the rename pencil */}
                    <button
                      onClick={() => setConfirmDeleteId(r.id)}
                      title="Delete quiz"
                      aria-label="Delete quiz"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        color: RED,
                        cursor: "pointer",
                        flexShrink: 0
                      }}
                    >
                      <TrashIcon size={14} />
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
              borderRadius: 3,
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
                  borderRadius: 3,
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
                  borderRadius: 3,
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
              borderRadius: 3,
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
                  borderRadius: 3,
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
                  borderRadius: 3,
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
