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
import { FilterMenu } from "./components/FilterMenu";
import { SignIn } from "./components/SignIn";
import { Toast } from "./components/Toast";
import { config } from "./config";
import { searchEntries } from "./lib/spotlightSearch";
import type { Entry, FilterState, SortMode, TaskStatus, ViewMode } from "./types";

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
function loadView(): {
  sort: SortMode;
  match: "any" | "all";
  view: ViewMode;
  pinnedCollapsed?: boolean;
} | null {
  try {
    const raw = localStorage.getItem(config.storage.viewKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function Workspace() {
  const {
    entries,
    add,
    update,
    remove,
    restore,
    toggleDone,
    togglePin,
    moveCard,
    setOrder,
    importEntries,
  } = useEntries();
  const { theme, toggle } = useTheme();
  const { prefs, toggleTimestamps, toggleTags, addTaskTag, removeTaskTag } = usePrefs();
  const currentUser = useQuery(api.users.currentUser);
  const people = useQuery(api.users.list) ?? [];
  const avatarInitial = (currentUser?.name || currentUser?.email || "?")[0].toUpperCase();
  const [filter, setFilter] = useState<FilterState>(() => ({
    tags: [],
    mentions: [],
    match: loadView()?.match ?? "any",
    query: "",
  }));
  const [sort, setSort] = useState<SortMode>(() => loadView()?.sort ?? "asc");
  const [view, setView] = useState<ViewMode>(() => loadView()?.view ?? "list");
  // Pinned tray starts minimized (just a count); expand via click or Shift+P.
  const [pinnedCollapsed, setPinnedCollapsed] = useState<boolean>(
    () => loadView()?.pinnedCollapsed ?? true
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [spotOpen, setSpotOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  const [feedScrolling, setFeedScrolling] = useState(false);
  const barRef = useRef<TerminalBarHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const highlightTimer = useRef<number | undefined>(undefined);
  const feedScrollTimer = useRef<number | undefined>(undefined);
  // Pending leader key for two-stroke chords (t c / t t), reset after a short window.
  const chordRef = useRef<string | null>(null);
  const chordTimer = useRef<number | undefined>(undefined);
  // Action history for ⌘Z / ⇧⌘Z. Each item knows how to reverse one mutation
  // and how to re-apply it. Newest last; capped so it can't grow unbounded.
  // Add/delete change the entry's id, so those items keep a small mutable `ref`
  // that undo/redo update as the row is re-created.
  type HistItem = { name: string; undo: () => void; redo: () => void };
  const undoStack = useRef<HistItem[]>([]);
  const redoStack = useRef<HistItem[]>([]);

  const flash = (msg: string) => setToast(msg);

  const pushUndo = (item: HistItem) => {
    undoStack.current.push(item);
    redoStack.current = []; // a fresh action invalidates the redo branch
    if (undoStack.current.length > 50) undoStack.current.shift();
  };

  // Wrapped mutations: do the action, then record how to reverse/replay it. The
  // recorded thunks call the store directly (not these wrappers) so undo/redo
  // don't themselves get recorded.
  const editEntry = (id: string, raw: string) => {
    const prev = entries.find((e) => e.id === id);
    update(id, raw);
    if (prev) {
      const oldRaw = prev.raw;
      pushUndo({ name: "edit", undo: () => update(id, oldRaw), redo: () => update(id, raw) });
    }
  };
  const deleteEntry = (id: string) => {
    const prev = entries.find((e) => e.id === id);
    remove(id);
    if (prev) {
      const snap = {
        raw: prev.raw,
        done: !!prev.done,
        pinned: !!prev.pinned,
        status: prev.status ?? "todo",
        order: prev.order ?? prev.createdAt,
        createdAt: prev.createdAt,
      };
      const ref = { id };
      pushUndo({
        name: "delete",
        undo: async () => {
          const nid = await restore(snap);
          if (nid) ref.id = nid;
        },
        redo: () => remove(ref.id),
      });
    }
  };
  const toggleDoneEntry = (id: string) => {
    const tags = prefs.taskTags;
    toggleDone(id, tags);
    pushUndo({ name: "task", undo: () => toggleDone(id, tags), redo: () => toggleDone(id, tags) });
  };
  const togglePinEntry = (id: string) => {
    togglePin(id);
    pushUndo({ name: "pin", undo: () => togglePin(id), redo: () => togglePin(id) });
  };
  const moveCardEntry = (id: string, status: TaskStatus, order: number) => {
    const prev = entries.find((e) => e.id === id);
    const tags = prefs.taskTags;
    moveCard(id, status, order, tags);
    if (prev) {
      const ps = prev.status ?? "todo";
      const po = prev.order ?? prev.createdAt;
      pushUndo({
        name: "move",
        undo: () => moveCard(id, ps, po, tags),
        redo: () => moveCard(id, status, order, tags),
      });
    }
  };
  const setOrderEntry = (id: string, order: number) => {
    const prev = entries.find((e) => e.id === id);
    setOrder(id, order);
    if (prev) {
      const po = prev.order ?? prev.createdAt;
      pushUndo({ name: "reorder", undo: () => setOrder(id, po), redo: () => setOrder(id, order) });
    }
  };

  // Persist the view (sort + match + list/board) across reloads.
  useEffect(() => {
    localStorage.setItem(
      config.storage.viewKey,
      JSON.stringify({ sort, match: filter.match, view, pinnedCollapsed })
    );
  }, [sort, filter.match, view, pinnedCollapsed]);

  const knownTags = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [entries]);

  // @mention tokens that actually appear in entries (for the people filter).
  const knownMentions = useMemo(() => {
    const set = new Set<string>();
    const re = /(?:^|\s)@([a-z0-9][a-z0-9_-]*)/gi;
    for (const e of entries) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(e.body))) set.add(m[1].toLowerCase());
    }
    return Array.from(set).sort();
  }, [entries]);

  // Map a mention token → display name + avatar, for nicer filter/search rows.
  const peopleInfo = useMemo(() => {
    const map: Record<string, { label: string; image?: string }> = {};
    for (const p of people) map[p.firstNameKey] = { label: p.firstName, image: p.image };
    return map;
  }, [people]);

  // Log-bar ↑/↓ history: your own entries, oldest → newest, so ↑ pulls your
  // most recent message first. (entries arrives as [...mine, ...mentioned], so
  // mapping it raw would surface @-mention notes out of chronological order.)
  const history = useMemo(
    () =>
      entries
        .filter((e) => e.isMine !== false)
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((e) => e.raw),
    [entries]
  );
  const pinned = useMemo(() => entries.filter((e) => e.pinned), [entries]);

  const filtered = useMemo(() => {
    // Tag + @mention filters, plus an optional free-text query (same matcher as
    // the Spotlight palette) so "see all matches" lands on a persistent view.
    const term = filter.query.trim();
    const matchIds = term ? new Set(searchEntries(entries, term).map((r) => r.entry.id)) : null;
    return entries.filter((e) => {
      const tagOk =
        filter.tags.length === 0 ||
        (filter.match === "all"
          ? filter.tags.every((t) => e.tags.includes(t))
          : filter.tags.some((t) => e.tags.includes(t)));
      const body = e.body.toLowerCase();
      const mentionOk =
        filter.mentions.length === 0 ||
        filter.mentions.some((n) => body.includes(`@${n.toLowerCase()}`));
      const queryOk = !matchIds || matchIds.has(e.id);
      return tagOk && mentionOk && queryOk;
    });
  }, [entries, filter]);

  const filtering =
    filter.tags.length > 0 || filter.mentions.length > 0 || filter.query.trim().length > 0;
  const activeFilterCount = filter.tags.length + filter.mentions.length;

  const toggleTag = (tag: string) =>
    setFilter((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));

  const toggleMention = (name: string) =>
    setFilter((f) => ({
      ...f,
      mentions: f.mentions.includes(name)
        ? f.mentions.filter((n) => n !== name)
        : [...f.mentions, name],
    }));

  const clearFilters = () => setFilter({ tags: [], mentions: [], match: filter.match, query: "" });
  const toggleMatch = () =>
    setFilter((f) => ({ ...f, match: f.match === "any" ? "all" : "any" }));

  useEffect(() => {
    if (!pendingOpenId || view !== "list" || focus) return;
    const id = pendingOpenId;
    const raf = window.requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-entry-id="${id}"]`);
      if (!row) {
        setPendingOpenId(null);
        return;
      }
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      setHighlightedEntryId(id);
      window.clearTimeout(highlightTimer.current);
      highlightTimer.current = window.setTimeout(() => {
        setHighlightedEntryId((current) => (current === id ? null : current));
      }, 1500);
      setPendingOpenId(null);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [pendingOpenId, view, focus, pinnedCollapsed]);

  useEffect(() => {
    return () => {
      window.clearTimeout(highlightTimer.current);
      window.clearTimeout(feedScrollTimer.current);
    };
  }, []);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (e.key === "Escape") {
        if (spotOpen) setSpotOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (helpOpen) setHelpOpen(false);
        else if (accountOpen) setAccountOpen(false);
        else if (filterOpen) setFilterOpen(false);
        else if (focus) setFocus(false);
        else if (filtering) clearFilters();
        return;
      }
      if (typing) return;
      const k = e.key.toLowerCase();

      // ⌘Z undo / ⇧⌘Z (or Ctrl+Y) redo the last data action. (While typing we
      // returned above, so the browser's native text undo handles inputs.)
      const redoKey =
        ((e.metaKey || e.ctrlKey) && e.shiftKey && k === "z") || (e.ctrlKey && k === "y");
      if (redoKey) {
        e.preventDefault();
        const item = redoStack.current.pop();
        flash(item ? `Redid ${item.name}` : "Nothing to redo");
        if (item) {
          item.redo();
          undoStack.current.push(item);
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && k === "z") {
        e.preventDefault();
        const item = undoStack.current.pop();
        flash(item ? `Undid ${item.name}` : "Nothing to undo");
        if (item) {
          item.undo();
          redoStack.current.push(item);
        }
        return;
      }

      if (spotOpen || settingsOpen || helpOpen || accountOpen) return;

      // Shift+F → Spotlight search.
      if (e.shiftKey && k === config.shortcuts.search) {
        e.preventDefault();
        setFilterOpen(false);
        setSpotOpen(true);
        return;
      }

      if (k === "1") {
        e.preventDefault();
        setView("list");
        return;
      }

      if (k === "2") {
        e.preventDefault();
        setView("board");
        setFilterOpen(false);
        return;
      }

      // F → filter menu. Enter can then toggle multiple tags; Esc closes it.
      if (k === config.shortcuts.search) {
        e.preventDefault();
        setFilterOpen((open) => !open);
        return;
      }

      // Shift+P → expand/minimize the pinned tray.
      if (e.shiftKey && k === "p") {
        e.preventDefault();
        setPinnedCollapsed((c) => !c);
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
    filterOpen,
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

  const logEntry = async (raw: string) => {
    const tag = raw.match(/(?:^|\s)\/([a-z0-9][a-z0-9_-]*)/i);
    flash(tag ? `Logged /${tag[1].toLowerCase()}` : "Logged");
    const id = await add(raw);
    if (!id) return;
    const ref = { id };
    pushUndo({
      name: "add",
      undo: () => remove(ref.id),
      redo: async () => {
        const nid = await add(raw);
        if (nid) ref.id = nid;
      },
    });
  };

  const handleFeedScroll = () => {
    setFeedScrolling(true);
    window.clearTimeout(feedScrollTimer.current);
    feedScrollTimer.current = window.setTimeout(() => setFeedScrolling(false), 750);
  };
  const feedAreaClass = `feed-area${feedScrolling ? " feed-area-scrolling" : ""}`;

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

          <div className="filter-wrap">
            <button
              className={`filter-trigger${filtering ? " filter-on" : ""}`}
              onClick={() => setFilterOpen((o) => !o)}
              title="Filter by tag (F)"
              aria-label="Filter by tag"
              aria-expanded={filterOpen}
            >
              <svg
                className="filter-glyph"
                viewBox="0 0 16 16"
                width="13"
                height="13"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M1.5 2.5h13a.5.5 0 0 1 .4.8L10 9.2V14a.5.5 0 0 1-.74.44l-2.5-1.4A.5.5 0 0 1 6.5 12.6V9.2L1.1 3.3a.5.5 0 0 1 .4-.8Z"
                />
              </svg>
              {activeFilterCount > 0 && (
                <span className="filter-count">{activeFilterCount}</span>
              )}
            </button>
            {filterOpen && (
              <FilterMenu
                tags={knownTags}
                activeTags={filter.tags}
                people={knownMentions}
                peopleInfo={peopleInfo}
                activeMentions={filter.mentions}
                match={filter.match}
                onToggleTag={toggleTag}
                onToggleMention={toggleMention}
                onToggleMatch={toggleMatch}
                onClear={() => {
                  clearFilters();
                  setFilterOpen(false);
                }}
                onClose={() => setFilterOpen(false)}
              />
            )}
          </div>

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

        {filtering && (
          <div className="filter-bar">
            <span className="filter-label">Filtering</span>
            {filter.query.trim() && (
              <button
                className="search-chip"
                onClick={() => setFilter((f) => ({ ...f, query: "" }))}
                title="Clear search"
              >
                <span className="search-chip-glyph">⌕</span>
                <span className="search-chip-text">“{filter.query.trim()}”</span>
                <span className="search-chip-x">✕</span>
              </button>
            )}
            {filter.tags.map((t) => (
              <TagChip key={t} tag={t} active onClick={toggleTag} />
            ))}
            {filter.mentions.map((n) => (
              <button
                key={`@${n}`}
                className="mention mention-active"
                onClick={() => toggleMention(n)}
                title={`Remove @${n} filter`}
              >
                @{n}
              </button>
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
          <main className={feedAreaClass} onScroll={handleFeedScroll}>
            <Board
              entries={filtered}
              onMove={moveCardEntry}
              onTogglePin={togglePinEntry}
              onDelete={deleteEntry}
              onTagClick={toggleTag}
            />
          </main>
        ) : (
          <>
            {!focus && (
              <PinnedNotch
                entries={pinned}
                collapsed={pinnedCollapsed}
                onToggleCollapsed={() => setPinnedCollapsed((c) => !c)}
                activeTags={filter.tags}
                activeMentions={filter.mentions}
                taskTags={prefs.taskTags}
                showTime={prefs.showTimestamps}
                showTags={prefs.showTags}
                highlightedEntryId={highlightedEntryId}
                onTagClick={toggleTag}
                onMentionClick={toggleMention}
                onEdit={editEntry}
                onDelete={deleteEntry}
                onToggleDone={toggleDoneEntry}
                onTogglePin={togglePinEntry}
              />
            )}

            <main className={feedAreaClass} onScroll={handleFeedScroll}>
              <Feed
                entries={focus ? entries : filtered}
                sort={sort}
                activeTags={filter.tags}
                activeMentions={filter.mentions}
                filtering={filtering}
                focus={focus}
                taskTags={prefs.taskTags}
                showTime={prefs.showTimestamps}
                showTags={prefs.showTags}
                highlightedEntryId={highlightedEntryId}
                onTagClick={toggleTag}
                onMentionClick={toggleMention}
                onEdit={editEntry}
                onDelete={deleteEntry}
                onToggleDone={toggleDoneEntry}
                onTogglePin={togglePinEntry}
                onSetOrder={setOrderEntry}
              />
            </main>
          </>
        )}

        <footer className="bar-area">
          <TerminalBar
            ref={barRef}
            onSubmit={logEntry}
            knownTags={knownTags}
            people={people}
            history={history}
          />
        </footer>

        {spotOpen && (
          <Spotlight
            entries={entries}
            initialQuery={filter.query}
            onSeeAll={(term) => {
              setFilterOpen(false);
              setFocus(false);
              setView("list");
              setFilter((f) => ({ ...f, query: term }));
              flash(`Showing matches for “${term}”`);
            }}
            onPick={(e) => {
              setFilterOpen(false);
              clearFilters();
              setFocus(false);
              setView("list");
              if (e.pinned) setPinnedCollapsed(false);
              setHighlightedEntryId(e.id);
              setPendingOpenId(e.id);
              flash(`Opened /${e.tags[0] ?? "note"} · ${e.body.slice(0, 28) || "entry"}`);
            }}
            onPickTag={(tag) => {
              setFilterOpen(false);
              setFocus(false);
              setView("list");
              setFilter((f) => ({
                ...f,
                tags: f.tags.includes(tag) ? f.tags : [...f.tags, tag],
                query: "",
              }));
              flash(`Filtering /${tag}`);
            }}
            onPickMention={(name) => {
              setFilterOpen(false);
              setFocus(false);
              setView("list");
              setFilter((f) => ({
                ...f,
                mentions: f.mentions.includes(name) ? f.mentions : [...f.mentions, name],
                query: "",
              }));
              flash(`Filtering @${name}`);
            }}
            peopleInfo={peopleInfo}
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
