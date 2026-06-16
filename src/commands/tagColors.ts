import type { Theme } from "../types";

/**
 * Tag chip colors, hand-picked to read as small muted chips in both themes.
 * Each entry is [darkBg, darkFg, lightBg, lightFg].
 */
const PALETTE: Record<string, [string, string, string, string]> = {
  todo: ["#3a2620", "#e0a18b", "#f4dad0", "#a6492e"],
  note: ["#1f2e38", "#8fbad2", "#d6e3ec", "#3f6b86"],
  idea: ["#332b18", "#cdb16a", "#ede2c4", "#8a6d22"],
  urgent: ["#3a211f", "#dc9a95", "#f3d6d4", "#b23a33"],
  followup: ["#2c2436", "#b79ad0", "#e4daec", "#6f4d8c"],
  done: ["#1e2e22", "#84bc92", "#d2e6d5", "#3f7a4c"],
};

/** Deterministic fallback hues for arbitrary user-defined tags. */
const FALLBACK: [string, string, string, string][] = [
  ["#2c2238", "#b79ad0", "#e6dcf0", "#6f4d8c"],
  ["#1e3036", "#7fc4c9", "#d2eaec", "#347e84"],
  ["#352618", "#d6a56a", "#f1e0c8", "#9a6a24"],
  ["#2a3320", "#a6c77c", "#e1eccf", "#5e7a33"],
  ["#33222c", "#d097b0", "#f1dae4", "#9a4c6e"],
];

export interface ChipColor {
  bg: string;
  fg: string;
}

/** Resolve a chip's background + foreground for a tag in the given theme. */
export function chipColor(tag: string, theme: Theme): ChipColor {
  const key = tag.replace(/^\//, "").toLowerCase();
  let v = PALETTE[key];
  if (!v) {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    v = FALLBACK[h % FALLBACK.length];
  }
  return theme === "dark" ? { bg: v[0], fg: v[1] } : { bg: v[2], fg: v[3] };
}
