import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { Entry, TaskStatus } from "../types";

/** Map a Convex `entries` document to the app's Entry shape used throughout the UI. */
function toEntry(doc: Doc<"entries">): Entry {
  return {
    id: doc._id,
    raw: doc.raw,
    body: doc.body,
    tags: doc.tags,
    createdAt: doc.createdAt ?? doc._creationTime,
    updatedAt: doc.updatedAt,
    edited: doc.edited,
    done: doc.done,
    pinned: doc.pinned,
    status: doc.status,
    order: doc.order,
  };
}

/**
 * Entries store, backed by Convex (real-time, per signed-in user).
 * Keeps the same public API the rest of the app already consumes so callers
 * (App.tsx, Feed, Board, EntryRow, …) are unchanged.
 */
export function useEntries() {
  const docs = useQuery(api.entries.list);
  const addM = useMutation(api.entries.add);
  const updateM = useMutation(api.entries.update);
  const removeM = useMutation(api.entries.remove);
  const toggleDoneM = useMutation(api.entries.toggleDone);
  const togglePinM = useMutation(api.entries.togglePin);
  const moveCardM = useMutation(api.entries.moveCard);
  const setOrderM = useMutation(api.entries.setOrder);

  // `undefined` while loading → render as empty (the UI shows its first-run state).
  const entries = useMemo(() => (docs ?? []).map(toEntry), [docs]);

  const add = useCallback((raw: string) => void addM({ raw }), [addM]);
  const update = useCallback(
    (id: string, raw: string) => void updateM({ id: id as Id<"entries">, raw }),
    [updateM]
  );
  const remove = useCallback(
    (id: string) => void removeM({ id: id as Id<"entries"> }),
    [removeM]
  );
  const toggleDone = useCallback(
    (id: string, taskTags: string[]) =>
      void toggleDoneM({ id: id as Id<"entries">, taskTags }),
    [toggleDoneM]
  );
  const togglePin = useCallback(
    (id: string) => void togglePinM({ id: id as Id<"entries"> }),
    [togglePinM]
  );
  const moveCard = useCallback(
    (id: string, status: TaskStatus, order: number, taskTags: string[]) =>
      void moveCardM({ id: id as Id<"entries">, status, order, taskTags }),
    [moveCardM]
  );
  const setOrder = useCallback(
    (id: string, order: number) =>
      void setOrderM({ id: id as Id<"entries">, order }),
    [setOrderM]
  );

  // Import: push each entry's raw text through `add` (server reparses + scopes to user).
  const importEntries = useCallback(
    (next: Entry[]) => {
      for (const e of next) {
        if (e?.raw) void addM({ raw: e.raw });
      }
    },
    [addM]
  );

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
