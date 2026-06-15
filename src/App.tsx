import { useEffect, useMemo, useRef, useState } from "react";
import { useEntries } from "./store/useEntries";
import { useTheme } from "./store/useTheme";
import { usePrefs } from "./store/usePrefs";
import { Feed } from "./components/Feed";
import { TerminalBar, type TerminalBarHandle } from "./components/TerminalBar";
import { TagChip } from "./components/TagChip";
import { SettingsModal } from "./components/SettingsModal";
import { HelpModal } from "./components/HelpModal";
import { PinnedNotch } from "./components/PinnedNotch";
import { Board } from "./components/Board";
import { config } from "./config";
import type { Entry, FilterState, SortMode, ViewMode } from "./types";

/** Sort/group modes shown as the segmented icon control. */
const SORTS: { mode: SortMode; icon: string; label: string }[] = [
  { mode: "asc", icon: "↓", label: "Newest at bottom" },
  { mode: "desc", icon: "↑", label: "Newest at top" },
  { mode: "tag", icon: "#", label: "Group by tag" },
  { mode: "manual", icon: "↕", label: "Manual order (drag to reorder)" },
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

export default function App() {
  const { entries, add, update, remove, toggleDone, togglePin, moveCard, setOrder, importEntries } =
    useEntries();
  const { theme, toggle } = useTheme();
  const { prefs, toggleTimestamps, addTaskTag, removeTaskTag } = usePrefs();
  const [filter, setFilter] = useState<FilterState>(() => ({
    tags: [],
    match: loadView()?.match ?? "any",
    query: "",
  }));
  const [sort, setSort] = useState<SortMode>(() => loadView()?.sort ?? "asc");
  const [view, setView] = useState<ViewMode>(() => loadView()?.view ?? "list");
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const barRef = useRef<TerminalBarHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cycleSort = () =>
    setSort((s) => SORTS[(SORTS.findIndex((x) => x.mode === s) + 1) % SORTS.length].mode);

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
    // Search matches body text or tags; a leading slash in the query is optional.
    const q = filter.query.trim().toLowerCase().replace(/^\//, "");
    return entries.filter((e) => {
      const tagOk =
        filter.tags.length === 0 ||
        (filter.match === "all"
          ? filter.tags.every((t) => e.tags.includes(t))
          : filter.tags.some((t) => e.tags.includes(t)));
      const textOk =
        !q || e.body.toLowerCase().includes(q) || e.tags.some((t) => t.includes(q));
      return tagOk && textOk;
    });
  }, [entries, filter]);

  const filtering = filter.tags.length > 0 || filter.query.trim().length > 0;

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
      // ⌘/Ctrl+K → search, works even while typing elsewhere.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === config.shortcuts.focusSearch) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (typing) return;
      if (e.key === config.shortcuts.help) {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key.toLowerCase() === config.shortcuts.focusMode && view === "list") {
        e.preventDefault();
        setFocus((f) => !f);
      } else if (e.key === config.shortcuts.focusBar) {
        e.preventDefault();
        barRef.current?.focus();
      } else if (e.key.toLowerCase() === config.shortcuts.cycleSort && view === "list") {
        e.preventDefault();
        cycleSort();
      } else if (e.key === config.shortcuts.clearFilters) {
        if (focus) setFocus(false);
        else if (filtering) clearFilters();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtering, focus, view]);

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
  };

  const onImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Entry[];
        if (Array.isArray(data)) importEntries(data);
      } catch {
        alert("Could not read that file.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="app">
      <header className="top-bar">
        <div className="brand" title={`${config.brand.name} · ${config.brand.tagline}`}>
          <span className="brand-mark">{config.brand.mark}</span>
        </div>

        <div className="view-toggle" role="group" aria-label="View">
          <button
            className={`view-btn${view === "list" ? " view-active" : ""}`}
            onClick={() => setView("list")}
            title="List view"
          >
            ☰
          </button>
          <button
            className={`view-btn${view === "board" ? " view-active" : ""}`}
            onClick={() => setView("board")}
            title="Board view"
          >
            ▦
          </button>
        </div>

        {view === "list" && !focus && (
          <>
            <div className="sort-group" role="group" aria-label="Sort and group">
              {SORTS.map((s) => (
                <button
                  key={s.mode}
                  className={`sort-btn${sort === s.mode ? " sort-active" : ""}`}
                  onClick={() => setSort(s.mode)}
                  title={`${s.label}  (S to cycle)`}
                  aria-label={s.label}
                >
                  {s.icon}
                </button>
              ))}
            </div>

            <div className="search-wrap">
              <input
                ref={searchRef}
                className="search-input"
                placeholder={config.ui.searchPlaceholder}
                title="Search (⌘K)"
                value={filter.query}
                onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === config.shortcuts.clearFilters) e.currentTarget.blur();
                }}
              />
              {filter.query && (
                <button
                  className="search-clear"
                  onClick={() => setFilter((f) => ({ ...f, query: "" }))}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </>
        )}

        {view === "list" && (
          <button
            className={`icon-btn focus-btn${focus ? " focus-on" : ""}`}
            onClick={() => setFocus((f) => !f)}
            title="Focus mode — pinned only (F)"
            aria-pressed={focus}
          >
            {focus ? "◉" : "◎"}
          </button>
        )}

        <button
          className="icon-btn settings-trigger"
          title="Settings"
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙
        </button>
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
              query={filter.query}
              activeTags={filter.tags}
              taskTags={prefs.taskTags}
              showTime={prefs.showTimestamps}
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
              query={filter.query}
              activeTags={filter.tags}
              filtering={filtering}
              focus={focus}
              taskTags={prefs.taskTags}
              showTime={prefs.showTimestamps}
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
        <TerminalBar ref={barRef} onSubmit={add} knownTags={knownTags} history={history} />
      </footer>

      {settingsOpen && (
        <SettingsModal
          theme={theme}
          onToggleTheme={toggle}
          prefs={prefs}
          onToggleTimestamps={toggleTimestamps}
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
    </div>
  );
}
