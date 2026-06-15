import { Fragment, useEffect, useMemo, useRef } from "react";
import type { Entry, SortMode } from "../types";
import { EntryRow } from "./EntryRow";
import { DateDivider } from "./DateDivider";
import { TagChip } from "./TagChip";
import { dayKey, dividerLabel } from "../lib/dates";
import { config } from "../config";

interface Props {
  entries: Entry[];
  sort: SortMode;
  query: string;
  activeTags: string[];
  filtering: boolean;
  onTagClick: (tag: string) => void;
  onEdit: (id: string, raw: string) => void;
  onDelete: (id: string) => void;
}

const UNTAGGED = "untagged";

/** Order entries per the chosen sort mode. */
function order(entries: Entry[], sort: SortMode): Entry[] {
  const arr = [...entries];
  if (sort === "desc") arr.sort((a, b) => b.createdAt - a.createdAt);
  else if (sort === "tag")
    arr.sort((a, b) => {
      const ta = a.tags[0] ?? "~"; // untagged sinks to the end
      const tb = b.tags[0] ?? "~";
      return ta.localeCompare(tb) || a.createdAt - b.createdAt;
    });
  else arr.sort((a, b) => a.createdAt - b.createdAt); // "asc" — chat default
  return arr;
}

export function Feed({
  entries,
  sort,
  query,
  activeTags,
  filtering,
  onTagClick,
  onEdit,
  onDelete,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const ordered = useMemo(() => order(entries, sort), [entries, sort]);

  // Only the chat view sticks to the bottom as new entries arrive.
  const autoScroll = sort === "asc" && config.ui.autoScroll;
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [ordered.length, autoScroll]);

  if (ordered.length === 0) {
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

  const byTag = sort === "tag";
  const keyOf = (e: Entry) => (byTag ? e.tags[0] ?? UNTAGGED : dayKey(e.createdAt));

  let lastKey = "";
  return (
    <div className="feed">
      {ordered.map((e) => {
        const k = keyOf(e);
        const showDivider = k !== lastKey;
        lastKey = k;
        return (
          <Fragment key={e.id}>
            {showDivider &&
              (byTag ? (
                <div className="tag-divider">
                  {k === UNTAGGED ? (
                    <span className="tag-divider-plain">untagged</span>
                  ) : (
                    <TagChip tag={k} active={activeTags.includes(k)} onClick={onTagClick} />
                  )}
                </div>
              ) : (
                <DateDivider label={dividerLabel(e.createdAt)} />
              ))}
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
