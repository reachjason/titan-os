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

  const toggleDone = useCallback((id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, done: !e.done } : e))
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
