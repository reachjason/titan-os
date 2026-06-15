import type { Entry, TaskStatus } from "../types";

/** Treat an entry as completed if flagged or tagged /done. */
export function isDone(e: Entry): boolean {
  return !!e.done || e.tags.includes("done");
}

/** Kanban column for an entry, defaulting from its done state. */
export function statusOf(e: Entry): TaskStatus {
  if (e.status) return e.status;
  return isDone(e) ? "done" : "todo";
}

/** Manual-sort position, defaulting to creation time so order is stable. */
export function orderOf(e: Entry): number {
  return e.order ?? e.createdAt;
}
