import OpenAI, { toFile } from "openai";
import { YoutubeTranscript } from "youtube-transcript";

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

// A question is only usable if its 4 options are distinct & non-empty and the
// answer points at one of A/B/C/D
function isValidQuestion(q: Q): boolean {
  if (!q.question?.trim()) return false;
  const opts = [q.options?.A, q.options?.B, q.options?.C, q.options?.D].map(
    (o) => (o ?? "").trim().toLowerCase()
  );
  if (opts.some((o) => !o) || new Set(opts).size !== 4) return false;
  return ["A", "B", "C", "D"].includes(q.answer);
}

// A true/false item: a statement plus an answer of "True" or "False"
type TFQ = {
  question: string;
  answer: string;
  difficulty: string;
};

function isValidTF(q: TFQ): boolean {
  if (!q.question?.trim()) return false;
  const a = (q.answer ?? "").toString().trim().toLowerCase();
  return a === "true" || a === "false";
}

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
- The "questions" array MUST contain exactly ${count} items. ONLY as a last resort — when it is genuinely IMPOSSIBLE to make even one relevant question because the notes are empty, pure gibberish, random characters, or a single meaningless word — return {"questions": []} instead. If the notes contain ANY real topic or subject at all, always make the questions. When in doubt, make the questions.
- Each question has exactly 4 answer options labelled A, B, C, and D. All four options MUST be different from each other — never repeat the same value or wording.
- Exactly one option is correct, and no other option may be equal or equivalent to it.
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
- ONLY as a last resort — when it is genuinely IMPOSSIBLE to make even one relevant question because the notes are empty, pure gibberish, or random characters — return {"questions": []} instead. If the notes contain ANY real topic or subject at all, always make the questions.
- The "questions" array MUST contain exactly ${count} items: exactly ONE question per section (question 1 from [Section 1], question 2 from [Section 2], and so on). This ensures the whole document is covered, not just the beginning.
- The sections are ONLY there to spread coverage. NEVER mention "section", a section number, or that the notes were divided. Each question must read as a standalone question about the material — the student never sees the sections.
- Each question has exactly 4 answer options labelled A, B, C, and D. All four options MUST be different from each other — never repeat the same value or wording.
- Exactly one option is correct, and no other option may be equal or equivalent to it.
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

// Make questions by having the AI read one or more uploaded images.
// When generating for one image out of several, pass imageNumber/totalImages
// so each question can say which uploaded image it is about.
async function makeQuestionsFromImages(
  images: string[],
  count: number,
  avoid: string[],
  level: string,
  imageNumber?: number,
  totalImages?: number
): Promise<Q[]> {
  const avoidNote = avoid.length
    ? `\n\nDo NOT repeat or rephrase any of these existing questions:\n- ${avoid.join(
        "\n- "
      )}`
    : "";
  const levelNote = level
    ? `\n- Write the questions for a ${level} student: match the vocabulary, depth, and reasoning expected at that level.`
    : "";
  // When there are several uploaded images, tell the student which one each question is about
  const labelNote =
    totalImages && totalImages > 1 && imageNumber
      ? `\n- The student uploaded ${totalImages} images. Begin EVERY question with the exact phrase "In image ${imageNumber}, " so they know which uploaded photo it refers to.`
      : "";
  const many = images.length > 1;

  const prompt = `Create exactly ${count} multiple-choice study questions based on the attached image${
    many ? `s (there are ${images.length})` : ""
  }.

The image${many ? "s" : ""} could be handwritten or typed notes, a textbook page, a diagram, a chart, or a photo of an object, place, or scene. Look carefully at what ${
    many ? "they show" : "it shows"
  } and write educational quiz questions about the subject matter — the facts, concepts, objects, or ideas depicted.

Rules:
- The "questions" array MUST contain exactly ${count} items. ALWAYS produce them, no matter how simple the image${
    many ? "s are" : " is"
  } — even a single shape, colour, or object is enough (ask about its colour, shape, count, position, or what it is). Never return an empty list.${
    many
      ? "\n- Draw questions from across ALL of the images, not just the first one."
      : ""
  }
- Base the questions on what is actually shown; don't invent unrelated facts.
- Do NOT ask questions whose answer depends on counting many small or repeated items (fingers, dots, tally marks, objects in a pile) — you often miscount these. Only ask about a count when it is small and unmistakable.
- Each question has exactly 4 answer options labelled A, B, C, and D. All four options MUST be different from each other — never repeat the same value or wording.
- Exactly one option is correct, and no other option may be equal or equivalent to it.
- Use a mix of easy, medium, and hard, and label each one.
- Spread the correct answers EVENLY across A, B, C and D. Do NOT cluster them on B or C.${labelNote}${levelNote}${avoidNote}

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
}`;

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: prompt },
    ...images.map(
      (img) => ({ type: "image_url", image_url: { url: img } }) as const
    )
  ];

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
      { role: "user", content }
    ]
  });

  const output = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(output);
  return Array.isArray(parsed.questions) ? parsed.questions : [];
}

