import { useEffect, useState } from "react";
import type { Theme } from "../types";
import { config } from "../config";
import { applyTheme } from "../lib/applyTheme";

const KEY = config.storage.themeKey;

/** Resolve the startup theme: saved preference, else OS preference. */
export function getInitialTheme(): Theme {
  const saved = localStorage.getItem(KEY) as Theme | null;
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  return { theme, toggle };
}
