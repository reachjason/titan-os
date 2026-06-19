import { useEffect, useRef, useState } from "react";
import { chipColor } from "../commands/tagColors";
import { useCurrentTheme } from "../store/ThemeContext";

interface Props {
  /** All tags ever used, for the filter list. */
  tags: string[];
  /** Currently-active filter tags. */
  activeTags: string[];
  /** @mention tokens that appear in entries, for the people filter list. */
  people: string[];
  /** Mention token → display name + avatar. */
  peopleInfo: Record<string, { label: string; image?: string }>;
  /** Currently-active @mention filters. */
  activeMentions: string[];
  /** How multiple tags combine. */
  match: "any" | "all";
  onToggleTag: (tag: string) => void;
  onToggleMention: (name: string) => void;
  onToggleMatch: () => void;
  onClear: () => void;
  onClose: () => void;
}

/** Popover: pick tags and/or people to filter the feed by (multi-select). */
export function FilterMenu({
  tags,
  activeTags,
  people,
  peopleInfo,
  activeMentions,
  match,
  onToggleTag,
  onToggleMention,
  onToggleMatch,
  onClear,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useCurrentTheme();
  const [selected, setSelected] = useState(0);

  // Tags then people, sharing one keyboard cursor.
  const items: { kind: "tag" | "person"; value: string }[] = [
    ...tags.map((value) => ({ kind: "tag" as const, value })),
    ...people.map((value) => ({ kind: "person" as const, value })),
  ];
  const hasActive = activeTags.length + activeMentions.length > 0;

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    setSelected((i) => Math.min(i, Math.max(items.length - 1, 0)));
  }, [items.length]);

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

  const toggle = (item: { kind: "tag" | "person"; value: string }) =>
    item.kind === "tag" ? onToggleTag(item.value) : onToggleMention(item.value);

  return (
    <div
      className="filter-menu"
      ref={ref}
      role="menu"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (e.key === "ArrowDown" && items.length > 0) {
          e.preventDefault();
          setSelected((i) => (i + 1) % items.length);
        } else if (e.key === "ArrowUp" && items.length > 0) {
          e.preventDefault();
          setSelected((i) => (i - 1 + items.length) % items.length);
        } else if (e.key === "Enter" && items[selected]) {
          e.preventDefault();
          toggle(items[selected]);
        }
      }}
    >
      <div className="filter-menu-head">
        <span className="filter-menu-title">Filter</span>
        {activeTags.length > 1 && (
          <button className="filter-menu-match" onClick={onToggleMatch} title="Match any vs. all">
            {match === "any" ? "any" : "all"}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="filter-menu-empty">Nothing to filter yet</div>
      ) : (
        <div className="filter-menu-list">
          {tags.length > 0 && <div className="filter-menu-section">Tags</div>}
          {tags.map((t) => {
            const i = items.findIndex((it) => it.kind === "tag" && it.value === t);
            const c = chipColor(t, theme);
            const on = activeTags.includes(t);
            return (
              <button
                key={`tag:${t}`}
                className={`filter-menu-item${on ? " filter-menu-item-on" : ""}${
                  i === selected ? " filter-menu-item-active" : ""
                }`}
                onClick={() => onToggleTag(t)}
                onPointerMove={() => setSelected(i)}
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

          {people.length > 0 && <div className="filter-menu-section">People</div>}
          {people.map((p) => {
            const i = items.findIndex((it) => it.kind === "person" && it.value === p);
            const info = peopleInfo[p];
            const on = activeMentions.includes(p);
            return (
              <button
                key={`person:${p}`}
                className={`filter-menu-item${on ? " filter-menu-item-on" : ""}${
                  i === selected ? " filter-menu-item-active" : ""
                }`}
                onClick={() => onToggleMention(p)}
                onPointerMove={() => setSelected(i)}
                role="menuitemcheckbox"
                aria-checked={on}
                title={info?.label ?? p}
              >
                <span className="filter-check">{on ? "✓" : ""}</span>
                {info?.image ? (
                  <img className="filter-avatar" src={info.image} alt="" />
                ) : (
                  <span className="filter-avatar filter-avatar-fallback">
                    {(info?.label ?? p)[0]?.toUpperCase()}
                  </span>
                )}
                <span className="mention">@{info?.label ?? p}</span>
              </button>
            );
          })}
        </div>
      )}

      {hasActive && (
        <button className="filter-menu-clear" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}
