import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Entry, SortMode } from "../types";
import { EntryRow } from "./EntryRow";
import { DateDivider } from "./DateDivider";
import { TagChip } from "./TagChip";
import { dayKey, dividerLabel } from "../lib/dates";
import { orderOf } from "../lib/tasks";
import { isTask } from "../store/usePrefs";
import { config } from "../config";

interface Props {
  entries: Entry[];
  sort: SortMode;
  activeTags: string[];
  activeMentions: string[];
  filtering: boolean;
  focus: boolean;
  taskTags: string[];
  showTime: boolean;
  showTags: boolean;
  highlightedEntryId?: string | null;
  onTagClick: (tag: string) => void;
  onMentionClick: (name: string) => void;
  onEdit: (id: string, raw: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: (id: string) => void;
  onTogglePin: (id: string) => void;
  onSetOrder: (id: string, order: number) => void;
}

const UNTAGGED = "untagged";

interface Item {
  key: string;
  entry: Entry;
  group: string;
}

function buildItems(entries: Entry[], sort: SortMode): Item[] {
  if (sort === "tag") {
    const pairs: { tag: string; entry: Entry }[] = [];
    for (const e of entries) {
      const tags = e.tags.length ? e.tags : [UNTAGGED];
      for (const t of tags) pairs.push({ tag: t, entry: e });
    }
    pairs.sort((a, b) => {
      const ta = a.tag === UNTAGGED ? "~" : a.tag;
      const tb = b.tag === UNTAGGED ? "~" : b.tag;
      return ta.localeCompare(tb) || a.entry.createdAt - b.entry.createdAt;
    });
    return pairs.map((p) => ({ key: `${p.tag}:${p.entry.id}`, entry: p.entry, group: p.tag }));
  }
  if (sort === "manual") {
    return [...entries]
      .sort((a, b) => orderOf(a) - orderOf(b))
      .map((e) => ({ key: e.id, entry: e, group: "" }));
  }
  const sorted = [...entries].sort((a, b) =>
    sort === "desc" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
  );
  return sorted.map((e) => ({ key: e.id, entry: e, group: dayKey(e.createdAt) }));
}

export function Feed(props: Props) {
  const {
    entries,
    sort,
    activeTags,
    activeMentions,
    filtering,
    focus,
    taskTags,
    showTime,
    showTags,
    highlightedEntryId,
    onTagClick,
    onMentionClick,
    onEdit,
    onDelete,
    onToggleDone,
    onTogglePin,
    onSetOrder,
  } = props;

  const bottomRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const byTag = sort === "tag";
  const manual = sort === "manual";

  const pinned = useMemo(
    () => entries.filter((e) => e.pinned).sort((a, b) => a.createdAt - b.createdAt),
    [entries]
  );
  const rest = useMemo(() => entries.filter((e) => !e.pinned), [entries]);
  const items = useMemo(() => buildItems(rest, sort), [rest, sort]);

  const autoScroll = sort === "asc" && config.ui.autoScroll;
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [items.length, autoScroll]);

  const renderRow = (entry: Entry, minimal = false) => (
    <EntryRow
      entry={entry}
      activeTags={activeTags}
      activeMentions={activeMentions}
      checkable={isTask(entry.tags, taskTags) || !!entry.done}
      showTime={minimal ? false : showTime}
      hideTags={!showTags}
      highlighted={entry.id === highlightedEntryId}
      onTagClick={onTagClick}
      onMentionClick={onMentionClick}
      onEdit={onEdit}
      onDelete={onDelete}
      onToggleDone={onToggleDone}
      onTogglePin={onTogglePin}
    />
  );

  if (focus) {
    return (
      <div className="feed feed-focus">
        {pinned.length > 0 ? (
          pinned.map((e) => <Fragment key={`pin:${e.id}`}>{renderRow(e, true)}</Fragment>)
        ) : (
          <div className="feed-empty">
            <p>Nothing pinned. Pin a task with ★, then press F to focus on it.</p>
          </div>
        )}
      </div>
    );
  }

  if (entries.length === 0) {
    if (filtering) {
      return (
        <div className="feed feed-empty">
          <p>Nothing matches that filter.</p>
        </div>
      );
    }
    return (
      <div className="feed feed-firstrun">
        <span className="firstrun-mark" aria-hidden="true" />
        <span className="firstrun-title">Your log is empty.</span>
        <span className="firstrun-sub">
          Type your first thought below — add a <code className="firstrun-tag">/tag</code> to label
          it.
        </span>
      </div>
    );
  }

  // Manual: drag rows by their handle to reorder.
  if (manual) {
    const list = items.map((it) => it.entry);
    const orderBefore = (target: Entry) => {
      const idx = list.findIndex((e) => e.id === target.id);
      const prev = list[idx - 1];
      return prev ? (orderOf(prev) + orderOf(target)) / 2 : orderOf(target) - 1;
    };
    const orderEnd = () => {
      const last = list[list.length - 1];
      return last ? orderOf(last) + 1 : Date.now();
    };
    const dropAt = (order: number) => {
      if (draggingId) onSetOrder(draggingId, order);
      setDraggingId(null);
    };
    return (
      <div className="feed">
        {items.map((it) => (
          <div
            key={it.key}
            className={`drag-row${draggingId === it.entry.id ? " dragging" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dropAt(orderBefore(it.entry))}
          >
            <span
              className="drag-handle"
              draggable
              title="Drag to reorder"
              onDragStart={() => setDraggingId(it.entry.id)}
              onDragEnd={() => setDraggingId(null)}
            >
              ⋮⋮
            </span>
            {renderRow(it.entry)}
          </div>
        ))}
        <div
          className="drag-end"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => dropAt(orderEnd())}
        />
        <div ref={bottomRef} />
      </div>
    );
  }

  let lastKey = "";
  return (
    <div className="feed">
      {items.map((it) => {
        const showDivider = it.group !== lastKey;
        lastKey = it.group;
        return (
          <Fragment key={it.key}>
            {showDivider &&
              (byTag ? (
                <div className="tag-divider">
                  {it.group === UNTAGGED ? (
                    <span className="tag-divider-plain">untagged</span>
                  ) : (
                    <TagChip
                      tag={it.group}
                      active={activeTags.includes(it.group)}
                      onClick={onTagClick}
                    />
                  )}
                </div>
              ) : (
                <DateDivider label={dividerLabel(it.entry.createdAt)} />
              ))}
            {renderRow(it.entry)}
          </Fragment>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
