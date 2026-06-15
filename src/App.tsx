import { useEffect, useMemo, useRef, useState } from "react";
import { useEntries } from "./store/useEntries";
import { useTheme } from "./store/useTheme";
import { Feed } from "./components/Feed";
import { TerminalBar, type TerminalBarHandle } from "./components/TerminalBar";
import { TagChip } from "./components/TagChip";
import { Settings } from "./components/Settings";
import { config } from "./config";
import type { Entry, FilterState, SortMode } from "./types";

export default function App() {
  const { entries, add, update, remove, importEntries } = useEntries();
  const { theme, toggle } = useTheme();
  const [filter, setFilter] = useState<FilterState>({ tags: [], match: "any", query: "" });
  const [sort, setSort] = useState<SortMode>("asc");
  const barRef = useRef<TerminalBarHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  // Global keyboard shortcuts (only when not typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (typing) return;
      if (e.key === config.shortcuts.focusBar) {
        e.preventDefault();
        barRef.current?.focus();
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
        <div className="brand">
          <span className="brand-mark">{config.brand.mark}</span>
          <span className="brand-name">{config.brand.name}</span>
          <span className="brand-sub">{config.brand.tagline}</span>
        </div>

        <select
          className="sort-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          title="Sort the feed"
        >
          <option value="asc">Newest at bottom</option>
          <option value="desc">Newest at top</option>
          <option value="tag">Group by tag</option>
        </select>

        <div className="search-wrap">
          <input
            className="search-input"
            placeholder={config.ui.searchPlaceholder}
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
    </div>
  );
}