// Ask the model for `count` true/false statements from the notes.
async function makeTrueFalse(
  text: string,
  count: number,
  avoid: string[],
  level: string
): Promise<TFQ[]> {
  const avoidNote = avoid.length
    ? `\n\nDo NOT repeat or rephrase any of these existing questions/statements:\n- ${avoid.join(
        "\n- "
      )}`
    : "";
  const levelNote = level
    ? `\n- Write the statements for a ${level} student: match the vocabulary, depth, and reasoning expected at that level.`
    : "";

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You generate true/false study statements from notes. " +
          "You always respond with valid JSON only, no extra text."
      },
      {
        role: "user",
        content: `Create exactly ${count} true/false statements based on the notes below.

Rules:
- The "questions" array MUST contain exactly ${count} items. ONLY as a last resort — when it is genuinely IMPOSSIBLE to make even one relevant statement because the notes are empty, pure gibberish, random characters, or a single meaningless word — return {"questions": []} instead. If the notes contain ANY real topic or subject at all, always make the statements. When in doubt, make them.
- Each item is a single declarative statement that is clearly either true or false based on the notes.
- Make roughly HALF of them true and half false — do NOT make them all true.
- The "answer" is exactly "True" or "False".
- Draw statements from ACROSS all of the notes (beginning, middle, and end) — never only the opening.
- Use a mix of easy, medium, and hard, and label each one.${levelNote}${avoidNote}

Return JSON in exactly this shape:
{
  "questions": [
    {
      "question": "the statement",
      "answer": "True",
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

// Ask the model for `count` true/false statements by reading the uploaded images.
async function makeTrueFalseFromImages(
  images: string[],
  count: number,
  avoid: string[],
  level: string
): Promise<TFQ[]> {
  const avoidNote = avoid.length
    ? `\n\nDo NOT repeat or rephrase any of these existing questions/statements:\n- ${avoid.join(
        "\n- "
      )}`
    : "";
  const levelNote = level
    ? `\n- Write the statements for a ${level} student: match the vocabulary, depth, and reasoning expected at that level.`
    : "";
  const many = images.length > 1;

  const prompt = `Create exactly ${count} true/false study statements based on the attached image${
    many ? `s (there are ${images.length})` : ""
  }.

The image${many ? "s" : ""} could be handwritten or typed notes, a textbook page, a diagram, a chart, or a photo of an object, place, or scene. Look carefully at what ${
    many ? "they show" : "it shows"
  } and write true/false statements about the subject matter.

Rules:
- The "questions" array MUST contain exactly ${count} items. ALWAYS produce them, no matter how simple the image${
    many ? "s are" : " is"
  }. Never return an empty list.${
    many
      ? "\n- Draw statements from across ALL of the images, not just the first one."
      : ""
  }
- Base the statements on what is actually shown; don't invent unrelated facts.
- Make roughly HALF of them true and half false — do NOT make them all true.
- The "answer" is exactly "True" or "False".
- Do NOT write statements whose truth depends on counting many small or repeated items — you often miscount these.
- Use a mix of easy, medium, and hard, and label each one.${levelNote}${avoidNote}

Return JSON in exactly this shape:
{
  "questions": [
    {
      "question": "the statement",
      "answer": "True",
      "difficulty": "easy"
    }
  ]
}`;

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: prompt },
    ...images.map(
      (img) => ({ type: "image_url", image_url: { url: img } }) as const
    )
  ];

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You generate true/false study statements from notes. " +
          "You always respond with valid JSON only, no extra text."
      },
      { role: "user", content }
    ]
  });

  const output = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(output);
  return Array.isArray(parsed.questions) ? parsed.questions : [];
}

// Pick a file extension Whisper accepts, preferring the real filename's
// extension and falling back to the MIME type.
function audioExt(mime: string, name?: string): string {
  const supported = ["mp3", "mp4", "m4a", "wav", "webm", "ogg", "oga", "mpeg", "mpga", "flac"];
  const fromName = name?.split(".").pop()?.toLowerCase();
  if (fromName && supported.includes(fromName)) return fromName;
  const map: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/mpeg": "mpeg"
  };
  return map[mime] ?? "mp3";
}

// Fetch an uploaded audio/video file from its (Supabase Storage) URL and
// transcribe it via Whisper. The bytes never pass through the request body,
// so Vercel's ~4.5 MB body limit doesn't apply.
async function transcribeUrl(url: string, name: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`file fetch failed: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const mime = resp.headers.get("content-type") ?? "";
  const file = await toFile(buffer, `audio.${audioExt(mime, name)}`, {
    type: mime || undefined
  });
  const res = await client.audio.transcriptions.create({
    file,
    model: "whisper-1"
  });
  return (res.text ?? "").trim();
}

