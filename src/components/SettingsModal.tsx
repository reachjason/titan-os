import { useEffect, useState } from "react";
import type { Prefs, Theme } from "../types";

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  prefs: Prefs;
  onToggleTimestamps: () => void;
  onAddTaskTag: (tag: string) => void;
  onRemoveTaskTag: (tag: string) => void;
  knownTags: string[];
  onExport: () => void;
  onImport: () => void;
  onShowHelp: () => void;
  onClose: () => void;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      className={`switch${on ? " switch-on" : ""}`}
      onClick={onClick}
      role="switch"
      aria-checked={on}
    >
      <span className="switch-knob" />
    </button>
  );
}

export function SettingsModal({
  theme,
  onToggleTheme,
  prefs,
  onToggleTimestamps,
  onAddTaskTag,
  onRemoveTaskTag,
  knownTags,
  onExport,
  onImport,
  onShowHelp,
  onClose,
}: Props) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addTag = () => {
    onAddTaskTag(draft);
    setDraft("");
  };

  const suggestions = knownTags.filter((t) => !prefs.taskTags.includes(t));

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="set-row">
          <div className="set-label">
            Dark mode
            <span className="set-sub">Switch between light and dark.</span>
          </div>
          <Toggle on={theme === "dark"} onClick={onToggleTheme} />
        </div>

        <div className="set-row">
          <div className="set-label">
            Show timestamps
            <span className="set-sub">Faint time on each row.</span>
          </div>
          <Toggle on={prefs.showTimestamps} onClick={onToggleTimestamps} />
        </div>

        <div className="set-block">
          <div className="set-label">
            Task tags
            <span className="set-sub">Entries with these tags get a checkbox.</span>
          </div>
          <div className="tasktag-chips">
            {prefs.taskTags.map((t) => (
              <button
                key={t}
                className="tasktag"
                onClick={() => onRemoveTaskTag(t)}
                title="Remove"
              >
                /{t} <span className="tasktag-x">✕</span>
              </button>
            ))}
          </div>
          <div className="tasktag-add">
            <input
              list="known-tags"
              className="tasktag-input"
              placeholder="add a tag…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <datalist id="known-tags">
              {suggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <button className="ghost-btn" onClick={addTag}>
              Add
            </button>
          </div>
        </div>

        <div className="set-divider" />

        <div className="set-actions">
          <button className="ghost-btn" onClick={onExport}>
            Export JSON
          </button>
          <button className="ghost-btn" onClick={onImport}>
            Import JSON
          </button>
          <button className="ghost-btn" onClick={onShowHelp}>
            Keyboard shortcuts
          </button>
        </div>
      </div>
    </div>
  );
}
