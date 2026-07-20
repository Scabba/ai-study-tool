"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  Fragment,
  type DragEvent
} from "react";
import Link from "next/link";
import WhatsNew from "./WhatsNew";
import AuthButton from "./components/AuthButton";
import PricingModal from "./components/PricingModal";
import { createClient } from "@/lib/supabase/client";
import { fetchSettings, saveSettings, type Settings } from "@/lib/userSettings";
import {
  loadStats,
  recordGeneration,
  recordQuestions,
  recordRechallenge,
  recordHint,
  recordCompletion,
  replaceStats,
  setStatsListener,
  topKey,
  averageGrade,
  currentStreak,
  isFrozen,
  nextMilestone,
  streakProgress,
  streakDeadlines,
  freezeQuizzesLeft,
  type Stats,
  type Streak
} from "@/lib/stats";
import { fetchStats, saveStats } from "@/lib/userStats";
import { classifySubject } from "@/lib/subjects";
import {
  FONTS,
  PALETTES,
  DEFAULT_THEME,
  applyTheme,
  loadTheme,
  saveTheme,
  type ThemeChoice
} from "@/lib/theme";

// A multiple-choice question coming back from the server
type MCQuestion = {
  type?: "mc";
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: string;
  difficulty: string;
  round?: number; // 0 = original quiz, 1+ = rechallenge extension rounds
};

// A true/false question — a statement the user judges "True" or "False"
type TFQuestion = {
  type: "tf";
  question: string;
  answer: "True" | "False";
  difficulty: string;
  round?: number; // 0 = original quiz, 1+ = rechallenge extension rounds
};

type Question = MCQuestion | TFQuestion;

type Mode = "text" | "image" | "audio";

// Each tab is its own workspace with its own quiz, so you can leave one
// half-finished, go generate another on a different tab, and come back to it.
// Generation state lives in here too — otherwise a run streaming into one tab
// would show its loading dots on (and block Generate for) the others.
type QuizState = {
  questions: Question[];
  answers: Record<number, string>; // which letter the user picked per question
  // How many rounds have been graded. Round 0 is the original quiz; each
  // Rechallenge adds another. A question in round r is graded once
  // r < submittedRounds.
  submittedRounds: number;
  // Per-question hint state: "loading" while it's being generated, then the text.
  hints: Record<number, { status: "loading" | "done"; text?: string }>;
  loading: boolean; // a generation is streaming into this tab
  rechallengeLoading: boolean; // a rechallenge round is streaming into this tab
};

const EMPTY_QUIZ: QuizState = {
  questions: [],
  answers: {},
  submittedRounds: 0,
  hints: {},
  loading: false,
  rechallengeLoading: false
};

const emptyQuizzes = (): Record<Mode, QuizState> => ({
  text: { ...EMPTY_QUIZ },
  image: { ...EMPTY_QUIZ },
  audio: { ...EMPTY_QUIZ }
});

// Most photos you can upload at once
const MAX_IMAGES = 5;

// The in-progress quiz is mirrored here so leaving the page (Support, Quiz
// history, Updates, ...) and coming back doesn't throw it away. sessionStorage,
// not localStorage: it should outlive a navigation, not a whole browser session.
const QUIZ_SESSION_KEY = "atheniaActiveQuiz";

// Parks the restart button just off the right edge of a Generate button, out of
// the flow so showing it never shifts the (centered) Generate button.
const restartSlot: React.CSSProperties = {
  position: "absolute",
  left: "100%",
  marginLeft: 10,
  top: "50%",
  transform: "translateY(-50%)"
};

// Difficulty slider stops (index 0 -> 2)
const DIFFICULTIES = ["Middle School", "High School", "University"];

// True on narrow (phone) screens. Uses matchMedia so it updates live when the
// window is resized or rotated, and renders as desktop-first on the server.
function useIsMobile(breakpoint = 640) {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(`(max-width: ${breakpoint}px)`).matches,
    () => false // server / first paint: assume desktop
  );
}

// Upload a file to the Supabase Storage `audio` bucket via XMLHttpRequest, so we
// can report real byte-level progress (the Supabase JS client uploads with
// fetch, which gives no progress events). The bucket allows anon inserts, so the
// public anon key is enough. Calls onProgress(0..100) as bytes go out.
function uploadAudioWithProgress(
  file: File,
  path: string,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!base || !key) {
      reject(new Error("Supabase env vars are not set"));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/audio/${path}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("Authorization", `Bearer ${key}`);
    xhr.setRequestHeader("x-upsert", "false");
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("network error during upload"));
    xhr.send(file);
  });
}

// Muted slate accent for selected tabs / the Generate button — matches the
// "NEW" badge on the Updates page instead of the old bright blue.
const ACCENT_BG = "rgba(148, 163, 184, 0.18)";
// A stronger fill for the multi-option pickers (Questions / Grade), where the
// faint version made it hard to tell which one was selected.
const ACCENT_BG_STRONG = "rgba(148, 163, 184, 0.35)";
const ACCENT_TEXT = "#cbd5e1";
// Muted grading colours — softer than pure green/red for right / wrong titles
// and the correct-answer dot, with a muted green for the Submit / grade button.
const CORRECT_GREEN = "#57b98a";
const WRONG_RED = "#e0776b";
const SUBMIT_GREEN = "#3f9169";
// Rechallenge (extension-round) theme: yellow instead of green. Muted gold to
// match the understated palette. YELLOW for titles/outline, BTN for the filled
// Submit / grade box.
const RECHALLENGE_YELLOW = "#d9b45a";
const RECHALLENGE_BTN = "#c79a34";
// Hint theme: the same yellow used for the answer-selection dot, so the
// lightbulb and hint text read as one "yellow" accent.
const HINT_YELLOW = "#eab308";
// Streak bar: light orange normally, light blue while a freeze is protecting it.
const STREAK_ORANGE = "#e9a05c";
const STREAK_FROZEN_BLUE = "#7dd3fc";
const STREAK_TRACK = "rgba(148, 163, 184, 0.22)";

// Whether Supabase auth is wired up (keys present in the browser bundle)
const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Shared style for the icon rows inside the account oval
const ovalItem: React.CSSProperties = {
  width: "100%",
  height: 40,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer"
};

// Grade/Year choices for each difficulty (same index order as DIFFICULTIES)
const GRADE_OPTIONS = [
  ["5", "6", "7", "8"],              // Middle School
  ["9", "10", "11", "12"],           // High School
  ["1", "2", "3", "4", "Graduate"]   // University
];