// Pull the 11-char video id out of any common YouTube URL form (or a bare id).
function youtubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.split("/").filter(Boolean)[0] ?? null;
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) => ["shorts", "embed", "v", "live"].includes(p));
      if (i >= 0 && parts[i + 1]) return parts[i + 1];
    }
  } catch {
    // not a URL — fall through
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;#39;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Fetch a YouTube video's captions and return them as one block of text.
// (Uses the video's existing captions — it does not download the media.)
async function fetchYoutubeCaptions(url: string): Promise<string> {
  const id = youtubeId(url);
  if (!id) return "";
  const parts = await YoutubeTranscript.fetchTranscript(id);
  return decodeEntities(parts.map((p) => p.text).join(" "))
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  const body = await req.json();
  let text = typeof body.text === "string" ? body.text : "";
  // Accept an array of audio/video files as base64 data URLs
  // A single uploaded audio/video file, referenced by its Storage URL
  const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl : "";
  const audioName = typeof body.audioName === "string" ? body.audioName : "";
  const youtube = typeof body.youtube === "string" ? body.youtube.trim() : "";
  // Accept an array of images (or a single legacy "image")
  const images: string[] = (
    Array.isArray(body.images)
      ? body.images.filter(
          (x: unknown) => typeof x === "string" && x.startsWith("data:image/")
        )
      : typeof body.image === "string" && body.image.startsWith("data:image/")
        ? [body.image]
        : []
  ).slice(0, 10); // never process more than 10 images
  const level = typeof body.level === "string" ? body.level : "";

  // Only allow 0/5/10/15/20, default to 5
  const allowed = [0, 5, 10, 15, 20];
  const count = allowed.includes(body.count) ? body.count : 5;

  // True/False count: 0/5/10/15/20, default 0 (none)
  const tfCount = allowed.includes(body.tfCount) ? body.tfCount : 0;

  // Audio/video: fetch the uploaded file and transcribe it, then use the transcript.
  if (audioUrl) {
    let audioFailed = false;
    try {
      text = await transcribeUrl(audioUrl, audioName);
    } catch (err) {
      audioFailed = true;
      // Log the real reason so we can see it in the dev server console
      console.error("[transcribe] failed:", (err as Error)?.message ?? err);
    }

    // If we got nothing usable back, tell the user right away.
    if (audioFailed || !text) {
      const message = audioFailed
        ? "We couldn't transcribe that file. Try a different audio or video format."
        : "We couldn't find any speech in that file to make questions from.";
      return new Response(JSON.stringify({ error: message }) + "\n", {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform"
        }
      });
    }
  }

  // YouTube link: pull the video's captions and use them as the notes text.
  if (!text && youtube) {
    let ytFailed = false;
    try {
      text = await fetchYoutubeCaptions(youtube);
    } catch (err) {
      ytFailed = true;
      console.error("[youtube] failed:", (err as Error)?.message ?? err);
    }

    if (ytFailed || !text) {
      const message = "We couldn't make a quiz from that video. Try a different one.";
      return new Response(JSON.stringify({ error: message }) + "\n", {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform"
        }
      });
    }
  }

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

      // For transcribed sources (audio or YouTube captions), drop a trailing
      // period off each answer option.
      const cleanOptions = (q: Q): Q =>
        !audioUrl && !youtube
          ? q
          : {
              ...q,
              options: {
                A: q.options.A.replace(/\s*\.\s*$/, ""),
                B: q.options.B.replace(/\s*\.\s*$/, ""),
                C: q.options.C.replace(/\s*\.\s*$/, ""),
                D: q.options.D.replace(/\s*\.\s*$/, "")
              }
            };

      // Send one question down the stream (skipping duplicates / extras)
      const send = (q: Q) => {
        const key = q.question?.trim().toLowerCase();
        if (!key || seen.has(key) || sent >= count) return;
        if (!isValidQuestion(q)) return; // drop malformed / duplicate-option questions
        seen.add(key);
        sentTexts.push(q.question);
        sent++;
        controller.enqueue(encoder.encode(JSON.stringify(cleanOptions(q)) + "\n"));
      };

      const sortByDifficulty = (batch: Q[]) =>
        batch.sort(
          (a, b) =>
            (order[a.difficulty?.toLowerCase()] ?? 1) -
            (order[b.difficulty?.toLowerCase()] ?? 1)
        );

      if (images.length > 0) {
        // Spread the questions across the images as evenly as possible:
        //  - fewer questions than images -> use that many images, 1 question each
        //  - equal              -> 1 question per image
        //  - more questions     -> each image gets an equal share (leftovers +1)
        const n = images.length;
        const base = Math.floor(count / n);
        const remainder = count % n;

        // Collect each image's share INDEPENDENTLY (its own quota + retries), so
        // one image over-producing can't eat another image's slots.
        const perImageResults = await Promise.all(
          images.map(async (img, i) => {
            const quota = base + (i < remainder ? 1 : 0);
            if (quota <= 0) return [] as Q[]; // this image isn't used for this quiz

            const collected: Q[] = [];
            const localSeen = new Set<string>();
            let tries = 0;
            while (collected.length < quota && tries < 3) {
              const batch = await makeQuestionsFromImages(
                [img],
                quota - collected.length,
                collected.map((q) => q.question),
                level,
                i + 1, // this image's number (1-based)
                n // total images uploaded
              );
              for (const q of batch) {
                if (collected.length >= quota) break;
                const key = q.question?.trim().toLowerCase();
                if (key && !localSeen.has(key) && isValidQuestion(q)) {
                  localSeen.add(key);
                  collected.push(q);
                }
              }
              if (batch.length === 0) break; // nothing usable from this image
              tries++;
            }
            sortByDifficulty(collected);
            return collected;
          })
        );

        // Send them in image order (image 1's questions, then image 2's, ...)
        for (const imgQuestions of perImageResults) {
          for (const q of imgQuestions) send(q);
        }

        // Top up any shortfall
        let attempts = 0;
        while (sent < count && attempts < 3) {
          const batch = await makeQuestionsFromImages(
            images,
            count - sent,
            sentTexts,
            level
          );
          if (batch.length === 0 && sent === 0) break; // unreadable image — stop retrying
          for (const q of batch) send(q);
          attempts++;
        }

        // Nothing usable in the image -> tell the user instead of a blank page
        // (only when MC questions were actually requested)
        if (count > 0 && sent === 0) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                error:
                  "We couldn't identify anything in that image. Try a clearer picture."
              }) + "\n"
            )
          );
        }
      } else {
        // TEXT
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
          // Too short to split — ask for the whole count from the whole text
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
          if (batch.length === 0 && sent === 0) break; // text has no usable content
          for (const q of batch) send(q);
          attempts++;
        }

        // The text had nothing meaningful to build questions from
        // (only when MC questions were actually requested)
        if (count > 0 && sent === 0) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                error:
                  "We couldn't make relevant questions from that text."
              }) + "\n"
            )
          );
        }
      }

      // TRUE / FALSE questions — generated after the multiple-choice ones and
      // streamed with a `type: "tf"` marker so the client renders them as T/F.
      if (tfCount > 0) {
        const seenTF = new Set<string>();
        const sentTFTexts: string[] = [];
        let sentTF = 0;

        const sendTF = (q: TFQ) => {
          const key = q.question?.trim().toLowerCase();
          // skip blanks, duplicates (of MC or TF), overflow, and malformed items
          if (!key || seen.has(key) || seenTF.has(key) || sentTF >= tfCount) return;
          if (!isValidTF(q)) return;
          seenTF.add(key);
          sentTFTexts.push(q.question);
          sentTF++;
          const answer =
            q.answer.toString().trim().toLowerCase() === "true"
              ? "True"
              : "False";
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "tf",
                question: q.question,
                answer,
                difficulty: q.difficulty
              }) + "\n"
            )
          );
        };

        let tfAttempts = 0;
        while (sentTF < tfCount && tfAttempts < 3) {
          const avoid = [...sentTexts, ...sentTFTexts];
          const batch =
            images.length > 0
              ? await makeTrueFalseFromImages(images, tfCount - sentTF, avoid, level)
              : await makeTrueFalse(text, tfCount - sentTF, avoid, level);
          if (batch.length === 0) break; // nothing usable — stop retrying
          for (const q of batch) sendTF(q);
          tfAttempts++;
        }

        // TF was the only thing requested and none came out -> tell the user
        // (when MC was also requested, its own error message already covers this)
        if (count === 0 && sentTF === 0) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                error:
                  images.length > 0
                    ? "We couldn't identify anything in that image. Try a clearer picture."
                    : "We couldn't make relevant questions from that text."
              }) + "\n"
            )
          );
        }
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
