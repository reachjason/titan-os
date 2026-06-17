import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
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

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const remoteSettings = useQuery(api.mcp.getUserSettings);
  const updateTaskTags = useMutation(api.mcp.updateTaskTags);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  }, [prefs]);

  useEffect(() => {
    if (!remoteSettings?.taskTags) return;
    setPrefs((p) =>
      sameTags(p.taskTags, remoteSettings.taskTags)
        ? p
        : { ...p, taskTags: remoteSettings.taskTags }
    );
  }, [remoteSettings?.taskTags]);

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
    setPrefs((p) => {
      if (p.taskTags.includes(t)) return p;
      const taskTags = [...p.taskTags, t];
      void updateTaskTags({ taskTags });
      return { ...p, taskTags };
    });
  }, [updateTaskTags]);

  const removeTaskTag = useCallback(
    (tag: string) =>
      setPrefs((p) => {
        const taskTags = p.taskTags.filter((t) => t !== tag);
        void updateTaskTags({ taskTags });
        return { ...p, taskTags };
      }),
    [updateTaskTags]
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
