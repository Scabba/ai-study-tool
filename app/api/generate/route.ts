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

// Ask the model for `count` questions, telling it to avoid repeating any we already have
async function makeQuestions(
  text: string,
  count: number,
  avoid: string[]
): Promise<Q[]> {
  const avoidNote = avoid.length
    ? `\n\nDo NOT repeat or rephrase any of these existing questions:\n- ${avoid.join(
        "\n- "
      )}`
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
- Use a mix of easy, medium, and hard, and label each one.
- Spread the correct answers EVENLY across A, B, C and D. Do NOT cluster them on B or C.${avoidNote}

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

export async function POST(req: Request) {
  const body = await req.json();
  const text = body.text;

  // Only allow 5/10/15/20, default to 5
  const allowed = [5, 10, 15, 20];
  const count = allowed.includes(body.count) ? body.count : 5;

  // Split the total into chunks of 5 (e.g. 20 -> [5, 5, 5, 5])
  const chunks: number[] = [];
  for (let left = count; left > 0; left -= 5) {
    chunks.push(Math.min(5, left));
  }

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

      // Fire all chunks in parallel; emit each chunk's questions the moment it lands
      await Promise.all(
        chunks.map(async (n) => {
          const batch = await makeQuestions(text, n, []);
          batch.sort(
            (a, b) =>
              (order[a.difficulty?.toLowerCase()] ?? 1) -
              (order[b.difficulty?.toLowerCase()] ?? 1)
          );
          for (const q of batch) send(q);
        })
      );

      // If duplicates left us short, top up the remainder
      let attempts = 0;
      while (sent < count && attempts < 3) {
        const batch = await makeQuestions(text, count - sent, sentTexts);
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
