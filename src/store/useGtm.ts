import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as lock from "../lib/sessionLock";
import { createVault, hasVault, wipe } from "../lib/sessionVault";
import { qrLogin, type QrLoginHandlers } from "../lib/telegramClient";

/**
 * GTM (Go-to-Market) store — the connect → unlock lifecycle and per-device UI
 * prefs for the Telegram broadcast feature. Group data lives in Convex (see
 * useGtmGroups); the Telegram session lives encrypted in IndexedDB (see
 * sessionVault) and is unlocked into memory via sessionLock.
 *
 * Flow: link Telegram by scanning a QR code, set a broadcast PIN that encrypts
 * the session at rest, then enter that PIN once per browser session to unlock.
 * The unlock lasts 30 minutes (refreshed on every send) and is held in memory
 * only — a reload re-locks.
 *
 * Until Phase 3 wires real Telegram, the QR step is simulated and a placeholder
 * session string is what gets encrypted — but the PIN, the AES-GCM vault, and
 * the in-memory unlock are all real.
 */

/** Connection lifecycle. `loggedOut` → (scan QR + set PIN) → `locked` → (enter PIN) → `unlocked`. */
export type GtmPhase = "loggedOut" | "locked" | "unlocked";

export interface GtmGroup {
  /** Convex document id (the stable handle used by category mutations). */
  id: string;
  /** Telegram group/channel id. */
  tgId: string;
  name: string;
  handle: string;
  members: number;
  /** Category slugs this group belongs to. */
  cats: string[];
  /** Surfaced with a "new" badge until dismissed. */
  isNew?: boolean;
}

/**
 * Per-device UI state. Group data and category tags now live in Convex (see
 * useGtmGroups); this store keeps only what is local to the device: the connect
 * → unlock lifecycle, the broadcast handle, the category rail order, and the
 * sync filter.
 */
export interface GtmState {
  /** Where the user is in the connect → unlock lifecycle. */
  phase: GtmPhase;
  /** @handle / phone shown in the UI and used for "test to myself". */
  userId: string;
  /** Whether a broadcast PIN has been set (i.e. the account is linked). */
  pinSet: boolean;
  /** Order categories appear in the rail. */
  catOrder: string[];
  filter: string;
}

const STORAGE_KEY = "titan-os.gtm.v2";

const DEFAULT_CAT_ORDER = ["vc", "angel", "cesto", "partner", "kol", "exchange", "mm"];

/** Telegram ids of groups the user isn't admin in — flagged "sends as member". */
export const NOT_ADMIN = new Set(["g6", "g7"]);

function loadState(): GtmState {
  const base: GtmState = {
    phase: "loggedOut",
    userId: "",
    pinSet: false,
    catOrder: [...DEFAULT_CAT_ORDER],
    filter: "cesto",
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const d = JSON.parse(raw) as Partial<GtmState>;
    // A linked account always resumes in the `locked` phase: the unlock lives
    // only in memory (never persisted), so a reload re-prompts for the PIN.
    const phase: GtmPhase = d.pinSet ? "locked" : "loggedOut";
    return {
      ...base,
      ...d,
      phase,
      catOrder: d.catOrder ?? base.catOrder,
    };
  } catch {
    return base;
  }
}

