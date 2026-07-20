import OpenAI from "openai";

// Screens what a user types before it becomes a quiz. This exists to stop
// someone feeding Athenia slurs to get an offensive quiz back — not to police
// what students study.
//
// Why the moderation API and not a word list: a list is trivially evaded
// (spacing, homoglyphs, leetspeak), goes stale, catches innocent words that
// contain a banned substring, and means keeping a file of slurs in the repo.
// The moderation endpoint is free and doesn't add token cost.

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Only the hate categories. Deliberately NOT the violence or self-harm ones:
// this is a study tool, and history, literature, biology and health notes
// legitimately contain that material. A student revising the Holocaust or
// reading Of Mice and Men should not be told their notes are unacceptable.
const BLOCKED = ["hate", "hate/threatening"] as const;

// Scores run 0..1. The category booleans OpenAI returns are tuned to catch
// discussion *about* hate as well as hate itself, which fires on exactly the
// history and literature notes we want to allow. A high score threshold picks
// out slurs aimed at someone rather than a text that merely mentions racism.
// If real content still gets blocked, raise this before removing the check.
const SCORE_THRESHOLD = 0.85;

// The OpenAI key must be allowed to call /v1/moderations. As of 2026-07-20 this
// project's key is NOT — it returns 403 Forbidden, the same restriction that
// blocks whisper/TTS. Enable the moderations endpoint for the key in the OpenAI
// dashboard (Project -> API keys -> allowed endpoints); it costs nothing.
//
// Until then this check is a NO-OP and no input is screened. One 403 flips this
// flag so we don't pay ~300ms of latency on every generation retrying an
// endpoint we're not allowed to call.
let forbidden = false;

// True when the text should be refused. Fails OPEN: if moderation can't run we
// allow the quiz. An outage here should not stop students working, and the
// worst case is one offensive quiz that only its author sees — a very different
// risk from the rate limiter, which fails closed because it guards our spend.
export async function isHatefulInput(text: string): Promise<boolean> {
  const sample = text.trim();
  if (!sample || forbidden) return false;
  try {
    const res = await client.moderations.create({
      model: "omni-moderation-latest",
      // The endpoint has its own length ceiling and slurs land early in an
      // abusive prompt; no need to send a whole textbook.
      input: sample.slice(0, 8000)
    });
    const result = res.results[0];
    if (!result) return false;
    const scores = result.category_scores;
    return BLOCKED.some((c) => scores[c] >= SCORE_THRESHOLD);
  } catch (err) {
    if ((err as { status?: number })?.status === 403) {
      forbidden = true;
      console.error(
        "[moderation] DISABLED: this OpenAI key is not allowed to call " +
          "/v1/moderations (403). Nothing is being screened. Enable the " +
          "moderations endpoint for the key in the OpenAI dashboard."
      );
      return false;
    }
    console.error("[moderation] check failed, allowing:", (err as Error)?.message ?? err);
    return false;
  }
}
