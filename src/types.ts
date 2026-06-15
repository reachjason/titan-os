export interface Entry {
  id: string;
  /** Raw text the user typed, including leading /tags. */
  raw: string;
  /** Text with leading command tags stripped off. */
  body: string;
  /** Lowercased tag names parsed from leading /tokens. */
  tags: string[];
  createdAt: number;
  updatedAt: number;
  edited: boolean;
  /** Completed — only meaningful for task entries (fades + strikes through). */
  done?: boolean;
  /** Pinned to the top focus section. */
  pinned?: boolean;
}

/** User preferences, editable in Settings and persisted. */
export interface Prefs {
  /** Show the faint per-row timestamp. */
  showTimestamps: boolean;
  /** Tags that turn an entry into a checkable task, e.g. ["do","todo"]. */
  taskTags: string[];
}

export type Theme = "light" | "dark";

/** Feed ordering: oldest→newest (chat), newest→oldest, or grouped by tag. */
export type SortMode = "asc" | "desc" | "tag";

export interface FilterState {
  /** Active tag filters. Empty = no tag filter. */
  tags: string[];
  /** How multiple tag filters combine: "any" = OR, "all" = AND. */
  match: "any" | "all";
  /** Free-text search query. */
  query: string;
}
