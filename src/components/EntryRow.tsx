import { Fragment, useEffect, useRef, useState } from "react";
import type { Entry } from "../types";
import { TagChip } from "./TagChip";
import { timeLabel } from "../lib/dates";
import { config } from "../config";

interface Props {
  entry: Entry;
  query: string;
  activeTags: string[];
  onTagClick: (tag: string) => void;
  onEdit: (id: string, raw: string) => void;
  onDelete: (id: string) => void;
}

/** Split text on a case-insensitive query and wrap matches in <mark>. */
function highlight(text: string, query: string) {
  const q = query.trim().replace(/^\//, "");
  if (!q) return text;
  const parts: React.ReactNode[] = [];
  let i = 0;
  let from = text.toLowerCase().indexOf(q.toLowerCase());
  while (from !== -1) {
    parts.push(text.slice(i, from));
    parts.push(<mark key={i}>{text.slice(from, from + q.length)}</mark>);
    i = from + q.length;
    from = text.toLowerCase().indexOf(q.toLowerCase(), i);
  }
  parts.push(text.slice(i));
  return parts;
}

export function EntryRow({ entry, query, activeTags, onTagClick, onEdit, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
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
    if (!config.ui.confirmOnDelete || confirm("Delete this entry?")) onDelete(entry.id);
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

  return (
    <div className="row">
      {/* Real spaces between fields so copy/paste reads: "HH:MM /tag text". */}
      <div className="row-line">
        <span className="row-time">{timeLabel(entry.createdAt)}</span>{" "}
        {entry.tags.map((t) => (
          <Fragment key={t}>
            <TagChip tag={t} active={activeTags.includes(t)} onClick={onTagClick} />{" "}
          </Fragment>
        ))}
        {entry.body && <span className="row-body">{highlight(entry.body, query)}</span>}
        {entry.edited && (
          <span className="edited-flag" title="edited">
            {" "}
            ✎
          </span>
        )}
      </div>
      <div className="row-actions">
        <button className="icon-btn" title="Edit" onClick={() => setEditing(true)}>
          ✎
        </button>
        <button className="icon-btn icon-danger" title="Delete" onClick={handleDelete}>
          ✕
        </button>
      </div>
    </div>
  );
}
