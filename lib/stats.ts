// Lightweight usage stats. Kept in localStorage always, and (when signed in)
// mirrored to the user's account so they follow them across devices.

// One answered question inside a quiz (kept so folders can rechallenge misses).
export type QuizItem = {
  question: string;
  options?: { A: string; B: string; C: string; D: string }; // absent for True/False
  correct: string; // correct answer (letter, or "True"/"False")
  chosen: string; // what the user picked
};

// One completed quiz, for the Quiz History page.
export type QuizRecord = {
  id: string; // stable id (for renaming / folders)
  name: string; // default "Quiz N", renameable
  date: number; // ms timestamp
  score: number; // percent correct
  grade: string; // e.g. "8", "Year 2", "Graduate"
  subject: string | null; // estimated subject, if any
  questions: number; // how many questions were in the quiz
  items: QuizItem[]; // the actual questions + answers
};

// The lowest unused "Quiz N" name. Numbering follows what's actually in the
// history — generating quizzes without submitting never burns a number, so the
// first quiz to reach the history is always "Quiz 1" — and deleting one frees
// its number again instead of leaving a gap or causing a duplicate. Renamed
// quizzes don't match the pattern, so they never hold a number hostage.
function nextQuizName(history: QuizRecord[]): string {
  const used = new Set<number>();
  for (const h of history) {
    const m = /^Quiz (\d+)$/.exec(h.name);
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `Quiz ${n}`;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// A folder groups quizzes together (by their ids).
export type Folder = {
  id: string;
  name: string;
  quizIds: string[];
};

const HISTORY_CAP = 50; // keep the most recent N quizzes

// --- Streak -----------------------------------------------------------------
// Submitting any quiz marks the day complete. Completing 5 in one day banks a
// "freeze" that covers one missed day, so the streak survives it.

export type Streak = {
  current: number; // consecutive completed days
  lastDay: string; // "YYYY-MM-DD" of the most recent completed day ("" = never)
  countToday: number; // quizzes submitted on `lastDay`
  freezes: number; // banked freeze days (one per 5-quiz day)
  premiumDays: number; // days of premium earned from milestones, banked for later
};

const EMPTY_STREAK: Streak = {
  current: 0,
  lastDay: "",
  countToday: 0,
  freezes: 0,
  premiumDays: 0
};

const QUIZZES_PER_FREEZE = 5;

// Local calendar day, as YYYY-MM-DD.
export function dayKey(ms: number = Date.now()): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Whole days from day `a` to day `b`. Compared as plain dates via UTC so a DST
// change can't shift the result by an hour and round to the wrong day.
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000
  );
}

// Premium days awarded for *reaching* this streak day (0 = not a milestone).
function milestoneReward(day: number): number {
  if (day === 7 || day === 14) return 3;
  if (day === 30) return 4;
  if (day === 60) return 5;
  return day > 60 && (day - 60) % 30 === 0 ? 5 : 0; // then every 30 days
}

// The milestone this streak is working toward, and what it pays out.
export function nextMilestone(current: number): { target: number; reward: number } {
  if (current < 7) return { target: 7, reward: 3 };
  if (current < 14) return { target: 14, reward: 3 };
  if (current < 30) return { target: 30, reward: 4 };
  if (current < 60) return { target: 60, reward: 5 };
  return { target: 60 + (Math.floor((current - 60) / 30) + 1) * 30, reward: 5 };
}

// The milestone this streak last cleared (the bar fills from here to the next).
function prevMilestone(current: number): number {
  if (current < 7) return 0;
  if (current < 14) return 7;
  if (current < 30) return 14;
  if (current < 60) return 30;
  return 60 + Math.floor((current - 60) / 30) * 30;
}

// The streak as it stands *right now*. The stored `current` is only refreshed on
// submit, so a streak can silently lapse between sessions — this reports what
// the user should actually see today (0 once it has lapsed for good).
export function currentStreak(st: Streak, today: string = dayKey()): number {
  if (!st.lastDay) return 0;
  const gap = dayDiff(st.lastDay, today);
  if (gap <= 1) return st.current; // done today, or still has today to keep it alive
  return st.freezes >= gap - 1 ? st.current : 0; // freezes cover the missed days
}

// Is the streak currently shielded by a banked freeze?
export function isFrozen(st: Streak): boolean {
  return st.freezes > 0;
}

// Fraction (0..1) of the way from the last milestone to the next.
export function streakProgress(current: number): number {
  const { target } = nextMilestone(current);
  const prev = prevMilestone(current);
  if (target <= prev) return 0;
  return Math.min(1, Math.max(0, (current - prev) / (target - prev)));
}

