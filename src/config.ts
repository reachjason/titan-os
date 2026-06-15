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
  bg: string;
  bgRaised: string;
  bgSunk: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  clay: string;
  clayDeep: string;
  line: string;
  mark: string;
  shadow: string;
  /** Chip lightness knobs (CSS % values) — tune chip contrast per theme. */
  chipL: string;
  chipTextL: string;
  chipBorderL: string;
}

export const config = {
  /** App identity — name in the header, browser tab title, tagline. */
  brand: {
    name: "Titan",
    tagline: "work inbox",
    /** Glyph shown before the name. Any emoji/char works. */
    mark: "◐",
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

  /** Keyboard shortcuts (KeyboardEvent.key values; focusSearch uses ⌘/Ctrl). */
  shortcuts: {
    /** Focus the terminal/log bar from anywhere. */
    focusBar: "/",
    /** Focus the search box (with ⌘ on macOS / Ctrl elsewhere). */
    focusSearch: "k",
    /** Cycle sort/group mode: newest-bottom → newest-top → by-tag. */
    cycleSort: "s",
    /** Toggle focus mode (pinned tasks only). */
    focusMode: "f",
    /** Open the keyboard-shortcut help modal. */
    help: "?",
    /** Clear active tag + search filters / close modals. */
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
      bg: "#f4f1ea",
      bgRaised: "#fbf9f3",
      bgSunk: "#ece7db",
      ink: "#2b2722",
      inkSoft: "#6b6358",
      inkFaint: "#9a9082",
      clay: "#cc785c",
      clayDeep: "#b15c40",
      line: "#e1dacb",
      mark: "#f4d9a0",
      shadow: "0 1px 2px rgba(43,39,34,.06), 0 8px 24px rgba(43,39,34,.05)",
      chipL: "92%",
      chipTextL: "32%",
      chipBorderL: "78%",
    } as ThemeTokens,
    dark: {
      bg: "#1c1a17",
      bgRaised: "#26231f",
      bgSunk: "#161412",
      ink: "#ede7dc",
      inkSoft: "#b3a99a",
      inkFaint: "#7d7466",
      clay: "#e08a6c",
      clayDeep: "#cc785c",
      line: "#353029",
      mark: "#6b531f",
      shadow: "0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.25)",
      chipL: "24%",
      chipTextL: "78%",
      chipBorderL: "36%",
    } as ThemeTokens,
  },
};

export type Config = typeof config;
