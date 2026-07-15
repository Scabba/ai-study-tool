import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Same model as the question generator (see app/api/generate/route.ts).
const GEN_MODEL = process.env.GENERATION_MODEL ?? "gpt-5.4-mini";

const SYS =
  "You are a study tutor who gives short hints. " +
  "You always respond with valid JSON only, no extra text.";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

// Aim the hint at the student's level, when we know it.
const levelNote = (level: string): string =>
  level ? ` Pitch it for a ${level} student.` : "";

// Generate a single nudge for one question. We send the correct answer so the
// model can steer toward it WITHOUT giving it away.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question : "";
  const answer = typeof body.answer === "string" ? body.answer : "";
  const level = typeof body.level === "string" ? body.level : "";
  const options =
    body.options && typeof body.options === "object" ? body.options : null;

  if (!question.trim()) {
    return json({ error: "No question provided." }, 400);
  }

  // Show the options (if any) so the hint can point away from the distractors,
  // and the correct answer so the model knows what NOT to reveal.
  const optionsBlock = options
    ? `\nOptions:\n${["A", "B", "C", "D"]
        .filter((l) => typeof options[l] === "string")
        .map((l) => `${l}. ${options[l]}`)
        .join("\n")}`
    : "";

  const prompt = `Give ONE short hint (a single sentence, 20 words or fewer) that helps a student work out the answer to the question below, WITHOUT stating or giving away the correct answer. Nudge them toward the right concept or how to reason about it — never name the answer, its option letter, or say whether it's true or false.${levelNote(
    level
  )}

Question: ${question}${optionsBlock}
Correct answer (do NOT reveal this): ${answer}

Return JSON in exactly this shape:
{ "hint": "the hint text" }`;

  try {
    const response = await client.chat.completions.create({
      model: GEN_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: prompt },
      ],
    });
    const parsed = JSON.parse(response.choices[0].message.content ?? "{}");
    const hint = typeof parsed.hint === "string" ? parsed.hint.trim() : "";
    if (!hint) {
      return json({ error: "No hint available." }, 502);
    }
    return json({ hint });
  } catch (err) {
    console.error("[hint] failed:", (err as Error)?.message ?? err);
    return json({ error: "Couldn't generate a hint." }, 502);
  }
}
