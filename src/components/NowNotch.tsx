import type { Entry } from "../types";

interface Props {
  /** The single focus task, or undefined when nothing is set. */
  entry?: Entry;
  /** Open the single-task modal. */
  onOpen: () => void;
  /** Clear the "right now" (toggles the focus flag off). */
  onClear: () => void;
  /** Empty state: nudge to capture the one thing (focuses the log bar). */
  onCompose: () => void;
}

/**
 * The "right now" hero card at the very top of the workspace: the single focus
 * task, shown large. When nothing is focused, an empty prompt card holds the
 * slot so there's always a pull toward committing to one thing.
 */
export function NowNotch({ entry, onOpen, onClear, onCompose }: Props) {
  if (!entry) {
    return (
      <button
        className="now-card now-card-empty"
        onClick={onCompose}
        title="Capture the one thing to focus on"
      >
        <span className="now-glyph" aria-hidden="true">
          ◎
        </span>
        <span className="now-card-body">
          <span className="now-label">right now</span>
          <span className="now-empty-prompt">What’s the one thing right now?</span>
        </span>
      </button>
    );
  }

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
