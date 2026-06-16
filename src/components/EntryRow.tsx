import { Fragment, useEffect, useRef, useState } from "react";
import type { Entry } from "../types";
import { TagChip } from "./TagChip";
import { timeLabel } from "../lib/dates";
import { renderMarkdown } from "../lib/markdown";
import { config } from "../config";

interface Props {
  entry: Entry;
  activeTags: string[];
  /** This entry carries a task tag → show a checkbox. */
  checkable: boolean;
  showTime: boolean;
  /** Hide tag chips (used in focus mode for a clean view). */
  hideTags?: boolean;
  onTagClick: (tag: string) => void;
  onEdit: (id: string, raw: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: (id: string) => void;
  onTogglePin: (id: string) => void;
}

export function EntryRow({
  entry,
  activeTags,
  checkable,
  showTime,
  hideTags,
  onTagClick,
  onEdit,
  onDelete,
  onToggleDone,
  onTogglePin,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(entry.raw);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing]);

  const commit = () => {
    if (draft.trim() && draft.trim() !== entry.raw) onEdit(entry.id, draft);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(entry.raw);
    setEditing(false);
  };
  const handleDelete = () => {
    if (config.ui.confirmOnDelete) setConfirming(true);
    else onDelete(entry.id);
  };

  if (editing) {
    return (
      <div className="row row-editing">
        <textarea
          ref={inputRef}
          className="row-edit"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={commit}
        />
      </div>
    );
  }

  const done = !!entry.done;

  return (
    <div className={`row${done ? " row-done" : ""}${entry.pinned ? " row-pinned" : ""}`}>
      {checkable ? (
        <button
          className={`check${done ? " check-on" : ""}`}
          onClick={() => onToggleDone(entry.id)}
          title={done ? "Mark not done" : "Mark done"}
          aria-pressed={done}
          aria-label={done ? "Completed" : "Mark done"}
        >
          {done && <span className="check-tick">✓</span>}
        </button>
      ) : (
        <span className="bullet" aria-hidden="true" />
      )}

      <div className="row-line">
        {!hideTags &&
          entry.tags.map((t) => (
            <Fragment key={t}>
              <TagChip tag={t} active={activeTags.includes(t)} onClick={onTagClick} />{" "}
            </Fragment>
          ))}
        {entry.body && <span className="row-body">{renderMarkdown(entry.body)}</span>}
        {entry.edited && (
          <span className="edited-flag" title="edited">
            {" "}
            ✎
          </span>
        )}
      </div>

      <div className="row-trail">
        {confirming ? (
          <div className="row-confirm">
            <span className="confirm-label">Delete?</span>
            <button className="confirm-yes" onClick={() => onDelete(entry.id)}>
              Delete
            </button>
            <button className="confirm-no" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <>
            {entry.isMine === false && entry.authorName && (
              <span className="row-author" title={`Added by ${entry.authorName}`}>
                added by {entry.authorName}
              </span>
            )}
            <div className="row-actions">
              <button
                className={`icon-btn${entry.pinned ? " icon-pinned" : ""}`}
                title={entry.pinned ? "Unpin" : "Pin to top"}
                onClick={() => onTogglePin(entry.id)}
              >
                {entry.pinned ? "★" : "☆"}
              </button>
              <button className="icon-btn" title="Edit" onClick={() => setEditing(true)}>
                ✎
              </button>
              <button className="icon-btn icon-danger" title="Delete" onClick={handleDelete}>
                ✕
              </button>
            </div>
            {showTime && <span className="row-time">{timeLabel(entry.createdAt)}</span>}
          </>
        )}
      </div>
    </div>
  );
}
