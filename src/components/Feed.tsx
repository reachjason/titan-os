import { Fragment, useEffect, useRef } from "react";
import type { Entry } from "../types";
import { EntryRow } from "./EntryRow";
import { DateDivider } from "./DateDivider";
import { dayKey, dividerLabel } from "../lib/dates";
import { config } from "../config";

interface Props {
  entries: Entry[];
  query: string;
  activeTags: string[];
  filtering: boolean;
  onTagClick: (tag: string) => void;
  onEdit: (id: string, raw: string) => void;
  onDelete: (id: string) => void;
}

export function Feed({
  entries,
  query,
  activeTags,
  filtering,
  onTagClick,
  onEdit,
  onDelete,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const count = entries.length;

  // Stick to the bottom as new entries arrive (WhatsApp-style).
  useEffect(() => {
    if (config.ui.autoScroll) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [count]);

  if (entries.length === 0) {
    return (
      <div className="feed feed-empty">
        <p>
          {filtering
            ? "Nothing matches that filter."
            : "Your inbox is empty. Type below — try “/todo ship the build”."}
        </p>
      </div>
    );
  }

  let lastDay = "";
  return (
    <div className="feed">
      {entries.map((e) => {
        const k = dayKey(e.createdAt);
        const showDivider = k !== lastDay;
        lastDay = k;
        return (
          <Fragment key={e.id}>
            {showDivider && <DateDivider label={dividerLabel(e.createdAt)} />}
            <EntryRow
              entry={e}
              query={query}
              activeTags={activeTags}
              onTagClick={onTagClick}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </Fragment>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
