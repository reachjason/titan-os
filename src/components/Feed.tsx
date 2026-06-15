import { Fragment, useEffect, useMemo, useRef } from "react";
import type { Entry, SortMode } from "../types";
import { EntryRow } from "./EntryRow";
import { DateDivider } from "./DateDivider";
import { TagChip } from "./TagChip";
import { dayKey, dividerLabel } from "../lib/dates";
import { isTask } from "../store/usePrefs";
import { config } from "../config";

interface Props {
  entries: Entry[];
  sort: SortMode;
  query: string;
  activeTags: string[];
  filtering: boolean;
  taskTags: string[];
  showTime: boolean;
  onTagClick: (tag: string) => void;
  onEdit: (id: string, raw: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: (id: string) => void;
  onTogglePin: (id: string) => void;
}

const UNTAGGED = "untagged";

interface Item {
  key: string;
  entry: Entry;
  group: string;
}

function buildItems(entries: Entry[], sort: SortMode): Item[] {
  if (sort === "tag") {
    const pairs: { tag: string; entry: Entry }[] = [];
    for (const e of entries) {
      const tags = e.tags.length ? e.tags : [UNTAGGED];
      for (const t of tags) pairs.push({ tag: t, entry: e });
    }
    pairs.sort((a, b) => {
      const ta = a.tag === UNTAGGED ? "~" : a.tag;
      const tb = b.tag === UNTAGGED ? "~" : b.tag;
      return ta.localeCompare(tb) || a.entry.createdAt - b.entry.createdAt;
    });
    return pairs.map((p) => ({ key: `${p.tag}:${p.entry.id}`, entry: p.entry, group: p.tag }));
  }
  const sorted = [...entries].sort((a, b) =>
    sort === "desc" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
  );
  return sorted.map((e) => ({ key: e.id, entry: e, group: dayKey(e.createdAt) }));
}

export function Feed(props: Props) {
  const {
    entries,
    sort,
    query,
    activeTags,
    filtering,
    taskTags,
    showTime,
    onTagClick,
    onEdit,
    onDelete,
    onToggleDone,
    onTogglePin,
  } = props;

  const bottomRef = useRef<HTMLDivElement>(null);
  const byTag = sort === "tag";

  const pinned = useMemo(
    () => entries.filter((e) => e.pinned).sort((a, b) => a.createdAt - b.createdAt),
    [entries]
  );
  const rest = useMemo(() => entries.filter((e) => !e.pinned), [entries]);
  const items = useMemo(() => buildItems(rest, sort), [rest, sort]);

  const autoScroll = sort === "asc" && config.ui.autoScroll;
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [items.length, autoScroll]);

  // Shared row renderer so pinned + feed look identical.
  const renderRow = (entry: Entry) => (
    <EntryRow
      entry={entry}
      query={query}
      activeTags={activeTags}
      checkable={isTask(entry.tags, taskTags) || !!entry.done}
      showTime={showTime}
      onTagClick={onTagClick}
      onEdit={onEdit}
      onDelete={onDelete}
      onToggleDone={onToggleDone}
      onTogglePin={onTogglePin}
    />
  );

  if (entries.length === 0) {
    return (
      <div className="feed feed-empty">
        <p>
          {filtering
            ? "Nothing matches that filter."
            : "Nothing here yet. Capture a task below — try “/do ship the deck”."}
        </p>
      </div>
    );
  }

  let lastKey = "";
  return (
    <div className="feed">
      {pinned.map((e) => (
        <Fragment key={`pin:${e.id}`}>{renderRow(e)}</Fragment>
      ))}
      {pinned.length > 0 && items.length > 0 && <div className="pin-divider" />}

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
            {renderRow(it.entry)}
          </Fragment>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
