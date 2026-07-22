"use client";

import { useState, useEffect } from "react";

// 👇 Bump this version AND update the list below every time you ship an update.
// Anyone who hasn't seen this exact version yet will get the popup once.
const APP_VERSION = "0.7";

const WHATS_NEW = [
  "👾 2 minigames on a brand new 'Games' page",
  "🛠️ Reworked Quiz History page",
  "🎨 Customizable buttons, quiz layout, and quiz folder colors",
  "📝 Optional written answers for generated questions",
  "📱 Mobile UI improvements to improve usability and accessibility",
  "👤 Moderation of prompts to ensure appropriate generated content",
  "⬆️ Improved generated question quality",
  "🔧 Various bugfixes, UI, and performance improvements"
];

export default function WhatsNew() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // localStorage is the browser's little memory that survives page reloads.
    // We store which version the user last saw.
    const lastSeen = localStorage.getItem("whatsNewVersion");
    if (lastSeen !== APP_VERSION) {
      // Loading from localStorage must happen in an effect (SSR-safe), so this
      // one-time setState is intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true); // they haven't seen this version yet -> show it
    }
  }, []);

  function close() {
    localStorage.setItem("whatsNewVersion", APP_VERSION); // remember they've seen it
    setOpen(false);
  }

  if (!open) return null; // nothing to show

  return (
    // The dark backdrop. Clicking it closes the popup.
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20
      }}
    >
      {/* The popup box. stopPropagation stops a click INSIDE from closing it. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative", // lets us pin the version to a corner
          background: "var(--background)",
          color: "var(--foreground)",
          border: "1px solid #888",
          borderRadius: 12,
          padding: "12px 28px 28px", // smaller gap on top, normal on sides/bottom
          maxWidth: 420,
          width: "100%",
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)"
        }}
      >
        <h2
          style={{
            marginTop: 0,
            textAlign: "center",
            fontSize: 32,
            fontWeight: "bold"
          }}
        >
          What&apos;s New
        </h2>

        <ul style={{ paddingLeft: 20 }}>
          {WHATS_NEW.map((item, i) => (
            <li key={i} style={{ marginBottom: 10 }}>
              {item}
            </li>
          ))}
        </ul>

        <button
          onClick={close}
          style={{
            marginTop: 12,
            padding: "10px 24px",
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            cursor: "pointer"
          }}
        >
          Got it
        </button>

        {/* Version pinned to the bottom-right corner of the box */}
        <span
          style={{
            position: "absolute",
            bottom: 12,
            right: 16,
            fontSize: 13,
            opacity: 0.6
          }}
        >
          v{APP_VERSION}
        </span>
      </div>
    </div>
  );
}
