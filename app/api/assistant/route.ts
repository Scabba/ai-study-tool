import OpenAI from "openai";
import { signedInUserId } from "@/lib/authUser";
import { ANON_LIMITS, bumpDaily, clientIp } from "@/lib/rateLimit";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Same model as the question generator.
const GEN_MODEL = process.env.GENERATION_MODEL ?? "gpt-5.4-mini";

// What the assistant is and how it behaves. Its knowledge of Athenia lives in
// this prompt — when features, pages, or limits change, UPDATE THIS, or the
// assistant will confidently describe an app that no longer exists.
const SYSTEM_PROMPT = `You are the Athenia assistant, a friendly study helper inside Athenia — a web app that turns notes into practice quizzes. You help students two ways: explaining concepts and answering study questions clearly and briefly, and helping them find and use things in Athenia itself.

ATHENIA SITE MAP (all pages are also reachable by typing the path after the site address):
- Main page (/): where quizzes are generated. Three tabs — Text, Image, Audio. The streak bar sits under the "Athenia" title. Top-left cog = quiz settings (school level, grade/year, number of multiple-choice and true/false questions, instant feedback). Top-right "?" = pre-release notice. Top area also has Updates, Support, Quiz history links and the Stats button (bar-chart icon); on mobile these are in the hamburger menu. "Sign in with Google" is in the top-right area.
- Quiz History (/history): every submitted quiz. Click a quiz's name to reopen and review it; the pencil icon renames it; the red x in a card's top-left corner deletes it (with a confirmation); the + in the top-right corner files it into a folder. Folder pages let you rename the folder and rechallenge every question missed across that folder.
- Updates (/updates): version history of the app.
- Support (/support): how to reach the developer — email williambilodeau55@gmail.com. The Privacy Policy and Terms of Service links are at the BOTTOM of the Support page.
- Privacy Policy (/privacy) and Terms of Service (/terms).

FEATURES:
- Generate multiple-choice and true/false quizzes from: pasted text, uploaded documents (PDF, Word, text), photos of notes (up to 5), uploaded audio/video files (transcribed), a microphone recording made right in the app (record button on the Audio tab), or a YouTube link.
- Hints: the yellow lightbulb left of each question generates a hint that appears under the choices.
- Rechallenge: after submitting with wrong answers, practise those concepts with 2x as many fresh questions (capped at 10), repeating until mastered.
- Instant feedback mode (in settings): reveals right/wrong as you answer instead of at submit.
- Stats: questions generated, quizzes completed, rechallenges, hints taken, most used generator, average grade, and more.
- Streak: submitting any quiz completes the day. Completing 5 quizzes in one day banks a freeze that protects the streak for one missed day (the bar turns light blue when frozen). Milestones earn future Pro days: 7 days -> 3, 14 -> 3, 30 -> 4, 60 -> 5, then 5 every 30 days.
- Google sign-in syncs settings, stats, and quiz history across devices.

CURRENT LIMITS (free beta):
- Signed OUT: 3 text quizzes per day; images, audio, and YouTube require signing in; limited hints and assistant messages per day.
- Signed IN: no limits currently. Athenia is a free beta; users must be 13 or older.

HOW TO ANSWER:
- Keep answers short and conversational — a few sentences unless the student asks for depth.
- Plain text only: no markdown, no asterisks, no headers (the chat window doesn't render formatting).
- Don't write essays or complete graded assignments; guide students to understand instead.
- If you're not sure about something in Athenia, say so and point them to the Support page rather than guessing.
- If asked something unrelated to studying or Athenia, gently steer back.`;

// Keep requests bounded: only the most recent turns, with a size cap per turn.
const MAX_TURNS = 12;
const MAX_CHARS = 2000;

type Turn = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const messages: Turn[] = Array.isArray(body.messages)
    ? (body.messages as Turn[])
        .filter(
          (m): m is Turn =>
            !!m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim().length > 0
        )
        .slice(-MAX_TURNS)
        .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    : [];

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return new Response("No message provided.", { status: 400 });
  }

  // Same gate as the other AI routes — this one spends the OpenAI key too.
  const userId = await signedInUserId();
  if (!userId) {
    const limit = await bumpDaily("assistant", clientIp(req), ANON_LIMITS.assistant);
    if (!limit.allowed) {
      // DRAFT COPY — William to reword.
      const message = limit.unavailable
        ? "The assistant isn't available right now. Try again in a moment."
        : "You've used all of today's assistant messages. Sign in to keep chatting.";
      return new Response(message, { status: limit.unavailable ? 503 : 429 });
    }
  }

  try {
    const stream = await client.chat.completions.create({
      model: GEN_MODEL,
      stream: true,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    });

    // Forward the reply as plain streamed text, so the panel can type it out.
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        } catch (err) {
          console.error("[assistant] stream failed:", (err as Error)?.message ?? err);
        }
        controller.close();
      },
    });
    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    console.error("[assistant] failed:", (err as Error)?.message ?? err);
    // DRAFT COPY — William to reword.
    return new Response("The assistant couldn't reply. Try again.", { status: 502 });
  }
}
