import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  const body = await req.json();
  const text = body.text;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" }, // force the model to reply with valid JSON
    messages: [
      {
        role: "system",
        content:
          "You generate multiple-choice study questions from notes. " +
          "You always respond with valid JSON only, no extra text."
      },
      {
        role: "user",
        content: `Create exactly 5 multiple-choice questions based on the notes below.

Rules:
- Question 1 must be EASY.
- Questions 2 and 3 must be MEDIUM difficulty.
- Questions 4 and 5 must be HARD.
- Each question has exactly 4 answer options labelled A, B, C, and D.
- Exactly one option is correct.
- Spread the correct answers EVENLY across A, B, C and D. Do NOT make most answers B or C. Across the 5 questions, make sure every letter (A, B, C, D) is used as the correct answer at least once.

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
    ],
  });

  const output = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(output);

  return NextResponse.json({
    questions: parsed.questions ?? []
  });
}
