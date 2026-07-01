import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Q = {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: string;
  difficulty: string;
};

const order: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

// Split notes into `n` contiguous parts so each batch covers a different section.
// Falls back to the whole text when it's too short to split usefully.
function splitIntoParts(text: string, n: number): string[] {
  if (n <= 1) return [text];
  const words = text.trim().split(/\s+/);
  if (words.length < n * 25) return [text]; // too short — give each batch the whole thing
  const per = Math.ceil(words.length / n);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const slice = words.slice(i * per, (i + 1) * per).join(" ");
    if (slice) parts.push(slice);
  }
  return parts;
}

// Ask the model for `count` questions, telling it to avoid repeating any we already have
async function makeQuestions(
  text: string,
  count: number,
  avoid: string[],
  level: string
): Promise<Q[]> {
  const avoidNote = avoid.length
    ? `\n\nDo NOT repeat or rephrase any of these existing questions:\n- ${avoid.join(
        "\n- "
      )}`
    : "";

  // Aim the questions at the student's education level
  const levelNote = level
    ? `\n- Write the questions for a ${level} student: match the vocabulary, depth, and reasoning expected at that level.`
    : "";

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" }, // force valid JSON
    messages: [
      {
        role: "system",
        content:
          "You generate multiple-choice study questions from notes. " +
          "You always respond with valid JSON only, no extra text."
      },
      {
        role: "user",
        content: `Create exactly ${count} multiple-choice questions based on the notes below.

Rules:
- The "questions" array MUST contain exactly ${count} items — no more, no fewer.
- Each question has exactly 4 answer options labelled A, B, C, and D.
- Exactly one option is correct.
- Draw questions from ACROSS all of the notes (beginning, middle, and end) — never only the opening.
- Use a mix of easy, medium, and hard, and label each one.
- Spread the correct answers EVENLY across A, B, C and D. Do NOT cluster them on B or C.${levelNote}${avoidNote}

Return JSON in exactly this shape:
{
  "questions": [
    {
      "question": "the question text",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "answer": "A",
      "difficulty": "easy"
    }
  ]
}

Notes:
${text}`
      }
    ]
  });

  const output = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(output);
  return Array.isArray(parsed.questions) ? parsed.questions : [];
}

// Make exactly one question per section, so questions cover the whole document
async function makeQuestionsPerSection(
  sections: string[],
  avoid: string[],
  level: string
): Promise<Q[]> {
  const count = sections.length;
  const avoidNote = avoid.length
    ? `\n\nDo NOT repeat or rephrase any of these existing questions:\n- ${avoid.join(
        "\n- "
      )}`
    : "";
  const levelNote = level
    ? `\n- Write the questions for a ${level} student: match the vocabulary, depth, and reasoning expected at that level.`
    : "";

  const notesBlock = sections
    .map((s, i) => `[Section ${i + 1}]\n${s}`)
    .join("\n\n");

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You generate multiple-choice study questions from notes. " +
          "You always respond with valid JSON only, no extra text."
      },
      {
        role: "user",
        content: `Create exactly ${count} multiple-choice questions from the notes below, which are divided into ${count} sections.

Rules:
- The "questions" array MUST contain exactly ${count} items: exactly ONE question per section (question 1 from [Section 1], question 2 from [Section 2], and so on). This ensures the whole document is covered, not just the beginning.
- The sections are ONLY there to spread coverage. NEVER mention "section", a section number, or that the notes were divided. Each question must read as a standalone question about the material — the student never sees the sections.
- Each question has exactly 4 answer options labelled A, B, C, and D.
- Exactly one option is correct.
- Use a mix of easy, medium, and hard, and label each one.
- Spread the correct answers EVENLY across A, B, C and D. Do NOT cluster them on B or C.${levelNote}${avoidNote}

Return JSON in exactly this shape:
{
  "questions": [
    {
      "question": "the question text",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "answer": "A",
      "difficulty": "easy"
    }
  ]
}

Notes:
${notesBlock}`
      }
    ]
  });

  const output = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(output);
  return Array.isArray(parsed.questions) ? parsed.questions : [];
}

export async function POST(req: Request) {
  const body = await req.json();
  const text = body.text;
  const level = typeof body.level === "string" ? body.level : "";

  // Only allow 5/10/15/20, default to 5
  const allowed = [5, 10, 15, 20];
  const count = allowed.includes(body.count) ? body.count : 5;

  // Split the notes into one section per question, so every question comes
  // from a different part of the document. (Returns [text] if it's too short.)
  const sections = splitIntoParts(text, count);

  const encoder = new TextEncoder();

  // Stream questions out one JSON line at a time, as soon as each is ready
  const stream = new ReadableStream({
    async start(controller) {
      const seen = new Set<string>();
      const sentTexts: string[] = [];
      let sent = 0;

      // Send one question down the stream (skipping duplicates / extras)
      const send = (q: Q) => {
        const key = q.question?.trim().toLowerCase();
        if (!key || seen.has(key) || sent >= count) return;
        seen.add(key);
        sentTexts.push(q.question);
        sent++;
        controller.enqueue(encoder.encode(JSON.stringify(q) + "\n"));
      };

      const sortByDifficulty = (batch: Q[]) =>
        batch.sort(
          (a, b) =>
            (order[a.difficulty?.toLowerCase()] ?? 1) -
            (order[b.difficulty?.toLowerCase()] ?? 1)
        );

      if (sections.length === count) {
        // Long enough to split: one question per section. Batch the sections
        // into groups of 5 and run those groups in parallel.
        const groups: string[][] = [];
        for (let i = 0; i < sections.length; i += 5) {
          groups.push(sections.slice(i, i + 5));
        }
        await Promise.all(
          groups.map(async (group) => {
            const batch = await makeQuestionsPerSection(group, [], level);
            sortByDifficulty(batch);
            for (const q of batch) send(q);
          })
        );
      } else {
        // Too short to split — ask for the whole count from the whole text,
        // in parallel chunks of 5
        const chunks: number[] = [];
        for (let left = count; left > 0; left -= 5) chunks.push(Math.min(5, left));
        await Promise.all(
          chunks.map(async (n) => {
            const batch = await makeQuestions(text, n, [], level);
            sortByDifficulty(batch);
            for (const q of batch) send(q);
          })
        );
      }

      // If duplicates left us short, top up the remainder
      let attempts = 0;
      while (sent < count && attempts < 3) {
        const batch = await makeQuestions(text, count - sent, sentTexts, level);
        for (const q of batch) send(q);
        attempts++;
      }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform"
    }
  });
}
