import type { Entry } from "../types";
import { timeLabel } from "./dates";

export interface HighlightRange {
  start: number;
  end: number;
}

export interface SpotlightResult {
  entry: Entry;
  score: number;
  bodyRanges: HighlightRange[];
  tagRanges: Record<string, HighlightRange[]>;
  authorRanges: HighlightRange[];
}

const MENTION_RE = /(?:^|\s)@([a-z0-9][a-z0-9_-]*)/gi;
const QUERY_STOP_WORDS = new Set(["author", "by", "from", "is"]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/^[/@#]+/, "").trim();
}

function termsFor(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const part of query.split(/\s+/)) {
    const term = normalize(part);
    if (term && !QUERY_STOP_WORDS.has(term) && !seen.has(term)) {
      seen.add(term);
      terms.push(term);
    }
  }
  return terms;
}

function mentionTokens(body: string): string[] {
  const out: string[] = [];
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(body))) {
    const token = m[1].toLowerCase();
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

function dateLabels(createdAt: number): string[] {
  const d = new Date(createdAt);
  const now = new Date();
  const start = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round((start(now).getTime() - start(d).getTime()) / 86400000);
  const labels = [
    timeLabel(createdAt),
    d.getFullYear().toString(),
    d.toLocaleDateString(undefined, { weekday: "long" }),
    d.toLocaleDateString(undefined, { weekday: "short" }),
    d.toLocaleDateString(undefined, { month: "long" }),
    d.toLocaleDateString(undefined, { month: "short" }),
    d.toLocaleDateString(undefined, { month: "long", day: "numeric" }),
    d.toLocaleDateString(undefined),
  ];
  if (daysAgo === 0) labels.push("today");
  if (daysAgo === 1) labels.push("yesterday");
  if (daysAgo >= 0 && daysAgo < 7) labels.push("this week");
  return labels.map((label) => label.toLowerCase());
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9_-]+/g) ?? [];
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (needle.length < 3) return false;
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i += 1;
    if (i === needle.length) return true;
  }
  return false;
}

function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      cur[j] = next;
      rowMin = Math.min(rowMin, next);
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

function fuzzyWordScore(term: string, text: string): number {
  if (term.length < 3) return 0;
  for (const word of words(text)) {
    if (word.startsWith(term)) return 28;
    if (term.length >= 4 && editDistanceWithin(term, word, term.length > 6 ? 2 : 1)) return 18;
    if (isSubsequence(term, word)) return 13;
  }
  return isSubsequence(term, text.toLowerCase()) ? 8 : 0;
}

function scoreText(term: string, text: string, weight: number): number {
  const lower = text.toLowerCase();
  if (!term || !lower) return 0;
  if (lower.includes(term)) return weight;
  const fuzzy = fuzzyWordScore(term, lower);
  return fuzzy ? Math.max(1, Math.round((fuzzy / 30) * weight)) : 0;
}

function rangesFor(text: string, term: string): HighlightRange[] {
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  const ranges: HighlightRange[] = [];
  let start = lower.indexOf(needle);
  while (needle && start !== -1) {
    ranges.push({ start, end: start + needle.length });
    start = lower.indexOf(needle, start + needle.length);
  }
  return ranges;
}

function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: HighlightRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) merged.push({ ...range });
    else last.end = Math.max(last.end, range.end);
  }
  return merged;
}

function bestTermScore(entry: Entry, term: string): number {
  const fields: { text: string; weight: number }[] = [
    { text: entry.body, weight: 60 },
    { text: entry.authorName ?? "", weight: 72 },
    { text: entry.done ? "done complete completed" : "todo open active", weight: 56 },
    { text: entry.status ?? "", weight: 56 },
    { text: dateLabels(entry.createdAt).join(" "), weight: 42 },
    ...entry.tags.map((tag) => ({ text: tag, weight: 84 })),
    ...mentionTokens(entry.body).map((mention) => ({ text: mention, weight: 76 })),
  ];
  return Math.max(...fields.map((field) => scoreText(term, field.text, field.weight)));
}

export function searchEntries(entries: Entry[], query: string): SpotlightResult[] {
  const terms = termsFor(query);
  const list = entries.map((entry) => {
    if (terms.length === 0) {
      return {
        entry,
        score: 0,
        bodyRanges: [],
        tagRanges: {},
        authorRanges: [],
      };
    }

    const termScores = terms.map((term) => bestTermScore(entry, term));
    if (termScores.some((score) => score === 0)) return null;

    const tagRanges: Record<string, HighlightRange[]> = {};
    for (const tag of entry.tags) {
      tagRanges[tag] = mergeRanges(terms.flatMap((term) => rangesFor(tag, term)));
    }

    return {
      entry,
      score: termScores.reduce((sum, score) => sum + score, 0),
      bodyRanges: mergeRanges(terms.flatMap((term) => rangesFor(entry.body, term))),
      tagRanges,
      authorRanges: mergeRanges(terms.flatMap((term) => rangesFor(entry.authorName ?? "", term))),
    };
  });

  return list
    .filter((item): item is SpotlightResult => item !== null)
    .sort((a, b) => b.score - a.score || b.entry.createdAt - a.entry.createdAt);
}

export function highlightParts(text: string, ranges: HighlightRange[]): (string | HighlightRange)[] {
  if (ranges.length === 0) return [text];
  const parts: (string | HighlightRange)[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(range);
    cursor = range.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
