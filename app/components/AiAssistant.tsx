"use client";

import { useEffect, useRef, useState } from "react";

// Floating AI assistant: an angel-wings button pinned to the bottom-right that
// opens a small chat panel. Replies stream in from /api/assistant.

type Turn = { role: "user" | "assistant"; content: string };

// Glyph-style angel wings with a halo: solid layered feather tiers per side
// (modelled on the classic wings-and-halo glyph), mirrored around the center.
function WingsIcon({ size = 26 }: { size?: number }) {
  const wing = (
    <>
      {/* leading edge, then three feather tiers — outer to inner */}
      <path d="M23 11 C16 8 8 8.5 3 11 C7.5 12.5 15 13 23 12.2 Z" />
      <path d="M20 12.8 C13 13.5 7.5 16 4.5 21.5 C9 21 14 18 19.5 14.5 Z" />
      <path d="M21.5 13.5 C16 16.5 12 21.5 10.5 27 C15 24.5 19 19.5 21.8 15 Z" />
      <path d="M22.6 14.5 C20.5 18 19.5 21.5 19.3 24.5 C21.5 21.5 22.6 18 22.8 15.5 Z" />
    </>
  );
  return (
    <svg
      width={size}
      height={(size * 32) / 48}
      viewBox="0 0 48 32"
      aria-hidden="true"
    >
      {/* halo */}
      <ellipse
        cx="24"
        cy="4.5"
        rx="4.5"
        ry="1.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <g fill="currentColor">{wing}</g>
      <g fill="currentColor" transform="translate(48,0) scale(-1,1)">
        {wing}
      </g>
    </svg>
  );
}

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false); // a reply is streaming in
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the newest message in view as replies stream in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  // Focus the input whenever the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    const history: Turn[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]); // empty bubble fills as it streams
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history })
      });
      if (!res.ok || !res.body) {
        const message = (await res.text().catch(() => "")) ||
          "The assistant couldn't reply. Try again."; // DRAFT COPY — William to reword.
        setMessages(history); // drop the empty bubble
        setError(message);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        const soFar = reply;
        setMessages([...history, { role: "assistant", content: soFar }]);
      }
      if (!reply) setMessages(history); // stream produced nothing — drop the bubble
    } catch {
      setMessages(history);
      setError("The assistant couldn't reply. Try again."); // DRAFT COPY — William to reword.
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* The floating wings button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-expanded={open}
        title="Athenia Assistant"
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          width: 48,
          height: 48,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          border: "2px solid #888",
          background: "var(--background)",
          color: "#cbd5e1",
          cursor: "pointer",
          zIndex: 1500
        }}
      >
        <WingsIcon size={40} />
      </button>

      {/* The chat panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 78,
            right: 20,
            width: "min(340px, calc(100vw - 40px))",
            height: "min(440px, 65vh)",
            display: "flex",
            flexDirection: "column",
            background: "var(--background)",
            color: "var(--foreground)",
            border: "1px solid #888",
            borderRadius: "var(--btn-radius, 3px)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
            zIndex: 1500,
            overflow: "hidden"
          }}
        >
          {/* header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderBottom: "1px solid #333",
              fontWeight: "bold",
              fontSize: 15
            }}
          >
            <WingsIcon size={22} />
            Athenia Assistant
          </div>

          {/* messages */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10
            }}
          >
            {messages.length === 0 && (
              <p style={{ margin: 0, fontSize: 14, opacity: 0.6, lineHeight: 1.5 }}>
                Ask me to explain a concept, or how anything in Athenia works.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  padding: "8px 12px",
                  borderRadius: "var(--btn-radius, 3px)",
                  fontSize: 14,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  background:
                    m.role === "user" ? "rgba(148, 163, 184, 0.18)" : "transparent",
                  border:
                    m.role === "user" ? "1px solid rgba(148,163,184,0.25)" : "1px solid #333"
                }}
              >
                {m.content ||
                  (busy && i === messages.length - 1 ? (
                    <span className="loading-dots" style={{ gap: 5 }}>
                      <span style={{ width: 8, height: 8 }}></span>
                      <span style={{ width: 8, height: 8 }}></span>
                      <span style={{ width: 8, height: 8 }}></span>
                    </span>
                  ) : (
                    ""
                  ))}
              </div>
            ))}
            {error && (
              <div style={{ fontSize: 13, color: "#e0776b" }}>{error}</div>
            )}
          </div>

          {/* input row */}
          <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #333" }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="Ask anything..."
              style={{
                flex: 1,
                minWidth: 0,
                padding: "8px 10px",
                fontSize: 14,
                background: "transparent",
                color: "inherit",
                border: "1px solid #888",
                borderRadius: "var(--btn-radius, 3px)",
                outline: "none"
              }}
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              aria-label="Send"
              style={{
                width: 38,
                height: 38,
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #888",
                borderRadius: "var(--btn-radius, 3px)",
                background: "transparent",
                color: busy || !input.trim() ? "#666" : "#cbd5e1",
                cursor: busy || !input.trim() ? "default" : "pointer"
              }}
            >
              {/* up-arrow send icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5" />
                <path d="M6 11l6-6 6 6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
