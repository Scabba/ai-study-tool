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
    messages: [
      {
        role: "system",
        content: "You generate study questions from notes. Be concise."
      },
      {
        role: "user",
        content: `Turn this into 5 study questions:\n\n${text}`
      }
    ],
  });

  const output = response.choices[0].message.content;

  return NextResponse.json({
    questions: output?.split("\n").filter(Boolean) ?? []
  });
}