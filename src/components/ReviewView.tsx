import { useMemo, useState } from "react";
import type { Entry } from "../types";
import { EntryRow } from "./EntryRow";
import { isTask } from "../store/usePrefs";
import { dayKey, dividerLabel } from "../lib/dates";

interface Props {
  entries: Entry[];
  taskTags: string[];
  activeTags: string[];
  activeMentions: string[];
  highlightedEntryId?: string | null;
  onTagClick: (tag: string) => void;
  onMentionClick: (name: string) => void;
  onEdit: (id: string, raw: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: (id: string) => void;
  onTogglePin: (id: string) => void;
  onSetFocus: (id: string) => void;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface DayGroup {
  key: string;
  label: string;
  ts: number;
  open: Entry[];
  done: Entry[];
}

/**
 * Completion / weekly-review view. Shows only task-tagged (or completed)
 * entries, grouped by the day they were logged — most recent first. Within
 * each day, open tasks sit above completed ones. Chips are hidden so the task
 * text is the loudest thing on the row and everything aligns to one column.
 * Days older than a week start collapsed so "this week" stays front and centre.
 */
export function ReviewView({
  entries,
  taskTags,
  activeTags,
  activeMentions,
  highlightedEntryId,
  onTagClick,
  onMentionClick,
  onEdit,
  onDelete,
  onToggleDone,
  onTogglePin,
  onSetFocus,
}: Props) {
  // Day key → explicit expand/collapse override (set when the user clicks a
  // day header). Days without an override fall back to the this-week default.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const groups = useMemo<DayGroup[]>(() => {
    const tasks = entries.filter((e) => isTask(e.tags, taskTags) || e.done);
    const byDay = new Map<string, DayGroup>();
    for (const e of tasks) {
      const key = dayKey(e.createdAt);
      let g = byDay.get(key);
      if (!g) {
        g = { key, label: dividerLabel(e.createdAt), ts: e.createdAt, open: [], done: [] };
        byDay.set(key, g);
      }
      g.ts = Math.max(g.ts, e.createdAt);
      (e.done ? g.done : g.open).push(e);
    }
    const byCreatedDesc = (a: Entry, b: Entry) => b.createdAt - a.createdAt;
    const list = Array.from(byDay.values());
    for (const g of list) {
      g.open.sort(byCreatedDesc);
      g.done.sort(byCreatedDesc);
    }
    return list.sort((a, b) => b.ts - a.ts);
  }, [entries, taskTags]);

  if (groups.length === 0) {
    return (
      <div className="review">
        <p className="review-empty">No tasks yet. Log one with a task tag (e.g. /do) to review it here.</p>
      </div>
    );
  }

  const weekAgo = Date.now() - WEEK_MS;

  return (
    <div className="review">
      {groups.map((g) => {
        const expanded = overrides[g.key] ?? g.ts >= weekAgo;
        const rows = [...g.open, ...g.done];
        return (
          <section className="review-day" key={g.key}>
            <button
              className="review-day-head"
              aria-expanded={expanded}
              onClick={() =>
                setOverrides((o) => ({ ...o, [g.key]: !(o[g.key] ?? g.ts >= weekAgo) }))
              }
            >
              <span className="review-chevron" aria-hidden="true">
                {expanded ? "▾" : "▸"}
              </span>
              <span className="review-day-label">{g.label}</span>
              <span className="review-day-count">
                {g.open.length > 0 && <span className="review-open-count">{g.open.length} open</span>}
                {g.open.length > 0 && g.done.length > 0 && " · "}
                {g.done.length > 0 && `${g.done.length} done`}
              </span>
            </button>
            {expanded && (
              <div className="review-day-rows">
                {rows.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    activeTags={activeTags}
                    activeMentions={activeMentions}
                    checkable
                    showTime={false}
                    hideTags
                    highlighted={entry.id === highlightedEntryId}
                    onTagClick={onTagClick}
                    onMentionClick={onMentionClick}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleDone={onToggleDone}
                    onTogglePin={onTogglePin}
                    onSetFocus={onSetFocus}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
