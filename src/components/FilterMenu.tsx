import { useEffect, useRef } from "react";
import { chipColor } from "../commands/tagColors";
import { useCurrentTheme } from "../store/ThemeContext";

interface Props {
  /** All tags ever used, for the filter list. */
  tags: string[];
  /** Currently-active filter tags. */
  active: string[];
  /** How multiple tags combine. */
  match: "any" | "all";
  onToggle: (tag: string) => void;
  onToggleMatch: () => void;
  onClear: () => void;
  onClose: () => void;
}

/** Popover: pick one or more tags to filter the feed by (multi-select). */
export function FilterMenu({
  tags,
  active,
  match,
  onToggle,
  onToggleMatch,
  onClear,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useCurrentTheme();

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const id = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div className="filter-menu" ref={ref} role="menu">
      <div className="filter-menu-head">
        <span className="filter-menu-title">Filter by tag</span>
        {active.length > 1 && (
          <button className="filter-menu-match" onClick={onToggleMatch} title="Match any vs. all">
            {match === "any" ? "any" : "all"}
          </button>
        )}
      </div>
      {tags.length === 0 ? (
        <div className="filter-menu-empty">No tags yet</div>
      ) : (
        <div className="filter-menu-list">
          {tags.map((t) => {
            const c = chipColor(t, theme);
            const on = active.includes(t);
            return (
              <button
                key={t}
                className={`filter-menu-item${on ? " filter-menu-item-on" : ""}`}
                onClick={() => onToggle(t)}
                role="menuitemcheckbox"
                aria-checked={on}
              >
                <span className="filter-check">{on ? "✓" : ""}</span>
                <span className="chip" style={{ background: c.bg, color: c.fg }}>
                  <span className="chip-slash">/</span>
                  {t}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {active.length > 0 && (
        <button className="filter-menu-clear" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}
