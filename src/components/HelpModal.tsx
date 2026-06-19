import { useEffect } from "react";

interface Props {
  onClose: () => void;
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["↵"], label: "Log & clear" },
  { keys: ["/"], label: "Open tag menu" },
  { keys: ["f"], label: "Filter menu" },
  { keys: ["⇧F"], label: "Spotlight search" },
  { keys: ["1"], label: "List view" },
  { keys: ["2"], label: "Board view" },
  { keys: ["esc"], label: "Dismiss / close" },
  { keys: ["v"], label: "List / Board" },
  { keys: ["p"], label: "Focus pinned" },
  { keys: ["⇧P"], label: "Expand / minimize pinned" },
  { keys: ["t", "c"], label: "Toggle timestamps" },
  { keys: ["t", "t"], label: "Toggle tags" },
  { keys: ["click ☑"], label: "Complete task" },
  { keys: ["click"], label: "Move board card" },
  { keys: ["↑", "↓"], label: "History (log bar)" },
  { keys: ["⌘Z"], label: "Undo last action" },
  { keys: ["⇧⌘Z"], label: "Redo last action" },
  { keys: ["?"], label: "This sheet" },
];

export function HelpModal({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay modal-overlay-centered" onMouseDown={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">Keyboard shortcuts</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="shortcut-grid">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="shortcut-row">
              <span className="shortcut-label">{s.label}</span>
              <span>
                {s.keys.map((k, i) => (
                  <kbd key={i}>{k}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="shortcut-foot">
          press <span className="spot-key">?</span> anytime · esc to close
        </div>
      </div>
    </div>
  );
}
