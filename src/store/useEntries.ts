import { useCallback, useEffect, useRef, useState } from "react";
import type { Entry } from "../types";
import { parseEntry } from "../lib/parse";
import { config } from "../config";

const STORAGE_KEY = config.storage.entriesKey;

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
    };
    setEntries((prev) => [...prev, entry]);
  }, []);

  // Completing a task rewrites its task tag (e.g. /do) to /done; unchecking reverts to /do.
  const toggleDone = useCallback((id: string, taskTags: string[]) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const from = e.done ? ["done"] : taskTags;
        const to = e.done ? "do" : "done";
        const tags = Array.from(
          new Set(e.tags.map((t) => (from.includes(t) ? to : t)))
        );
        const raw = e.raw.replace(
          /(^|\s)\/([a-z0-9][a-z0-9_-]*)/gi,
          (m, sp, tag) => (from.includes(tag.toLowerCase()) ? `${sp}/${to}` : m)
        );
        return { ...e, done: !e.done, tags, raw };
      })
    );
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

  return { entries, add, update, remove, toggleDone, togglePin, importEntries };
}
