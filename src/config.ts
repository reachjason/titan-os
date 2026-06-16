/**
 * ─────────────────────────────────────────────────────────────
 *  TITAN · single source of truth
 *  Edit this file to customize the app. Almost nothing else needs
 *  touching. Each section says exactly what it controls.
 * ─────────────────────────────────────────────────────────────
 */

export interface CommandDef {
  /** The word after the slash, e.g. "todo" for /todo. Lowercase, no spaces. */
  name: string;
  /** Short description shown in autocomplete. */
  hint: string;
  /** Chip color, 0–360 on the color wheel (0/360 red, 40 amber, 200 blue…). */
  hue: number;
}

export interface ThemeTokens {
  /** Page background. */
  bg: string;
  /** Raised surfaces — modals, popovers, cards, capture bar, pills. */
  bgRaised: string;
  /** Recessed surfaces — hovered rows, faint fills. */
  bgSunk: string;
  /** Primary text. */
  ink: string;
  /** Secondary text — wordmark, toggles, labels. */
  inkSoft: string;
  /** Faint text — timestamps, hints, the "off" toolbar glyphs. */
  inkFaint: string;
  /** Accent (coral / terracotta). */
  clay: string;
  /** Accent, deeper — hover / pressed. */
  clayDeep: string;
  /** Hairline borders. */
  line: string;
  /** Search highlight background. */
  mark: string;
  /** Note bullet dot + unchecked checkbox border. */
  dot: string;
  /** Modal / popover scrim. */
  scrim: string;
  /** Box shadow for raised surfaces. */
  shadow: string;
  /** Stronger shadow for modals / Spotlight. */
  shadowStrong: string;
  /** Toast background + text (inverted). */
  toastBg: string;
  toastInk: string;
}

export const config = {
  /** App identity — name in the header, browser tab title, tagline. */
  brand: {
    name: "Titan",
    tagline: "work inbox",
    /** Glyph shown before the name. Any emoji/char works. */
    mark: "◐",
  },

  /** Signed-in user shown in the account popover (demo / front-end only). */
  account: {
    initial: "A",
    email: "alex@titan.os",
    subtitle: "Signed in with Google",
  },

  /**
   * Built-in slash commands. ADD A COMMAND = add one line here.
   * Tags you invent on the fly still work; they just get an auto color.
   */
  commands: [
    { name: "todo", hint: "a task to do", hue: 18 },
    { name: "idea", hint: "a thought to keep", hue: 40 },
    { name: "note", hint: "a plain note", hue: 200 },
    { name: "urgent", hint: "needs attention now", hue: 2 },
    { name: "followup", hint: "circle back later", hue: 280 },
    { name: "done", hint: "completed task", hue: 145 },
  ] as CommandDef[],

  /** Copy and behavior toggles. */
  ui: {
    placeholder: "Log…  /tag to label",
    /** Accessible name for the icon-only log button. */
    logLabel: "Log",
    searchPlaceholder: "Search",
    /** Ask before deleting an entry. */
    confirmOnDelete: true,
    /** Auto-scroll the feed to the newest entry. */
    autoScroll: true,
  },

  /** Keyboard shortcuts (KeyboardEvent.key values; search uses Shift). */
  shortcuts: {
    /** Focus the terminal/log bar from anywhere. */
    focusBar: "/",
    /** Open the Spotlight search palette (with Shift, i.e. Shift+F). */
    search: "f",
    /** Switch between list and board view. */
    toggleView: "v",
    /** Toggle focus mode (pinned tasks only). */
    focusMode: "p",
    /** Open the keyboard-shortcut help modal. */
    help: "?",
    /** Clear active tag filters / close modals. */
    clearFilters: "Escape",
  },

  /** Default preferences (editable in Settings, then persisted). */
  prefs: {
    /** Show the faint per-row timestamp. */
    showTimestamps: true,
    /** Show tag chips on rows. */
    showTags: true,
    /** Tags that make an entry a checkable task. */
    taskTags: ["do", "todo"],
  },

  /** localStorage keys. Change these to keep separate inboxes. */
  storage: {
    entriesKey: "titan-os.entries.v1",
    themeKey: "titan-os.theme",
    /** Remembers sort mode + match mode across reloads. */
    viewKey: "titan-os.view.v1",
    /** Remembers preferences (timestamps, task tags). */
    prefsKey: "titan-os.prefs.v1",
  },

  /**
   * Color palettes. Every color in the app comes from here — edit a value
   * and the whole UI follows (injected as CSS variables at startup).
   */
  theme: {
    light: {
      bg: "#f3eee4",
      bgRaised: "#ffffff",
      bgSunk: "#eae3d6",
      ink: "#2a2521",
      inkSoft: "#6b6358",
      inkFaint: "#a39a8c",
      clay: "#c8674a",
      clayDeep: "#a8523a",
      line: "#e2dacd",
      mark: "#f1d9bf",
      dot: "#c9bfae",
      scrim: "rgba(40,30,20,.28)",
      shadow: "0 1px 2px rgba(40,30,20,.06), 0 12px 32px rgba(40,30,20,.10)",
      shadowStrong: "0 24px 60px rgba(40,30,20,.30)",
      toastBg: "#2a2521",
      toastInk: "#f3ece1",
    } as ThemeTokens,
    dark: {
      bg: "#171311",
      bgRaised: "#211c18",
      bgSunk: "#1c1814",
      ink: "#f3ece1",
      inkSoft: "#b8ae9f",
      inkFaint: "#6f665b",
      clay: "#e08a6b",
      clayDeep: "#cc785c",
      line: "#2c2621",
      mark: "#4a3a26",
      dot: "#5a5147",
      scrim: "rgba(10,8,6,.62)",
      shadow: "0 1px 2px rgba(0,0,0,.4), 0 12px 32px rgba(0,0,0,.4)",
      shadowStrong: "0 24px 60px rgba(0,0,0,.55)",
      toastBg: "#f3ece1",
      toastInk: "#2a2521",
    } as ThemeTokens,
  },
};

export type Config = typeof config;
