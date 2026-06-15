import { useEffect } from "react";

interface Props {
  onClose: () => void;
}

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Search" },
  { keys: ["/"], label: "Focus the log bar" },
  { keys: ["F"], label: "Focus mode — pinned only" },
  { keys: ["H", "C"], label: "Hide timestamps  ·  S C to show" },
  { keys: ["H", "T"], label: "Hide tags  ·  S T to show" },
  { keys: ["?"], label: "Show this help" },
  { keys: ["Esc"], label: "Clear filters · cancel · close" },
  { keys: ["Enter"], label: "Log the entry  ·  Shift+Enter newline" },
  { keys: ["↑", "↓"], label: "Previous / next entry (in the log bar)" },
  { keys: ["click tag"], label: "Filter — click more tags to combine" },
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
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Keyboard shortcuts</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <ul className="shortcut-list">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="shortcut-row">
              <span className="shortcut-keys">
                {s.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
              <span className="shortcut-label">{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
