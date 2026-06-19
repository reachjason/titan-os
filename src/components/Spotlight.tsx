import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { Entry } from "../types";
import { chipColor } from "../commands/tagColors";
import { useCurrentTheme } from "../store/ThemeContext";
import { timeLabel } from "../lib/dates";
import { config } from "../config";
import { highlightParts, searchEntries, type HighlightRange } from "../lib/spotlightSearch";

interface Props {
  entries: Entry[];
  /** Seed the search box (e.g. with the feed's active query). */
  initialQuery?: string;
  /** Jump to an entry (e.g. clear filters + scroll). */
  onPick?: (entry: Entry) => void;
  /** Show every match in the feed as a persistent search-results view. */
  onSeeAll?: (query: string) => void;
  /** Apply a tag filter (show all entries with this tag). */
  onPickTag?: (tag: string) => void;
  /** Apply a people filter (show all entries mentioning this person). */
  onPickMention?: (name: string) => void;
  /** Mention token → display name + avatar. */
  peopleInfo?: Record<string, { label: string; image?: string }>;
  onClose: () => void;
}

/** A search row: see-all, a tag/people-filter shortcut, or a matched entry. */
type Row =
  | { kind: "all"; count: number }
  | { kind: "tag"; tag: string; count: number }
  | { kind: "person"; key: string; label: string; image?: string; count: number }
  | { kind: "entry"; result: ReturnType<typeof searchEntries>[number] };

