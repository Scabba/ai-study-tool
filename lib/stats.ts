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
  current: number; // consecutive streak days
  lastDay: string; // ET day (YYYY-MM-DD) the streak was last increased
  lastIncreaseAt: number; // ms timestamp of that increase — the decay clock
  freezeProgress: number; // quizzes banked toward the next freeze (0..4)
  freezeEarnedAt: number | null; // ms the current freeze was earned (null = none)
  premiumDays: number; // days of Pro earned from milestones, banked for later
  rewarded: number; // highest milestone already paid out — each pays ONCE
};

const EMPTY_STREAK: Streak = {
  current: 0,
  lastDay: "",
  lastIncreaseAt: 0,
  freezeProgress: 0,
  freezeEarnedAt: null,
  premiumDays: 0,
  rewarded: 0
};

const DAY_MS = 86_400_000;
export const DECAY_AFTER_MS = 2 * DAY_MS; // streak decays 48h after it last went up
export const FREEZE_QUIZZES = 4; // quizzes after the streak-extending one to earn a freeze

// The streak's day boundary is midnight Eastern. en-CA formats as YYYY-MM-DD,
// and the timeZone option handles EST/EDT so it doesn't drift in summer.
export function estDayKey(ms: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(ms));
}

// Pro days awarded for *reaching* this streak day (0 = not a milestone).
function milestoneReward(day: number): number {
  if (day === 7 || day === 14) return 3;
  if (day === 30) return 4;
  if (day === 60) return 5;
  return day > 60 && (day - 60) % 30 === 0 ? 5 : 0; // then every 30 days
}

// The milestone this streak is working toward, and what it pays out.
export function nextMilestone(
  current: number,
  rewarded = 0
): { target: number; reward: number } {
  // Always points at the next milestone still EARNABLE — claimed rewards never
  // pay twice, so a lapse can't let you re-farm an old one.
  const floor = Math.max(current, rewarded);
  if (floor < 7) return { target: 7, reward: 3 };
  if (floor < 14) return { target: 14, reward: 3 };
  if (floor < 30) return { target: 30, reward: 4 };
  if (floor < 60) return { target: 60, reward: 5 };
  return { target: 60 + (Math.floor((floor - 60) / 30) + 1) * 30, reward: 5 };
}

// The milestone this streak last cleared (the bar fills from here to the next).
function prevMilestone(current: number): number {
  if (current < 7) return 0;
  if (current < 14) return 7;
  if (current < 30) return 14;
  if (current < 60) return 30;
  return 60 + Math.floor((current - 60) / 30) * 30;
}

// Settle the streak against the clock. A banked freeze is spent automatically
// the moment a decay would happen: the streak is kept and the 48h countdown
// restarts from that point. Anything still overdue after that decays normally
// (-1, then -1 per further 24h). Pure — callers persist the result on submit.
function settleStreak(
  st: Streak,
  now: number
): { current: number; decayAt: number; freezeUsed: boolean; hasFreeze: boolean } {
  const hasFreeze = !!st.freezeEarnedAt;
  if (!st.lastIncreaseAt) {
    return { current: st.current, decayAt: 0, freezeUsed: false, hasFreeze };
  }
  let decayAt = st.lastIncreaseAt + DECAY_AFTER_MS;
  let freezeUsed = false;
  if (now >= decayAt && hasFreeze) {
    decayAt += DECAY_AFTER_MS; // freeze absorbs it and resets the countdown
    freezeUsed = true;
  }
  let current = st.current;
  if (now >= decayAt) {
    current = Math.max(0, current - (Math.floor((now - decayAt) / DAY_MS) + 1));
  }
  return { current, decayAt, freezeUsed, hasFreeze: hasFreeze && !freezeUsed };
}

// Is a freeze banked and ready to protect the streak? (Drives the blue bar.)
export function isFrozen(st: Streak, now: number = Date.now()): boolean {
  return settleStreak(st, now).hasFreeze;
}

