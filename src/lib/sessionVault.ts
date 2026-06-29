import { config } from "../config";

/**
 * sessionVault — encryption at rest for the Telegram session string.
 *
 * The session string grants full access to the user's Telegram account, so it
 * is the one true secret in this feature. It must never leave the device and
 * never sit in plaintext anywhere. This module keeps it as AES-256-GCM
 * ciphertext in IndexedDB, under a key derived from the user's broadcast PIN.
 *
 * Security shape:
 *  - Key derivation: PBKDF2-SHA256 (high iteration count) over the PIN + a
 *    per-vault random salt. The KDF + its params are stored in the record
 *    (`kdf`) so a stronger KDF (Argon2id) can be added later without a
 *    migration — a vault never silently downgrades.
 *  - The derived CryptoKey is NON-EXTRACTABLE: code (even XSS) can use it to
 *    decrypt but cannot read the key bytes out to replay elsewhere.
 *  - We hold the key and decrypt on demand, so the plaintext session only
 *    exists transiently during a send — never resident for the unlock window.
 *  - Wrong PIN is detected by AES-GCM auth-tag failure; there is no separate
 *    stored PIN hash to weaken the at-rest blob.
 *
 * A forgotten PIN means the vault is unrecoverable — by design, there is no
 * backdoor. The user simply re-links Telegram via QR.
 */

const { dbName, storeName, recordKey, version: VAULT_VERSION, pbkdf2Iterations } =
  config.storage.vault;

export type VaultErrorCode = "BAD_PIN" | "NO_VAULT" | "CORRUPT" | "VERSION" | "EXISTS" | "CRYPTO";

export class VaultError extends Error {
  constructor(public code: VaultErrorCode, message?: string) {
    super(message ?? code);
    this.name = "VaultError";
  }
}

/** KDF descriptor stored in the record so params are data-driven, not hardcoded. */
type KdfParams = { algo: "pbkdf2"; hash: "SHA-256"; iterations: number };

interface VaultRecord {
  version: number;
  kdf: KdfParams;
  /** Per-vault, fixed for the life of one PIN. */
  salt: Uint8Array<ArrayBuffer>;
  /** Per-encryption — regenerated on every write (never reuse (key, IV) in GCM). */
  iv: Uint8Array<ArrayBuffer>;
  /** AES-256-GCM(sessionString); GCM tag is appended by WebCrypto. */
  ciphertext: Uint8Array<ArrayBuffer>;
  createdAt: number;
}

/** An unlocked handle: the usable (non-extractable) key. */
export interface UnlockedVault {
  readonly key: CryptoKey;
}

// ---- IndexedDB plumbing (one db, one store, one fixed record key) ----

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new VaultError("CRYPTO", "IndexedDB unavailable"));
  });
}

function idbGet(db: IDBDatabase): Promise<VaultRecord | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(recordKey);
    req.onsuccess = () => resolve(req.result as VaultRecord | undefined);
    req.onerror = () => reject(new VaultError("CRYPTO", "read failed"));
  });
}

function idbPut(db: IDBDatabase, record: VaultRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(record, recordKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new VaultError("CRYPTO", "write failed"));
  });
}

function idbDelete(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(recordKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new VaultError("CRYPTO", "delete failed"));
  });
}

// ---- crypto helpers ----

const dec = new TextDecoder();

/** UTF-8 encode into an ArrayBuffer-backed view (satisfies BufferSource in TS 5.6). */
function utf8(s: string): Uint8Array<ArrayBuffer> {
  const src = new TextEncoder().encode(s);
  const out = new Uint8Array(new ArrayBuffer(src.byteLength));
  out.set(src);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(b);
  return b;
}

/** Derive a non-extractable AES-GCM key from the PIN + salt via PBKDF2. */
async function deriveKey(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  kdf: KdfParams
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", utf8(pin), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: kdf.iterations, hash: kdf.hash },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"]
  );
}

function defaultKdf(): KdfParams {
  return { algo: "pbkdf2", hash: "SHA-256", iterations: pbkdf2Iterations };
}

// ---- public API ----

/** Is there a vault on this device? (drives connect screen vs unlock screen) */
export async function hasVault(): Promise<boolean> {
  const db = await openDb();
  try {
    return (await idbGet(db)) !== undefined;
  } finally {
    db.close();
  }
}

/**
 * First-time setup: derive a key from the PIN, encrypt the session, persist.
 * Throws VaultError("EXISTS") if a vault already exists — re-keying must go
 * through an explicit wipe() first.
 */
export async function createVault(pin: string, sessionString: string): Promise<void> {
  const db = await openDb();
  try {
    if ((await idbGet(db)) !== undefined) throw new VaultError("EXISTS");
    const kdf = defaultKdf();
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = await deriveKey(pin, salt, kdf);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, utf8(sessionString))
    );
    await idbPut(db, {
      version: VAULT_VERSION,
      kdf,
      salt,
      iv,
      ciphertext,
      createdAt: Date.now(),
    });
  } finally {
    db.close();
  }
}

/**
 * Verify the PIN and return an unlocked handle. The handle holds a usable but
 * non-extractable key; the plaintext session is NOT produced here. Throws
 * VaultError("BAD_PIN") on a wrong PIN (GCM auth-tag failure), ("NO_VAULT") if
 * none exists, or ("VERSION"/"CORRUPT") on an unreadable record.
 */
export async function unlock(pin: string): Promise<UnlockedVault> {
  const db = await openDb();
  try {
    const rec = await idbGet(db);
    if (!rec) throw new VaultError("NO_VAULT");
    if (rec.version !== VAULT_VERSION) throw new VaultError("VERSION");
    if (!rec.salt || !rec.iv || !rec.ciphertext) throw new VaultError("CORRUPT");
    const key = await deriveKey(pin, rec.salt, rec.kdf);
    // Decrypt once to validate the PIN; discard the plaintext immediately.
    try {
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv }, key, rec.ciphertext);
    } catch {
      throw new VaultError("BAD_PIN");
    }
    return { key };
  } finally {
    db.close();
  }
}

/**
 * Decrypt the session on demand from a live handle. Returns the plaintext
 * session string for the duration of a single send — the caller must not stash
 * it. Re-reads the current record so a rewritten session is picked up.
 */
export async function readSession(handle: UnlockedVault): Promise<string> {
  const db = await openDb();
  try {
    const rec = await idbGet(db);
    if (!rec) throw new VaultError("NO_VAULT");
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: rec.iv },
        handle.key,
        rec.ciphertext
      );
      return dec.decode(plain);
    } catch {
      // Key no longer matches the record (e.g. re-keyed in another tab).
      throw new VaultError("BAD_PIN");
    }
  } finally {
    db.close();
  }
}

/**
 * Re-encrypt a (possibly Telegram-rotated) session under the existing key,
 * generating a fresh IV. Used after login or whenever GramJS updates the
 * session. Requires a live handle (so the same PIN-derived key is reused).
 */
export async function rewriteSession(
  handle: UnlockedVault,
  sessionString: string
): Promise<void> {
  const db = await openDb();
  try {
    const rec = await idbGet(db);
    if (!rec) throw new VaultError("NO_VAULT");
    const iv = randomBytes(12);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, handle.key, utf8(sessionString))
    );
    await idbPut(db, { ...rec, iv, ciphertext });
  } finally {
    db.close();
  }
}

/** Destroy the vault entirely (forgotten PIN, disconnect, reset). */
export async function wipe(): Promise<void> {
  const db = await openDb();
  try {
    await idbDelete(db);
  } finally {
    db.close();
  }
}
