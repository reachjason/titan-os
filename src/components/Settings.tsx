import { useEffect, useRef, useState } from "react";
import type { Theme } from "../types";

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  onExport: () => void;
  onImport: () => void;
  onHelp: () => void;
}

export function Settings({ theme, onToggleTheme, onExport, onImport, onHelp }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="settings" ref={wrapRef}>
      <button
        className="icon-btn settings-trigger"
        title="Settings"
        aria-label="Settings"
        onClick={() => setOpen((o) => !o)}
      >
        ⚙
      </button>
      {open && (
        <div className="settings-menu" role="menu">
          <button
            className="settings-item"
            onClick={() => {
              onToggleTheme();
            }}
          >
            <span>{theme === "light" ? "☾" : "☀"}</span>
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
          <button
            className="settings-item"
            onClick={() => {
              setOpen(false);
              onExport();
            }}
          >
            <span>↓</span>
            Export JSON
          </button>
          <button
            className="settings-item"
            onClick={() => {
              setOpen(false);
              onImport();
            }}
          >
            <span>↑</span>
            Import JSON
          </button>
          <button
            className="settings-item"
            onClick={() => {
              setOpen(false);
              onHelp();
            }}
          >
            <span>?</span>
            Keyboard shortcuts
          </button>
        </div>
      )}
    </div>
  );
}
