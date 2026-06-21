import { useEffect, useRef, useState } from "react";
import type { Entry } from "../types";
import { TagChip } from "./TagChip";
import { renderMarkdown } from "../lib/markdown";
import { timeLabel } from "../lib/dates";
import { config } from "../config";

interface Props {
  entry: Entry;
  /** This entry carries a task tag → show a done toggle. */
  checkable: boolean;
  showTags: boolean;
  activeTags: string[];
  activeMentions: string[];
  onClose: () => void;
  onTagClick: (tag: string) => void;
  onMentionClick: (name: string) => void;
  onEdit: (id: string, raw: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: (id: string) => void;
  onTogglePin: (id: string) => void;
  onSetFocus: (id: string) => void;
}

/** Does the body contain this tag inline (as "/tag")? */
function tagInBody(body: string, tag: string): boolean {
  return new RegExp(`(?:^|\\s)/${tag}(?![a-z0-9_-])`, "i").test(body);
}

/**
 * Single-task focus overlay: the "right now" task, rendered large with the
 * text on top and its actions stacked underneath. Pops in to feel like
 * entering a focus mode; the log bar below stays usable.
 */
export function NowModal({
  entry,
  checkable,
  showTags,
  activeTags,
  activeMentions,
  onClose,
  onTagClick,
  onMentionClick,
  onEdit,
  onDelete,
  onToggleDone,
  onTogglePin,
  onSetFocus,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(entry.raw);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const done = !!entry.done;

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

  const orphanTags = showTags ? entry.tags.filter((t) => !tagInBody(entry.body, t)) : [];

  return (
    <div
      className="modal-overlay modal-overlay-centered now-modal-overlay"
      onMouseDown={onClose}
    >
      <div
        className="modal now-modal"
        role="dialog"
        aria-label="Right now"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">
            <span className="now-glyph" aria-hidden="true">
              ◉
            </span>{" "}
            Right now
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {editing ? (
          <textarea
            ref={inputRef}
            className="row-edit now-modal-edit"
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
                e.stopPropagation();
                cancel();
              }
            }}
            onBlur={commit}
          />
        ) : (
          <div className={`now-modal-body${done ? " now-modal-body-done" : ""}`}>
            {orphanTags.length > 0 && (
              <div className="now-modal-tags">
                {orphanTags.map((t) => (
                  <TagChip
                    key={t}
                    tag={t}
                    active={activeTags.includes(t)}
                    onClick={onTagClick}
                  />
                ))}
              </div>
            )}
            {entry.body ? (
              renderMarkdown(entry.body, {
                onMention: onMentionClick,
                activeMentions,
                onTag: onTagClick,
                activeTags,
                hideTags: !showTags,
              })
            ) : (
              <span className="now-modal-empty">(empty)</span>
            )}
          </div>
        )}

        <div className="now-modal-foot">
          {confirming ? (
            <div className="now-modal-confirm">
              <span className="confirm-label">Delete this?</span>
              <button className="confirm-yes" onClick={() => onDelete(entry.id)}>
                Delete
              </button>
              <button className="confirm-no" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <span className="now-modal-time">{timeLabel(entry.createdAt)}</span>
              <div className="now-modal-actions">
                {checkable && (
                  <button
                    className={`now-act${done ? " now-act-on" : ""}`}
                    onClick={() => onToggleDone(entry.id)}
                  >
                    {done ? "✓ Done" : "Mark done"}
                  </button>
                )}
                <button
                  className={`now-act${entry.pinned ? " now-act-on" : ""}`}
                  onClick={() => onTogglePin(entry.id)}
                >
                  {entry.pinned ? "★ Pinned" : "☆ Pin"}
                </button>
                <button className="now-act" onClick={() => setEditing(true)}>
                  ✎ Edit
                </button>
                <button
                  className="now-act now-act-clear"
                  onClick={() => onSetFocus(entry.id)}
                  title="Clear the right-now task"
                >
                  ◉ Clear
                </button>
                <button
                  className="now-act now-act-danger"
                  onClick={() =>
                    config.ui.confirmOnDelete ? setConfirming(true) : onDelete(entry.id)
                  }
                >
                  ✕ Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
