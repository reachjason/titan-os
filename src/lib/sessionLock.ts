import { config } from "../config";
import { unlock as vaultUnlock, readSession, type UnlockedVault } from "./sessionVault";

/**
 * sessionLock — the in-memory unlock manager for the Telegram session.
 *
 * The user enters their broadcast PIN once per session. We hold the resulting
 * (non-extractable) key handle in module memory with a 30-minute TTL that is
 * refreshed on every send, so a burst of broadcasts needs only one PIN entry.
 * Nothing here is ever persisted: a tab close or reload drops the handle and
 * re-locks — the encrypted blob in IndexedDB is the only thing that survives.
 *
 * Zeroization caveat: JavaScript can't reliably wipe secrets. The transient
 * session string produced inside `withSession` is an immutable, GC-managed
 * string — it can't be scrubbed, which is exactly why we decrypt on demand
 * (short-lived) rather than holding plaintext for the whole window. Dropping
 * the non-extractable CryptoKey reference is the one disposal with real teeth.
 */

const TTL_MS = config.storage.vault.ttlMs;

let current: UnlockedVault | null = null;
let expiresAt = 0; // epoch ms; 0 = locked
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

function arm() {
  expiresAt = Date.now() + TTL_MS;
  if (timer) clearTimeout(timer);
  timer = setTimeout(lock, TTL_MS);
}

/** Enter the PIN: unlock the vault and arm the TTL. Throws on a wrong PIN. */
export async function unlockWithPin(pin: string): Promise<void> {
  const handle = await vaultUnlock(pin); // throws VaultError("BAD_PIN") on miss
  current = handle;
  arm();
  emit();
}

/** Refresh the 30-minute window — call at the start of every broadcast send. */
export function touch(): void {
  if (!current) return;
  arm();
  emit();
}

export function isUnlocked(): boolean {
  return current !== null && Date.now() < expiresAt;
}

export function getHandle(): UnlockedVault | null {
  return isUnlocked() ? current : null;
}

/**
 * Run `fn` with the decrypted session string, counting the call as activity
 * (refreshes the TTL). The plaintext is function-scoped — do not stash it.
 * Throws "LOCKED" if not currently unlocked.
 */
export async function withSession<T>(fn: (session: string) => Promise<T>): Promise<T> {
  const h = getHandle();
  if (!h) throw new Error("LOCKED");
  touch();
  const session = await readSession(h);
  return fn(session);
}

/** Manual "lock now", TTL expiry, or logout: drop the handle and re-lock. */
export function lock(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  // Dropping the non-extractable key reference hands disposal to the browser.
  current = null;
  expiresAt = 0;
  emit();
}

/** Remaining unlock time in ms (0 when locked) — for the TTL countdown. */
export function remainingMs(): number {
  return isUnlocked() ? expiresAt - Date.now() : 0;
}

// ---- React glue (useSyncExternalStore) ----
export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function getSnapshot(): boolean {
  return isUnlocked();
}

// Best-effort: lock on tab hide/close. The heap is torn down anyway, but this
// runs the timer cleanup and key-drop deterministically on navigation.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", lock);
}
