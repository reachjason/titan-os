import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * GTM (Go-to-Market) mock store. This is a frontend-only feature: it simulates
 * connecting a Telegram account, syncing the groups you're in, categorizing
 * them, and broadcasting a message to every group in a category. No backend —
 * everything lives in localStorage on this device, exactly like the design
 * prototype it was built from.
 *
 * The connect flow models the *real* security design (see the GTM integration
 * plan): you link Telegram by scanning a QR code, then set a broadcast PIN that
 * (in the real build) encrypts the session at rest. Each browser session you
 * enter the PIN once to "unlock"; the unlock lasts 30 minutes, refreshed on
 * every send, and is held in memory only — never persisted. Phase 0 fakes all
 * of this with no real crypto, but keeps the same shape so the UX is real.
 */

/** Connection lifecycle. `loggedOut` → (scan QR + set PIN) → `locked` → (enter PIN) → `unlocked`. */
export type GtmPhase = "loggedOut" | "locked" | "unlocked";

export interface GtmGroup {
  id: string;
  name: string;
  handle: string;
  members: number;
  /** Category slugs this group belongs to. */
  cats: string[];
  /** Surfaced with a "new" badge right after the sync that introduced it. */
  isNew?: boolean;
}

export interface GtmState {
  /** Where the user is in the connect → unlock lifecycle. */
  phase: GtmPhase;
  /** @handle / phone shown in the UI and used for "test to myself". */
  userId: string;
  /** Whether a broadcast PIN has been set (i.e. the account is linked). */
  pinSet: boolean;
  synced: boolean;
  groups: GtmGroup[];
  syncedAt: number;
  /** Order categories appear in the rail. */
  catOrder: string[];
  filter: string;
}

const STORAGE_KEY = "titan-os.gtm.v2";

/** 30-minute unlock window, refreshed on each send. Mirrors the real design. */
const UNLOCK_TTL_MS = 30 * 60 * 1000;

/** Phase-0 mock PIN. The real build derives an encryption key from it instead. */
const MOCK_PIN = "1234";

const DEFAULT_CAT_ORDER = ["vc", "angel", "cesto", "partner", "kol", "exchange", "mm"];

/** Groups that aren't admin — flagged in the review modal ("sends as member"). */
export const NOT_ADMIN = new Set(["g6", "g7"]);

/** The catalog a "sync" reveals, in the order Telegram would return them. */
const CATALOG: GtmGroup[] = [
  { id: "g1", name: "Cesto × Paradigm", handle: "@cesto_paradigm", members: 8, cats: ["vc"] },
  { id: "g2", name: "Cesto × a16z crypto", handle: "@cesto_a16z", members: 6, cats: ["vc"] },
  { id: "g3", name: "Cesto Angels", handle: "@cesto_angels", members: 24, cats: ["angel"] },
  { id: "g4", name: "Cesto × Coinbase BD", handle: "@cesto_cb", members: 5, cats: ["partner", "exchange"] },
  { id: "g5", name: "Cesto Power Users", handle: "@cesto_power", members: 156, cats: ["cesto"] },
  { id: "g6", name: "Cesto Community DAO", handle: "@cesto_dao", members: 312, cats: ["cesto"] },
  { id: "g7", name: "Cesto KOL Circle", handle: "@cesto_kol", members: 41, cats: ["kol"] },
  { id: "g8", name: "Cesto × Pantera", handle: "@cesto_pantera", members: 7, cats: [] },
  { id: "g9", name: "Cesto Market Makers", handle: "@cesto_mm", members: 12, cats: ["mm"] },
  { id: "g10", name: "Cesto Builders Guild", handle: "@cesto_builders", members: 88, cats: [] },
];

function loadState(): GtmState {
  const base: GtmState = {
    phase: "loggedOut",
    userId: "",
    pinSet: false,
    synced: false,
    groups: [],
    syncedAt: 0,
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
      groups: d.groups ?? [],
    };
  } catch {
    return base;
  }
}

function clone(groups: GtmGroup[]): GtmGroup[] {
  return groups.map((g) => ({ ...g, cats: [...g.cats] }));
}

