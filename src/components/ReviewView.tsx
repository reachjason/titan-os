import { useEffect, useMemo, useRef, useState } from "react";
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
  /** Bumped by the header control to expand/collapse every day at once. */
  bulkNonce: number;
  bulkExpanded: boolean;
  onTagClick: (tag: string) => void;
  onMentionClick: (name: string) => void;
  onEdit: (id: string, raw: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: (id: string) => void;
  onTogglePin: (id: string) => void;
  onSetFocus: (id: string) => void;
  /** Schedule a task under today / clear its schedule. */
  onMoveToday: (id: string) => void;
  onUnschedule: (id: string) => void;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface DayGroup {
  key: string;
  label: string;
  ts: number;
  open: Entry[];
  done: Entry[];
}

/** The day this task sits under in the review: its schedule day if "moved to
 *  today", otherwise when it was logged. */
function effectiveAt(e: Entry): number {
  return e.scheduledFor ?? e.createdAt;
}

/** Drop leading status tags (e.g. "/do ", "/done ") from the displayed text —
 *  the checkbox already conveys open vs. done, so they're pure noise here. Some
 *  entries store the tag inline in the body, so hiding the chip isn't enough. */
function cleanBody(body: string, statusTags: Set<string>): string {
  let s = body;
  for (;;) {
    const m = /^\s*\/([a-z0-9][a-z0-9_-]*)\s+/i.exec(s);
    if (m && statusTags.has(m[1].toLowerCase())) s = s.slice(m[0].length);
    else break;
  }
  return s;
}

/**
 * Completion / weekly-review view. Shows only task-tagged (or completed)
 * entries, grouped by their day — most recent first. Within each day, open
 * tasks sit above completed ones. The status tag is stripped from the text so
 * the task itself is the only thing on the row, and rows align to one column.
 * Days older than a week start collapsed so "this week" stays front and centre.
 * Each row can be pulled to today (non-destructively); the header symbol and
 * the e / c keys expand or collapse every day.
 */
export function ReviewView({
  entries,
  taskTags,
  activeTags,
  activeMentions,
  highlightedEntryId,
  bulkNonce,
  bulkExpanded,
  onTagClick,
  onMentionClick,
  onEdit,
  onDelete,
  onToggleDone,
  onTogglePin,
  onSetFocus,
  onMoveToday,
  onUnschedule,
}: Props) {
  // Day key → explicit expand/collapse override (set by clicking a day header
  // or a bulk command). Days without one fall back to the this-week default.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const statusTags = useMemo(
    () => new Set([...taskTags.map((t) => t.toLowerCase()), "done", "todo"]),
    [taskTags]
  );

  const groups = useMemo<DayGroup[]>(() => {
    const tasks = entries.filter((e) => isTask(e.tags, taskTags) || e.done);
    const byDay = new Map<string, DayGroup>();
    for (const e of tasks) {
      const at = effectiveAt(e);
      const key = dayKey(at);
      let g = byDay.get(key);
      if (!g) {
        g = { key, label: dividerLabel(at), ts: at, open: [], done: [] };
        byDay.set(key, g);
      }
      g.ts = Math.max(g.ts, at);
      (e.done ? g.done : g.open).push(e);
    }
    const byAtDesc = (a: Entry, b: Entry) => effectiveAt(b) - effectiveAt(a);
    const list = Array.from(byDay.values());
    for (const g of list) {
      g.open.sort(byAtDesc);
      g.done.sort(byAtDesc);
    }
    return list.sort((a, b) => b.ts - a.ts);
  }, [entries, taskTags]);

  // Apply bulk expand/collapse. Driven by `bulkNonce` so it only fires on an
  // explicit command, not when the groups change. A ref keeps the latest
  // groups without retriggering the effect.
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  useEffect(() => {
    if (!bulkNonce) return;
    setOverrides(() => {
      const next: Record<string, boolean> = {};
      for (const g of groupsRef.current) next[g.key] = bulkExpanded;
      return next;
    });
  }, [bulkNonce, bulkExpanded]);

  if (groups.length === 0) {
    return (
      <div className="review">
        <p className="review-empty">
          No tasks yet. Log one with a task tag (e.g. /do) to review it here.
        </p>
      </div>
    );
  }

  const today = dayKey(Date.now());
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
                {g.open.length > 0 && (
                  <span className="review-open-count">{g.open.length} open</span>
                )}
                {g.open.length > 0 && g.done.length > 0 && " · "}
                {g.done.length > 0 && `${g.done.length} done`}
              </span>
            </button>
            {expanded && (
              <div className="review-day-rows">
                {rows.map((entry) => {
                  const text = cleanBody(entry.body, statusTags);
                  const display = text === entry.body ? entry : { ...entry, body: text };
                  const isToday = dayKey(effectiveAt(entry)) === today;
                  return (
                    <EntryRow
                      key={entry.id}
                      entry={display}
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
                      onMoveToday={!isToday ? onMoveToday : undefined}
                      onUnschedule={isToday && entry.scheduledFor != null ? onUnschedule : undefined}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
