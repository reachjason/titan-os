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

export interface FilterState {
  /** Active tag filters (OR'd together). Empty = no tag filter. */
  tags: string[];
  /** Free-text search query. */
  query: string;
}
