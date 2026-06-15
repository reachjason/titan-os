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

/** A renderable feed item: an entry plus the group it currently sits in. */
interface Item {
  key: string;
  entry: Entry;
  group: string;
}

/** Build the ordered, grouped list of items for the chosen sort mode. */
function buildItems(entries: Entry[], sort: SortMode): Item[] {
  if (sort === "tag") {
    // Each entry appears once under EVERY tag it carries.
    const pairs: { tag: string; entry: Entry }[] = [];
    for (const e of entries) {
      const tags = e.tags.length ? e.tags : [UNTAGGED];
      for (const t of tags) pairs.push({ tag: t, entry: e });
    }
    pairs.sort((a, b) => {
      const ta = a.tag === UNTAGGED ? "~" : a.tag; // untagged sinks last
      const tb = b.tag === UNTAGGED ? "~" : b.tag;
      return ta.localeCompare(tb) || a.entry.createdAt - b.entry.createdAt;
    });
    return pairs.map((p) => ({
      key: `${p.tag}:${p.entry.id}`,
      entry: p.entry,
      group: p.tag,
    }));
  }

  const sorted = [...entries].sort((a, b) =>
    sort === "desc" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
  );
  return sorted.map((e) => ({ key: e.id, entry: e, group: dayKey(e.createdAt) }));
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
  const items = useMemo(() => buildItems(entries, sort), [entries, sort]);
  const byTag = sort === "tag";

  // Only the chat view sticks to the bottom as new entries arrive.
  const autoScroll = sort === "asc" && config.ui.autoScroll;
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [items.length, autoScroll]);

  if (items.length === 0) {
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

  let lastKey = "";
  return (
    <div className="feed">
      {items.map((it) => {
        const showDivider = it.group !== lastKey;
        lastKey = it.group;
        return (
          <Fragment key={it.key}>
            {showDivider &&
              (byTag ? (
                <div className="tag-divider">
                  {it.group === UNTAGGED ? (
                    <span className="tag-divider-plain">untagged</span>
                  ) : (
                    <TagChip
                      tag={it.group}
                      active={activeTags.includes(it.group)}
                      onClick={onTagClick}
                    />
                  )}
                </div>
              ) : (
                <DateDivider label={dividerLabel(it.entry.createdAt)} />
              ))}
            <EntryRow
              entry={it.entry}
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
