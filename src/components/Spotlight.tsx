import { useEffect, useMemo, useRef, useState } from "react";
import type { Entry } from "../types";
import { chipColor } from "../commands/tagColors";
import { useCurrentTheme } from "../store/ThemeContext";
import { timeLabel } from "../lib/dates";

interface Props {
  entries: Entry[];
  /** Jump to an entry (e.g. clear filters + scroll). */
  onPick?: (entry: Entry) => void;
  onClose: () => void;
}

/** macOS-Spotlight-style search palette: ⇧F opens, live filter, esc closes. */
export function Spotlight({ entries, onPick, onClose }: Props) {
  const theme = useCurrentTheme();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^\//, "");
    const list = needle
      ? entries.filter(
          (e) =>
            e.body.toLowerCase().includes(needle) ||
            e.tags.some((t) => t.includes(needle))
        )
      : entries;
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [entries, q]);

  useEffect(() => setSel(0), [q]);

  const pick = (e: Entry) => {
    onPick?.(e);
    onClose();
  };

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
                setSel((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter" && results[sel]) {
                e.preventDefault();
                pick(results[sel]);
              }
            }}
          />
          <span className="spot-esc">esc</span>
        </div>

        <div className="spot-body">
          {results.length === 0 ? (
            <div className="spot-empty">No entries match “{q}”</div>
          ) : (
            results.map((e, i) => {
              const tag = e.tags[0];
              const c = tag ? chipColor(tag, theme) : null;
              return (
                <button
                  key={e.id}
                  className={`spot-row${i === sel ? " spot-row-active" : ""}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => pick(e)}
                >
                  {tag && c && (
                    <span
                      className="chip"
                      style={{ background: c.bg, color: c.fg }}
                    >
                      <span className="chip-slash">/</span>
                      {tag}
                    </span>
                  )}
                  <span className={`spot-text${e.done ? " spot-text-done" : ""}`}>
                    {e.body || (tag ? `/${tag}` : "(empty)")}
                  </span>
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
