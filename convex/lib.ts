// Pure helpers shared by Convex mutations. These mirror the client-side logic in
// src/lib/parse.ts and src/store/useEntries.ts — kept here because Convex functions
// bundle separately from the Vite app and can't reliably import from src/.

export type TaskStatus = "todo" | "doing" | "done";

const TAG = /(^|\s)\/([a-z0-9][a-z0-9_-]*)/gi;
const MENTION = /(^|\s)@([a-z0-9][a-z0-9_-]*)/gi;

/** Lowercased @mention tokens from raw text, e.g. "ping @jason" -> ["jason"]. */
export function parseMentionTokens(raw: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  MENTION.lastIndex = 0;
  while ((m = MENTION.exec(raw))) {
    const t = m[2].toLowerCase();
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** A user's first name, lowercased, for matching @mentions. */
export function firstNameKey(name: string | undefined): string {
  return (name || "").trim().split(/\s+/)[0].toLowerCase();
}

/**
 * Extract /tags (anywhere in the line) and the remaining body text.
 * "call vendor /urgent re /invoice" -> { tags: ["urgent","invoice"], body: "call vendor re" }
 */
export function parseEntry(raw: string): { tags: string[]; body: string } {
  const tags: string[] = [];
  let m: RegExpExecArray | null;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(raw))) {
    const tag = m[2].toLowerCase();
    if (!tags.includes(tag)) tags.push(tag);
  }
  // Keep /tags inline in the body so the message reads naturally; they're
  // rendered as chips in place by the client.
  const body = raw
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
  return { tags, body };
}

/** Rewrite /tags matching `fromTags` to `/to` in a raw string. */
export function retagRaw(raw: string, fromTags: string[], to: string): string {
  return raw.replace(/(^|\s)\/([a-z0-9][a-z0-9_-]*)/gi, (m, sp, tag) =>
    fromTags.includes(tag.toLowerCase()) ? `${sp}/${to}` : m
  );
}

interface StatusFields {
  tags: string[];
  raw: string;
  body: string;
  done: boolean;
}

/**
 * Compute the tags/raw/body/done changes for moving an entry to `status`,
 * syncing the /do↔/done tag (in tags, raw, and the inline body). Returns only
 * the fields that change so the caller can patch.
 */
export function applyStatus(
  e: StatusFields,
  status: TaskStatus,
  taskTags: string[]
): { tags: string[]; raw: string; body: string; done: boolean } {
  const wasDone = e.done || e.tags.includes("done");
  let tags = e.tags;
  let raw = e.raw;
  let body = e.body;
  let done = e.done;
  if (status === "done" && !wasDone) {
    tags = Array.from(new Set(e.tags.map((t) => (taskTags.includes(t) ? "done" : t))));
    raw = retagRaw(e.raw, taskTags, "done");
    body = retagRaw(e.body, taskTags, "done");
    done = true;
  } else if (status !== "done" && wasDone) {
    tags = Array.from(new Set(e.tags.map((t) => (t === "done" ? "do" : t))));
    raw = retagRaw(e.raw, ["done"], "do");
    body = retagRaw(e.body, ["done"], "do");
    done = false;
  }
  return { tags, raw, body, done };
}