/** Strip a single leading sigil so "/idea", "@idea", "idea" all match a tag. */
function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/^[/@#]+/, "");
}

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(config.storage.searchRecentKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(next: string[]) {
  localStorage.setItem(config.storage.searchRecentKey, JSON.stringify(next.slice(0, 5)));
}

function renderMarked(text: string, ranges: HighlightRange[]) {
  return highlightParts(text, ranges).map((part, i) =>
    typeof part === "string" ? (
      part
    ) : (
      <mark key={`${part.start}:${part.end}:${i}`}>{text.slice(part.start, part.end)}</mark>
    )
  );
}

/** macOS-Spotlight-style search palette: ⇧F opens, live filter, esc closes. */
export function Spotlight({
  entries,
  initialQuery = "",
  onPick,
  onSeeAll,
  onPickTag,
  onPickMention,
  peopleInfo,
  onClose,
}: Props) {
  const theme = useCurrentTheme();
  const [q, setQ] = useState(initialQuery);
  const [sel, setSel] = useState(0);
  const [recent, setRecent] = useState<string[]>(loadRecentSearches);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastKeyNavAt = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => searchEntries(entries, q), [entries, q]);

  // Entry count per tag, for the "Filter by /tag" shortcut rows.
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) for (const t of e.tags) counts[t] = (counts[t] ?? 0) + 1;
    return counts;
  }, [entries]);

  // Entry count per @mention token, for the "Filter by @name" shortcut rows.
  const mentionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const re = /(?:^|\s)@([a-z0-9][a-z0-9_-]*)/gi;
    for (const e of entries) {
      const seen = new Set<string>();
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(e.body))) {
        const token = m[1].toLowerCase();
        if (!seen.has(token)) {
          seen.add(token);
          counts[token] = (counts[token] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [entries]);

  // Tags / people whose name matches the query — prefix first, then by frequency.
  const byQuery = (counts: Record<string, number>) => {
    const term = normalizeQuery(q);
    if (!term) return [];
    return Object.keys(counts)
      .filter((k) => k.includes(term))
      .sort((a, b) => {
        const ap = a.startsWith(term) ? 0 : 1;
        const bp = b.startsWith(term) ? 0 : 1;
        return ap - bp || counts[b] - counts[a] || a.localeCompare(b);
      })
      .slice(0, 4);
  };
  const tagMatches = useMemo(() => byQuery(tagCounts), [tagCounts, q]);
  const mentionMatches = useMemo(() => byQuery(mentionCounts), [mentionCounts, q]);

  // "See all matches" leads the list (default cursor) so Enter shows the full
  // result set in the feed; tag/people shortcuts and entry matches follow.
  const term = q.trim();
  const rows: Row[] = useMemo(
    () => [
      ...(onSeeAll && term && results.length > 0 ? [{ kind: "all" as const, count: results.length }] : []),
      ...(onPickTag ? tagMatches.map((tag) => ({ kind: "tag" as const, tag, count: tagCounts[tag] })) : []),
      ...(onPickMention
        ? mentionMatches.map((key) => ({
            kind: "person" as const,
            key,
            label: peopleInfo?.[key]?.label ?? key,
            image: peopleInfo?.[key]?.image,
            count: mentionCounts[key],
          }))
        : []),
      ...results.map((result) => ({ kind: "entry" as const, result })),
    ],
    [onSeeAll, term, onPickTag, onPickMention, tagMatches, mentionMatches, tagCounts, mentionCounts, peopleInfo, results]
  );

  useEffect(() => setSel(0), [q]);

  const remember = () => {
    const term = q.trim();
    if (!term) return;
    const next = [term, ...recent.filter((item) => item.toLowerCase() !== term.toLowerCase())];
    setRecent(next.slice(0, 5));
    saveRecentSearches(next);
  };

  const pick = (e: Entry) => {
    remember();
    onPick?.(e);
    onClose();
  };

  const pickTag = (tag: string) => {
    remember();
    onPickTag?.(tag);
    onClose();
  };

  const pickMention = (name: string) => {
    remember();
    onPickMention?.(name);
    onClose();
  };

  const seeAll = () => {
    remember();
    onSeeAll?.(term);
    onClose();
  };

  const choose = (row: Row) => {
    if (row.kind === "all") seeAll();
    else if (row.kind === "tag") pickTag(row.tag);
    else if (row.kind === "person") pickMention(row.key);
    else pick(row.result.entry);
  };

  const resultLabel =
    q.trim().length > 0
      ? `${results.length} ${results.length === 1 ? "match" : "matches"}`
      : `${results.length} ${results.length === 1 ? "entry" : "entries"}`;

  return (
    <div className="spot-overlay" onMouseDown={onClose}>
      <div
        className="spot"
        role="dialog"
        aria-label="Search"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="spot-head">
          <span className="spot-glyph">⌕</span>
          <input
            ref={inputRef}
            className="spot-input"
            placeholder="Search your log…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                lastKeyNavAt.current = performance.now();
                setSel((s) => Math.min(s + 1, Math.max(rows.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                lastKeyNavAt.current = performance.now();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter" && rows[sel]) {
                e.preventDefault();
                choose(rows[sel]);
              }
            }}
          />
          <span className="spot-count">{resultLabel}</span>
          <span className="spot-esc">esc</span>
        </div>

        {recent.length > 0 && !q.trim() && (
          <div className="spot-recent" aria-label="Recent searches">
            <span className="spot-recent-label">Recent</span>
            {recent.map((item) => (
              <button key={item} className="spot-recent-chip" onClick={() => setQ(item)}>
                {item}
              </button>
            ))}
          </div>
        )}

        <div className="spot-body">
          {rows.length === 0 ? (
            <div className="spot-empty">
              <span>No entries match “{q}”</span>
              <small>Try a tag, person, status, or date.</small>
            </div>
          ) : (
            rows.map((row, i) => {
              const onMove = (ev: PointerEvent) => {
                const prev = pointerRef.current;
                pointerRef.current = { x: ev.clientX, y: ev.clientY };
                if (!prev) return;
                const moved = Math.abs(prev.x - ev.clientX) + Math.abs(prev.y - ev.clientY);
                if (moved < 2 || performance.now() - lastKeyNavAt.current < 250) return;
                setSel(i);
              };

              if (row.kind === "all") {
                return (
                  <button
                    key="see-all"
                    className={`spot-row spot-row-all${i === sel ? " spot-row-active" : ""}`}
                    onPointerMove={onMove}
                    onClick={seeAll}
                  >
                    <span className="spot-all-glyph">≡</span>
                    <span className="spot-text">
                      See all {row.count} {row.count === 1 ? "match" : "matches"} for “{term}”
                    </span>
                    <span className="spot-time">↵</span>
                  </button>
                );
              }

              if (row.kind === "tag") {
                const c = chipColor(row.tag, theme);
                return (
                  <button
                    key={`tag:${row.tag}`}
                    className={`spot-row spot-row-tag${i === sel ? " spot-row-active" : ""}`}
                    onPointerMove={onMove}
                    onClick={() => pickTag(row.tag)}
                  >
                    <span className="chip" style={{ background: c.bg, color: c.fg }}>
                      <span className="chip-slash">/</span>
                      {row.tag}
                    </span>
                    <span className="spot-text">Filter by /{row.tag}</span>
                    <span className="spot-time">
                      {row.count} {row.count === 1 ? "entry" : "entries"}
                    </span>
                  </button>
                );
              }

              if (row.kind === "person") {
                return (
                  <button
                    key={`person:${row.key}`}
                    className={`spot-row spot-row-tag${i === sel ? " spot-row-active" : ""}`}
                    onPointerMove={onMove}
                    onClick={() => pickMention(row.key)}
                  >
                    {row.image ? (
                      <img className="suggest-avatar" src={row.image} alt="" />
                    ) : (
                      <span className="suggest-avatar suggest-avatar-fallback">
                        {row.label[0]?.toUpperCase()}
                      </span>
                    )}
                    <span className="spot-text">Filter by @{row.label}</span>
                    <span className="spot-time">
                      {row.count} {row.count === 1 ? "entry" : "entries"}
                    </span>
                  </button>
                );
              }

              const { result } = row;
              const e = result.entry;
              const tag = e.tags[0];
              const c = tag ? chipColor(tag, theme) : null;
              const showAuthor = !!e.authorName && (e.isMine === false || result.authorRanges.length > 0);
              return (
                <button
                  key={e.id}
                  className={`spot-row${i === sel ? " spot-row-active" : ""}`}
                  onPointerMove={onMove}
                  onClick={() => pick(e)}
                >
                  {tag && c && (
                    <span
                      className="chip"
                      style={{ background: c.bg, color: c.fg }}
                    >
                      <span className="chip-slash">/</span>
                      {renderMarked(tag, result.tagRanges[tag] ?? [])}
                    </span>
                  )}
                  <span className={`spot-text${e.done ? " spot-text-done" : ""}`}>
                    {renderMarked(e.body || (tag ? `/${tag}` : "(empty)"), result.bodyRanges)}
                  </span>
                  {showAuthor && (
                    <span className="spot-author">
                      by {renderMarked(e.authorName ?? "", result.authorRanges)}
                    </span>
                  )}
                  <span className="spot-time">{timeLabel(e.createdAt)}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="spot-foot">
          <span>
            <span className="spot-key">↑↓</span> navigate
          </span>
          <span>
            <span className="spot-key">↵</span> open
          </span>
          <span className="spot-foot-end">⇧F · Spotlight search</span>
        </div>
      </div>
    </div>
  );
}
