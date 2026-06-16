import { createContext, useContext } from "react";
import type { Theme } from "../types";

/** Current theme, provided by App so chips can pick their per-theme colors. */
export const ThemeContext = createContext<Theme>("dark");

export function useCurrentTheme(): Theme {
  return useContext(ThemeContext);
}
