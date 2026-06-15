import { useCallback, useEffect, useRef, useState } from "react";
import type { Entry, TaskStatus } from "../types";
import { parseEntry } from "../lib/parse";
import { config } from "../config";

const STORAGE_KEY = config.storage.entriesKey;

/** Rewrite /tags matching `fromTags` to `/to` in a raw string. */
function retagRaw(raw: string, fromTags: string[], to: string): string {
  return raw.replace(/(^|\s)\/([a-z0-9][a-z0-9_-]*)/gi, (m, sp, tag) =>
    fromTags.includes(tag.toLowerCase()) ? `${sp}/${to}` : m
  );
}

/** Move an entry to a status, syncing its done flag + /do↔/done tag. */
function applyStatus(e: Entry, status: TaskStatus, taskTags: string[]): Entry {
  const wasDone = !!e.done || e.tags.includes("done");
  let { tags, raw } = e;
  let done = !!e.done;
  if (status === "done" && !wasDone) {
    tags = Array.from(new Set(e.tags.map((t) => (taskTags.includes(t) ? "done" : t))));
    raw = retagRaw(e.raw, taskTags, "done");
    done = true;
  } else if (status !== "done" && wasDone) {
    tags = Array.from(new Set(e.tags.map((t) => (t === "done" ? "do" : t))));
    raw = retagRaw(e.raw, ["done"], "do");
    done = false;
  }
  return { ...e, status, tags, raw, done };
}

function load(): Entry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Entry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useEntries() {
  const [entries, setEntries] = useState<Entry[]>(load);
  const writeTimer = useRef<number | null>(null);

  // Debounced persistence.
  useEffect(() => {
    if (writeTimer.current) window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }, 150);
    return () => {
      if (writeTimer.current) window.clearTimeout(writeTimer.current);
    };
  }, [entries]);

  const add = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const { tags, body } = parseEntry(trimmed);
    const now = Date.now();
    const entry: Entry = {
      id: makeId(),
      raw: trimmed,
      body,
      tags,
      createdAt: now,
      updatedAt: now,
      edited: false,
      done: false,
      pinned: false,
      status: "todo",
      order: now,
    };
    setEntries((prev) => [...prev, entry]);
  }, []);

  // Checkbox: toggle between done and todo (syncs /do↔/done).
  const toggleDone = useCallback((id: string, taskTags: string[]) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const next: TaskStatus =
          e.done || e.tags.includes("done") ? "todo" : "done";
        return applyStatus(e, next, taskTags);
      })
    );
  }, []);

  // Board drag: set a card's column + manual position at once.
  const moveCard = useCallback(
    (id: string, status: TaskStatus, order: number, taskTags: string[]) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...applyStatus(e, status, taskTags), order } : e))
      );
    },
    []
  );

  // List manual reorder: set a row's position without changing status.
  const setOrder = useCallback((id: string, order: number) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, order } : e)));
  }, []);

  const togglePin = useCallback((id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, pinned: !e.pinned } : e))
    );
  }, []);

  const update = useCallback((id: string, raw: string) => {
    const trimmed = raw.trim();
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        if (!trimmed) return e;
        const { tags, body } = parseEntry(trimmed);
        return { ...e, raw: trimmed, body, tags, updatedAt: Date.now(), edited: true };
      })
    );
  }, []);

  const remove = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const importEntries = useCallback((next: Entry[]) => {
    setEntries(next);
  }, []);

  return {
    entries,
    add,
    update,
    remove,
    toggleDone,
    togglePin,
    moveCard,
    setOrder,
    importEntries,
  };
}
