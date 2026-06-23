import type { Entry } from "../types";

interface Props {
  entry: Entry;
  /** Open the single-task modal. */
  onOpen: () => void;
  /** Clear the "right now" (toggles the focus flag off). */
  onClear: () => void;
}

/**
 * The "right now" hero card at the very top of the workspace: the single focus
 * task, shown large. Rendered only when a task is focused.
 */
export function NowNotch({ entry, onOpen, onClear }: Props) {
  return (
    <div className="now-card">
      <span className="now-glyph now-glyph-live" aria-hidden="true">
        ◉
      </span>
      <button className="now-card-body" onClick={onOpen} title="Open the right-now task">
        <span className="now-label">right now</span>
        <span className="now-task-text">{entry.body.trim() || "(empty)"}</span>
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
