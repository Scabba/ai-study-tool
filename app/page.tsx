"use client";

import { useState } from "react";

export default function Home() {
  const [text, setText] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);

  async function generateQuestions() {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    });

    const data = await res.json();
    setQuestions(data.questions);
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>AI Study Tool</h1>

      <textarea
        style={{ width: "100%", height: 200 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste notes here..."
      />

      <br />

      <button onClick={generateQuestions}>
        Generate Questions
      </button>

      <ul>
        {questions.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ul>
    </main>
  );
}