export function useGtm() {
  const [state, setState] = useState<GtmState>(loadState);
  const [syncing, setSyncing] = useState(false);
  /**
   * When the current unlock expires (epoch ms), or 0 when locked. Kept in
   * memory only — never persisted — so closing the tab or reloading re-locks,
   * exactly as the real in-memory session lock would behave.
   */
  const [unlockedUntil, setUnlockedUntil] = useState(0);
  const syncTimer = useRef<number | undefined>(undefined);
  const lockTimer = useRef<number | undefined>(undefined);

  // Persist the durable slice on every change. `phase` and `unlockedUntil` are
  // intentionally excluded: a linked account is re-derived as `locked` on load
  // (see loadState), and the unlock window lives only in memory.
  useEffect(() => {
    try {
      const { phase: _phase, ...durable } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(durable));
    } catch {
      /* storage full / unavailable — fine for a mock */
    }
  }, [state]);

  useEffect(
    () => () => {
      window.clearTimeout(syncTimer.current);
      window.clearTimeout(lockTimer.current);
    },
    []
  );

  const handle = useMemo(() => {
    const u = state.userId.trim();
    if (!u) return "@you";
    return u[0] === "@" ? u : "@" + u;
  }, [state.userId]);

  const setField = useCallback(<K extends keyof GtmState>(key: K, value: GtmState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  /** Arm (or refresh) the 30-minute unlock window and schedule the auto-lock. */
  const armUnlock = useCallback(() => {
    window.clearTimeout(lockTimer.current);
    setUnlockedUntil(Date.now() + UNLOCK_TTL_MS);
    lockTimer.current = window.setTimeout(() => {
      setUnlockedUntil(0);
      setState((s) => (s.phase === "unlocked" ? { ...s, phase: "locked" } : s));
    }, UNLOCK_TTL_MS);
  }, []);

  /**
   * Mock QR login: simulates the user scanning the QR from their phone and
   * approving. In the real build this is signInUserWithQrCode → a session
   * string. Here it just records a handle and advances to the set-PIN step.
   */
  const qrLoginMock = useCallback((rawHandle: string) => {
    const u = rawHandle.trim();
    if (!u) return;
    setState((s) => ({ ...s, userId: u }));
  }, []);

  /**
   * Mock set-PIN: in the real build this derives an AES key from the PIN and
   * encrypts the session into IndexedDB. Here it just marks the account linked
   * and drops to the locked screen (the user then enters the PIN to unlock).
   */
  const setPinMock = useCallback((pin: string) => {
    if (pin.trim().length < 4) return false;
    setState((s) => ({ ...s, pinSet: true, phase: "locked" }));
    return true;
  }, []);

  /**
   * Mock unlock: validates the PIN (Phase 0 accepts MOCK_PIN), arms the
   * in-memory 30-minute window, and moves to the unlocked phase. Returns false
   * on a wrong PIN so the UI can show "incorrect PIN".
   */
  const unlockMock = useCallback(
    (pin: string): boolean => {
      if (pin !== MOCK_PIN) return false;
      armUnlock();
      setState((s) => ({ ...s, phase: "unlocked" }));
      return true;
    },
    [armUnlock]
  );

  /** Refresh the unlock window — call at the start of every broadcast send. */
  const touchMock = useCallback(() => {
    setUnlockedUntil((cur) => {
      if (!cur) return cur; // locked — nothing to refresh
      armUnlock();
      return Date.now() + UNLOCK_TTL_MS;
    });
  }, [armUnlock]);

  /** Manual "Lock now" / TTL expiry: zeroize the window and re-lock. */
  const lock = useCallback(() => {
    window.clearTimeout(lockTimer.current);
    setUnlockedUntil(0);
    setState((s) => (s.pinSet ? { ...s, phase: "locked" } : s));
  }, []);

  /** Unlink the account entirely (forgotten PIN / disconnect): back to QR. */
  const disconnect = useCallback(() => {
    window.clearTimeout(lockTimer.current);
    setUnlockedUntil(0);
    setState((s) => ({ ...s, phase: "loggedOut", pinSet: false }));
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    window.clearTimeout(lockTimer.current);
    setUnlockedUntil(0);
    setState(loadState());
  }, []);

  /**
   * Simulate a Telegram sync. First sync seeds 8 groups; later syncs reveal one
   * more from the catalog (flagged "new") until the catalog is exhausted.
   * Returns a toast message describing what happened.
   */
  const sync = useCallback((onToast?: (msg: string) => void) => {
    setSyncing((cur) => {
      if (cur) return cur;
      window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => {
        setState((s) => {
          if (!s.synced) {
            const groups = clone(CATALOG.slice(0, 8));
            onToast?.("Synced 8 groups from Telegram");
            return { ...s, synced: true, groups, syncedAt: Date.now() };
          }
          const next = CATALOG[s.groups.length];
          if (!next) {
            onToast?.("No new groups found");
            return { ...s, syncedAt: Date.now() };
          }
          const cleared = s.groups.map((g) => ({ ...g, isNew: false }));
          const groups = [...cleared, { ...next, cats: [...next.cats], isNew: true }];
          onToast?.("+1 new group · " + next.name);
          return { ...s, groups, syncedAt: Date.now() };
        });
        setSyncing(false);
      }, 750);
      return true;
    });
  }, []);

  // ---- selection-independent group mutations ----

  const toggleGroupCat = useCallback((gid: string, cid: string) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) =>
        g.id === gid
          ? { ...g, cats: g.cats.includes(cid) ? g.cats.filter((c) => c !== cid) : [...g.cats, cid] }
          : g
      ),
    }));
  }, []);

  /** Add a brand-new category (registering it in catOrder) to one group. */
  const addCategoryToGroup = useCallback((gid: string, rawCat: string) => {
    const cat = rawCat.trim().toLowerCase().replace(/\s+/g, "-");
    if (!cat) return;
    setState((s) => ({
      ...s,
      catOrder: s.catOrder.includes(cat) ? s.catOrder : [...s.catOrder, cat],
      groups: s.groups.map((g) =>
        g.id === gid ? { ...g, cats: g.cats.includes(cat) ? g.cats : [...g.cats, cat] } : g
      ),
    }));
  }, []);

  /**
   * Tri-state bulk toggle across a set of groups: if every selected group
   * already has the category, remove it from all; otherwise add it to all.
   * Returns true when the net action was "add", false when "remove".
   */
  const bulkToggleCat = useCallback((ids: string[], cid: string): boolean => {
    let added = true;
    setState((s) => {
      const sel = s.groups.filter((g) => ids.includes(g.id));
      if (!sel.length) return s;
      const allHave = sel.every((g) => g.cats.includes(cid));
      added = !allHave;
      return {
        ...s,
        groups: s.groups.map((g) => {
          if (!ids.includes(g.id)) return g;
          if (allHave) return { ...g, cats: g.cats.filter((c) => c !== cid) };
          return g.cats.includes(cid) ? g : { ...g, cats: [...g.cats, cid] };
        }),
      };
    });
    return added;
  }, []);

  const bulkAddNewCat = useCallback((ids: string[], rawCat: string): string | null => {
    const cat = rawCat.trim().toLowerCase().replace(/\s+/g, "-");
    if (!cat) return null;
    setState((s) => ({
      ...s,
      catOrder: s.catOrder.includes(cat) ? s.catOrder : [...s.catOrder, cat],
      groups: s.groups.map((g) =>
        ids.includes(g.id) ? (g.cats.includes(cat) ? g : { ...g, cats: [...g.cats, cat] }) : g
      ),
    }));
    return cat;
  }, []);

  const syncedAgo = useCallback(() => {
    const t = state.syncedAt;
    if (!t) return "just now";
    const d = Math.floor((Date.now() - t) / 1000);
    if (d < 60) return "just now";
    if (d < 3600) return Math.floor(d / 60) + "m ago";
    return Math.floor(d / 3600) + "h ago";
  }, [state.syncedAt]);

  const unlocked = state.phase === "unlocked" && unlockedUntil > Date.now();

  /** Remaining unlock time as "mm:ss" (clamped at 0), for the TTL pill. */
  const ttlLabel = useCallback(() => {
    const ms = Math.max(0, unlockedUntil - Date.now());
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [unlockedUntil]);

  return {
    state,
    syncing,
    handle,
    unlocked,
    unlockedUntil,
    setField,
    qrLoginMock,
    setPinMock,
    unlockMock,
    touchMock,
    lock,
    disconnect,
    reset,
    sync,
    toggleGroupCat,
    addCategoryToGroup,
    bulkToggleCat,
    bulkAddNewCat,
    syncedAgo,
    ttlLabel,
  };
}
