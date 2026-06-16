import { useState } from "react";
import type { Entry, TaskStatus } from "../types";
import { statusOf, orderOf } from "../lib/tasks";
import { TagChip } from "./TagChip";
import { renderMarkdown } from "../lib/markdown";

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "To Do" },
  { key: "doing", label: "In Progress" },
  { key: "done", label: "Done" },
];

interface Props {
  entries: Entry[];
  onMove: (id: string, status: TaskStatus, order: number) => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  onTagClick: (tag: string) => void;
}

interface CardProps {
  entry: Entry;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDropBefore: () => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  onTagClick: (tag: string) => void;
}

function Card({
  entry,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDropBefore,
  onTogglePin,
  onDelete,
  onTagClick,
}: CardProps) {
  const [confirming, setConfirming] = useState(false);
  const done = statusOf(entry) === "done";

  return (
    <div
      className={`card${done ? " card-done" : ""}${entry.pinned ? " card-pinned" : ""}${
        dragging ? " card-dragging" : ""
      }`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", entry.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        // Keep the column highlighted and signal an insert-before drop here.
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropBefore();
      }}
    >
      <div className="card-body">
        {entry.body ? (
          renderMarkdown(entry.body, { onTag: onTagClick })
        ) : (
          <span className="card-empty">(empty)</span>
        )}
      </div>
      {(() => {
        const orphan = entry.tags.filter(
          (t) => !new RegExp(`(?:^|\\s)/${t}(?![a-z0-9_-])`, "i").test(entry.body)
        );
        return orphan.length > 0 ? (
          <div className="card-tags">
            {orphan.map((t) => (
              <TagChip key={t} tag={t} onClick={onTagClick} />
            ))}
          </div>
        ) : null;
      })()}
      <div className="card-actions">
        {confirming ? (
          <>
            <button className="confirm-yes" onClick={() => onDelete(entry.id)}>
              Delete
            </button>
            <button className="confirm-no" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              className={`icon-btn${entry.pinned ? " icon-pinned" : ""}`}
              title={entry.pinned ? "Unpin" : "Pin"}
              onClick={() => onTogglePin(entry.id)}
            >
              {entry.pinned ? "★" : "☆"}
            </button>
            <button
              className="icon-btn icon-danger"
              title="Delete"
              onClick={() => setConfirming(true)}
            >
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function Board({ entries, onMove, onTogglePin, onDelete, onTagClick }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  // Default to a focus board: only pinned/starred entries. Toggle to see all.
  const [pinnedOnly, setPinnedOnly] = useState(true);

  // Anything without an explicit status defaults to "To Do" (via statusOf).
  const visible = pinnedOnly ? entries.filter((e) => e.pinned) : entries;
  const colItems = (key: TaskStatus) =>
    visible.filter((e) => statusOf(e) === key).sort((a, b) => orderOf(a) - orderOf(b));

  const orderBefore = (list: Entry[], target: Entry) => {
    const idx = list.findIndex((e) => e.id === target.id);
    const prev = list[idx - 1];
    return prev ? (orderOf(prev) + orderOf(target)) / 2 : orderOf(target) - 1;
  };
  const orderEnd = (list: Entry[]) => {
    const last = list[list.length - 1];
    return last ? orderOf(last) + 1 : Date.now();
  };

  const drop = (col: TaskStatus, order: number) => {
    if (draggingId) onMove(draggingId, col, order);
    setDraggingId(null);
    setOverCol(null);
  };

  return (
    <div className="board-wrap">
      <div className="board-bar">
        <button
          className={`board-filter${pinnedOnly ? " on" : ""}`}
          onClick={() => setPinnedOnly((v) => !v)}
          title={
            pinnedOnly
              ? "Showing pinned tasks — click to show all"
              : "Showing all tasks — click to show pinned only"
          }
        >
          <span className="board-filter-star">{pinnedOnly ? "★" : "☆"}</span>
          {pinnedOnly ? "Pinned only" : "All tasks"}
        </button>
      </div>
      <div className="board">
        {COLUMNS.map((col) => {
        const list = colItems(col.key);
        return (
          <div
            key={col.key}
            className={`column${overCol === col.key ? " column-over" : ""}`}
            onDragEnter={() => {
              if (draggingId) setOverCol(col.key);
            }}
            onDragOver={(e) => {
              // Allow drops anywhere in the column (incl. the empty area below cards).
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (draggingId && overCol !== col.key) setOverCol(col.key);
            }}
            onDragLeave={(e) => {
              // Only clear when the cursor actually leaves the column, not when it
              // crosses between the column's own children (cards / body).
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOverCol((c) => (c === col.key ? null : c));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(col.key, orderEnd(list));
            }}
          >
            <div className="column-head">
              <span className="column-title">{col.label}</span>
              <span className="column-count">{list.length}</span>
            </div>
            <div className="column-body">
              {list.map((e) => (
                <Card
                  key={e.id}
                  entry={e}
                  dragging={draggingId === e.id}
                  onDragStart={() => setDraggingId(e.id)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverCol(null);
                  }}
                  onDragOver={() => {
                    if (draggingId && overCol !== col.key) setOverCol(col.key);
                  }}
                  onDropBefore={() => drop(col.key, orderBefore(list, e))}
                  onTogglePin={onTogglePin}
                  onDelete={onDelete}
                  onTagClick={onTagClick}
                />
              ))}
              {list.length === 0 && <div className="column-empty">Drop here</div>}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
