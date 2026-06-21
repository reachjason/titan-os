import type { Entry } from "../types";
import { EntryRow } from "./EntryRow";
import { isTask } from "../store/usePrefs";

interface Props {
  entries: Entry[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  activeTags: string[];
  activeMentions: string[];
  taskTags: string[];
  showTime: boolean;
  showTags: boolean;
  highlightedEntryId?: string | null;
  onTagClick: (tag: string) => void;
  onMentionClick: (name: string) => void;
  onEdit: (id: string, raw: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: (id: string) => void;
  onTogglePin: (id: string) => void;
  onSetFocus: (id: string) => void;
}

/** Always-visible tray of pinned tasks, sitting just under the header. */
export function PinnedNotch({
  entries,
  collapsed,
  onToggleCollapsed,
  activeTags,
  activeMentions,
  taskTags,
  showTime,
  showTags,
  highlightedEntryId,
  onTagClick,
  onMentionClick,
  onEdit,
  onDelete,
  onToggleDone,
  onTogglePin,
  onSetFocus,
}: Props) {
  if (entries.length === 0) return null;
  return (
    <div className={`pin-notch${collapsed ? " pin-notch-collapsed" : ""}`}>
      <button
        className="pin-toggle"
        onClick={onToggleCollapsed}
        title={collapsed ? "Expand pinned (Shift+P)" : "Minimize pinned (Shift+P)"}
        aria-expanded={!collapsed}
      >
        <span className="pin-toggle-star">★</span>
        <span className="pin-toggle-count">
          {entries.length} pinned
        </span>
        <span className="pin-toggle-chev">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && (
        <div className="pin-notch-inner">
          {entries.map((e) => (
          <EntryRow
            key={`pin:${e.id}`}
            entry={e}
            activeTags={activeTags}
            activeMentions={activeMentions}
            checkable={isTask(e.tags, taskTags) || !!e.done}
            showTime={showTime}
            hideTags={!showTags}
            highlighted={e.id === highlightedEntryId}
            onTagClick={onTagClick}
            onMentionClick={onMentionClick}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleDone={onToggleDone}
            onTogglePin={onTogglePin}
            onSetFocus={onSetFocus}
          />
          ))}
        </div>
      )}
    </div>
  );
}
