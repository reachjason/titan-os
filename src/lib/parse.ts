/**
 * Tags are /tokens that may appear ANYWHERE in the line, any number of times.
 * "call vendor /urgent re /invoice" -> tags: ["urgent","invoice"],
 *                                      body: "call vendor re"
 * Tags are extracted and shown as chips; the body keeps the remaining prose.
 */
const TAG = /(^|\s)\/([a-z0-9][a-z0-9_-]*)/gi;

export function parseEntry(raw: string): { tags: string[]; body: string } {
  const tags: string[] = [];
  let m: RegExpExecArray | null;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(raw))) {
    const tag = m[2].toLowerCase();
    if (!tags.includes(tag)) tags.push(tag);
  }
  const body = raw
    .replace(TAG, "$1") // drop the /tag, keep its leading space
    .replace(/[ \t]{2,}/g, " ") // collapse runs of spaces/tabs (keep newlines)
    .replace(/[ \t]*\n[ \t]*/g, "\n") // tidy whitespace around newlines
    .trim();
  return { tags, body };
}

/** Detect an in-progress "/par" token at the caret for autocomplete. */
export function activeTagFragment(value: string): string | null {
  const m = value.match(/(?:^|\s)\/([a-z0-9_-]*)$/i);
  return m ? m[1].toLowerCase() : null;
}

/** Detect an in-progress "@jas" mention at the caret for the people picker. */
export function activeMentionFragment(value: string): string | null {
  const m = value.match(/(?:^|\s)@([a-z0-9_-]*)$/i);
  return m ? m[1].toLowerCase() : null;
}
