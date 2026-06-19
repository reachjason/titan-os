import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { COMMANDS, getCommand } from "../commands/registry";
import { chipColor } from "../commands/tagColors";
import { useCurrentTheme } from "../store/ThemeContext";
import { activeTagFragment, activeMentionFragment } from "../lib/parse";
import { config } from "../config";

export interface Person {
  id: string;
  firstName: string;
  firstNameKey: string;
  name: string;
  image?: string;
  isMe?: boolean;
}

interface Props {
  onSubmit: (raw: string) => void;
  /** All tag names ever used, for autocomplete suggestions. */
  knownTags: string[];
  /** All users, for @mention autocomplete. */
  people: Person[];
  /** Raw text of every entry, oldest → newest, for ↑/↓ history recall. */
  history: string[];
}

export interface TerminalBarHandle {
  focus: () => void;
}

export const TerminalBar = forwardRef<TerminalBarHandle, Props>(
  ({ onSubmit, knownTags, people, history }, ref) => {
    const theme = useCurrentTheme();
    const [value, setValue] = useState("");
    const [sel, setSel] = useState(0);
    const [histPos, setHistPos] = useState(0);
    // The in-progress draft, stashed when you step into history so ↓ restores it.
    const draftRef = useRef("");
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    // Two autocomplete modes: /tags and @people. At most one is active (whichever
    // token the caret is currently inside).
    const tagFragment = activeTagFragment(value);
    const mentionFragment = activeMentionFragment(value);

    const tagSuggestions =
      tagFragment !== null
        ? Array.from(new Set([...COMMANDS.map((c) => c.name), ...knownTags]))
            // "done" is applied automatically when a task is checked, not typed,
            // so don't suggest it (typing /do should never offer only /done).
            .filter((t) => t !== "done" && t.startsWith(tagFragment) && t !== tagFragment)
            .slice(0, 6)
        : [];

    const peopleSuggestions =
      mentionFragment !== null
        ? // "@all" pseudo-person (mentions everyone) shown first, then real users.
          [
            {
              id: "__all__",
              firstName: "all",
              firstNameKey: "all",
              name: "Everyone",
              isAll: true,
            } as Person & { isAll?: boolean },
            ...people,
          ]
            .filter((p) => p.firstNameKey.startsWith(mentionFragment))
            .slice(0, 6)
        : [];

    const mode: "tag" | "people" | null =
      mentionFragment !== null && peopleSuggestions.length > 0
        ? "people"
        : tagSuggestions.length > 0
        ? "tag"
        : null;

    const count = mode === "people" ? peopleSuggestions.length : tagSuggestions.length;

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

    const applyTag = (tag: string) => {
      setValue((v) => v.replace(/\/([a-z0-9_-]*)$/i, `/${tag} `));
      setSel(0);
      requestAnimationFrame(autoSize);
      inputRef.current?.focus();
    };
    const applyPerson = (p: Person) => {
      setValue((v) => v.replace(/@([a-z0-9_-]*)$/i, `@${p.firstName} `));
      setSel(0);
      requestAnimationFrame(autoSize);
      inputRef.current?.focus();
    };
    const applyCurrent = () => {
      if (mode === "people") applyPerson(peopleSuggestions[sel]);
      else if (mode === "tag") applyTag(tagSuggestions[sel]);
    };

    const submit = () => {
      if (!value.trim()) return;
      onSubmit(value);
      setValue("");
      setSel(0);
      setHistPos(0);
      draftRef.current = "";
      reset();
    };

    const recall = (pos: number) => {
      const clamped = Math.max(0, Math.min(pos, history.length));
      // Stepping into history from a draft → stash it so ↓ can bring it back.
      if (histPos === 0 && clamped > 0) draftRef.current = value;
      setHistPos(clamped);
      setValue(clamped === 0 ? draftRef.current : history[history.length - clamped]);
      setSel(0);
      requestAnimationFrame(autoSize);
    };

    return (
      <div className="terminal-wrap">
        {mode === "tag" && (
          <ul className="suggest">
            {tagSuggestions.map((t, i) => {
              const c = chipColor(t, theme);
              const hint = getCommand(t)?.hint ?? "custom tag";
              return (
                <li
                  key={t}
                  className={i === sel ? "suggest-active" : ""}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyTag(t);
                  }}
                >
                  <span className="chip" style={{ background: c.bg, color: c.fg }}>
                    <span className="chip-slash">/</span>
                    {t}
                  </span>
                  <span className="suggest-hint">{hint}</span>
                </li>
              );
            })}
          </ul>
        )}
        {mode === "people" && (
          <ul className="suggest">
            {peopleSuggestions.map((p, i) => (
              <li
                key={p.id}
                className={i === sel ? "suggest-active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyPerson(p);
                }}
              >
                {(p as Person & { isAll?: boolean }).isAll ? (
                  <span className="suggest-avatar suggest-avatar-fallback" aria-hidden="true">
                    ∗
                  </span>
                ) : p.image ? (
                  <img className="suggest-avatar" src={p.image} alt="" />
                ) : (
                  <span className="suggest-avatar suggest-avatar-fallback">
                    {p.firstName[0]?.toUpperCase()}
                  </span>
                )}
                <span className="suggest-person">@{p.firstName}</span>
                <span className="suggest-hint">
                  {(p as Person & { isAll?: boolean }).isAll
                    ? "everyone"
                    : p.isMe
                    ? "you"
                    : p.name}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="terminal-bar">
          <span className="prompt-glyph">&gt;</span>
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
              // History recall, terminal-style: ↑ on the first line pulls an
              // older entry, ↓ on the last line a newer one (in a single-line
              // draft that's always, so it just works). The current draft is
              // stashed on entry and restored when ↓ returns past the newest
              // entry, so recalling never loses what you were typing. Move the
              // caret to the start with ← / Home (those are never intercepted).
              const firstNl = value.indexOf("\n");
              const lastNl = value.lastIndexOf("\n");
              const onFirstLine = firstNl === -1 || el.selectionStart <= firstNl;
              const onLastLine = el.selectionStart > lastNl;
              if (e.key === "ArrowDown" && mode) {
                e.preventDefault();
                setSel((s) => (s + 1) % count);
              } else if (e.key === "ArrowUp" && mode) {
                e.preventDefault();
                setSel((s) => (s - 1 + count) % count);
              } else if (e.key === "ArrowUp" && onFirstLine) {
                // first line → recall an older entry
                e.preventDefault();
                recall(histPos + 1);
              } else if (e.key === "ArrowDown" && histPos > 0 && onLastLine) {
                // last line → recall a newer entry (recall(0) restores the draft)
                e.preventDefault();
                recall(histPos - 1);
              } else if (e.key === "Tab" && mode) {
                // Tab completes the highlighted tag/person (without leaving the bar).
                e.preventDefault();
                applyCurrent();
              } else if (e.key === "Enter" && !e.shiftKey) {
                // Enter submits; Shift+Enter inserts a newline (default).
                e.preventDefault();
                if (mode) applyCurrent();
                else submit();
              } else if (e.key === config.shortcuts.clearFilters) {
                // Esc steps out of the bar but keeps the draft text intact.
                e.preventDefault();
                setSel(0);
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
