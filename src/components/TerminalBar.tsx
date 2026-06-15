import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { COMMANDS } from "../commands/registry";
import { activeTagFragment } from "../lib/parse";
import { config } from "../config";

interface Props {
  onSubmit: (raw: string) => void;
  /** All tag names ever used, for autocomplete suggestions. */
  knownTags: string[];
  /** Raw text of every entry, oldest → newest, for ↑/↓ history recall. */
  history: string[];
}

export interface TerminalBarHandle {
  focus: () => void;
}

export const TerminalBar = forwardRef<TerminalBarHandle, Props>(
  ({ onSubmit, knownTags, history }, ref) => {
    const [value, setValue] = useState("");
    const [sel, setSel] = useState(0);
    // 0 = composing fresh input; n = nth entry from the end (1 = most recent).
    const [histPos, setHistPos] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const fragment = activeTagFragment(value);
    const suggestions =
      fragment !== null
        ? Array.from(new Set([...COMMANDS.map((c) => c.name), ...knownTags]))
            .filter((t) => t.startsWith(fragment) && t !== fragment)
            .slice(0, 6)
        : [];

    const applySuggestion = (tag: string) => {
      setValue((v) => v.replace(/\/([a-z0-9_-]*)$/i, `/${tag} `));
      setSel(0);
      inputRef.current?.focus();
    };

    const submit = () => {
      if (!value.trim()) return;
      onSubmit(value);
      setValue("");
      setSel(0);
      setHistPos(0);
    };

    // Walk the entry history like a shell: ↑ older, ↓ newer, 0 = blank line.
    const recall = (pos: number) => {
      const clamped = Math.max(0, Math.min(pos, history.length));
      setHistPos(clamped);
      setValue(clamped === 0 ? "" : history[history.length - clamped]);
    };

    return (
      <div className="terminal-wrap">
        {suggestions.length > 0 && (
          <ul className="suggest">
            {suggestions.map((t, i) => (
              <li
                key={t}
                className={i === sel ? "suggest-active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(t);
                }}
              >
                <span className="chip-slash">/</span>
                {t}
              </li>
            ))}
          </ul>
        )}
        <div className="terminal-bar">
          <span className="prompt-glyph">›</span>
          <input
            ref={inputRef}
            className="terminal-input"
            value={value}
            placeholder={config.ui.placeholder}
            spellCheck={false}
            autoFocus
            onChange={(e) => {
              setValue(e.target.value);
              setSel(0);
              setHistPos(0); // typing breaks out of history browsing
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && suggestions.length > 0) {
                e.preventDefault();
                setSel((s) => (s + 1) % suggestions.length);
              } else if (e.key === "ArrowUp" && suggestions.length > 0) {
                e.preventDefault();
                setSel((s) => (s - 1 + suggestions.length) % suggestions.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                recall(histPos + 1); // older
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                recall(histPos - 1); // newer
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (suggestions.length > 0) applySuggestion(suggestions[sel]);
                else submit();
              } else if (e.key === config.shortcuts.clearFilters) {
                // Esc clears & cancels the line (and any open suggestions).
                e.preventDefault();
                setValue("");
                setSel(0);
                setHistPos(0);
              }
            }}
          />
          <button
            className="send-btn"
            onClick={submit}
            title={`${config.ui.logLabel} (Enter)`}
            aria-label={config.ui.logLabel}
          >
            ↵
          </button>
        </div>
      </div>
    );
  }
);

TerminalBar.displayName = "TerminalBar";
