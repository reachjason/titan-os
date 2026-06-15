import { useEffect, useMemo, useRef, useState } from "react";
import { useEntries } from "./store/useEntries";
import { useTheme } from "./store/useTheme";
import { Feed } from "./components/Feed";
import { TerminalBar, type TerminalBarHandle } from "./components/TerminalBar";
import { TagChip } from "./components/TagChip";
import { Settings } from "./components/Settings";
import { HelpModal } from "./components/HelpModal";
import { config } from "./config";
import type { Entry, FilterState, SortMode } from "./types";

/** Sort/group modes shown as the segmented icon control. */
const SORTS: { mode: SortMode; icon: string; label: string }[] = [
  { mode: "asc", icon: "↓", label: "Newest at bottom" },
  { mode: "desc", icon: "↑", label: "Newest at top" },
  { mode: "tag", icon: "#", label: "Group by tag" },
];

/** Restore the saved view (sort + match) so the last screen persists. */
function loadView(): { sort: SortMode; match: "any" | "all" } | null {
  try {
    const raw = localStorage.getItem(config.storage.viewKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const { entries, add, update, remove, importEntries } = useEntries();
  const { theme, toggle } = useTheme();
  const [filter, setFilter] = useState<FilterState>(() => ({
    tags: [],
    match: loadView()?.match ?? "any",
    query: "",
  }));
  const [sort, setSort] = useState<SortMode>(() => loadView()?.sort ?? "asc");
  const [helpOpen, setHelpOpen] = useState(false);
  const barRef = useRef<TerminalBarHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cycleSort = () =>
    setSort((s) => SORTS[(SORTS.findIndex((x) => x.mode === s) + 1) % SORTS.length].mode);

  // Persist the view (sort + match) across reloads.
  useEffect(() => {
    localStorage.setItem(
      config.storage.viewKey,
      JSON.stringify({ sort, match: filter.match })
    );
  }, [sort, filter.match]);

  const knownTags = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [entries]);

  const history = useMemo(() => entries.map((e) => e.raw), [entries]);

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
      } else if (e.key === config.shortcuts.focusBar) {
        e.preventDefault();
        barRef.current?.focus();
      } else if (e.key.toLowerCase() === config.shortcuts.cycleSort) {
        e.preventDefault();
        cycleSort();
      } else if (e.key === config.shortcuts.clearFilters && filtering) {
        clearFilters();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtering]);

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

        <Settings
          theme={theme}
          onToggleTheme={toggle}
          onExport={exportJson}
          onImport={() => fileRef.current?.click()}
          onHelp={() => setHelpOpen(true)}
        />
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

      <main className="feed-area">
        <Feed
          entries={filtered}
          sort={sort}
          query={filter.query}
          activeTags={filter.tags}
          filtering={filtering}
          onTagClick={toggleTag}
          onEdit={update}
          onDelete={remove}
        />
      </main>

      <footer className="bar-area">
        <TerminalBar ref={barRef} onSubmit={add} knownTags={knownTags} history={history} />
      </footer>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
