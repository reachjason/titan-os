import { useEffect, useMemo, useRef, useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEntries } from "./store/useEntries";
import { useTheme } from "./store/useTheme";
import { usePrefs } from "./store/usePrefs";
import { ThemeContext } from "./store/ThemeContext";
import { Feed } from "./components/Feed";
import { TerminalBar, type TerminalBarHandle } from "./components/TerminalBar";
import { SettingsModal } from "./components/SettingsModal";
import { HelpModal } from "./components/HelpModal";
import { PinnedNotch } from "./components/PinnedNotch";
import { Board } from "./components/Board";
import { TagChip } from "./components/TagChip";
import { Spotlight } from "./components/Spotlight";
import { AccountMenu } from "./components/AccountMenu";
import { SignIn } from "./components/SignIn";
import { Toast } from "./components/Toast";
import { config } from "./config";
import type { Entry, FilterState, SortMode, ViewMode } from "./types";

/** Gate the app on auth state: sign-in screen when logged out, workspace when in. */
export default function App() {
  return (
    <>
      <AuthLoading>
        <div className="auth-loading">Loading…</div>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <Workspace />
      </Authenticated>
    </>
  );
}

/** Sort/group modes shown as bare monospace glyphs (design order: ↓ ↑ # ⇅). */
const SORTS: { mode: SortMode; icon: string; label: string }[] = [
  { mode: "desc", icon: "↓", label: "Newest at top" },
  { mode: "asc", icon: "↑", label: "Newest at bottom" },
  { mode: "tag", icon: "#", label: "Group by tag" },
  { mode: "manual", icon: "⇅", label: "Manual order (drag to reorder)" },
];

