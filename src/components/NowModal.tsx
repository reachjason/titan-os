import { useEffect, useRef, useState } from "react";
import type { Entry } from "../types";
import { renderMarkdown } from "../lib/markdown";
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

/**
 * Single-task focus mode: the "right now" task, rendered large and centred as
 * the one thing on screen, with a single primary "Mark done" and quiet utility
 * icons beneath. Completing it celebrates, then clears the right-now flag and
 * exits — you finished, so you leave focus.
 */
export function NowModal({
  entry,
  checkable,
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
  const [burst, setBurst] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const exitTimer = useRef<number | null>(null);
  const done = !!entry.done;

  // Complete from focus mode: celebrate, then drop it from "right now" and exit.
  const handleComplete = () => {
    if (done) {
      onToggleDone(entry.id); // already done → just toggle back, stay put
      return;
    }
    setBurst(true);
    onToggleDone(entry.id);
    if (exitTimer.current) window.clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(() => {
      onSetFocus(entry.id); // clear the right-now flag
      onClose(); // leave focus mode
    }, 900);
  };

  useEffect(() => () => {
    if (exitTimer.current) window.clearTimeout(exitTimer.current);
  }, []);

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
        <div className="now-modal-head">
          <span className="now-modal-eyebrow">
            <span className="now-glyph now-glyph-live" aria-hidden="true">
              ◉
            </span>
            right now
          </span>
          <button className="now-modal-x" onClick={onClose} aria-label="Close">
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
          <div className={`now-modal-task${done ? " now-modal-task-done" : ""}`}>
            {entry.body ? (
              renderMarkdown(entry.body, {
                onMention: onMentionClick,
                activeMentions,
                onTag: onTagClick,
                hideTags: true,
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
              {checkable && (
                <button
                  className={`now-primary${burst ? " now-primary-burst" : ""}`}
                  onClick={handleComplete}
                >
                  <span className="now-primary-check" aria-hidden="true">
                    ✓
                  </span>
                  {done ? "Done" : "Mark done"}
                  {burst && (
                    <span className="burst burst-big" aria-hidden="true">
                      <span className="burst-ring" />
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <span
                          key={i}
                          className="burst-particle"
                          style={{ ["--a" as string]: `${i * 45}deg` }}
                        />
                      ))}
                    </span>
                  )}
                </button>
              )}
              <div className="now-modal-utils">
                <button className="now-util" onClick={() => setEditing(true)} title="Edit">
                  ✎
                </button>
                <button
                  className={`now-util${entry.pinned ? " now-util-on" : ""}`}
                  onClick={() => onTogglePin(entry.id)}
                  title={entry.pinned ? "Unpin" : "Pin"}
                  aria-pressed={!!entry.pinned}
                >
                  {entry.pinned ? "★" : "☆"}
                </button>
                <button
                  className="now-util"
                  onClick={() => onSetFocus(entry.id)}
                  title="Clear the right-now task"
                >
                  ◉
                </button>
                <button
                  className="now-util now-util-danger"
                  onClick={() =>
                    config.ui.confirmOnDelete ? setConfirming(true) : onDelete(entry.id)
                  }
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
