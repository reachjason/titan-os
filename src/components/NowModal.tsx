import { useEffect } from "react";
import type { Entry } from "../types";
import { EntryRow } from "./EntryRow";

interface Props {
  entry: Entry;
  /** This entry carries a task tag → show a checkbox. */
  checkable: boolean;
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

/** Single-task overlay: shows only the "right now" task, reusing EntryRow. */
export function NowModal({
  entry,
  checkable,
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay modal-overlay-centered" onMouseDown={onClose}>
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
        <EntryRow
          entry={entry}
          activeTags={activeTags}
          activeMentions={activeMentions}
          checkable={checkable}
          showTime
          onTagClick={onTagClick}
          onMentionClick={onMentionClick}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleDone={onToggleDone}
          onTogglePin={onTogglePin}
          onSetFocus={onSetFocus}
        />
      </div>
    </div>
  );
}
