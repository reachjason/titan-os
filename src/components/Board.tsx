import { useState } from "react";
import type { Entry, TaskStatus } from "../types";
import { statusOf, orderOf } from "../lib/tasks";
import { isTask } from "../store/usePrefs";
import { TagChip } from "./TagChip";

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "To Do" },
  { key: "doing", label: "In Progress" },
  { key: "done", label: "Done" },
];

interface Props {
  entries: Entry[];
  taskTags: string[];
  onMove: (id: string, status: TaskStatus, order: number) => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  onTagClick: (tag: string) => void;
}

interface CardProps {
  entry: Entry;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: () => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  onTagClick: (tag: string) => void;
}

function Card({
  entry,
  onDragStart,
  onDragEnd,
  onDropBefore,
  onTogglePin,
  onDelete,
  onTagClick,
}: CardProps) {
  const [confirming, setConfirming] = useState(false);
  const done = statusOf(entry) === "done";

  return (
    <div
      className={`card${done ? " card-done" : ""}${entry.pinned ? " card-pinned" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.stopPropagation();
        onDropBefore();
      }}
    >
      <div className="card-body">{entry.body || <span className="card-empty">(empty)</span>}</div>
      {entry.tags.length > 0 && (
        <div className="card-tags">
          {entry.tags.map((t) => (
            <TagChip key={t} tag={t} onClick={onTagClick} />
          ))}
        </div>
      )}
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

export function Board({ entries, taskTags, onMove, onTogglePin, onDelete, onTagClick }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  const tasks = entries.filter((e) => isTask(e.tags, taskTags) || statusOf(e) === "done");

  const colItems = (key: TaskStatus) =>
    tasks.filter((e) => statusOf(e) === key).sort((a, b) => orderOf(a) - orderOf(b));

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
    <div className="board">
      {COLUMNS.map((col) => {
        const list = colItems(col.key);
        return (
          <div
            key={col.key}
            className={`column${overCol === col.key ? " column-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.key);
            }}
            onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
            onDrop={() => drop(col.key, orderEnd(list))}
          >
            <div className="column-head">
              {col.label}
              <span className="column-count">{list.length}</span>
            </div>
            <div className="column-body">
              {list.map((e) => (
                <Card
                  key={e.id}
                  entry={e}
                  onDragStart={() => setDraggingId(e.id)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverCol(null);
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
  );
}