export type Stats = {
  questionsGenerated: number;
  quizzesCompleted: number;
  rechallengesTaken: number;
  hintsTaken: number;
  generatorCounts: { text: number; image: number; audio: number };
  gradeSum: number; // sum of quiz score percentages, for the average
  gradeCount: number; // how many graded quizzes went into gradeSum
  difficultyCounts: Record<string, number>; // e.g. { "8": 4, "Year 2": 1 }
  subjectCounts: Record<string, number>; // e.g. { "Biology": 3 }
  history: QuizRecord[]; // most recent quizzes, newest first
  folders: Folder[]; // user-made folders grouping quizzes
  streak: Streak; // daily streak + banked freezes/rewards
};

const KEY = "atheniaStats";

const EMPTY: Stats = {
  questionsGenerated: 0,
  quizzesCompleted: 0,
  rechallengesTaken: 0,
  hintsTaken: 0,
  generatorCounts: { text: 0, image: 0, audio: 0 },
  gradeSum: 0,
  gradeCount: 0,
  difficultyCounts: {},
  subjectCounts: {},
  history: [],
  folders: [],
  streak: { ...EMPTY_STREAK }
};

function sanitizeItems(v: unknown): QuizItem[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[])
    .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
    .map((it) => ({
      question: typeof it.question === "string" ? it.question : "",
      options:
        it.options && typeof it.options === "object"
          ? (it.options as { A: string; B: string; C: string; D: string })
          : undefined,
      correct: typeof it.correct === "string" ? it.correct : "",
      chosen: typeof it.chosen === "string" ? it.chosen : ""
    }));
}

// Coerce any stored / cloud object into a valid Stats (guards against bad data).
export function fromRaw(raw: unknown): Stats {
  if (!raw || typeof raw !== "object") return { ...EMPTY };
  const s = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
  const counts = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (v && typeof v === "object") {
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
        if (typeof n === "number" && isFinite(n)) out[k] = n;
      }
    }
    return out;
  };
  const gen = (s.generatorCounts ?? {}) as Record<string, unknown>;
  const history: QuizRecord[] = Array.isArray(s.history)
    ? (s.history as unknown[])
        .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
        .map((h) => ({
          id: typeof h.id === "string" ? h.id : makeId(),
          name: typeof h.name === "string" ? h.name : "Quiz",
          date: num(h.date),
          score: num(h.score),
          grade: typeof h.grade === "string" ? h.grade : "",
          subject: typeof h.subject === "string" ? h.subject : null,
          questions: num(h.questions),
          items: sanitizeItems(h.items)
        }))
        .slice(0, HISTORY_CAP)
    : [];
  const folders: Folder[] = Array.isArray(s.folders)
    ? (s.folders as unknown[])
        .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
        .map((f) => ({
          id: typeof f.id === "string" ? f.id : makeId(),
          name: typeof f.name === "string" ? f.name : "Folder",
          quizIds: Array.isArray(f.quizIds)
            ? (f.quizIds as unknown[]).filter((x): x is string => typeof x === "string")
            : []
        }))
    : [];
  return {
    questionsGenerated: num(s.questionsGenerated),
    quizzesCompleted: num(s.quizzesCompleted),
    rechallengesTaken: num(s.rechallengesTaken),
    hintsTaken: num(s.hintsTaken),
    generatorCounts: { text: num(gen.text), image: num(gen.image), audio: num(gen.audio) },
    gradeSum: num(s.gradeSum),
    gradeCount: num(s.gradeCount),
    difficultyCounts: counts(s.difficultyCounts),
    subjectCounts: counts(s.subjectCounts),
    history,
    folders,
    streak: streakFromRaw(s.streak)
  };
}

function streakFromRaw(v: unknown): Streak {
  if (!v || typeof v !== "object") return { ...EMPTY_STREAK };
  const st = v as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && isFinite(x) && x > 0 ? x : 0);
  return {
    current: num(st.current),
    lastDay: typeof st.lastDay === "string" ? st.lastDay : "",
    countToday: num(st.countToday),
    freezes: num(st.freezes),
    premiumDays: num(st.premiumDays)
  };
}

export function loadStats(): Stats {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? fromRaw(JSON.parse(raw)) : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

// The app registers a listener so it can mirror each change to the account.
let listener: ((s: Stats) => void) | null = null;
export function setStatsListener(cb: ((s: Stats) => void) | null) {
  listener = cb;
}

function writeLocal(s: Stats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable — stats just won't persist
  }
}

function save(s: Stats) {
  writeLocal(s);
  listener?.(s); // notify for cloud sync
}

// Overwrite local stats WITHOUT notifying the listener — used when loading the
// account's stats on sign-in, so we don't immediately push them straight back.
export function replaceStats(s: Stats) {
  writeLocal(s);
}

