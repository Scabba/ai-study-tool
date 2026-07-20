"use client";

import { useLayoutEffect } from "react";
import { applyTheme, loadTheme } from "@/lib/theme";

// Applies the saved font + palette before first paint on every page, so the
// customization from the palette panel follows the user across the whole site.
export default function ThemeLoader() {
  useLayoutEffect(() => {
    applyTheme(loadTheme());
  }, []);
  return null;
}