// Quizzes still needed to earn a freeze (null while one is banked — no stacking).
export function freezeQuizzesLeft(st: Streak, now: number = Date.now()): number | null {
  if (isFrozen(st, now)) return null;
  return Math.max(0, FREEZE_QUIZZES - st.freezeProgress);
}

// When the streak next decays (after any freeze has done its job).
export function streakDeadlines(
  st: Streak,
  now: number = Date.now()
): { decayAt: number } | null {
  if (!st.lastIncreaseAt) return null;
  return { decayAt: settleStreak(st, now).decayAt };
}

// The streak as it stands right now — stored `current` only changes on submit,
// so this applies whatever the clock owes since then.
export function currentStreak(st: Streak, now: number = Date.now()): number {
  return settleStreak(st, now).current;
}

// Fraction (0..1) of the way from the last milestone to the next.
export function streakProgress(current: number, rewarded = 0): number {
  const { target } = nextMilestone(current, rewarded);
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
  const lastDay = typeof st.lastDay === "string" ? st.lastDay : "";
  return {
    current: num(st.current),
    lastDay,
    // Saves from before the 48h clock have no timestamp — seed it from now so
    // an existing streak gets a fresh window instead of instantly decaying.
    lastIncreaseAt: num(st.lastIncreaseAt) || (lastDay ? Date.now() : 0),
    freezeProgress: num(st.freezeProgress),
    freezeEarnedAt: num(st.freezeEarnedAt) || null,
    premiumDays: num(st.premiumDays),
    rewarded: num(st.rewarded)
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

// Roll the streak forward for a submitted quiz (mutates `st`). Returns the
// milestone day just reached, or 0 — the caller uses it to claim the Pro days
// from the server, which is what actually grants them. `premiumDays` below is
// only a local tally for display; the server is the authority (lib/proGrants).
function advanceStreak(st: Streak): number {
  const now = Date.now();
  const today = estDayKey(now);

  if (st.lastDay !== today) {
    // First quiz of a new Eastern day: settle any decay owed, then add today.
    // The 48h decay clock restarts from this moment.
    const settled = settleStreak(st, now);
    if (settled.freezeUsed) st.freezeEarnedAt = null; // the freeze did its job
    st.current = settled.current + 1;
    st.lastDay = today;
    st.lastIncreaseAt = now;
    st.freezeProgress = 0; // a fresh grind toward today's freeze
    // Each milestone pays out ONCE ever — a lapse can't let you re-earn it.
    const reward = milestoneReward(st.current);
    if (reward > 0 && st.current > st.rewarded) {
      st.premiumDays += reward;
      st.rewarded = st.current;
      return st.current;
    }
    return 0;
  }

  // Same day: further quizzes grind toward a freeze. Only one freeze exists at
  // a time and they don't stack, so this pauses while one is active — the grind
  // reopens (from zero) once it expires.
  if (!isFrozen(st, now) && st.freezeProgress < FREEZE_QUIZZES) {
    st.freezeProgress += 1;
    if (st.freezeProgress >= FREEZE_QUIZZES) {
      st.freezeEarnedAt = now;
      st.freezeProgress = 0;
    }
  }
  return 0; // freezes aren't milestones
}

// A quiz was submitted/graded at `gradePercent`, on grade level `grade`, with an
// estimated `subject` (or null if it couldn't be guessed).
// Returns the streak milestone just reached (0 if none), so the caller can ask
// the server to grant the Pro days for it.
export function recordCompletion(
  gradePercent: number,
  grade: string,
  subject: string | null,
  items: QuizItem[]
): number {
  const s = loadStats();
  s.quizzesCompleted += 1;
  s.gradeSum += gradePercent;
  s.gradeCount += 1;
  const milestoneReached = advanceStreak(s.streak);
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
  return milestoneReached;
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

// Delete a folder. The quizzes it held are untouched — a folder is just a tag,
// so removing it un-files those quizzes rather than deleting them.
export function deleteFolder(id: string) {
  const s = loadStats();
  s.folders = s.folders.filter((f) => f.id !== id);
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
