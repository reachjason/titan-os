import { useEffect, useMemo, useRef, useState } from "react";
import type { Entry } from "../types";
import { chipColor } from "../commands/tagColors";
import { useCurrentTheme } from "../store/ThemeContext";
import { timeLabel } from "../lib/dates";
import { config } from "../config";
import { highlightParts, searchEntries, type HighlightRange } from "../lib/spotlightSearch";

interface Props {
  entries: Entry[];
  /** Jump to an entry (e.g. clear filters + scroll). */
  onPick?: (entry: Entry) => void;
  onClose: () => void;
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
export function Spotlight({ entries, onPick, onClose }: Props) {
  const theme = useCurrentTheme();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [recent, setRecent] = useState<string[]>(loadRecentSearches);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastKeyNavAt = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => searchEntries(entries, q), [entries, q]);

  useEffect(() => setSel(0), [q]);

  const pick = (e: Entry) => {
    const term = q.trim();
    if (term) {
      const next = [term, ...recent.filter((item) => item.toLowerCase() !== term.toLowerCase())];
      setRecent(next.slice(0, 5));
      saveRecentSearches(next);
    }
    onPick?.(e);
    onClose();
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
                setSel((s) => Math.min(s + 1, Math.max(results.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                lastKeyNavAt.current = performance.now();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter" && results[sel]) {
                e.preventDefault();
                pick(results[sel].entry);
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
          {results.length === 0 ? (
            <div className="spot-empty">
              <span>No entries match “{q}”</span>
              <small>Try a tag, person, status, or date.</small>
            </div>
          ) : (
            results.map((result, i) => {
              const e = result.entry;
              const tag = e.tags[0];
              const c = tag ? chipColor(tag, theme) : null;
              const showAuthor = !!e.authorName && (e.isMine === false || result.authorRanges.length > 0);
              return (
                <button
                  key={e.id}
                  className={`spot-row${i === sel ? " spot-row-active" : ""}`}
                  onPointerMove={(ev) => {
                    const prev = pointerRef.current;
                    pointerRef.current = { x: ev.clientX, y: ev.clientY };
                    if (!prev) return;
                    const moved = Math.abs(prev.x - ev.clientX) + Math.abs(prev.y - ev.clientY);
                    if (moved < 2 || performance.now() - lastKeyNavAt.current < 250) return;
                    setSel(i);
                  }}
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
