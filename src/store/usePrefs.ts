import { useCallback, useEffect, useState } from "react";
import type { Prefs } from "../types";
import { config } from "../config";

const KEY = config.storage.prefsKey;

function load(): Prefs {
  const defaults: Prefs = {
    showTimestamps: config.prefs.showTimestamps,
    showTags: config.prefs.showTags,
    taskTags: [...config.prefs.taskTags],
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return defaults;
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  }, [prefs]);

  const toggleTimestamps = useCallback(
    () => setPrefs((p) => ({ ...p, showTimestamps: !p.showTimestamps })),
    []
  );
  const toggleTags = useCallback(
    () => setPrefs((p) => ({ ...p, showTags: !p.showTags })),
    []
  );
  const setTimestamps = useCallback(
    (on: boolean) => setPrefs((p) => ({ ...p, showTimestamps: on })),
    []
  );
  const setTags = useCallback(
    (on: boolean) => setPrefs((p) => ({ ...p, showTags: on })),
    []
  );

  const addTaskTag = useCallback((tag: string) => {
    const t = tag.trim().toLowerCase().replace(/^\//, "");
    if (!t) return;
    setPrefs((p) =>
      p.taskTags.includes(t) ? p : { ...p, taskTags: [...p.taskTags, t] }
    );
  }, []);

  const removeTaskTag = useCallback(
    (tag: string) =>
      setPrefs((p) => ({ ...p, taskTags: p.taskTags.filter((t) => t !== tag) })),
    []
  );

  return {
    prefs,
    toggleTimestamps,
    toggleTags,
    setTimestamps,
    setTags,
    addTaskTag,
    removeTaskTag,
  };
}

/** Whether an entry is a checkable task given the current task tags. */
export function isTask(tags: string[], taskTags: string[]): boolean {
  return tags.some((t) => taskTags.includes(t));
}
