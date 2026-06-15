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
    const [histPos, setHistPos] = useState(0);
    const inputRef = useRef<HTMLTextAreaElement>(null);

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

    // Grow the textarea to fit its content (capped by CSS max-height).
    const autoSize = () => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    const reset = () => {
      const el = inputRef.current;
      if (el) el.style.height = "auto";
    };

    const applySuggestion = (tag: string) => {
      setValue((v) => v.replace(/\/([a-z0-9_-]*)$/i, `/${tag} `));
      setSel(0);
      requestAnimationFrame(autoSize);
      inputRef.current?.focus();
    };

    const submit = () => {
      if (!value.trim()) return;
      onSubmit(value);
      setValue("");
      setSel(0);
      setHistPos(0);
      reset();
    };

    const recall = (pos: number) => {
      const clamped = Math.max(0, Math.min(pos, history.length));
      setHistPos(clamped);
      setValue(clamped === 0 ? "" : history[history.length - clamped]);
      requestAnimationFrame(autoSize);
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
          <textarea
            ref={inputRef}
            className="terminal-input"
            value={value}
            rows={1}
            placeholder={config.ui.placeholder}
            spellCheck={false}
            autoFocus
            onChange={(e) => {
              setValue(e.target.value);
              setSel(0);
              setHistPos(0);
              autoSize();
            }}
            onKeyDown={(e) => {
              const el = e.currentTarget;
              if (e.key === "ArrowDown" && suggestions.length > 0) {
                e.preventDefault();
                setSel((s) => (s + 1) % suggestions.length);
              } else if (e.key === "ArrowUp" && suggestions.length > 0) {
                e.preventDefault();
                setSel((s) => (s - 1 + suggestions.length) % suggestions.length);
              } else if (e.key === "ArrowUp" && el.selectionStart === 0) {
                // caret at very start → recall older entry
                e.preventDefault();
                recall(histPos + 1);
              } else if (e.key === "ArrowDown" && el.selectionStart === value.length) {
                // caret at very end → recall newer entry
                e.preventDefault();
                recall(histPos - 1);
              } else if (e.key === "Enter" && !e.shiftKey) {
                // Enter submits; Shift+Enter inserts a newline (default).
                e.preventDefault();
                if (suggestions.length > 0) applySuggestion(suggestions[sel]);
                else submit();
              } else if (e.key === config.shortcuts.clearFilters) {
                // Esc clears the line and moves focus out of the bar.
                e.preventDefault();
                setValue("");
                setSel(0);
                setHistPos(0);
                reset();
                el.blur();
              }
            }}
          />
          <button
            className="send-btn"
            onClick={submit}
            title={`${config.ui.logLabel} (Enter · Shift+Enter for newline)`}
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
