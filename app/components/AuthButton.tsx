"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Shared styling so this control matches the existing Updates / Support pills.
const pill: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  borderRadius: "var(--btn-radius, 3px)",
  border: "2px solid #888",
  background: "transparent",
  color: "inherit",
  fontSize: 16,
  textDecoration: "none",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

// Supabase keys are inlined into the browser bundle at build time. Until
// they're set in .env.local, there's nothing to connect to — so we render
// nothing rather than crashing the whole page.
const isConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Pull the display name / avatar out of Google's profile metadata.
function displayName(user: User): string {
  return (
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email ??
    "Account"
  );
}
function avatarUrl(user: User): string | null {
  return user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;
}

export default function AuthButton() {
  const [supabase] = useState(() => (isConfigured ? createClient() : null));
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false); // is the dropdown showing?
  const [imgError, setImgError] = useState(false); // Google avatar failed to load (often a 429 rate-limit)
  // Last visit's pill (name + avatar), shown pre-paint so the button doesn't
  // blink out on every navigation while the real session check runs.
  const [cached, setCached] = useState<{ name: string; avatar: string | null } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem("atheniaPillCache");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-paint cache hydration
      if (raw) setCached(JSON.parse(raw));
    } catch {
      // no cache — first visit
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setImgError(false);
      setReady(true);
      try {
        if (data.user) {
          sessionStorage.setItem("atheniaPillCache", JSON.stringify({
            name: displayName(data.user),
            avatar: avatarUrl(data.user)
          }));
        } else {
          sessionStorage.removeItem("atheniaPillCache");
        }
      } catch { /* best-effort */ }
    });

    // Keep in sync if the user signs in/out in another tab.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setImgError(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // Close the dropdown when clicking anywhere outside the box.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function signIn(switchAccount = false) {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Force Google's account picker so they can choose a different login.
        ...(switchAccount ? { queryParams: { prompt: "select_account" } } : {}),
      },
    });
  }

  async function signOut() {
    if (!supabase) return;
    setOpen(false);
    await supabase.auth.signOut();
    setUser(null);
  }

  // Nothing to show until Supabase is configured. While the session check is
  // still running, show last visit's pill (non-interactive) instead of nothing.
  if (!supabase) return null;
  if (!ready) {
    if (!cached) return null;
    return (
      <div style={{ ...pill, cursor: "default" }}>
        {cached.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cached.avatar} alt="" width={24} height={24} style={{ borderRadius: "50%", display: "block" }} />
        ) : null}
        <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {cached.name}
        </span>
        <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>▾</span>
      </div>
    );
  }

  if (!user) {
    return (
      <button type="button" onClick={() => signIn()} style={pill}>
        Sign in with Google
      </button>
    );
  }

  const name = displayName(user);
  const avatar = avatarUrl(user);

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={pill}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {avatar && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt=""
            width={24}
            height={24}
            onError={() => setImgError(true)} // Google rate-limited the avatar — show initials instead
            style={{ borderRadius: "50%", display: "block" }}
          />
        ) : (
          // Fallback: the same outline person icon used on mobile. Google often
          // rate-limits the avatar (429), so we drop to this rather than a broken image.
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: "block", flexShrink: 0 }}
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20 a8 8 0 0 1 16 0" />
          </svg>
        )}
        <span
          style={{
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
        {/* caret ▾ that rotates when open */}
        <span
          aria-hidden
          style={{
            fontSize: 12,
            lineHeight: 1,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 120ms ease",
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: 38,
            right: 0,
            left: 0,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            background: "var(--background)",
            border: "2px solid #888",
            borderRadius: "var(--btn-radius, 3px)",
            overflow: "hidden",
            zIndex: 1001,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => signIn(true)}
            style={menuItem}
          >
            Switch account
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            style={{ ...menuItem, borderTop: "1px solid #888" }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const menuItem: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  background: "transparent",
  color: "inherit",
  border: "none",
  fontSize: 15,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