export default function Home() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("text"); // which page tab is active
  const [images, setImages] = useState<string[]>([]); // uploaded images on the image page
  // uploaded audio/video: previewUrl (local player), path (in the private Storage bucket)
  const [audioFiles, setAudioFiles] = useState<
    {
      name: string;
      previewUrl: string;
      path: string;
      isVideo: boolean;
      sig: string; // name|size|lastModified — to skip re-uploading the same file
    }[]
  >([]);
  const [audioUploading, setAudioUploading] = useState(false); // is a file uploading to Storage?
  const [audioProgress, setAudioProgress] = useState(0); // upload progress 0–100 for the loading bar
  const [recording, setRecording] = useState(false); // is the mic recording right now?
  const [recordSeconds, setRecordSeconds] = useState(0); // elapsed recording time
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]); // audio data collected while recording
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Live visualizer: analyser reads mic levels, rAF loop moves the bars. The
  // bars are driven by direct style writes (not React state) — 60 updates/sec
  // through setState would re-render the whole page each frame.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vizRafRef = useRef<number>(0);
  const vizBarsRef = useRef<HTMLDivElement>(null);
  const [youtubeUrl, setYoutubeUrl] = useState(""); // pasted YouTube link on the audio page
  const [showYoutube, setShowYoutube] = useState(false); // is the YouTube link box open?
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // the mobile hamburger menu
  const [accountMenuOpen, setAccountMenuOpen] = useState(false); // account dropdown under the "?"
  const [authEmail, setAuthEmail] = useState<string | null>(null); // signed-in user's email, if any
  const [authAvatar, setAuthAvatar] = useState<string | null>(null); // signed-in user's photo, if any
  const [authUserId, setAuthUserId] = useState<string | null>(null); // signed-in user's id (for account-wide settings)
  const [authClient] = useState(() => (SUPABASE_CONFIGURED ? createClient() : null));
  const isMobile = useIsMobile();
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null); // image shown fullscreen
  const [fullscreenVideo, setFullscreenVideo] = useState<string | null>(null); // video shown fullscreen
  // One quiz per tab; the active tab's is what the page renders.
  const [quizzes, setQuizzes] = useState<Record<Mode, QuizState>>(emptyQuizzes);
  const { questions, answers, submittedRounds, hints, loading, rechallengeLoading } =
    quizzes[mode];

  // Patch one tab's quiz. Callers pass the tab explicitly, so a generation that
  // started on Text keeps writing to Text even after you switch away.
  const patchQuiz = (
    m: Mode,
    patch: Partial<QuizState> | ((q: QuizState) => Partial<QuizState>)
  ) =>
    setQuizzes((prev) => ({
      ...prev,
      [m]: { ...prev[m], ...(typeof patch === "function" ? patch(prev[m]) : patch) }
    }));
  const [instantFeedback, setInstantFeedback] = useState(false); // reveal right/wrong as you answer
  const [toggleError, setToggleError] = useState<string | null>(null); // shown if you try to change instant feedback mid-quiz
  const [genError, setGenError] = useState<string | null>(null); // shown when trying to generate without required settings
  const [amount, setAmount] = useState(5); // how many multiple-choice questions to generate
  const [tfAmount, setTfAmount] = useState(0); // how many true/false questions (0 = none)
  const [showNotice, setShowNotice] = useState(false); // the "?" pre-release notice
  const [showSettings, setShowSettings] = useState(false); // the cog settings panel
  const [showStats, setShowStats] = useState(false); // the Stats panel
  const [statsData, setStatsData] = useState<Stats | null>(null); // snapshot shown in the Stats panel
  const [showPricing, setShowPricing] = useState(false); // the Athenia Pro upgrade screen
  const [showCustomize, setShowCustomize] = useState(false); // the palette / customization panel
  const [theme, setTheme] = useState<ThemeChoice>(DEFAULT_THEME); // font + palette choice
  const [isPro, setIsPro] = useState(false); // does this account have an active subscription?
  const [streak, setStreak] = useState<Streak | null>(null); // daily streak shown under the title
  const [showStreakInfo, setShowStreakInfo] = useState(false); // the streak's "i" reward popover
  const [dragging, setDragging] = useState(false); // a file is being dragged over the text box
  const [difficulty, setDifficulty] = useState(1); // 0=Middle School, 1=High School, 2=University
  const [gradeYear, setGradeYear] = useState<string | null>(null); // chosen grade/year within the difficulty
  const [dotCount, setDotCount] = useState(3); // for the animated "paste text here..." dots
  const [flashIndex, setFlashIndex] = useState<number | null>(null); // which question to flash as "missing"
  const reviewScrollRef = useRef(false); // scroll to the quiz after opening one from history
  const streakInfoRef = useRef<HTMLDivElement>(null); // the streak bar + its "i" popover
  const quizRestored = useRef(false); // true once the saved quiz has been read back
  const fileInputRef = useRef<HTMLInputElement>(null); // hidden PDF file picker
  const dragDepth = useRef(0); // enter/leave counter so the drag highlight doesn't flicker over children
  const imageInputRef = useRef<HTMLInputElement>(null); // hidden image file picker
  const audioInputRef = useRef<HTMLInputElement>(null); // hidden audio/video file picker
  const noticeRef = useRef<HTMLDivElement>(null); // the pre-release notice box
  const noticeButtonRef = useRef<HTMLButtonElement>(null); // the "?" button
  const settingsRef = useRef<HTMLDivElement>(null); // the settings panel
  const settingsButtonRef = useRef<HTMLButtonElement>(null); // the cog button
  const mobileMenuRef = useRef<HTMLDivElement>(null); // the mobile hamburger + its dropdown
  const accountMenuRef = useRef<HTMLDivElement>(null); // the mobile account button + its dropdown
  const skipFirstSave = useRef(true); // don't save settings on the very first render
  const cloudReady = useRef(false); // true once we've loaded (or migrated) this user's cloud settings
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // debounces cloud writes
  const statsCloudReady = useRef(false); // true once we've loaded (or seeded) this user's cloud stats
  const statsCloudTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // debounces cloud stat writes
  const latestSettings = useRef<Settings>({
    difficulty: 1,
    gradeYear: null,
    instantFeedback: false,
    amount: 5,
    tfAmount: 0
  }); // always holds the current settings (used to seed a brand-new account)
  // One in-flight generation per tab, so generating on Image can't cancel Text's.
  const genAbortRef = useRef<Record<Mode, AbortController | null>>({
    text: null,
    image: null,
    audio: null
  });

  // Close the mobile hamburger menu when you tap outside it
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (!mobileMenuRef.current?.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileMenuOpen]);

  // Close the account dropdown when you tap outside it
  useEffect(() => {
    if (!accountMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (!accountMenuRef.current?.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [accountMenuOpen]);

  // Pre-paint: hydrate who-am-I and Pro state from the last visit's cache so
  // the profile button and "Athenia Pro" title don't blink out on every
  // navigation while the real checks run. Verified (and re-cached) just below.
  useLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem("atheniaAuthCache");
      if (!raw) return;
      const c = JSON.parse(raw);
      /* eslint-disable react-hooks/set-state-in-effect -- pre-paint cache hydration */
      if (typeof c.email === "string") setAuthEmail(c.email);
      if (typeof c.id === "string") setAuthUserId(c.id);
      if (typeof c.avatar === "string") setAuthAvatar(c.avatar);
      if (c.pro === true && typeof c.id === "string") setIsPro(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // no cache — normal first visit
    }
  }, []);

  // Track the signed-in user (email + photo) for the account button
  useEffect(() => {
    if (!authClient) return;
    let active = true;
    const apply = (
      user: { id?: string; email?: string; user_metadata?: Record<string, unknown> } | null
    ) => {
      setAuthEmail(user?.email ?? null);
      setAuthUserId(user?.id ?? null);
      const meta = user?.user_metadata ?? {};
      setAuthAvatar(
        (meta.avatar_url as string) ?? (meta.picture as string) ?? null
      );
      try {
        if (user?.email) {
          const prev = JSON.parse(sessionStorage.getItem("atheniaAuthCache") ?? "{}");
          sessionStorage.setItem("atheniaAuthCache", JSON.stringify({
            email: user.email,
            id: user.id,
            avatar: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
            pro: prev.id === user.id ? prev.pro === true : false
          }));
        } else {
          sessionStorage.removeItem("atheniaAuthCache");
        }
      } catch { /* cache is best-effort */ }
    };
    authClient.auth.getUser().then(({ data }) => {
      if (active) apply(data.user);
    });
    const { data: sub } = authClient.auth.onAuthStateChange((_e, session) =>
      apply(session?.user ?? null)
    );
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [authClient]);

  // Close the notice when you click anywhere outside it (or its button)
  useEffect(() => {
    if (!showNotice) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        noticeRef.current?.contains(target) ||
        noticeButtonRef.current?.contains(target)
      ) {
        return; // clicked the notice or the "?" — leave it to their own handlers
      }
      setShowNotice(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotice]);

  // Close the settings panel when you click anywhere outside it (or the cog)
  useEffect(() => {
    if (!showSettings) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        settingsRef.current?.contains(target) ||
        settingsButtonRef.current?.contains(target)
      ) {
        return;
      }
      setShowSettings(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSettings]);

  // Animate the dots (1 -> 2 -> 3 -> 1 ...) for the empty-box placeholder and
  // for the "Uploading..." message on the audio page.
  useEffect(() => {
    if (text !== "" && !audioUploading) return; // nothing using the dots right now
    const id = setInterval(() => {
      setDotCount((c) => (c === 3 ? 1 : c + 1));
    }, 800); // slow, calm tick — fast dots felt stressful
    return () => clearInterval(id); // stop the timer when we're done
  }, [text, audioUploading]);

  // Load the user's saved settings once, on first load
  useEffect(() => {
    try {
      const raw = localStorage.getItem("edforceSettings");
      if (!raw) return;
      const s = JSON.parse(raw);
      // Loading saved settings must happen in an effect (SSR-safe); these
      // one-time setState calls are intentional.
      /* eslint-disable react-hooks/set-state-in-effect */
      if (typeof s.difficulty === "number") setDifficulty(s.difficulty);
      if (s.gradeYear === null || typeof s.gradeYear === "string") setGradeYear(s.gradeYear);
      if (typeof s.instantFeedback === "boolean") setInstantFeedback(s.instantFeedback);
      if (typeof s.amount === "number") setAmount(s.amount);
      if (typeof s.tfAmount === "number") setTfAmount(s.tfAmount);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // ignore bad/missing saved data
    }
  }, []);

  // Save settings whenever they change (skipping the first render, which runs
  // before the saved values have loaded — so we don't overwrite them). Signed-in
  // users also get the change mirrored to their account so it follows them across
  // devices; signed-out users just use localStorage as before.
  useEffect(() => {
    const current = { difficulty, gradeYear, instantFeedback, amount, tfAmount };
    latestSettings.current = current;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    try {
      localStorage.setItem("edforceSettings", JSON.stringify(current));
    } catch {
      // storage might be unavailable — not critical
    }
    // Push to the account, but only once we've loaded their cloud settings (so a
    // stale local value can't overwrite the cloud during login). Debounced so
    // dragging the difficulty slider doesn't fire a write per step.
    if (authClient && authUserId && cloudReady.current) {
      if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
      cloudSaveTimer.current = setTimeout(() => {
        saveSettings(authClient, authUserId, current);
      }, 500);
    }
  }, [difficulty, gradeYear, instantFeedback, amount, tfAmount, authClient, authUserId]);

  // When a user signs in, load their account-wide settings — the cloud copy wins
  // across devices. If they have no saved row yet, seed it from whatever's set
  // right now (migrating this device's local settings up so nothing is lost).
  useEffect(() => {
    cloudReady.current = false;
    if (!authClient || !authUserId) return;
    let active = true;
    (async () => {
      const cloud = await fetchSettings(authClient, authUserId);
      if (!active) return;
      if (cloud) {
        setDifficulty(cloud.difficulty);
        setGradeYear(cloud.gradeYear);
        setInstantFeedback(cloud.instantFeedback);
        setAmount(cloud.amount);
        setTfAmount(cloud.tfAmount);
      } else {
        await saveSettings(authClient, authUserId, latestSettings.current);
      }
      if (active) cloudReady.current = true;
    })();
    return () => {
      active = false;
    };
  }, [authClient, authUserId]);

  // Mirror stats to the account whenever they change (debounced — recording a
  // question fires often). Only pushes once the cloud stats have been loaded, so
  // a fresh local copy can't clobber the account during sign-in.
  useEffect(() => {
    setStatsListener((s) => {
      if (!authClient || !authUserId || !statsCloudReady.current) return;
      if (statsCloudTimer.current) clearTimeout(statsCloudTimer.current);
      statsCloudTimer.current = setTimeout(() => {
        saveStats(authClient, authUserId, s);
      }, 1500);
    });
    return () => setStatsListener(null);
  }, [authClient, authUserId]);

  // On sign-in, load the account's stats (cloud wins across devices). If the
  // account has none yet, seed it from this device's local stats.
  useEffect(() => {
    statsCloudReady.current = false;
    if (!authClient || !authUserId) return;
    let active = true;
    (async () => {
      const cloud = await fetchStats(authClient, authUserId);
      if (!active) return;
      if (cloud) {
        replaceStats(cloud); // overwrite local with the account copy
        setStreak(cloud.streak); // ...and show the account's streak
      } else {
        await saveStats(authClient, authUserId, loadStats());
      }
      if (active) statsCloudReady.current = true;
    })();
    return () => {
      active = false;
    };
  }, [authClient, authUserId]);

  // If the page unmounts mid-recording, stop the recorder and release the mic.
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      cancelAnimationFrame(vizRafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null; // don't try to upload from a dead page
        rec.stop();
        rec.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Is this account Pro? RLS lets a user read only their own subscription row.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!authClient || !authUserId) {
        if (active) setIsPro(false); // signed out -> definitely not Pro
        return;
      }
      const { data } = await authClient
        .from("subscriptions")
        .select("status")
        .eq("user_id", authUserId)
        .maybeSingle();
      if (!active) return;
      const pro = data?.status === "active" || data?.status === "trialing";
      setIsPro(pro);
      try {
        const prev = JSON.parse(sessionStorage.getItem("atheniaAuthCache") ?? "{}");
        if (prev.id === authUserId) {
          sessionStorage.setItem("atheniaAuthCache", JSON.stringify({ ...prev, pro }));
        }
      } catch { /* best-effort */ }
    })();
    return () => {
      active = false;
    };
  }, [authClient, authUserId]);

  // Streak lives in localStorage, so it can only be read once we're in the
  // browser — this one-time setState is intentional.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setStreak(loadStats().streak);
    setTheme(loadTheme()); // panel state only; ThemeLoader already applied it
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Close the streak's "i" popover when clicking anywhere outside it.
  useEffect(() => {
    if (!showStreakInfo) return;
    function handleClickOutside(e: MouseEvent) {
      if (!streakInfoRef.current?.contains(e.target as Node)) setShowStreakInfo(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showStreakInfo]);

  // Bring back the quizzes we were in the middle of (all three tabs), so
  // navigating away to Support / Quiz history / Updates and back doesn't lose
  // them. Runs before the handoff effects below, so opening a saved quiz from
  // history still wins over whatever was here.
  useEffect(() => {
    (async () => {
      try {
        const raw = sessionStorage.getItem(QUIZ_SESSION_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Record<Mode, QuizState>>;
          const restored = emptyQuizzes();
          for (const m of ["text", "image", "audio"] as Mode[]) {
            const q = saved[m];
            if (!q || !Array.isArray(q.questions) || q.questions.length === 0) continue;
            restored[m] = {
              ...EMPTY_QUIZ,
              questions: q.questions,
              answers: q.answers ?? {},
              submittedRounds: q.submittedRounds ?? 0,
              // Drop hints still loading when we left — that fetch is long gone.
              // Loading flags are dropped too: those streams didn't survive.
              hints: Object.fromEntries(
                Object.entries(q.hints ?? {}).filter(([, h]) => h?.status === "done")
              )
            };
          }
          setQuizzes(restored);
        }
      } catch {
        // no session storage / bad payload — start fresh
      }
      quizRestored.current = true; // only now may we start writing back
    })();
  }, []);

  // Mirror every tab's quiz into sessionStorage on change.
  useEffect(() => {
    if (!quizRestored.current) return; // don't clobber the save before we've read it
    try {
      const anyQuestions = (["text", "image", "audio"] as Mode[]).some(
        (m) => quizzes[m].questions.length > 0
      );
      if (!anyQuestions) sessionStorage.removeItem(QUIZ_SESSION_KEY);
      else sessionStorage.setItem(QUIZ_SESSION_KEY, JSON.stringify(quizzes));
    } catch {
      // storage full/unavailable — the quizzes just won't survive a navigation
    }
  }, [quizzes]);

  // A folder "rechallenge" hands off the missed questions via localStorage, then
  // navigates here — pick them up once and load them as a fresh quiz to retake.
  useEffect(() => {
    (async () => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem("atheniaFolderRechallenge");
        if (raw) localStorage.removeItem("atheniaFolderRechallenge");
      } catch {
        return;
      }
      if (!raw) return;
      try {
        const items = JSON.parse(raw) as {
          question: string;
          options?: { A: string; B: string; C: string; D: string };
          correct: string;
        }[];
        const qs: Question[] = items.slice(0, 20).map((it) =>
          it.options
            ? {
                question: it.question,
                options: it.options,
                answer: it.correct,
                difficulty: "medium",
                round: 0
              }
            : {
                type: "tf",
                question: it.question,
                answer: it.correct === "True" ? "True" : "False",
                difficulty: "medium",
                round: 0
              }
        );
        if (qs.length) {
          // Lands on the Text tab — that's the tab the app opens on.
          patchQuiz("text", { ...EMPTY_QUIZ, questions: qs });
        }
      } catch {
        // bad payload — ignore
      }
    })();
  }, []);

  // Opening a saved quiz from Quiz History hands its questions + the user's
  // answers over via localStorage, then navigates here — load them once and
  // show it already graded (in review mode).
  useEffect(() => {
    (async () => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem("atheniaViewQuiz");
        if (raw) localStorage.removeItem("atheniaViewQuiz");
      } catch {
        return;
      }
      if (!raw) return;
      try {
        const items = JSON.parse(raw) as {
          question: string;
          options?: { A: string; B: string; C: string; D: string };
          correct: string;
          chosen: string;
        }[];
        const qs: Question[] = items.map((it) =>
          it.options
            ? {
                question: it.question,
                options: it.options,
                answer: it.correct,
                difficulty: "medium",
                round: 0
              }
            : {
                type: "tf",
                question: it.question,
                answer: it.correct === "True" ? "True" : "False",
                difficulty: "medium",
                round: 0
              }
        );
        if (qs.length) {
          const chosen: Record<number, string> = {};
          items.forEach((it, i) => {
            if (it.chosen) chosen[i] = it.chosen;
          });
          reviewScrollRef.current = true; // jump to the quiz once it renders
          // Lands on the Text tab — that's the tab the app opens on.
          patchQuiz("text", {
            ...EMPTY_QUIZ,
            questions: qs,
            answers: chosen,
            submittedRounds: 1 // round 0 is already graded → reveal right/wrong
          });
        }
      } catch {
        // bad payload — ignore
      }
    })();
  }, []);

  // After opening a quiz from history, scroll it into view — otherwise you land
  // at the top of the generator and the reviewed quiz is easy to miss below it.
  useEffect(() => {
    if (!reviewScrollRef.current || questions.length === 0) return;
    reviewScrollRef.current = false;
    // Defer past the router's scroll-to-top that follows navigation, and use an
    // instant jump — a smooth scroll gets cancelled by the re-renders that land
    // right after navigation, dropping us back at the top.
    const t = setTimeout(() => {
      document
        .getElementById("question-0")
        ?.scrollIntoView({ behavior: "auto", block: "start" });
    }, 250);
    return () => clearTimeout(t);
  }, [questions]);

  const placeholder = "paste text here" + ".".repeat(dotCount);

  function handleSubmit() {
    // Grade the current (not-yet-graded) round only. Find the first UNANSWERED
    // question within that round.
    const activeRound = submittedRounds;
    const missing = questions.findIndex(
      (q, i) => (q.round ?? 0) === activeRound && !answers[i]
    );

    if (missing !== -1) {
      // Scroll that question to the middle of the screen...
      const el = document.getElementById(`question-${missing}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });

      // ...and flash it yellow for three seconds
      setFlashIndex(missing);
      setTimeout(() => setFlashIndex(null), 3000);
      return; // stop here — don't grade an incomplete round
    }

    // Stats: only the original quiz (round 0) counts as a completed quiz;
    // rechallenge rounds are extra practice within it.
    if (activeRound === 0) {
      // Capture each round-0 question with the user's answer (for history + folder rechallenge)
      const items = questions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => (q.round ?? 0) === 0)
        .map(({ q, i }) => ({
          question: q.question,
          options: "options" in q ? q.options : undefined,
          correct: q.answer,
          chosen: answers[i] ?? ""
        }));
      const correct = items.filter((it) => it.chosen === it.correct).length;
      const pct = items.length ? Math.round((correct / items.length) * 100) : 0;
      const quizText = items
        .map((it) => `${it.question} ${it.options ? Object.values(it.options).join(" ") : ""}`)
        .join(" ");
      recordCompletion(pct, gradeLabel(), classifySubject(quizText), items);
      setStreak(loadStats().streak); // submitting completes the day
    }

    patchQuiz(mode, { submittedRounds: activeRound + 1 }); // this round is now graded
    setToggleError(null); // toggle is usable again now that it's submitted
  }

  // The instant-feedback toggle is locked while the active (ungraded) round has
  // any answer in it — so you can't flip it to peek mid-round.
  const activeRoundAnswered = questions.some(
    (q, i) => (q.round ?? 0) === submittedRounds && answers[i] != null
  );

  // Turn the difficulty + grade settings into a phrase the AI can target,
  // e.g. "grade 8 (middle school)" or "graduate-level (university)"
  function describeLevel(): string {
    const school = DIFFICULTIES[difficulty];
    if (!gradeYear) return school; // no grade picked yet -> just the school level
    if (difficulty === 2) {
      return gradeYear === "Graduate"
        ? "graduate-level (university)"
        : `year ${gradeYear} university`;
    }
    return `grade ${gradeYear} (${school.toLowerCase()})`;
  }

  // The specific grade level for the Stats panel: "8", "Year 2", or "Graduate".
  function gradeLabel(): string {
    if (!gradeYear) return DIFFICULTIES[difficulty];
    if (difficulty === 2) {
      return gradeYear === "Graduate" ? "Graduate" : `Year ${gradeYear}`;
    }
    return gradeYear; // grade number for middle / high school
  }

  // Reveal a hint for one question: show a brief loading animation, ask the
  // server for a nudge, then display it in yellow under the choices. Ignores
  // repeat clicks once a hint is loading or already shown.
  async function takeHint(i: number) {
    const q = questions[i];
    if (!q || hints[i]) return;
    const hintMode = mode; // the tab this hint belongs to
    patchQuiz(hintMode, (s) => ({ hints: { ...s.hints, [i]: { status: "loading" } } }));
    try {
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.question,
          answer: q.answer,
          options: "options" in q ? q.options : undefined,
          level: gradeLabel()
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.hint) throw new Error(data?.error ?? "no hint");
      patchQuiz(hintMode, (s) => ({
        hints: { ...s.hints, [i]: { status: "done", text: data.hint } }
      }));
      recordHint(); // stats: count this hint
    } catch {
      // Failed — drop the state so the lightbulb can be tried again.
      patchQuiz(hintMode, (s) => {
        const next = { ...s.hints };
        delete next[i];
        return { hints: next };
      });
    }
  }

  // Read the NDJSON stream the server sends (one question per line, or an
  // {error} line). Calls onItem for each question as it arrives.
  async function readQuestionStream(
    res: Response,
    signal: AbortSignal,
    onItem: (item: Question) => void | Promise<void>
  ) {
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handleLine = async (line: string) => {
      if (signal.aborted) return; // page was switched — drop it
      const item = JSON.parse(line);
      if (item.error) {
        setGenError(item.error); // the server told us what went wrong
        return;
      }
      await onItem(item as Question);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // the last piece might be a half-finished line
      for (const line of lines) {
        if (line.trim()) await handleLine(line);
      }
    }
    if (buffer.trim()) await handleLine(buffer);
  }

  // Core generation: send a payload (text OR image) and stream questions in
  async function runGeneration(payload: {
    text?: string;
    images?: string[];
    audioPath?: string;
    audioName?: string;
    youtube?: string;
  }) {
    if (!gradeYear) {
      setGenError("Choose grade level in settings to generate questions");
      return;
    }
    if (amount === 0 && tfAmount === 0) {
      setGenError("Choose a question amount larger than zero to generate");
      return;
    }
    // Pin this run to the tab it started on, so it keeps filling that tab's quiz
    // even if the user switches away mid-generation.
    const genMode = mode;

    setGenError(null);
    setToggleError(null); // fresh quiz -> toggle is usable again
    patchQuiz(genMode, { ...EMPTY_QUIZ, loading: true }); // clear this tab's quiz, dots on

    // Stats: count which source this generation came from
    recordGeneration(
      payload.images?.length
        ? "image"
        : payload.audioPath || payload.youtube
          ? "audio"
          : "text"
    );

    // Cancel this tab's previous run, otherwise its questions keep landing in
    // the quiz we just cleared. Other tabs' runs are untouched.
    genAbortRef.current[genMode]?.abort();
    const controller = new AbortController();
    genAbortRef.current[genMode] = controller;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ...payload, count: amount, tfCount: tfAmount, level: describeLevel() }),
        signal: controller.signal
      });

      // Original quiz -> everything is round 0. A small gap so each pops in.
      await readQuestionStream(res, controller.signal, async (item) => {
        patchQuiz(genMode, (q) => ({ questions: [...q.questions, { ...item, round: 0 }] }));
        recordQuestions(1); // stats: count generated questions
        await new Promise((r) => setTimeout(r, 250));
      });
    } catch (err) {
      // Restarting/regenerating aborts the request on purpose — ignore that; re-throw real errors
      if ((err as Error)?.name !== "AbortError") throw err;
    } finally {
      // Only clear the loading state if THIS run is still this tab's current one
      // (a newer run may have replaced/cancelled it)
      if (genAbortRef.current[genMode] === controller) {
        genAbortRef.current[genMode] = null;
        patchQuiz(genMode, { loading: false }); // dots off, even if it failed
      }
    }
  }

  // Wipe this tab's quiz off the screen (the restart button next to Generate).
  function clearQuiz() {
    genAbortRef.current[mode]?.abort(); // stop anything still streaming into this tab
    genAbortRef.current[mode] = null;
    patchQuiz(mode, { ...EMPTY_QUIZ });
    setToggleError(null);
    setFlashIndex(null);
  }

  // Generate from whatever text we pass in (defaults to the textarea's text)
  async function generateQuestions(sourceText: string = text) {
    if (!sourceText.trim()) {
      setGenError("Paste notes to generate questions");
      return;
    }
    await runGeneration({ text: sourceText });
  }

  // Rechallenge: take the questions the student got wrong in the round they just
  // graded and append a new round of 2× that many fresh questions on the same
  // concepts (tagged with the next round number, so they render as yellow).
  async function runRechallenge() {
    const justGraded = submittedRounds - 1; // the round we just submitted
    const wrong = questions.filter(
      (q, i) => (q.round ?? 0) === justGraded && answers[i] !== q.answer
    );
    if (wrong.length === 0) return;
    recordRechallenge(); // stats

    const newRound = submittedRounds; // the next round
    const count = Math.min(wrong.length * 2, 10); // 2× the misses, capped at 10
    const genMode = mode; // pin to the tab this rechallenge belongs to

    setGenError(null);
    patchQuiz(genMode, { rechallengeLoading: true });
    genAbortRef.current[genMode]?.abort(); // don't let an earlier run stream into this round
    const controller = new AbortController();
    genAbortRef.current[genMode] = controller;

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          similarTo: wrong.map((q) => ({
            question: q.question,
            answer: q.answer,
            options: "options" in q ? q.options : undefined
          })),
          count,
          level: describeLevel()
        }),
        signal: controller.signal
      });

      await readQuestionStream(res, controller.signal, async (item) => {
        patchQuiz(genMode, (q) => ({
          questions: [...q.questions, { ...item, round: newRound }]
        }));
        recordQuestions(1); // stats: rechallenge questions count too
        await new Promise((r) => setTimeout(r, 250));
      });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") throw err;
    } finally {
      if (genAbortRef.current[genMode] === controller) {
        genAbortRef.current[genMode] = null;
        patchQuiz(genMode, { rechallengeLoading: false });
      }
    }
  }

  // Add one or more uploaded images to the list (doesn't generate yet)
  async function addImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (Array.from(files).some((f) => f.size > 10 * 1024 * 1024)) {
      setGenError("Each image must be under 10 MB.");
      return;
    }
    setGenError(null);
    try {
      const dataUrls = await Promise.all(
        Array.from(files).map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            })
        )
      );
      const room = MAX_IMAGES - images.length;
      if (room <= 0) {
        setGenError(`You can only upload up to ${MAX_IMAGES} images.`);
        return;
      }
      // Skip anything we already have AND any repeats within this same selection
      // (mobile photo pickers let you tap the same photo more than once).
      const seen = new Set(images);
      const newOnes: string[] = [];
      for (const url of dataUrls) {
        if (!seen.has(url)) {
          seen.add(url);
          newOnes.push(url);
        }
      }
      if (newOnes.length === 0) return; // everything picked was a duplicate
      if (newOnes.length > room) {
        setGenError(`You can only upload up to ${MAX_IMAGES} images.`);
      }
      setImages([...images, ...newOnes.slice(0, room)]);
    } catch {
      setGenError("Couldn't read one of those images. Try different files.");
    }
  }

  // Generate a quiz from all the uploaded images
  async function generateFromImages() {
    if (images.length === 0) {
      setGenError("Upload at least one photo first");
      return;
    }
    await runGeneration({ images });
  }

  // Remove a single uploaded image by its position
  function removeImage(index: number) {
    setImages(images.filter((_, i) => i !== index));
  }

  // Upload the single audio/video file straight to Supabase Storage, so it
  // never rides through the API request body (dodges Vercel's ~4.5 MB cap).
  async function addAudio(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const file = files[0]; // only one audio/video at a time
    if (file.size > 25 * 1024 * 1024) {
      setGenError("The audio or video file must be under 25 MB");
      return;
    }
    // Skip re-uploading the exact same file that's already loaded (don't burn
    // bandwidth/storage on an identical upload back-to-back).
    const sig = `${file.name}|${file.size}|${file.lastModified}`;
    if (audioFiles[0]?.sig === sig) return;
    setGenError(null);
    setAudioProgress(0);
    setAudioUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "dat";
      const path = `${crypto.randomUUID()}.${ext}`;
      // Upload via XHR so the loading bar reflects real upload progress.
      await uploadAudioWithProgress(file, path, setAudioProgress);

      const prev = audioFiles[0]; // this file replaces any previous one
      setYoutubeUrl(""); // a file and a link are mutually exclusive
      setAudioFiles([
        {
          name: file.name,
          previewUrl: URL.createObjectURL(file),
          path,
          isVideo: (file.type || "").startsWith("video"),
          sig
        }
      ]);
      if (prev) {
        URL.revokeObjectURL(prev.previewUrl);
        supabase.storage.from("audio").remove([prev.path]); // clean up the old upload
      }
    } catch (e) {
      console.error("[audio upload] failed:", e); // detail stays in the dev console only
      setGenError("Couldn't upload that file. Please try again.");
    } finally {
      setAudioUploading(false);
    }
  }

  // Record straight from the microphone (e.g. a lecture). Stopping turns the
  // recording into a normal file and sends it through the same upload flow as
  // a picked file.
  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop(); // onstop below does the rest
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Chrome/Firefox record webm/opus; Safari records mp4 (m4a). Whisper
      // accepts both.
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (t) => MediaRecorder.isTypeSupported(t)
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };

      // Wire the mic into an analyser and bounce the bars off the live level
      // (dynamic-island style). Nothing is connected to the speakers — no echo.
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const freq = new Uint8Array(analyser.frequencyBinCount);
      const animate = () => {
        vizRafRef.current = requestAnimationFrame(animate);
        const bars = vizBarsRef.current?.children;
        if (!bars?.length) return; // bars not rendered yet
        analyser.getByteFrequencyData(freq);
        // One frequency band per bar, drawn from the voice range (low bins).
        const per = Math.floor(40 / bars.length);
        for (let b = 0; b < bars.length; b++) {
          let sum = 0;
          for (let i = b * per; i < (b + 1) * per; i++) sum += freq[i];
          const level = sum / per / 255; // 0..1
          (bars[b] as HTMLElement).style.height = `${4 + Math.round(level * 24)}px`;
        }
      };
      animate();

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop()); // release the mic (browser tab indicator off)
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        cancelAnimationFrame(vizRafRef.current);
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        setRecording(false);
        const type = recorder.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(recordChunksRef.current, { type });
        recordChunksRef.current = [];
        if (blob.size === 0) return; // nothing captured
        const stamp = new Date().toLocaleString(undefined, {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
        });
        addAudio([new File([blob], `Recording ${stamp}.${ext}`, { type })]);
      };
      recorder.start(1000); // collect data every second
      mediaRecorderRef.current = recorder;
      setGenError(null);
      setRecordSeconds(0);
      setRecording(true);
      recordTimerRef.current = setInterval(
        () => setRecordSeconds((s) => s + 1),
        1000
      );
    } catch (err) {
      console.error("[record] failed:", (err as Error)?.message ?? err);
      // DRAFT COPY — William to reword.
      setGenError("Couldn't access your microphone. Check your browser permissions.");
    }
  }

  // Generate a quiz from the uploaded audio/video, or from a YouTube link's captions
  async function generateFromAudio() {
    if (audioFiles.length > 0) {
      const upload = audioFiles[0];
      await runGeneration({
        audioPath: upload.path,
        audioName: upload.name
      });
      // The server deletes the file right after transcribing it, so this upload
      // can't be generated from again — clear it rather than leave a dead entry.
      URL.revokeObjectURL(upload.previewUrl);
      setAudioFiles((prev) => prev.filter((a) => a.path !== upload.path));
      return;
    }
    const yt = youtubeUrl.trim();
    if (yt) {
      await runGeneration({ youtube: yt });
      return;
    }
    setGenError("Please upload an audio or video to generate questions");
  }

  // Remove the uploaded audio/video file (and delete it from Storage)
  function removeAudio(index: number) {
    const removed = audioFiles[index];
    setAudioFiles(audioFiles.filter((_, i) => i !== index));
    if (removed) {
      URL.revokeObjectURL(removed.previewUrl);
      try {
        createClient().storage.from("audio").remove([removed.path]);
      } catch {
        // best-effort cleanup
      }
    }
  }

  // Account switcher actions (used by the mobile menu's account fly-out)
  async function accountSignIn(switchAccount = false) {
    if (!authClient) return;
    setAccountMenuOpen(false);
    await authClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Force Google's account picker so they can choose a different login
        ...(switchAccount ? { queryParams: { prompt: "select_account" } } : {})
      }
    });
  }
  async function accountSignOut() {
    if (!authClient) return;
    await authClient.auth.signOut();
    setAuthEmail(null);
    setAuthAvatar(null);
    setAccountMenuOpen(false);
  }

  // Switch between the Text / Image / Audio tabs. Each tab is its own workspace:
  // its quiz (see `quizzes`) and its uploads stay put, so you can leave one
  // half-finished, build another elsewhere, and come back to it. Only transient
  // messages/overlays are reset. Uploaded audio is now cleaned up when you remove
  // it rather than on every switch — deleting it here would yank the file out
  // from under a generation still transcribing it.
  function switchMode(m: Mode) {
    if (m === mode) return;
    setMode(m);
    setGenError(null);
    setToggleError(null);
    setFullscreenImage(null);
    setFullscreenVideo(null);
  }

  // Pull the text out of a PDF in the browser
  async function extractPdfText(file: File): Promise<string> {
    const pdfjsLib = await import("pdfjs-dist");
    // tell pdf.js where its background "worker" file is
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();

    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

    let fullText = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      fullText +=
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ") + "\n";
    }
    return fullText;
  }

  // Read an uploaded document (PDF, Word .docx, or plain text) and make a quiz
  async function handleFile(file: File) {
    if (!gradeYear) {
      setGenError("Choose grade level in settings to generate questions");
      return;
    }
    const name = file.name.toLowerCase();
    patchQuiz("text", { loading: true }); // file upload only happens on the Text tab
    try {
      let extracted = "";

      if (file.type === "application/pdf" || name.endsWith(".pdf")) {
        extracted = await extractPdfText(file);
      } else if (name.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        extracted = (await mammoth.extractRawText({ arrayBuffer })).value;
      } else if (
        file.type.startsWith("text/") ||
        /\.(txt|md|markdown|csv|text|log)$/.test(name)
      ) {
        extracted = await file.text();
      } else {
        setGenError(
          "Unsupported file. Try a PDF, Word (.docx), or text file — or use the Image page for photos."
        );
        return;
      }

      if (!extracted.trim()) {
        setGenError(
          "Couldn't find any text in that file. If it's a scan or photo, use the Image page."
        );
        return;
      }

      setText(extracted);              // show the extracted text in the box
      await generateQuestions(extracted); // and make questions from it
    } catch {
      setGenError("Couldn't read that file. Try a different one.");
    } finally {
      patchQuiz("text", { loading: false });
    }
  }

  // Drag-and-drop onto the text box. We only react to dragged FILES (not text
  // selections), and count enter/leave so the highlight stays put as the cursor
  // crosses the textarea and toolbar inside the box.
  const isFileDrag = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  const onDragEnter = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!isFileDrag(e) || dragDepth.current === 0) return;
    dragDepth.current--;
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // A tiny numbered box standing in for one uploaded photo (used on mobile, to
  // the sides of the upload box). Tapping it opens that photo fullscreen.
  const renderThumb = (src: string, index: number, label: number) => (
    <button
      key={index}
      type="button"
      onClick={() => setFullscreenImage(src)}
      title={`View image ${label}`}
      style={{
        position: "relative",
        width: 44,
        height: 44,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        background: "transparent",
        border: "2px solid #888",
        borderRadius: 3,
        cursor: "pointer",
        color: "inherit"
      }}
    >
      {/* little picture glyph */}
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="M4 18 l5 -5 3 3 4 -4 4 4" />
      </svg>
      {/* its number */}
      <span
        style={{
          position: "absolute",
          bottom: -6,
          right: -6,
          minWidth: 16,
          height: 16,
          padding: "0 4px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          background: ACCENT_BG_STRONG,
          color: ACCENT_TEXT,
          border: "1px solid #888",
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1
        }}
      >
        {label}
      </span>
    </button>
  );

  // The Submit / grade / Rechallenge controls shown at the end of one round.
  const renderRoundControls = (r: number) => {
    const roundTotal = questions.filter((q) => (q.round ?? 0) === r).length;
    const roundScore = questions.reduce(
      (t, q, i) => t + ((q.round ?? 0) === r && answers[i] === q.answer ? 1 : 0),
      0
    );
    const graded = r < submittedRounds;
    const isActive = r === submittedRounds;
    const pct = roundTotal ? Math.round((roundScore / roundTotal) * 100) : 0;
    const wrong = roundTotal - roundScore;
    const maxRound = questions.reduce((m, q) => Math.max(m, q.round ?? 0), 0);
    const yellow = r >= 1; // extension rounds use the yellow theme

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 8,
          marginBottom: 28
        }}
      >
        {graded ? (
          <span
            style={{
              padding: "12px 28px",
              background: yellow ? RECHALLENGE_BTN : SUBMIT_GREEN,
              color: yellow ? "#1a1a1a" : "white",
              fontWeight: "bold",
              borderRadius: 3,
              fontSize: 20
            }}
          >
            {roundScore}/{roundTotal} ({pct}%)
          </span>
        ) : isActive ? (
          <button
            onClick={handleSubmit}
            disabled={rechallengeLoading || loading}
            style={{
              padding: "12px 28px",
              background: yellow ? RECHALLENGE_BTN : SUBMIT_GREEN,
              color: yellow ? "#1a1a1a" : "white",
              fontWeight: "bold",
              border: "none",
              borderRadius: 3,
              fontSize: 16,
              cursor: "pointer"
            }}
          >
            Submit
          </button>
        ) : null}

        {/* Rechallenge: only on the newest round, once it's graded and has misses */}
        {graded && r === maxRound && wrong > 0 && (
          <button
            onClick={() => runRechallenge()}
            disabled={rechallengeLoading}
            title={`Practise the ${wrong} you missed with ${wrong * 2} fresh questions`}
            style={{
              padding: "12px 24px",
              background: "transparent",
              color: RECHALLENGE_YELLOW,
              border: `2px solid ${RECHALLENGE_BTN}`,
              borderRadius: 3,
              fontWeight: "bold",
              fontSize: 16,
              cursor: rechallengeLoading ? "default" : "pointer"
            }}
          >
            {rechallengeLoading ? (
              <span className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </span>
            ) : (
              "Rechallenge"
            )}
          </button>
        )}
      </div>
    );
  };

  // Restart: sits to the right of Generate once a quiz is on screen, and clears it.
  const renderRestart = () =>
    questions.length === 0 ? null : (
      <button
        onClick={clearQuiz}
        aria-label="Clear quiz"
        title="Clear quiz"
        style={{
          width: 36,
          height: 36,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          borderRadius: 3,
          border: "2px solid #888",
          background: "transparent",
          color: "#cbd5e1",
          cursor: "pointer"
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>
    );

  // Pick a font/palette in the customization panel: apply live and persist.
  const pickTheme = (patch: Partial<ThemeChoice>) => {
    setTheme((prev) => {
      const next = { ...prev, ...patch };
      applyTheme(next);
      saveTheme(next);
      return next;
    });
  };

  // The streak bar under the title: a thin rounded track that fills toward the
  // next reward milestone. Light orange normally; light blue while a freeze is
  // banked (5 quizzes in a day) and protecting the streak.
  const renderStreak = () => {
    if (!streak) return null; // not read from localStorage yet
    const days = currentStreak(streak);
    const frozen = isFrozen(streak);
    const { target, reward } = nextMilestone(days, streak.rewarded);
    const deadlines = streakDeadlines(streak);
    const freezeLeft = freezeQuizzesLeft(streak);
    // Ceil so a fresh 48h window reads "48h", not "47h"; switch to minutes in
    // the last hour so it never sits on a misleading "0h".
    const timeLeft = (ms: number) => {
      const left = Math.max(0, ms - Date.now());
      if (left < 3_600_000) return `${Math.ceil(left / 60_000)}m`;
      return `${Math.ceil(left / 3_600_000)}h`;
    };
    const fill = frozen ? STREAK_FROZEN_BLUE : STREAK_ORANGE;

    return (
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        {/* day count + bar + the "i" that reveals what the next milestone pays */}
        <div
          ref={streakInfoRef}
          style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}
        >
          <span style={{ fontSize: 13, lineHeight: 1, color: "#cbd5e1" }}>{days}</span>

          <div
            style={{
              width: 180,
              height: 6,
              // Squared-off ends, matching the app's slightly-rounded-square
              // language. (3 would round a 6px bar into a full pill.)
              borderRadius: 2,
              background: STREAK_TRACK,
              overflow: "hidden"
            }}
          >
            <div
              style={{
                width: `${streakProgress(days, streak.rewarded) * 100}%`,
                height: "100%",
                borderRadius: 2,
                backgroundColor: fill,
                // Only the width animates. Transitioning the colour leaves the
                // computed background stuck on the old value when a freeze kicks
                // in, so the bar swaps colour instantly instead.
                transition: "width 300ms ease"
              }}
            />
          </div>

          <button
            onClick={() => setShowStreakInfo((v) => !v)}
            aria-label="Streak reward"
            aria-expanded={showStreakInfo}
            style={{
              width: 16,
              height: 16,
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              borderRadius: "50%",
              border: "1px solid #888",
              background: "transparent",
              color: "#888",
              fontSize: 10,
              fontStyle: "italic",
              fontWeight: "bold",
              lineHeight: 1,
              cursor: "pointer"
            }}
          >
            i
          </button>

          {showStreakInfo && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                left: "50%",
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
                background: "var(--background)",
                color: "var(--foreground)",
                border: "1px solid #888",
                borderRadius: 3,
                padding: "6px 10px",
                fontSize: 12,
                boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
                zIndex: 900
              }}
            >
              <div>{target} days - {reward} days Pro</div>
              {frozen && (
                <div style={{ marginTop: 4, color: STREAK_FROZEN_BLUE }}>
                  Streak freeze ready
                </div>
              )}
              {freezeLeft !== null && freezeLeft > 0 && (
                <div style={{ marginTop: 4, opacity: 0.7 }}>
                  Streak freeze in {freezeLeft} quiz{freezeLeft === 1 ? "" : "zes"}
                </div>
              )}
              {deadlines && days > 0 && (
                <div style={{ marginTop: 4, opacity: 0.7 }}>
                  Streak decays in {timeLeft(deadlines.decayAt)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Label/value pairs shown in the Stats panel.
  const statRows = (s: Stats): [string, string][] => {
    const gen = topKey(s.generatorCounts);
    const avg = averageGrade(s);
    return [
      ["Questions generated", String(s.questionsGenerated)],
      ["Quizzes completed", String(s.quizzesCompleted)],
      ["Rechallenges taken", String(s.rechallengesTaken)],
      ["Hints taken", String(s.hintsTaken)],
      ["Most used generator", gen ? gen[0].toUpperCase() + gen.slice(1) : "—"],
      ["Average grade", avg === null ? "—" : `${avg}%`],
      ["Most used grade level", topKey(s.difficultyCounts) ?? "—"],
      ["Most common subject", topKey(s.subjectCounts) ?? "—"]
    ];
  };

  return (
    <main style={{ padding: 40 }}>
      <WhatsNew />

      {/* Fullscreen image viewer — click anywhere to close */}
      {fullscreenImage && (
        <div
          onClick={() => setFullscreenImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 20,
            cursor: "zoom-out"
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullscreenImage}
            alt="Fullscreen"
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        </div>
      )}

      {/* Fullscreen video viewer — click the backdrop to close */}
      {fullscreenVideo && (
        <div
          onClick={() => setFullscreenVideo(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 20,
            cursor: "zoom-out"
          }}
        >
          <video
            src={fullscreenVideo}
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()} // clicks on the player shouldn't close it
            style={{ maxWidth: "100%", maxHeight: "100%" }}
          />
        </div>
      )}

      {/* Updates / Support links, fixed at the top-right just left of the "?" */}
      <div
        style={{
          position: "fixed",
          top: 20,
          right: 68, // just left of the 40px "?" at right:20
          display: "flex",
          gap: 8,
          zIndex: 1000
        }}
      >
        {/* Upgrade indicator: a thick muted-green up arrow beside the profile
            pill. Signed-in users only — there's no account to upgrade otherwise.
            Opens the Athenia Pro screen. */}
        {!isMobile && authEmail && !isPro && (
          <button
            onClick={() => setShowPricing(true)}
            title="Upgrade to Athenia Pro"
            aria-label="Upgrade to Athenia Pro"
            style={{
              width: 48,
              height: 40, // matches the account pill beside it
              marginRight: -10, // tuck in close to the profile pill
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "center",
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer"
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
              {/* chunky block arrow, filled — Athenia's light blue */}
              <path
                d="M12 3 L20 11 H15.5 V21 H8.5 V11 H4 Z"
                fill={STREAK_FROZEN_BLUE}
              />
            </svg>
          </button>
        )}
        {!isMobile && <AuthButton />}
        {!isMobile &&
        [
          { label: "Updates", href: "/updates" },
          { label: "Support", href: "/support" }
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              height: 40,
              padding: "0 16px",
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 3,
              border: "2px solid #888",
              background: "transparent",
              color: "inherit",
              fontSize: 16,
              textDecoration: "none",
              cursor: "pointer"
            }}
          >
            {link.label}
          </Link>
        ))}

        {/* Quiz History — circular button with a history (clock + back-arrow) icon */}
        {!isMobile && (
          <Link
            href="/history"
            aria-label="Quiz history"
            title="Quiz history"
            style={{
              width: 40,
              height: 40,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              border: "2px solid #888",
              background: "transparent",
              color: "inherit",
              textDecoration: "none",
              cursor: "pointer"
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M12 7v5l4 2" />
            </svg>
          </Link>
        )}

        {/* Stats — circular button with an ascending bar-chart icon */}
        {!isMobile && (
          <button
            onClick={() => {
              setStatsData(loadStats());
              setShowStats(true);
            }}
            aria-label="Stats"
            title="Stats"
            style={{
              width: 40,
              height: 40,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              border: "2px solid #888",
              background: "transparent",
              color: "inherit",
              cursor: "pointer"
            }}
          >
            <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor">
              {/* three ascending bars: small, medium, large — squared off (rx 1) */}
              <rect x="3" y="14" width="4.5" height="7" rx="1" />
              <rect x="9.75" y="9" width="4.5" height="12" rx="1" />
              <rect x="16.5" y="4" width="4.5" height="17" rx="1" />
            </svg>
          </button>
        )}

        {/* Customize — circular button with a minimal palette + brush icon.
            Not wired to anything yet (the customization panel comes later). */}
        {!isMobile && (
          <button
            onClick={() => setShowCustomize(true)}
            aria-label="Customize"
            title="Customize"
            style={{
              width: 40,
              height: 40,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              border: "2px solid #888",
              background: "transparent",
              color: "inherit",
              cursor: "pointer"
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* classic painter's palette: blob with a thumb-hole notch at the
                  bottom, four paint wells — fills the whole button */}
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
              <circle cx="13.5" cy="6.5" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="17.5" cy="10.5" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="8.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="6.5" cy="12.5" r="1.4" fill="currentColor" stroke="none" />
            </svg>
          </button>
        )}
      </div>

      {/* Customization panel — fonts and color palettes */}
      {showCustomize && (
        <div
          onClick={() => setShowCustomize(false)}
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
              width: 380,
              maxWidth: "100%",
              background: "var(--background)",
              color: "var(--foreground)",
              border: "1px solid #888",
              borderRadius: 3,
              padding: 24,
              boxShadow: "0 6px 24px rgba(0,0,0,0.25)"
            }}
          >
            <div style={{ fontWeight: "bold", fontSize: 22, textAlign: "center", marginBottom: 18 }}>
              Customize
            </div>

            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>Font</div>
            <div style={{ display: "flex", gap: 8 }}>
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => pickTheme({ font: f.id })}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    border:
                      theme.font === f.id ? `2px solid ${STREAK_FROZEN_BLUE}` : "1px solid #888",
                    borderRadius: 3,
                    background: "transparent",
                    color: "inherit",
                    fontSize: 15,
                    fontFamily: f.css, // each button previews its own font
                    cursor: "pointer"
                  }}
                >
                  {f.name}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 13, opacity: 0.6, margin: "18px 0 8px" }}>Palette</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {PALETTES.map((pal) => (
                <button
                  key={pal.id}
                  onClick={() => pickTheme({ palette: pal.id })}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 0 8px",
                    border:
                      theme.palette === pal.id
                        ? `2px solid ${STREAK_FROZEN_BLUE}`
                        : "1px solid #888",
                    borderRadius: 3,
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer"
                  }}
                >
                  {/* swatch: the palette's background with its text colour dot */}
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 3,
                      background: pal.bg,
                      border: "1px solid #888",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: pal.fg }} />
                  </span>
                  <span style={{ fontSize: 12 }}>{pal.name}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => pickTheme({ ...DEFAULT_THEME })}
              style={{
                marginTop: 18,
                width: "100%",
                padding: "8px 0",
                border: "1px solid #888",
                borderRadius: 3,
                background: "transparent",
                color: "inherit",
                fontSize: 13,
                cursor: "pointer",
                opacity: 0.8
              }}
            >
              Reset to default
            </button>
          </div>
        </div>
      )}

      {/* Athenia Pro upgrade screen */}
      <PricingModal open={showPricing} onClose={() => setShowPricing(false)} isPro={isPro} />

      {/* Stats panel — a centered card; click the backdrop to close */}
      {showStats && statsData && (
        <div
          onClick={() => setShowStats(false)}
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
              width: 340,
              maxWidth: "100%",
              background: "var(--background)",
              color: "var(--foreground)",
              border: "1px solid #888",
              borderRadius: 3,
              padding: 24,
              boxShadow: "0 6px 24px rgba(0,0,0,0.25)"
            }}
          >
            <div
              style={{
                fontWeight: "bold",
                fontSize: 22,
                textAlign: "center",
                marginBottom: 16
              }}
            >
              Stats
            </div>
            {statRows(statsData).map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 0",
                  borderTop: "1px solid #333"
                }}
              >
                <span style={{ opacity: 0.7 }}>{label}</span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* "?" help circle, fixed to the top-right of the screen */}
      <button
        ref={noticeButtonRef}
        onClick={() => setShowNotice((v) => !v)}
        title="About this version"
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "2px solid #888",
          background: "var(--background)",
          color: "inherit",
          fontSize: 24,
          fontWeight: "bold",
          cursor: "pointer",
          zIndex: 1000
        }}
      >
        ?
      </button>

      {/* The notice that appears just below the "?" when it's clicked */}
      {showNotice && (
        <div
          ref={noticeRef}
          style={{
            position: "fixed",
            top: 70,
            right: 20,
            maxWidth: 280,
            background: "var(--background)",
            color: "var(--foreground)",
            border: "1px solid #888",
            borderRadius: 3,
            padding: 16,
            boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
            zIndex: 1100 // sit above the mobile profile button
          }}
        >
          Notice: this is a pre-release version of Athenia. Many updates are
          still necessary to create the perfect study tool 🙂
        </div>
      )}

      {/* Mobile account button: profile picture + caret, under the "?" */}
      {isMobile && authClient && (
        <div ref={accountMenuRef} style={{ position: "fixed", top: 70, right: 20, zIndex: 1000 }}>
          {authEmail ? (
            accountMenuOpen ? (
              // Expanded oval: avatar on top, then switch / log out, divided by lines
              <div
                style={{
                  width: 40,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  border: "2px solid #777",
                  borderRadius: 22,
                  background: "var(--background)",
                  overflow: "hidden"
                }}
              >
                <button
                  onClick={() => setAccountMenuOpen(false)}
                  title={authEmail}
                  aria-label="Account"
                  aria-expanded
                  style={{
                    width: "100%",
                    height: 36,
                    padding: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    overflow: "hidden"
                  }}
                >
                  {authAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={authAvatar}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 20 a8 8 0 0 1 16 0" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => accountSignIn(true)}
                  title="Switch account"
                  aria-label="Switch account"
                  style={{ ...ovalItem, borderTop: "1px solid #888" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 9 h13" />
                    <path d="M14 6 l3 3 l-3 3" />
                    <path d="M20 15 h-13" />
                    <path d="M10 12 l-3 3 l3 3" />
                  </svg>
                </button>
                <button
                  onClick={accountSignOut}
                  title="Log out"
                  aria-label="Log out"
                  style={{ ...ovalItem, borderTop: "1px solid #888" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 5 H7 a1 1 0 0 0 -1 1 V18 a1 1 0 0 0 1 1 H14" />
                    <path d="M11 12 H21" />
                    <path d="M18 9 l3 3 l-3 3" />
                  </svg>
                </button>
              </div>
            ) : (
              // Collapsed: a plain 40x40 circle, identical in build to the "?" / hamburger
              <button
                onClick={() => setAccountMenuOpen(true)}
                title={authEmail}
                aria-label="Account"
                aria-expanded={false}
                style={{
                  width: 40,
                  height: 40,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid #777",
                  borderRadius: "50%",
                  background: "var(--background)",
                  color: "inherit",
                  cursor: "pointer",
                  overflow: "hidden"
                }}
              >
                {authAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={authAvatar}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20 a8 8 0 0 1 16 0" />
                  </svg>
                )}
              </button>
            )
          ) : (
            <button
              onClick={() => accountSignIn()}
              title="Sign in with Google"
              aria-label="Sign in with Google"
              style={{
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #777",
                borderRadius: "50%",
                background: "var(--background)",
                color: "inherit",
                cursor: "pointer"
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20 a8 8 0 0 1 16 0" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Cog settings circle, fixed to the top-left of the screen */}
      <button
        ref={settingsButtonRef}
        onClick={() => setShowSettings((v) => !v)}
        title="Quiz settings"
        style={{
          position: "fixed",
          top: 20,
          left: 20,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "2px solid #888",
          background: "var(--background)",
          color: "inherit",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 1000
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* The settings panel that expands from the cog */}
      {showSettings && (
        <div
          ref={settingsRef}
          style={{
            position: "fixed",
            top: 70,
            left: 20,
            width: 300,
            background: "var(--background)",
            color: "var(--foreground)",
            border: "1px solid #888",
            borderRadius: 3,
            padding: 20,
            boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: 20
          }}
        >
          <div style={{ fontWeight: "bold", fontSize: 18 }}>Settings</div>

          {/* Instant feedback on/off */}
          <div>
            <label
              style={{
                display: "inline-flex", // only the box + text are clickable, not the whole row
                width: "fit-content",
                alignItems: "center",
                gap: 8,
                cursor: "pointer"
              }}
            >
              {/* the real checkbox, hidden — the label still toggles it */}
              <input
                type="checkbox"
                checked={instantFeedback}
                onChange={(e) => {
                  // Locked only DURING a round (answered but not yet submitted).
                  // After submitting, answers are already locked, so it's free again.
                  if (activeRoundAnswered) {
                    setToggleError(
                      e.target.checked
                        ? "Cannot be enabled; Complete the questions"
                        : "Cannot be disabled; Complete the questions"
                    );
                    return;
                  }
                  setInstantFeedback(e.target.checked);
                  setToggleError(null);
                }}
                style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
              />
              {/* our custom box with a white checkmark when on */}
              <span
                style={{
                  width: 18,
                  height: 18,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: instantFeedback ? ACCENT_BG : "#000",
                  border: "1px solid #999",
                  borderRadius: 3
                }}
              >
                {instantFeedback && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={ACCENT_TEXT}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12 l5 5 l9 -11" />
                  </svg>
                )}
              </span>
              Instant feedback
            </label>
            {toggleError && (
              <div style={{ marginTop: 6, color: "#dc2626", fontSize: 14 }}>
                {toggleError}
              </div>
            )}
          </div>

          {/* Multiple-choice amount: pick one of 5 / 10 / 15 / 20 */}
          <div>
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>Multiple-choice questions</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[0, 5, 10, 15, 20].map((n) => (
                <button
                  key={n}
                  onClick={() => setAmount(n)}
                  style={{
                    width: 44,
                    height: 36,
                    borderRadius: 3,
                    border: "2px solid #888",
                    background: amount === n ? ACCENT_BG_STRONG : "transparent",
                    color: amount === n ? ACCENT_TEXT : "inherit",
                    fontWeight: amount === n ? "bold" : "normal",
                    cursor: "pointer"
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* True/False amount: pick one of 5 / 10 / 15 / 20 */}
          <div>
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>True/False questions</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[0, 5, 10, 15, 20].map((n) => (
                <button
                  key={n}
                  onClick={() => setTfAmount(n)}
                  style={{
                    width: 44,
                    height: 36,
                    borderRadius: 3,
                    border: "2px solid #888",
                    background: tfAmount === n ? ACCENT_BG_STRONG : "transparent",
                    color: tfAmount === n ? ACCENT_TEXT : "inherit",
                    fontWeight: tfAmount === n ? "bold" : "normal",
                    cursor: "pointer"
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty slider: Middle School / High School / University */}
          <div>
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>Difficulty</div>
            <input
              className="difficulty-slider"
              type="range"
              min={0}
              max={2}
              step={1}
              value={difficulty}
              onChange={(e) => {
                setDifficulty(Number(e.target.value));
                setGradeYear(null); // grade options change with the level, so reset the pick
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                marginTop: 4
              }}
            >
              {DIFFICULTIES.map((label, idx) => (
                <span
                  key={label}
                  style={{
                    fontWeight: difficulty === idx ? "bold" : "normal",
                    opacity: difficulty === idx ? 1 : 0.6
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Grade/Year: choices depend on the difficulty level above */}
          <div>
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>
              {difficulty === 2 ? "Year" : "Grade"}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {GRADE_OPTIONS[difficulty].map((g) => (
                <button
                  key={g}
                  onClick={() => {
                    setGradeYear(g);
                    setGenError(null); // grade chosen -> clear the warning
                  }}
                  style={{
                    minWidth: 40,
                    height: 36,
                    padding: "0 10px",
                    borderRadius: 3,
                    border: "2px solid #888",
                    background: gradeYear === g ? ACCENT_BG_STRONG : "transparent",
                    color: gradeYear === g ? ACCENT_TEXT : "inherit",
                    fontWeight: gradeYear === g ? "bold" : "normal",
                    cursor: "pointer"
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <h1
        style={{
          textAlign: "center",
          fontFamily: "var(--font-playfair), Georgia, serif",
          fontStyle: "italic",
          fontWeight: "bold",
          fontSize: 64,
          marginTop: 0,      // sit up near the top edge
          marginBottom: 12,
          transform: "translateY(10px)",  // nudge just the text down, without shifting the layout below
          color: isPro ? STREAK_FROZEN_BLUE : undefined // Pro accounts wear the light blue
        }}
      >
        {isPro ? "Athenia Pro" : "Athenia"}
      </h1>

      {renderStreak()}

      {/* Tab bar: fixed at the top-left (desktop only — mobile uses the menu) */}
      {!isMobile && (
      <div
        style={{
          position: "fixed",
          top: 20,
          left: 72, // just right of the 40px cog at left:20
          display: "flex",
          gap: 8,
          zIndex: 1000,
          background: "var(--background)" // solid, so scrolling questions don't bleed through
        }}
      >
        {(["text", "image", "audio"] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 3,
              border: "2px solid #888",
              background: mode === m ? ACCENT_BG : "transparent",
              color: mode === m ? ACCENT_TEXT : "inherit",
              fontWeight: "bold",
              fontSize: 16,
              cursor: "pointer",
              textTransform: "capitalize"
            }}
          >
            {m}
          </button>
        ))}
      </div>
      )}

      {/* Mobile menu: hamburger under the cog (hidden while the settings panel is open) */}
      {isMobile && !showSettings && (
        <div ref={mobileMenuRef} style={{ position: "fixed", top: 70, left: 20, zIndex: 1000 }}>
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={mobileMenuOpen}
            style={{
              width: 40,
              height: 40,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "center",
              gap: 5,
              padding: "0 9px",
              border: "2px solid #888",
              borderRadius: 3,
              background: "var(--background)",
              color: "inherit",
              cursor: "pointer",
              position: "relative",
              zIndex: 1 // sit above the menu so its border isn't overlapped
            }}
          >
            {/* three lines, descending in width */}
            <span style={{ width: 20, height: 2, background: "currentColor", borderRadius: 2 }} />
            <span style={{ width: 15, height: 2, background: "currentColor", borderRadius: 2 }} />
            <span style={{ width: 10, height: 2, background: "currentColor", borderRadius: 2 }} />
          </button>

          {mobileMenuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: 38, // 2px up so its top border merges with the button's bottom into one line
                left: 0,
                minWidth: 150,
                display: "flex",
                flexDirection: "column",
                background: "var(--background)",
                border: "2px solid #888",
                borderRadius: 3,
                overflow: "hidden",
                zIndex: 0 // behind the button, so the shared edge reads as one line
              }}
            >
              {(["text", "image", "audio"] as const).map((m) => (
                <button
                  key={m}
                  role="menuitem"
                  onClick={() => {
                    switchMode(m);
                    setMobileMenuOpen(false);
                  }}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    border: "none",
                    background: mode === m ? ACCENT_BG : "transparent",
                    color: mode === m ? ACCENT_TEXT : "inherit",
                    fontSize: 16,
                    fontWeight: mode === m ? "bold" : "normal",
                    cursor: "pointer",
                    textTransform: "capitalize"
                  }}
                >
                  {m}
                </button>
              ))}
              <button
                role="menuitem"
                onClick={() => {
                  setStatsData(loadStats());
                  setShowStats(true);
                  setMobileMenuOpen(false);
                }}
                style={{
                  padding: "12px 16px",
                  textAlign: "left",
                  border: "none",
                  borderTop: "1px solid #888",
                  background: "transparent",
                  color: "inherit",
                  fontSize: 16,
                  cursor: "pointer"
                }}
              >
                Stats
              </button>
              {[
                { label: "Support", href: "/support" },
                { label: "Updates", href: "/updates" }
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    borderTop: "1px solid #888",
                    background: "transparent",
                    color: "inherit",
                    fontSize: 16,
                    textDecoration: "none",
                    cursor: "pointer"
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "text" && (
        <>
      {/* Hidden file picker — PDFs, Word docs, and text files */}
      <input
        type="file"
        accept=".pdf,.docx,.txt,.md,.markdown,.csv,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = ""; // reset so the same file can be picked again
        }}
      />

      {/* One box for all three ways to add material: click to upload, drag &
          drop a file onto it, or just paste/type text in the area below. */}
      <div
        onDragEnter={onDragEnter}
        onDragOver={(e) => {
          if (isFileDrag(e)) e.preventDefault(); // required for the drop to fire
        }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          position: "relative",
          width: "100%",
          // Lines the toolbar up with the top of the image / audio upload boxes
          // (those sit at 68 under the streak; the 2px border puts the toolbar at 68 too).
          marginTop: 66,
          border: `2px solid ${dragging ? ACCENT_TEXT : "#888"}`,
          borderRadius: 3,
          transition: "border-color 0.15s"
        }}
      >
        {/* Toolbar: the click-to-upload button plus a hint about the other ways */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            padding: "8px 10px",
            borderBottom: "1px solid #333"
          }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Upload a document (PDF, Word, or text)"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              background: "transparent",
              border: "1px solid #888",
              borderRadius: 3,
              cursor: "pointer",
              color: "inherit",
              fontSize: 14
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 32 32"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* up-arrow rising out of a tray = upload */}
              <path d="M16 21 V7" />
              <path d="M9 14 L16 7 L23 14" />
              <path d="M6 24 H26" />
            </svg>
            Upload file
          </button>
          <span style={{ fontSize: 13, opacity: 0.55 }}>
            {isMobile ? "PDF, Word, or text" : "or drag & drop — PDF, Word, or text"}
          </span>
        </div>

        <textarea
          style={{
            display: "block",
            width: "100%",
            height: 150,
            border: "none",
            outline: "none",
            resize: "vertical",
            background: "transparent",
            color: "inherit",
            padding: 12,
            fontSize: 16,
            fontFamily: "inherit"
          }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
        />

        {/* Highlight overlay shown only while a file is dragged over the box */}
        {dragging && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none", // let the drop pass through to the box
              background: ACCENT_BG,
              borderRadius: 3,
              color: ACCENT_TEXT,
              fontSize: 16,
              fontWeight: 500
            }}
          >
            Drop your file to upload
          </div>
        )}
      </div>

      {/* Generate stays centered under the textarea; the restart hangs off its
          right absolutely so it can't nudge the button when it appears. */}
      <div style={{ position: "relative", width: "fit-content", margin: "12px auto 0" }}>
        <button
          onClick={() => generateQuestions()}
          disabled={loading}
          style={{
            display: "block",
            padding: "10px 24px",
            minWidth: 190,
            height: 44,
            background: ACCENT_BG,
            color: ACCENT_TEXT,
            border: "none",
            borderRadius: 3,
            fontSize: 16,
            cursor: loading ? "default" : "pointer"
          }}
        >
          {loading ? (
            <span className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
          ) : (
            "Generate"
          )}
        </button>
        <span style={restartSlot}>{renderRestart()}</span>
      </div>

      {/* Warning shown if you try to generate without picking a grade */}
      {genError && (
        <div style={{ marginTop: 12, color: "#dc2626", fontSize: 15 }}>
          {genError}
        </div>
      )}
        </>
      )}

      {/* Image page: previews fill the left, upload controls stay centered */}
      {mode === "image" && (
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "center" : "flex-start",
            gap: 24,
            marginTop: 20
          }}
        >
          {/* Left column: uploaded image previews (desktop only; on mobile a
              count badge on the upload box stands in for the thumbnails) */}
          {!isMobile && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",   // multiple per row on the same y-level
              alignContent: "flex-start",
              gap: 12
            }}
          >
            {images.map((src, i) => (
              <div key={i} style={{ position: "relative", display: "inline-block" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Upload ${i + 1}`}
                  onClick={() => setFullscreenImage(src)}
                  style={{
                    display: "block",
                    maxWidth: 160,
                    maxHeight: 160,
                    border: "2px solid #888",
                    borderRadius: 3,
                    objectFit: "contain",
                    cursor: "pointer" // click to view fullscreen
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  aria-label="Remove image"
                  title="Remove"
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(0,0,0,0.6)",
                    color: "#fff",
                    fontSize: 15,
                    lineHeight: 1,
                    cursor: "pointer"
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          )}

          {/* Center column: upload controls */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: 48 // keep the upload box near the textarea's height
            }}
          >
            {/* Hidden image picker (can select several at once) */}
            <input
              type="file"
              accept="image/*"
              multiple
              ref={imageInputRef}
              style={{ display: "none" }}
              onChange={(e) => {
                addImages(e.target.files);
                e.target.value = ""; // reset so the same files can be picked again
              }}
            />

            {/* Painting box with a plus — click to add photos */}
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={loading}
              title="Add photos"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 96,
                height: 96,
                background: "transparent",
                border: "2px solid #888",
                borderRadius: 3,
                cursor: loading ? "default" : "pointer",
                color: "inherit"
              }}
            >
              <svg
                width="52"
                height="52"
                viewBox="0 0 32 32"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {/* painting frame */}
                <rect x="4" y="7" width="18" height="17" rx="2.5" />
                {/* sun */}
                <circle cx="9.5" cy="12.5" r="1.8" />
                {/* mountains */}
                <path d="M5 21 l4 -5 3 3 3 -4 6 7" />
                {/* plus, floating just off the top-right corner */}
                <line x1="27" y1="3.5" x2="27" y2="9.5" />
                <line x1="24" y1="6.5" x2="30" y2="6.5" />
              </svg>
            </button>

            {/* On mobile, the uploaded photos live here (where the caption sits) as
                small numbered boxes — tap one to view that photo fullscreen. */}
            {isMobile && images.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 8,
                  marginTop: 12
                }}
              >
                {images.map((src, i) => renderThumb(src, i, i + 1))}
              </div>
            )}

            {isMobile && images.length > 0 ? (
              <p style={{ opacity: 0.7, marginTop: 12 }}>
                {images.length} / {MAX_IMAGES} photos ·{" "}
                <button
                  type="button"
                  onClick={() => setImages([])}
                  style={{
                    background: "none",
                    border: "none",
                    color: ACCENT_TEXT,
                    cursor: "pointer",
                    fontSize: "inherit",
                    padding: 0,
                    textDecoration: "underline"
                  }}
                >
                  Clear
                </button>
              </p>
            ) : (
              <p style={{ opacity: 0.7, marginTop: 12 }}>
                Upload photos to generate questions
              </p>
            )}

            {/* Generate button (uses all uploaded photos) */}
            <div style={{ position: "relative", marginTop: 16 }}>
              <button
                onClick={() => generateFromImages()}
                disabled={loading}
                style={{
                  display: "block",
                  padding: "10px 24px",
                  minWidth: 190,
                  height: 44,
                  background: ACCENT_BG,
                  color: ACCENT_TEXT,
                  border: "none",
                  borderRadius: 3,
                  fontSize: 16,
                  cursor: loading ? "default" : "pointer"
                }}
              >
                {loading ? (
                  <span className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                ) : (
                  "Generate"
                )}
              </button>
              <span style={restartSlot}>{renderRestart()}</span>
            </div>

            {genError && (
              <div style={{ marginTop: 12, color: "#dc2626", fontSize: 15 }}>
                {genError}
              </div>
            )}
          </div>

          {/* Right column: spacer to keep the controls centered (desktop only) */}
          {!isMobile && <div style={{ flex: 1 }} />}
        </div>
      )}

      {/* Audio page: uploaded files on the left, upload controls centered */}
      {mode === "audio" && (
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "center" : "flex-start",
            gap: 24,
            marginTop: 20
          }}
        >
          {/* Left column: uploaded audio/video players (desktop only; on mobile a
              small tappable video preview sits above the buttons instead) */}
          {!isMobile && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}
          >
            {audioFiles.map((a, i) => (
              <div
                key={i}
                style={{
                  border: "2px solid #888",
                  borderRadius: 3,
                  padding: 10
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 14,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "#c7c7c7"
                    }}
                  >
                    {a.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAudio(i)}
                    aria-label="Remove file"
                    title="Remove"
                    style={{
                      flexShrink: 0,
                      width: 22,
                      height: 22,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "50%",
                      border: "1px solid #888",
                      background: "transparent",
                      color: "inherit",
                      fontSize: 14,
                      lineHeight: 1,
                      cursor: "pointer"
                    }}
                  >
                    ×
                  </button>
                </div>
                {a.isVideo ? (
                  <video
                    src={a.previewUrl}
                    controls
                    style={{ width: "100%", maxHeight: 180, borderRadius: 3 }}
                  />
                ) : (
                  <audio src={a.previewUrl} controls style={{ width: "100%" }} />
                )}
              </div>
            ))}
          </div>
          )}

          {/* Center column: upload controls */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: 48
            }}
          >
            {/* Hidden audio/video picker (can select several at once) */}
            <input
              type="file"
              accept="audio/*,video/*,.mp3,.mp4,.m4a,.wav,.webm,.ogg,.oga,.mpeg,.mpga,.flac"
              ref={audioInputRef}
              style={{ display: "none" }}
              onChange={(e) => {
                addAudio(e.target.files);
                e.target.value = ""; // reset so the same files can be picked again
              }}
            />

            {/* On mobile a small video preview sits centered above the two
                buttons; tap it to expand fullscreen. Audio-only files show a
                compact name chip in the same spot instead. */}
            {isMobile && audioFiles[0]?.isVideo && (
              <div
                onClick={() => setFullscreenVideo(audioFiles[0].previewUrl)}
                style={{
                  position: "relative",
                  marginBottom: 16,
                  cursor: "pointer",
                  lineHeight: 0
                }}
              >
                <video
                  src={`${audioFiles[0].previewUrl}#t=0.1`}
                  muted
                  playsInline
                  preload="metadata"
                  style={{
                    width: 132,
                    height: 84,
                    objectFit: "cover",
                    border: "2px solid #888",
                    borderRadius: 3,
                    background: "#000"
                  }}
                />
                {/* play badge, centered over the thumbnail */}
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none"
                  }}
                >
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.55)" />
                    <path d="M10 8 L16 12 L10 16 Z" fill="#fff" />
                  </svg>
                </span>
                {/* remove */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAudio(0);
                  }}
                  aria-label="Remove file"
                  title="Remove"
                  style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    width: 22,
                    height: 22,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    border: "1px solid #888",
                    background: "#000",
                    color: "#fff",
                    fontSize: 14,
                    lineHeight: 1,
                    cursor: "pointer"
                  }}
                >
                  ×
                </button>
              </div>
            )}
            {isMobile && audioFiles[0] && !audioFiles[0].isVideo && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                  maxWidth: 240,
                  fontSize: 14,
                  color: "#c7c7c7"
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {audioFiles[0].name}
                </span>
                <button
                  type="button"
                  onClick={() => removeAudio(0)}
                  aria-label="Remove file"
                  title="Remove"
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    border: "1px solid #888",
                    background: "transparent",
                    color: "inherit",
                    fontSize: 14,
                    lineHeight: 1,
                    cursor: "pointer"
                  }}
                >
                  ×
                </button>
              </div>
            )}

            {/* Add buttons: microphone (upload a file) + YouTube (paste a link) */}
            <div style={{ display: "flex", gap: 12 }}>
              {/* Microphone box with a plus — click to add audio */}
              <button
                onClick={() => audioInputRef.current?.click()}
                disabled={loading || audioUploading}
                title="Add audio or video"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 96,
                  height: 96,
                  background: "transparent",
                  border: "2px solid #888",
                  borderRadius: 3,
                  cursor: loading ? "default" : "pointer",
                  color: "inherit"
                }}
              >
                <svg
                  width="52"
                  height="52"
                  viewBox="0 0 32 32"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* microphone capsule */}
                  <rect x="10" y="4" width="8" height="13" rx="4" />
                  {/* pickup arc under the capsule */}
                  <path d="M6 15 a8 8 0 0 0 16 0" />
                  {/* stem + base */}
                  <line x1="14" y1="23" x2="14" y2="26" />
                  <line x1="10" y1="26" x2="18" y2="26" />
                  {/* plus, floating just off the top-right corner */}
                  <line x1="27" y1="3.5" x2="27" y2="9.5" />
                  <line x1="24" y1="6.5" x2="30" y2="6.5" />
                </svg>
              </button>

              {/* Record box — records the microphone (e.g. a live lecture) */}
              <button
                onClick={toggleRecording}
                disabled={loading || audioUploading}
                title={recording ? "Stop recording" : "Record audio"}
                aria-pressed={recording}
                style={{
                  display: "inline-flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  width: 96,
                  height: 96,
                  background: "transparent",
                  border: recording ? "2px solid #e0776b" : "2px solid #888",
                  borderRadius: 3,
                  cursor: loading ? "default" : "pointer",
                  color: "inherit"
                }}
              >
                {recording ? (
                  <>
                    {/* live level bars — heights are driven straight from the mic
                        by the analyser loop in toggleRecording */}
                    <div
                      ref={vizBarsRef}
                      style={{
                        display: "flex",
                        alignItems: "center", // bars grow from the middle out
                        gap: 3,
                        height: 28
                      }}
                    >
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: 2,
                            background: "#e0776b",
                            transition: "height 80ms ease" // smooths the jumps between frames
                          }}
                        />
                      ))}
                    </div>
                    <span style={{ fontSize: 14, color: "#e0776b", fontVariantNumeric: "tabular-nums" }}>
                      {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}
                    </span>
                  </>
                ) : (
                  // record icon: a dot in a circle
                  <svg
                    width="44"
                    height="44"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
                  </svg>
                )}
              </button>

              {/* YouTube box — click to reveal a link box */}
              <button
                onClick={() => setShowYoutube((v) => !v)}
                disabled={loading || audioUploading}
                title="Use a YouTube link"
                aria-pressed={showYoutube}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 96,
                  height: 96,
                  background: "transparent",
                  border: showYoutube ? "2px solid #cbd5e1" : "2px solid #888",
                  borderRadius: 3,
                  cursor: loading ? "default" : "pointer",
                  color: "inherit"
                }}
              >
                <svg
                  width="44"
                  height="44"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {/* chain-link icon */}
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </button>
            </div>

            {/* YouTube link box (appears when the YouTube button is clicked) */}
            {showYoutube && (
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => {
                  setYoutubeUrl(e.target.value);
                  if (e.target.value.trim()) setAudioFiles([]); // a link replaces a file
                  setGenError(null);
                }}
                placeholder="Paste a YouTube link"
                style={{
                  marginTop: 12,
                  width: 260,
                  height: 40,
                  border: "2px solid #888",
                  borderRadius: 3,
                  padding: "0 12px",
                  fontSize: 15,
                  background: "transparent",
                  color: "inherit"
                }}
              />
            )}

            {audioUploading ? (
              <div style={{ marginTop: 16, width: 220 }}>
                {/* Rectangular bordered box (matches the site's #888 boxes) that
                    fills with the accent as the upload progresses. */}
                <div
                  style={{
                    height: 16,
                    width: "100%",
                    border: "2px solid #888",
                    borderRadius: 3,
                    background: "transparent",
                    overflow: "hidden"
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${audioProgress}%`,
                      background: ACCENT_BG_STRONG,
                      transition: "width 0.15s ease"
                    }}
                  />
                </div>
                <p
                  style={{
                    opacity: 0.7,
                    marginTop: 8,
                    fontSize: 13,
                    textAlign: "center"
                  }}
                >
                  Uploading {audioProgress}%
                </p>
              </div>
            ) : (
              <p style={{ opacity: 0.7, marginTop: 12 }}>
                Upload audio or a YouTube link to generate questions
              </p>
            )}

            {/* Generate button (transcribes, then builds the quiz) */}
            <div style={{ position: "relative", marginTop: 16 }}>
              <button
                onClick={() => generateFromAudio()}
                disabled={loading || audioUploading}
                style={{
                  display: "block",
                  padding: "10px 24px",
                  minWidth: 190,
                  height: 44,
                  background: ACCENT_BG,
                  color: ACCENT_TEXT,
                  border: "none",
                  borderRadius: 3,
                  fontSize: 16,
                  cursor: loading ? "default" : "pointer"
                }}
              >
                {loading ? (
                  <span className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                ) : (
                  "Generate"
                )}
              </button>
              <span style={restartSlot}>{renderRestart()}</span>
            </div>

            {genError && (
              <div style={{ marginTop: 12, color: "#dc2626", fontSize: 15 }}>
                {genError}
              </div>
            )}
          </div>

          {/* Right column: spacer to keep the controls centered (desktop only) */}
          {!isMobile && <div style={{ flex: 1 }} />}
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        {questions.map((q, i) => {
          const qRound = q.round ?? 0;
          // Reveal right/wrong once this question's round is graded, OR instantly
          // once it's answered (when instant feedback is on).
          const revealed =
            qRound < submittedRounds || (instantFeedback && answers[i] != null);

          // Title colour: green/red once revealed; otherwise yellow for extension
          // (rechallenge) questions, and the default colour for the original round.
          const titleColor = revealed
            ? answers[i] === q.answer
              ? CORRECT_GREEN
              : WRONG_RED
            : qRound >= 1
              ? RECHALLENGE_YELLOW
              : undefined;

          // Last question of its round? (rounds are contiguous in the array)
          const isLastOfRound =
            i === questions.length - 1 ||
            (questions[i + 1].round ?? 0) !== qRound;

          return (
            <Fragment key={i}>
            <div
              id={`question-${i}`}
              className={`q-card${flashIndex === i ? " flash-missing" : ""}`}
              style={{
                position: "relative",
                padding: 12,
                borderRadius: 3,
                // A hint slots INTO the existing gap between choice D and the next
                // question rather than adding to it: giving up this card's bottom
                // padding/margin buys back exactly the room the hint takes, so the
                // question-to-question spacing is unchanged (see the hint's marginTop).
                paddingBottom: hints[i] ? 0 : 12,
                marginBottom: hints[i] ? 3 : 18
              }}
            >
              {/* Hint lightbulb — sits in the empty space to the left of the
                  question, without shifting the question text. */}
              <button
                onClick={() => takeHint(i)}
                title={hints[i] ? "Hint" : "Get a hint"}
                aria-label="Get a hint"
                style={{
                  position: "absolute",
                  left: -24,
                  top: 16,
                  padding: 0,
                  background: "transparent",
                  border: "none",
                  lineHeight: 0,
                  cursor: hints[i] ? "default" : "pointer"
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  // Filled once a hint has been taken, otherwise an outline.
                  fill={hints[i]?.status === "done" ? HINT_YELLOW : "none"}
                  stroke={HINT_YELLOW}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 18h6" />
                  <path d="M10 22h4" />
                  <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1v.2h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" />
                </svg>
              </button>
              <p
                style={{
                  fontWeight: "bold",
                  fontSize: 18,
                  color: titleColor,
                  marginBottom: 22 // push the answers down, away from the question
                }}
              >
                {i + 1}. {q.question}
              </p>

              {/* Build the answer choices: True/False for a TF question,
                  otherwise the four labelled options of a MC question. */}
              {(q.type === "tf"
                ? (["True", "False"] as const).map((v) => ({ value: v as string, label: v as string }))
                : (["A", "B", "C", "D"] as const).map((letter) => ({
                    value: letter as string,
                    label: `${letter}. ${q.options[letter]}`
                  }))
              ).map((choice) => {
                // Show the green dot in the circle ONLY for the correct option
                // on a question the user got wrong (once revealed).
                const showGreenDot =
                  revealed && answers[i] !== q.answer && choice.value === q.answer;

                return (
                  <label
                    key={choice.value}
                    style={{
                      display: "flex",       // sits on its own line...
                      width: "fit-content",  // ...but only as wide as its content (so you click the dot/letter/text, not the whole row)
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 10,
                      cursor: revealed ? "default" : "pointer"
                    }}
                  >
                    {showGreenDot ? (
                      // A green filled circle that sits where the radio dot would be
                      <span
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: "50%",
                          background: CORRECT_GREEN,
                          flexShrink: 0
                        }}
                      />
                    ) : (
                      <input
                        type="radio"
                        name={`question-${i}`}
                        checked={answers[i] === choice.value}
                        onChange={() => {
                          // lock a question once its answer is revealed, but
                          // DON'T disable the radio (disabled greys out the
                          // user's yellow dot)
                          if (!revealed)
                            patchQuiz(mode, (s) => ({
                              answers: { ...s.answers, [i]: choice.value }
                            }));
                        }}
                        style={{ accentColor: "#eab308", margin: 0 }} // yellow selection dot
                      />
                    )}

                    <span style={{ color: "#c7c7c7" }}>{choice.label}</span>
                  </label>
                );
              })}

              {/* Hint: the same bouncing-squares animation as quiz loading,
                  then the hint in yellow Inter text under choice D. Sits
                  centered in the gap between choice D and the next question. */}
              {hints[i]?.status === "loading" && (
                <div style={{ marginTop: 15, display: "flex", alignItems: "center", height: 22 }}>
                  {/* Same bouncing-squares motion as quiz loading, but in the
                      hint's yellow (brighter than the rechallenge gold). Styled
                      inline — only the `dot-fade` keyframe comes from the CSS. */}
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    {[0, 0.2, 0.4].map((delay) => (
                      <span
                        key={delay}
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 2,
                          background: HINT_YELLOW,
                          animation: "dot-fade 1.2s infinite ease-in-out",
                          animationDelay: `${delay}s`
                        }}
                      />
                    ))}
                  </span>
                </div>
              )}
              {hints[i]?.status === "done" && hints[i]?.text && (
                <p
                  style={{
                    marginTop: 15,
                    marginBottom: 0,
                    color: HINT_YELLOW,
                    fontSize: 15,
                    lineHeight: 1.45,
                    fontFamily: "var(--font-inter), system-ui, sans-serif"
                  }}
                >
                  {hints[i]?.text}
                </p>
              )}
            </div>
            {/* After the last question of each round: its Submit / grade / Rechallenge */}
            {isLastOfRound && renderRoundControls(qRound)}
            </Fragment>
          );
        })}
      </div>
    </main>
  );
}