// A generation was kicked off from one of the three sources.
export function recordGeneration(mode: "text" | "image" | "audio") {
  const s = loadStats();
  s.generatorCounts[mode] += 1;
  save(s);
}

// `n` questions arrived from the AI.
export function recordQuestions(n: number) {
  const s = loadStats();
  s.questionsGenerated += n;
  save(s);
}

// The student took a rechallenge round.
export function recordRechallenge() {
  const s = loadStats();
  s.rechallengesTaken += 1;
  save(s);
}

// The student revealed a hint on a question.
export function recordHint() {
  const s = loadStats();
  s.hintsTaken += 1;
  save(s);
}

// Roll the streak forward for a quiz submitted today (mutates `st`).
function advanceStreak(st: Streak) {
  const today = dayKey();

  if (st.lastDay === today) {
    st.countToday += 1; // already counted today; just tally toward the freeze
  } else {
    const gap = st.lastDay ? dayDiff(st.lastDay, today) : Infinity;
    if (gap === 1) {
      st.current += 1; // yesterday -> streak continues
    } else if (gap > 1 && st.freezes >= gap - 1) {
      st.freezes -= gap - 1; // spend freezes to cover the missed days
      st.current += 1;
    } else {
      st.current = 1; // lapsed (or first ever) -> start over
      st.freezes = 0;
    }
    st.lastDay = today;
    st.countToday = 1;
    // Only pays out when the streak actually reaches a new day, so extra
    // quizzes on the same day can't farm the same milestone repeatedly.
    st.premiumDays += milestoneReward(st.current);
  }

  // 5 quizzes in one day banks a freeze (once per day).
  if (st.countToday === QUIZZES_PER_FREEZE) st.freezes += 1;
}

// A quiz was submitted/graded at `gradePercent`, on grade level `grade`, with an
// estimated `subject` (or null if it couldn't be guessed).
export function recordCompletion(
  gradePercent: number,
  grade: string,
  subject: string | null,
  items: QuizItem[]
) {
  const s = loadStats();
  s.quizzesCompleted += 1;
  s.gradeSum += gradePercent;
  s.gradeCount += 1;
  advanceStreak(s.streak);
  s.difficultyCounts[grade] = (s.difficultyCounts[grade] ?? 0) + 1;
  if (subject) s.subjectCounts[subject] = (s.subjectCounts[subject] ?? 0) + 1;
  const record: QuizRecord = {
    id: makeId(),
    name: nextQuizName(s.history),
    date: Date.now(),
    score: gradePercent,
    grade,
    subject,
    questions: items.length,
    items
  };
  s.history = [record, ...s.history].slice(0, HISTORY_CAP);
  save(s);
}

// Rename a quiz in the history.
export function renameQuiz(id: string, name: string) {
  const s = loadStats();
  const q = s.history.find((h) => h.id === id);
  if (!q) return;
  q.name = name.trim() || q.name;
  save(s);
}

// Delete a quiz from history and remove it from any folder it belongs to.
export function deleteQuiz(id: string) {
  const s = loadStats();
  s.history = s.history.filter((h) => h.id !== id);
  s.folders = s.folders.map((f) => ({
    ...f,
    quizIds: f.quizIds.filter((q) => q !== id)
  }));
  save(s);
}

// Create a new folder and return its id.
export function createFolder(name: string): string {
  const s = loadStats();
  const folder: Folder = {
    id: makeId(),
    name: name.trim() || "Untitled folder",
    quizIds: []
  };
  s.folders = [...s.folders, folder];
  save(s);
  return folder.id;
}

// Rename a folder.
export function renameFolder(id: string, name: string) {
  const s = loadStats();
  const f = s.folders.find((x) => x.id === id);
  if (!f) return;
  f.name = name.trim() || f.name;
  save(s);
}

// Add a quiz to a folder (no-op if already there).
export function addQuizToFolder(quizId: string, folderId: string) {
  const s = loadStats();
  const f = s.folders.find((x) => x.id === folderId);
  if (!f) return;
  if (!f.quizIds.includes(quizId)) f.quizIds.push(quizId);
  save(s);
}

// Take a quiz back out of a folder.
export function removeQuizFromFolder(quizId: string, folderId: string) {
  const s = loadStats();
  const f = s.folders.find((x) => x.id === folderId);
  if (!f) return;
  f.quizIds = f.quizIds.filter((id) => id !== quizId);
  save(s);
}

// The key with the highest count (ties broken by first seen), or null if all zero.
export function topKey(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

// Average quiz grade as a whole-number percent, or null if none graded yet.
export function averageGrade(s: Stats): number | null {
  return s.gradeCount ? Math.round(s.gradeSum / s.gradeCount) : null;
}
