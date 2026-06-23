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
  /** Briefly pulse this row after opening it from Spotlight. */
  highlighted?: boolean;
  /** Active @mention filters, for highlighting. */
  activeMentions: string[];
  onTagClick: (tag: string) => void;
  onMentionClick: (name: string) => void;
  onEdit: (id: string, raw: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: (id: string) => void;
  onTogglePin: (id: string) => void;
  /** Set/clear this entry as the single "right now" focus task. */
  onSetFocus?: (id: string) => void;
  /** Review only: schedule this task under today (shown when not already today). */
  onMoveToday?: (id: string) => void;
  /** Review only: clear the schedule, back to its logged day. */
  onUnschedule?: (id: string) => void;
}

/** Does the body contain this tag inline (as "/tag")? */
function tagInBody(body: string, tag: string): boolean {
  return new RegExp(`(?:^|\\s)/${tag}(?![a-z0-9_-])`, "i").test(body);
}

export function EntryRow({
  entry,
  activeTags,
  checkable,
  showTime,
  hideTags,
  highlighted,
  activeMentions,
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
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(entry.raw);
  const [burst, setBurst] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const burstTimer = useRef<number | null>(null);

  const done = !!entry.done;

  // Fire a one-shot celebration burst only when crossing into "done".
  const handleToggleDone = () => {
    if (!done) {
      if (burstTimer.current) window.clearTimeout(burstTimer.current);
      setBurst(false);
      requestAnimationFrame(() => setBurst(true));
      burstTimer.current = window.setTimeout(() => setBurst(false), 720);
    }
    onToggleDone(entry.id);
  };

  useEffect(() => () => {
    if (burstTimer.current) window.clearTimeout(burstTimer.current);
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
  const handleDelete = () => {
    if (config.ui.confirmOnDelete) setConfirming(true);
    else onDelete(entry.id);
  };

  if (editing) {
    return (
      <div
        className={`row row-editing${highlighted ? " row-highlight" : ""}`}
        data-entry-id={entry.id}
      >
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

  return (
    <div
      className={`row${done ? " row-done" : ""}${entry.pinned ? " row-pinned" : ""}${
        highlighted ? " row-highlight" : ""
      }`}
      data-entry-id={entry.id}
    >
      {checkable ? (
        <button
          className={`check${done ? " check-on" : ""}${burst ? " check-burst" : ""}${
            burst && entry.focused ? " check-burst-big" : ""
          }`}
          onClick={handleToggleDone}
          title={done ? "Mark not done" : "Mark done"}
          aria-pressed={done}
          aria-label={done ? "Completed" : "Mark done"}
        >
          {done && <span className="check-tick">✓</span>}
          {burst && (
            <span className="burst" aria-hidden="true">
              <span className="burst-ring" />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="burst-particle"
                  style={{ ["--a" as string]: `${i * 60}deg` }}
                />
              ))}
            </span>
          )}
        </button>
      ) : (
        <span className="bullet" aria-hidden="true" />
      )}

      <div className="row-line">
        {/* Leading chips only for tags NOT present inline in the body (e.g.
            older entries whose stored body had tags stripped). New entries
            render their /tags inline within the message. */}
        {!hideTags &&
          entry.tags
            .filter((t) => !tagInBody(entry.body, t))
            .map((t) => (
              <Fragment key={t}>
                <TagChip tag={t} active={activeTags.includes(t)} onClick={onTagClick} />{" "}
              </Fragment>
            ))}
        {entry.body && (
          <span className="row-body">
            {renderMarkdown(entry.body, {
              onMention: onMentionClick,
              activeMentions,
              onTag: onTagClick,
              activeTags,
              hideTags,
            })}
          </span>
        )}
        {entry.edited && (
          <span className="edited-flag" title="edited">
            {" "}
            ✎
          </span>
        )}
        {entry.isMine === false && entry.authorName && (
          <span className="row-author" title={`Added by ${entry.authorName}`}>
            by {entry.authorName}
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
            <div className="row-actions">
              {onMoveToday && (
                <button
                  className="icon-btn"
                  title="Move to today"
                  onClick={() => onMoveToday(entry.id)}
                >
                  ▲
                </button>
              )}
              {onUnschedule && (
                <button
                  className="icon-btn icon-scheduled"
                  title="Scheduled for today — move back to its logged day"
                  onClick={() => onUnschedule(entry.id)}
                >
                  ▲
                </button>
              )}
              {onSetFocus && (
                <button
                  className={`icon-btn${entry.focused ? " icon-focused" : ""}`}
                  title={entry.focused ? "Clear right now" : "Set as right now"}
                  aria-pressed={!!entry.focused}
                  onClick={() => onSetFocus(entry.id)}
                >
                  {entry.focused ? "◉" : "◎"}
                </button>
              )}
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
