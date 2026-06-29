import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import type { GtmGroup } from "./useGtm";
import { withSession } from "../lib/sessionLock";
import { connectClient, fetchGroups, fetchGroupPhoto, toUpsert } from "../lib/telegramClient";

/**
 * GTM group store, backed by Convex (real-time, per signed-in user). The group
 * list, category tags, and the "new groups" diff live server-side so they load
 * instantly and follow the user across devices.
 *
 * The Telegram session is NOT here — it stays client-side and encrypted. This
 * store is purely the non-sensitive group metadata cache; `sync()` reaches into
 * Telegram (via the unlocked session) to refresh it.
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
    photoUrl: doc.photoUrl,
  };
}

export function useGtmGroups() {
  const docs = useQuery(api.gtmGroups.list);
  const upsertManyM = useMutation(api.gtmGroups.upsertMany);
  const toggleCatM = useMutation(api.gtmGroups.toggleCat);
  const setCatsM = useMutation(api.gtmGroups.setCats);
  const bulkToggleCatM = useMutation(api.gtmGroups.bulkToggleCat);
  const clearNewM = useMutation(api.gtmGroups.clearNew);
  const clearAllM = useMutation(api.gtmGroups.clearAll);
  const generateUploadUrlM = useMutation(api.gtmGroups.generateUploadUrl);
  const setPhotoM = useMutation(api.gtmGroups.setPhoto);

  const [syncing, setSyncing] = useState(false);

  // `undefined` while loading → empty; `synced` is "has at least one group".
  const groups = useMemo(() => (docs ?? []).map(toGroup), [docs]);
  const loaded = docs !== undefined;
  const synced = (docs?.length ?? 0) > 0;
  const gid = (id: string) => id as Id<"gtmGroups">;

  /**
   * Sync groups from Telegram: connect with the unlocked session, fetch the
   * dialog list, and upsert the groups/channels into Convex. Newly-seen groups
   * are flagged isNew (drives the "Found N new groups" badge). Requires an
   * unlocked session (withSession throws "LOCKED" otherwise). Returns a toast.
   */
  /** Upload one group's photo blob to Convex storage and attach it. */
  const uploadPhoto = useCallback(
    async (tgId: string, blob: Blob) => {
      const url = await generateUploadUrlM({});
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await setPhotoM({ tgId, photoId: storageId });
    },
    [generateUploadUrlM, setPhotoM]
  );

  const sync = useCallback(
    async (onToast?: (msg: string) => void) => {
      if (syncing) return;
      setSyncing(true);
      // tgIds that already have a photo cached — skip re-downloading those.
      const havePhoto = new Set((docs ?? []).filter((g) => g.photoUrl).map((g) => g.tgId));
      try {
        // One client connection: fetch dialogs, then download missing photos.
        const { fetched, photos } = await withSession(async (session) => {
          const client = await connectClient(session);
          try {
            const fetched = await fetchGroups(client);
            const photos: { tgId: string; blob: Blob }[] = [];
            // Throttle: download sequentially so we don't hammer Telegram.
            for (const g of fetched) {
              if (havePhoto.has(g.tgId)) continue;
              const blob = await fetchGroupPhoto(client, g.tgId);
              if (blob) photos.push({ tgId: g.tgId, blob });
            }
            return { fetched, photos };
          } finally {
            await client.disconnect();
          }
        });
        const { newTgIds } = await upsertManyM({ groups: fetched.map(toUpsert) });
        if (newTgIds.length === 0) onToast?.(`Synced ${fetched.length} groups · no new ones`);
        else
          onToast?.(
            `Synced ${fetched.length} · ${newTgIds.length} new group${newTgIds.length === 1 ? "" : "s"}`
          );
        // Upload photos after the groups exist (setPhoto looks them up by tgId).
        for (const p of photos) {
          try {
            await uploadPhoto(p.tgId, p.blob);
          } catch {
            /* one photo failing shouldn't fail the sync */
          }
        }
      } catch (e) {
        onToast?.(
          (e as Error)?.message === "LOCKED"
            ? "Unlock first to sync"
            : "Sync failed — " + ((e as Error)?.message ?? "try again")
        );
      } finally {
        setSyncing(false);
      }
    },
    [syncing, docs, upsertManyM, uploadPhoto]
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
