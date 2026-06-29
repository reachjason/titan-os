import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import type { GtmGroup } from "./useGtm";

/**
 * GTM group store, backed by Convex (real-time, per signed-in user). Replaces
 * the localStorage group state from the Phase-0 mock: the group list, category
 * tags, and the "new groups" diff now live server-side so they load instantly
 * and follow the user across devices.
 *
 * The Telegram session is NOT here — it stays client-side and encrypted. This
 * store is purely the non-sensitive group metadata cache.
 *
 * Until Phase 3 wires real Telegram, `sync()` seeds a demo catalog into Convex
 * so the rest of the flow is exercisable end-to-end against the real backend.
 */

type GroupDoc = FunctionReturnType<typeof api.gtmGroups.list>[number];

/** Map a Convex gtmGroups doc to the app's GtmGroup shape used by GtmView. */
function toGroup(doc: GroupDoc): GtmGroup {
  return {
    id: doc._id,
    tgId: doc.tgId,
    name: doc.name,
    handle: doc.handle,
    members: doc.members,
    cats: doc.cats,
    isNew: doc.isNew,
  };
}

/** The demo catalog a "sync" reveals — the same set the Phase-0 mock used. */
const CATALOG = [
  { tgId: "g1", name: "Cesto × Paradigm", handle: "@cesto_paradigm", members: 8, cats: ["vc"] },
  { tgId: "g2", name: "Cesto × a16z crypto", handle: "@cesto_a16z", members: 6, cats: ["vc"] },
  { tgId: "g3", name: "Cesto Angels", handle: "@cesto_angels", members: 24, cats: ["angel"] },
  { tgId: "g4", name: "Cesto × Coinbase BD", handle: "@cesto_cb", members: 5, cats: ["partner", "exchange"] },
  { tgId: "g5", name: "Cesto Power Users", handle: "@cesto_power", members: 156, cats: ["cesto"] },
  { tgId: "g6", name: "Cesto Community DAO", handle: "@cesto_dao", members: 312, cats: ["cesto"] },
  { tgId: "g7", name: "Cesto KOL Circle", handle: "@cesto_kol", members: 41, cats: ["kol"] },
  { tgId: "g8", name: "Cesto × Pantera", handle: "@cesto_pantera", members: 7, cats: [] },
  { tgId: "g9", name: "Cesto Market Makers", handle: "@cesto_mm", members: 12, cats: ["mm"] },
  { tgId: "g10", name: "Cesto Builders Guild", handle: "@cesto_builders", members: 88, cats: [] },
];

export function useGtmGroups() {
  const docs = useQuery(api.gtmGroups.list);
  const upsertManyM = useMutation(api.gtmGroups.upsertMany);
  const toggleCatM = useMutation(api.gtmGroups.toggleCat);
  const setCatsM = useMutation(api.gtmGroups.setCats);
  const bulkToggleCatM = useMutation(api.gtmGroups.bulkToggleCat);
  const clearNewM = useMutation(api.gtmGroups.clearNew);
  const clearAllM = useMutation(api.gtmGroups.clearAll);

  const [syncing, setSyncing] = useState(false);

  // `undefined` while loading → empty; `synced` is "has at least one group".
  const groups = useMemo(() => (docs ?? []).map(toGroup), [docs]);
  const loaded = docs !== undefined;
  const synced = (docs?.length ?? 0) > 0;
  const gid = (id: string) => id as Id<"gtmGroups">;

  /**
   * Sync groups from Telegram. Phase 1: seeds the demo catalog into Convex (the
   * first sync reveals 8, later syncs reveal one more, flagged new) so the diff
   * and badge work against the real backend. Phase 3 swaps the catalog for a
   * real getDialogs() fetch. Returns a toast describing what happened.
   */
  const sync = useCallback(
    async (onToast?: (msg: string) => void) => {
      if (syncing) return;
      setSyncing(true);
      try {
        const have = docs?.length ?? 0;
        const reveal = have === 0 ? CATALOG.slice(0, 8) : CATALOG.slice(0, Math.min(have + 1, CATALOG.length));
        const { newTgIds } = await upsertManyM({ groups: reveal });
        if (have === 0) onToast?.(`Synced ${reveal.length} groups from Telegram`);
        else if (newTgIds.length === 0) onToast?.("No new groups found");
        else {
          const added = CATALOG.find((c) => c.tgId === newTgIds[0]);
          onToast?.("+1 new group · " + (added?.name ?? newTgIds[0]));
        }
      } finally {
        setSyncing(false);
      }
    },
    [docs, syncing, upsertManyM]
  );

  const toggleGroupCat = useCallback(
    (id: string, cat: string) => void toggleCatM({ id: gid(id), cat }),
    [toggleCatM]
  );

  const setGroupCats = useCallback(
    (id: string, cats: string[]) => void setCatsM({ id: gid(id), cats }),
    [setCatsM]
  );

  const bulkToggleCat = useCallback(
    (ids: string[], cat: string) => bulkToggleCatM({ ids: ids.map(gid), cat }).then((r) => r.added),
    [bulkToggleCatM]
  );

  const clearNew = useCallback(() => void clearNewM({}), [clearNewM]);
  const clearAll = useCallback(() => void clearAllM({}), [clearAllM]);

  return {
    groups,
    loaded,
    synced,
    syncing,
    sync,
    toggleGroupCat,
    setGroupCats,
    bulkToggleCat,
    clearNew,
    clearAll,
  };
}