export function useGtm() {
  const [state, setState] = useState<GtmState>(loadState);

  // The unlocked-or-not boolean is owned by the sessionLock module singleton;
  // subscribe so phase/TTL stay in sync even across components.
  const lockUnlocked = useSyncExternalStore(lock.subscribe, lock.getSnapshot);

  // Persist the durable slice on every change. `phase` is excluded: a linked
  // account is re-derived as `locked` on load (the unlock lives only in memory).
  useEffect(() => {
    try {
      const { phase: _phase, ...durable } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(durable));
    } catch {
      /* storage full / unavailable */
    }
  }, [state]);

  // On mount, reconcile `pinSet` with whether a vault actually exists on this
  // device (e.g. the vault was wiped elsewhere, or state predates it).
  useEffect(() => {
    let alive = true;
    hasVault().then((exists) => {
      if (!alive) return;
      setState((s) =>
        s.pinSet === exists ? s : { ...s, pinSet: exists, phase: exists ? "locked" : "loggedOut" }
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  // Keep the rendered phase honest: if the lock module re-locked (TTL expiry,
  // pagehide), drop out of the `unlocked` phase.
  useEffect(() => {
    if (!lockUnlocked) {
      setState((s) => (s.phase === "unlocked" ? { ...s, phase: "locked" } : s));
    }
  }, [lockUnlocked]);

  const handle = useMemo(() => {
    const u = state.userId.trim();
    if (!u) return "@you";
    return u[0] === "@" ? u : "@" + u;
  }, [state.userId]);

  const setField = useCallback(<K extends keyof GtmState>(key: K, value: GtmState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  /**
   * Link Telegram via QR + set the broadcast PIN, in one flow:
   *  1. validate the PIN,
   *  2. run the real QR login (renders the QR and prompts for 2FA via the given
   *     handlers) to obtain a session string,
   *  3. encrypt that session into the vault under the PIN, and
   *  4. record the handle and drop to the locked screen.
   * Returns an error string on failure (too-short PIN, login failed), or null
   * on success. The plaintext session never leaves this function.
   */
  const linkTelegram = useCallback(
    async (
      pin: string,
      handle: string,
      handlers: QrLoginHandlers
    ): Promise<string | null> => {
      if (pin.trim().length < 4) return "PIN must be at least 4 characters";
      // Start fresh: a stale vault would block createVault.
      await wipe();
      let session: string;
      try {
        session = await qrLogin(handlers);
      } catch (e) {
        return (e as Error)?.message || "Telegram login failed";
      }
      try {
        await createVault(pin, session);
      } catch {
        return "Couldn't secure the session — try again";
      }
      const u = handle.trim();
      setState((s) => ({ ...s, userId: u || s.userId, pinSet: true, phase: "locked" }));
      return null;
    },
    []
  );

  /**
   * Unlock with the PIN: decrypts the vault key into memory (30-min TTL) and
   * moves to the unlocked phase. Returns false on a wrong PIN.
   */
  const unlock = useCallback(async (pin: string): Promise<boolean> => {
    try {
      await lock.unlockWithPin(pin);
    } catch {
      return false; // wrong PIN (or no vault)
    }
    setState((s) => ({ ...s, phase: "unlocked" }));
    return true;
  }, []);

  /** Refresh the unlock window — call at the start of every broadcast send. */
  const touch = useCallback(() => lock.touch(), []);

  /** Manual "Lock now": drop the in-memory key and re-lock. */
  const lockNow = useCallback(() => {
    lock.lock();
    setState((s) => (s.pinSet ? { ...s, phase: "locked" } : s));
  }, []);

  /** Unlink the account entirely (forgotten PIN / disconnect): wipe + back to QR. */
  const disconnect = useCallback(async () => {
    lock.lock();
    await wipe();
    setState((s) => ({ ...s, phase: "loggedOut", pinSet: false }));
  }, []);

  const reset = useCallback(async () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    lock.lock();
    await wipe();
    setState(loadState());
  }, []);

  // ---- category rail order (group membership lives in useGtmGroups) ----

  /** Normalize a free-typed category name to a slug. */
  const normalizeCat = useCallback(
    (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, "-"),
    []
  );

  /** Register a category in the rail order if new. Returns its slug (or null). */
  const registerCat = useCallback(
    (rawCat: string): string | null => {
      const cat = normalizeCat(rawCat);
      if (!cat) return null;
      setState((s) =>
        s.catOrder.includes(cat) ? s : { ...s, catOrder: [...s.catOrder, cat] }
      );
      return cat;
    },
    [normalizeCat]
  );

  const unlocked = state.phase === "unlocked" && lockUnlocked;

  /** Remaining unlock time as "mm:ss" (clamped at 0), for the TTL pill. */
  const ttlLabel = useCallback(() => {
    const total = Math.floor(lock.remainingMs() / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, []);

  return {
    state,
    handle,
    unlocked,
    setField,
    linkTelegram,
    unlock,
    touch,
    lockNow,
    disconnect,
    reset,
    normalizeCat,
    registerCat,
    ttlLabel,
  };
}
