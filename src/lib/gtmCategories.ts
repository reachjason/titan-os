import type { Theme } from "../types";

/**
 * GTM category chip colors. Categories are user-defined (vc, angel, kol, …) so
 * the well-known ones get hand-picked hues and anything new gets a deterministic
 * fallback. Each entry is [darkBg, darkFg, lightBg, lightFg] — same shape as the
 * tag palette so chips read as small muted pills in both themes.
 */
const PALETTE: Record<string, [string, string, string, string]> = {
  vc: ["#2b2536", "#b6a3d4", "#e6dcf0", "#6f4d8c"],
  angel: ["#22302a", "#8fbf9e", "#d6e8da", "#3f7a55"],
  cesto: ["#382a22", "#d99c7a", "#f4dccd", "#a6492e"],
  partner: ["#222a35", "#8aa9c9", "#d8e3ef", "#3f6b86"],
  kol: ["#322f22", "#c9b87a", "#ede2c4", "#8a6d22"],
  exchange: ["#322633", "#c69ab0", "#f1dae8", "#9a4c74"],
  mm: ["#213230", "#7fb8b0", "#d2eae6", "#347e74"],
};

/** Deterministic fallback hues for arbitrary user-defined categories. */
const FALLBACK: [string, string, string, string][] = [
  ["#2e2733", "#bfa9cf", "#e9def2", "#6f4d8c"],
  ["#2a2c22", "#bcc07f", "#e6e6cb", "#5e7a33"],
  ["#222f30", "#88bcc0", "#d4eaec", "#347e84"],
  ["#33272a", "#c9a0a4", "#f1dadd", "#9a4c52"],
  ["#2a3320", "#a6c77c", "#e1eccf", "#5e7a33"],
];

export interface CatColor {
  bg: string;
  fg: string;
}

/** Resolve a category chip's background + foreground in the given theme. */
export function categoryColor(cat: string, theme: Theme): CatColor {
  const key = cat.toLowerCase();
  let v = PALETTE[key];
  if (!v) {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    v = FALLBACK[h % FALLBACK.length];
  }
  return theme === "dark" ? { bg: v[0], fg: v[1] } : { bg: v[2], fg: v[3] };
}
