import { config } from "../config";
import type { Theme } from "../types";

/** Maps config token keys to the CSS custom properties styles.css consumes. */
const VAR_MAP: Record<keyof typeof config.theme.light, string> = {
  bg: "--bg",
  bgRaised: "--bg-raised",
  bgSunk: "--bg-sunk",
  ink: "--ink",
  inkSoft: "--ink-soft",
  inkFaint: "--ink-faint",
  clay: "--clay",
  clayDeep: "--clay-deep",
  line: "--line",
  mark: "--mark",
  shadow: "--shadow",
  chipL: "--chip-l",
  chipTextL: "--chip-text-l",
  chipBorderL: "--chip-border-l",
};

/** Write a theme's tokens onto :root so the whole UI re-skins instantly. */
export function applyTheme(theme: Theme) {
  const tokens = config.theme[theme];
  const root = document.documentElement;
  (Object.keys(VAR_MAP) as (keyof typeof tokens)[]).forEach((key) => {
    root.style.setProperty(VAR_MAP[key], tokens[key]);
  });
  root.dataset.theme = theme;
}
