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
