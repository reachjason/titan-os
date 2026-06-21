import type { Entry } from "../types";

interface Props {
  entry: Entry;
  /** Open the single-task modal. */
  onOpen: () => void;
  /** Clear the "right now" (toggles the focus flag off). */
  onClear: () => void;
}

/**
 * One-line "right now" bar: the single focus task, sitting at the very top of
 * the workspace (above the pinned tray) in both list and board views.
 */
export function NowNotch({ entry, onOpen, onClear }: Props) {
  return (
    <div className="now-notch">
      <span className="now-glyph" aria-hidden="true">
        ◉
      </span>
      <span className="now-label">right now</span>
      <button className="now-task" onClick={onOpen} title="Open the right-now task">
        {entry.body.trim() || "(empty)"}
      </button>
      <button
        className="now-clear"
        onClick={onClear}
        title="Clear right now"
        aria-label="Clear right now"
      >
        ✕
      </button>
    </div>
  );
}
