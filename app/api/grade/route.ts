import OpenAI from "openai";
import { signedInUserId } from "@/lib/authUser";
import { ANON_LIMITS, bumpDaily, clientIp } from "@/lib/rateLimit";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Same model as the generator (see app/api/generate/route.ts).
const GEN_MODEL = process.env.GENERATION_MODEL ?? "gpt-5.4-mini";

const SYS =
  "You are a fair, encouraging teacher grading a student's written short answer " +
  "against a model answer. Judge CONCEPTUAL understanding, not exact wording. " +
  "You always respond with valid JSON only, no extra text.";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

type Verdict = "correct" | "partial" | "incorrect";

// Grade one written answer. A single structured call returns the verdict plus
// all the feedback — no second request.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question : "";
  const expected = typeof body.expected === "string" ? body.expected : "";
  const response = typeof body.response === "string" ? body.response : "";

  if (!question.trim() || !expected.trim()) {
    return json({ error: "Missing question or model answer." }, 400);
  }
  if (!response.trim()) {
    return json({ error: "No answer to grade." }, 400);
  }

  // Same gate as the other AI routes — this spends the same OpenAI key.
  const userId = await signedInUserId();
  if (!userId) {
    const limit = await bumpDaily("grade", clientIp(req), ANON_LIMITS.grade);
    if (!limit.allowed) {
      // DRAFT COPY — William to reword.
      const message = limit.unavailable
        ? "Couldn't grade that right now. Try again in a moment."
        : "You've used all of today's written gradings. Sign in to keep going.";
      return json({ error: message }, limit.unavailable ? 503 : 429);
    }
  }

  const prompt = `Grade the student's answer against the model answer, judging meaning rather than exact wording.

Accept as correct: different phrasing, synonyms, a different sentence order, and CONCISE answers that capture the core idea — a student does not have to restate every clause of the model answer. Ignore capitalization, punctuation, and minor spelling mistakes. Reject answers that state something different, contradictory, or unrelated — mentioning the right topic is not enough if the actual claim is wrong.

Calibration examples (for a question about Newton's First Law, model answer "an object stays at rest or in uniform motion unless acted on by a net external force"):
- "Objects keep moving unless a force acts on them." -> correct (captures the essential relationship).
- "Things stay at rest or keep moving at constant velocity until a force changes their motion." -> correct.
- "Objects speed up on their own." -> incorrect (contradicts the concept).
- "Gravity causes all motion." -> incorrect (unrelated claim).

Verdict rules:
- "correct" when the answer clearly communicates the essential concept, even if concise or missing minor detail. Do NOT withhold "correct" just because a nuance is unstated.
- "partial" when the answer captures SOME of the idea but gets an important part wrong, muddled, or missing.
- "incorrect" when it misses the concept, is contradictory, or is unrelated.
- Only prefer "partial" over "correct" when you genuinely doubt the core idea is there — not merely because more detail was possible.

Feedback: 2-3 sentences, warm and specific, addressed to the student ("you"). For "partial", say what they got and what important piece is missing.

Question: ${question}
Model answer: ${expected}
Student answer: ${response}

Return JSON in exactly this shape:
{
  "verdict": "correct" | "partial" | "incorrect",
  "confidence": 0.0-1.0,
  "feedback": "the short explanation addressed to the student",
  "modelAnswer": "a clean one to two sentence model answer",
  "missingConcepts": ["short phrases the answer was missing, [] if none"],
  "suggestion": "one optional improvement tip, or empty string",
  "reasoning": "brief internal grading rationale"
}`;

  try {
    const res = await client.chat.completions.create({
      model: GEN_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: prompt }
      ]
    });
    const p = JSON.parse(res.choices[0].message.content ?? "{}");
    const raw = String(p.verdict ?? "").toLowerCase();
    const verdict: Verdict =
      raw === "correct" ? "correct" : raw === "partial" ? "partial" : "incorrect";
    // Confidence gate: honour the spec's "prefer partial when uncertain" — a
    // low-confidence "correct" is downgraded so a full mark is always earned.
    const confidence = typeof p.confidence === "number" ? p.confidence : 0;
    const finalVerdict: Verdict =
      verdict === "correct" && confidence < 0.7 ? "partial" : verdict;

    return json({
      verdict: finalVerdict,
      confidence,
      feedback: typeof p.feedback === "string" ? p.feedback : "",
      modelAnswer: typeof p.modelAnswer === "string" ? p.modelAnswer : expected,
      missingConcepts: Array.isArray(p.missingConcepts)
        ? p.missingConcepts.filter((x: unknown) => typeof x === "string").slice(0, 5)
        : [],
      suggestion: typeof p.suggestion === "string" ? p.suggestion : ""
      // reasoning is intentionally NOT returned — internal only.
    });
  } catch (err) {
    console.error("[grade] failed:", (err as Error)?.message ?? err);
    return json({ error: "Couldn't grade that answer." }, 502);
  }
}
