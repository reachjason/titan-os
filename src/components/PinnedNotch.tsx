import type { Entry } from "../types";
import { EntryRow } from "./EntryRow";
import { isTask } from "../store/usePrefs";

interface Props {
  entries: Entry[];
  activeTags: string[];
  taskTags: string[];
  showTime: boolean;
  showTags: boolean;
  onTagClick: (tag: string) => void;
  onEdit: (id: string, raw: string) => void;
  onDelete: (id: string) => void;
  onToggleDone: (id: string) => void;
  onTogglePin: (id: string) => void;
}

/** Always-visible tray of pinned tasks, sitting just under the header. */
export function PinnedNotch({
  entries,
  activeTags,
  taskTags,
  showTime,
  showTags,
  onTagClick,
  onEdit,
  onDelete,
  onToggleDone,
  onTogglePin,
}: Props) {
  if (entries.length === 0) return null;
  return (
    <div className="pin-notch">
      <div className="pin-notch-inner">
        {entries.map((e) => (
          <EntryRow
            key={`pin:${e.id}`}
            entry={e}
            activeTags={activeTags}
            checkable={isTask(e.tags, taskTags) || !!e.done}
            showTime={showTime}
            hideTags={!showTags}
            onTagClick={onTagClick}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleDone={onToggleDone}
            onTogglePin={onTogglePin}
          />
        ))}
      </div>
    </div>
  );
}