/** Restore the saved view (sort + match + list/board) so the last screen persists. */
function loadView(): { sort: SortMode; match: "any" | "all"; view: ViewMode } | null {
  try {
    const raw = localStorage.getItem(config.storage.viewKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function Workspace() {
  const { entries, add, update, remove, toggleDone, togglePin, moveCard, setOrder, importEntries } =
    useEntries();
  const { theme, toggle } = useTheme();
  const { prefs, toggleTimestamps, toggleTags, addTaskTag, removeTaskTag } = usePrefs();
  const currentUser = useQuery(api.users.currentUser);
  const avatarInitial = (currentUser?.name || currentUser?.email || "?")[0].toUpperCase();
  const [filter, setFilter] = useState<FilterState>(() => ({
    tags: [],
    match: loadView()?.match ?? "any",
    query: "",
  }));
  const [sort, setSort] = useState<SortMode>(() => loadView()?.sort ?? "asc");
  const [view, setView] = useState<ViewMode>(() => loadView()?.view ?? "list");
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [spotOpen, setSpotOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const barRef = useRef<TerminalBarHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Pending leader key for two-stroke chords (t c / t t), reset after a short window.
  const chordRef = useRef<string | null>(null);
  const chordTimer = useRef<number | undefined>(undefined);

  const flash = (msg: string) => setToast(msg);

  // Persist the view (sort + match + list/board) across reloads.
  useEffect(() => {
    localStorage.setItem(
      config.storage.viewKey,
      JSON.stringify({ sort, match: filter.match, view })
    );
  }, [sort, filter.match, view]);

  const knownTags = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [entries]);

  const history = useMemo(() => entries.map((e) => e.raw), [entries]);
  const pinned = useMemo(() => entries.filter((e) => e.pinned), [entries]);

  const filtered = useMemo(() => {
    // Tag filter only — free-text search now lives in the Spotlight palette.
    return entries.filter((e) => {
      return (
        filter.tags.length === 0 ||
        (filter.match === "all"
          ? filter.tags.every((t) => e.tags.includes(t))
          : filter.tags.some((t) => e.tags.includes(t)))
      );
    });
  }, [entries, filter]);

  const filtering = filter.tags.length > 0;

  const toggleTag = (tag: string) =>
    setFilter((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));

  const clearFilters = () => setFilter({ tags: [], match: filter.match, query: "" });
  const toggleMatch = () =>
    setFilter((f) => ({ ...f, match: f.match === "any" ? "all" : "any" }));

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (e.key === "Escape") {
        if (spotOpen) setSpotOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (helpOpen) setHelpOpen(false);
        else if (accountOpen) setAccountOpen(false);
        else if (focus) setFocus(false);
        else if (filtering) clearFilters();
        return;
      }
      if (typing) return;
      const k = e.key.toLowerCase();

      // Shift+F → Spotlight search.
      if (e.shiftKey && k === config.shortcuts.search) {
        e.preventDefault();
        setSpotOpen(true);
        return;
      }

      // Resolve a pending "t" chord: t c → toggle timestamps, t t → toggle tags.
      if (chordRef.current === "t") {
        chordRef.current = null;
        window.clearTimeout(chordTimer.current);
        if (k === "c") {
          e.preventDefault();
          toggleTimestamps();
          return;
        }
        if (k === "t") {
          e.preventDefault();
          toggleTags();
          return;
        }
        // not a chord completion — fall through and treat k normally
      }
      // Start the chord on the leader key.
      if (k === "t") {
        chordRef.current = "t";
        chordTimer.current = window.setTimeout(() => (chordRef.current = null), 800);
        return;
      }

      if (e.key === config.shortcuts.help) {
        e.preventDefault();
        setHelpOpen(true);
      } else if (k === config.shortcuts.toggleView) {
        e.preventDefault();
        setView((v) => (v === "list" ? "board" : "list"));
      } else if (k === config.shortcuts.focusMode && view === "list") {
        e.preventDefault();
        setFocus((f) => !f);
      } else if (e.key === config.shortcuts.focusBar) {
        e.preventDefault();
        barRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    filtering,
    focus,
    view,
    spotOpen,
    settingsOpen,
    helpOpen,
    accountOpen,
    toggleTimestamps,
    toggleTags,
  ]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.brand.name.toLowerCase()}-inbox.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash("Exported JSON");
  };

  const onImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Entry[];
        if (Array.isArray(data)) {
          importEntries(data);
          flash(`Imported ${data.length} entries`);
        } else {
          flash("Import failed — invalid JSON");
        }
      } catch {
        flash("Import failed — invalid JSON");
      }
    };
    reader.readAsText(file);
  };

  const logEntry = (raw: string) => {
    add(raw);
    const tag = raw.match(/(?:^|\s)\/([a-z0-9][a-z0-9_-]*)/i);
    flash(tag ? `Logged /${tag[1].toLowerCase()}` : "Logged");
  };

  return (
    <ThemeContext.Provider value={theme}>
      <div className="app">
        <header className="top-bar">
          <span className="wordmark">
            titan<span className="wordmark-slash">/</span>os
          </span>
          <span className="bar-sep" aria-hidden="true" />

          <div className="view-toggle" role="group" aria-label="View">
            <button
              className={`view-link${view === "list" ? " view-on" : ""}`}
              onClick={() => setView("list")}
            >
              list
            </button>
            <button
              className={`view-link${view === "board" ? " view-on" : ""}`}
              onClick={() => setView("board")}
            >
              board
            </button>
          </div>

          {view === "list" && (
            <div className="sort-group" role="group" aria-label="Sort and group">
              {SORTS.map((s) => (
                <button
                  key={s.mode}
                  className={`sort-glyph${sort === s.mode ? " sort-on" : ""}`}
                  onClick={() => setSort(s.mode)}
                  title={s.label}
                  aria-label={s.label}
                >
                  {s.icon}
                </button>
              ))}
            </div>
          )}

          <div className="bar-spacer" />

          <button
            className="search-trigger"
            onClick={() => setSpotOpen(true)}
            title="Search (⇧F)"
            aria-label="Search"
          >
            <span className="search-glyph">⌕</span>
            <span className="search-kbd">⇧F</span>
          </button>

          <div className="bar-utils">
            <button
              className="util-link theme-toggle"
              onClick={toggle}
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              <span className={`theme-mark theme-mark-${theme}`} />
              theme
            </button>
            <button className="util-link" onClick={() => setSettingsOpen(true)}>
              settings
            </button>
            <div className="account">
              <button
                className="avatar"
                onClick={() => setAccountOpen((o) => !o)}
                title="Account"
                aria-label="Account"
                aria-expanded={accountOpen}
              >
                {currentUser?.image ? (
                  <img className="avatar-img" src={currentUser.image} alt="" />
                ) : (
                  avatarInitial
                )}
              </button>
              {accountOpen && (
                <AccountMenu
                  onSignOut={() => {
                    setAccountOpen(false);
                    flash("Signing out…");
                  }}
                  onClose={() => setAccountOpen(false)}
                />
              )}
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = "";
            }}
          />
        </header>

        {filter.tags.length > 0 && (
          <div className="filter-bar">
            <span className="filter-label">Filtering</span>
            {filter.tags.map((t) => (
              <TagChip key={t} tag={t} active onClick={toggleTag} />
            ))}
            {filter.tags.length > 1 && (
              <button
                className="match-toggle"
                onClick={toggleMatch}
                title="Match entries with any vs. all of these tags"
              >
                {filter.match === "any" ? "match any" : "match all"}
              </button>
            )}
            <button className="filter-clear" onClick={clearFilters}>
              clear · esc
            </button>
          </div>
        )}

        {view === "board" ? (
          <main className="feed-area">
            <Board
              entries={filtered}
              taskTags={prefs.taskTags}
              onMove={(id, status, order) => moveCard(id, status, order, prefs.taskTags)}
              onTogglePin={togglePin}
              onDelete={remove}
              onTagClick={toggleTag}
            />
          </main>
        ) : (
          <>
            {!focus && (
              <PinnedNotch
                entries={pinned}
                query=""
                activeTags={filter.tags}
                taskTags={prefs.taskTags}
                showTime={prefs.showTimestamps}
                showTags={prefs.showTags}
                onTagClick={toggleTag}
                onEdit={update}
                onDelete={remove}
                onToggleDone={(id) => toggleDone(id, prefs.taskTags)}
                onTogglePin={togglePin}
              />
            )}

            <main className="feed-area">
              <Feed
                entries={focus ? entries : filtered}
                sort={sort}
                query=""
                activeTags={filter.tags}
                filtering={filtering}
                focus={focus}
                taskTags={prefs.taskTags}
                showTime={prefs.showTimestamps}
                showTags={prefs.showTags}
                onTagClick={toggleTag}
                onEdit={update}
                onDelete={remove}
                onToggleDone={(id) => toggleDone(id, prefs.taskTags)}
                onTogglePin={togglePin}
                onSetOrder={setOrder}
              />
            </main>
          </>
        )}

        <footer className="bar-area">
          <TerminalBar ref={barRef} onSubmit={logEntry} knownTags={knownTags} history={history} />
        </footer>

        {spotOpen && (
          <Spotlight
            entries={entries}
            onPick={(e) => {
              clearFilters();
              setFocus(false);
              setView("list");
              // Briefly highlight the picked entry via search-style mark.
              flash(`/${e.tags[0] ?? "note"} · ${e.body.slice(0, 28) || "entry"}`);
            }}
            onClose={() => setSpotOpen(false)}
          />
        )}

        {settingsOpen && (
          <SettingsModal
            theme={theme}
            onToggleTheme={toggle}
            prefs={prefs}
            onToggleTimestamps={toggleTimestamps}
            onToggleTags={toggleTags}
            onAddTaskTag={addTaskTag}
            onRemoveTaskTag={removeTaskTag}
            knownTags={knownTags}
            onExport={exportJson}
            onImport={() => fileRef.current?.click()}
            onShowHelp={() => {
              setSettingsOpen(false);
              setHelpOpen(true);
            }}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
        {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      </div>
    </ThemeContext.Provider>
  );
}
