import type { TelegramClient } from "telegram";
import type { GtmGroup } from "../store/useGtm";

/**
 * telegramClient — the GramJS (MTProto) wrapper for the GTM broadcast feature.
 *
 * Runs entirely in the browser (Option A): the session string never reaches a
 * server. GramJS is heavy, so it is loaded via dynamic import only when the
 * connect/broadcast path is actually used, keeping it out of the main bundle.
 *
 * The app's api_id/api_hash are app identity (from env), not account secrets —
 * see the GTM plan. The real secret, the session string, is produced by QR
 * login here and handed straight to the encrypted vault by the caller.
 */

const API_ID = Number(import.meta.env.VITE_TG_API_ID);
const API_HASH = import.meta.env.VITE_TG_API_HASH;

export function hasTelegramCredentials(): boolean {
  return Number.isFinite(API_ID) && API_ID > 0 && !!API_HASH;
}

/** Lazy-load the heavy GramJS modules only when needed (keeps them out of the
 *  initial bundle). Node-core shims (Buffer, util, stream, crypto, …) are
 *  provided globally by vite-plugin-node-polyfills. */
async function loadGramjs() {
  const [{ TelegramClient }, { StringSession }, logger] = await Promise.all([
    import("telegram"),
    import("telegram/sessions"),
    import("telegram/extensions/Logger"),
  ]);
  return { TelegramClient, StringSession, LogLevel: logger.LogLevel };
}

/** base64url-encode the QR login token for the tg://login deep link. */
function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export interface QrLoginHandlers {
  /** Called with the tg://login URL to encode as a QR; re-called when it refreshes. */
  onUrl: (url: string) => void;
  /** Called when the account has 2FA — must resolve the user's password. */
  getPassword: (hint?: string) => Promise<string>;
}

/**
 * Drive a QR login to completion and return the session string. The caller is
 * responsible for immediately encrypting it (createVault) and then discarding
 * the plaintext. The client is disconnected before returning.
 */
export async function qrLogin(handlers: QrLoginHandlers): Promise<string> {
  const { TelegramClient, StringSession, LogLevel } = await loadGramjs();
  const session = new StringSession("");
  const client = new TelegramClient(session, API_ID, API_HASH, { connectionRetries: 3 });
  client.setLogLevel(LogLevel.NONE); // never log the session or traffic

  await client.connect();
  try {
    await client.signInUserWithQrCode(
      { apiId: API_ID, apiHash: API_HASH },
      {
        qrCode: async ({ token }) => {
          handlers.onUrl(`tg://login?token=${base64Url(new Uint8Array(token))}`);
        },
        password: async (hint) => handlers.getPassword(hint),
        onError: async (err) => {
          // Returning false lets GramJS keep retrying token regeneration.
          console.warn("[tg] qr login error:", err.message);
          return false;
        },
      }
    );
    return session.save();
  } finally {
    await client.disconnect();
  }
}

/** Connect a client from a saved session string (for sync / broadcast). */
export async function connectClient(sessionString: string): Promise<TelegramClient> {
  const { TelegramClient, StringSession, LogLevel } = await loadGramjs();
  const client = new TelegramClient(new StringSession(sessionString), API_ID, API_HASH, {
    connectionRetries: 3,
  });
  client.setLogLevel(LogLevel.NONE);
  await client.connect();
  return client;
}

/** A group/channel pulled from the user's dialog list. */
export interface FetchedGroup {
  tgId: string;
  name: string;
  handle: string;
  members: number;
}

/** Fetch the groups/channels (not 1:1 chats) the user is a member of. */
export async function fetchGroups(client: TelegramClient): Promise<FetchedGroup[]> {
  const dialogs = await client.getDialogs({ limit: 500 });
  const out: FetchedGroup[] = [];
  for (const d of dialogs) {
    if (!d.isGroup && !d.isChannel) continue; // skip user DMs
    const entity = d.entity as
      | { id?: { toString(): string }; username?: string; participantsCount?: number }
      | undefined;
    if (!entity?.id) continue;
    out.push({
      tgId: entity.id.toString(),
      name: (d.title || d.name || "Untitled").toString(),
      handle: entity.username ? `@${entity.username}` : "",
      members: typeof entity.participantsCount === "number" ? entity.participantsCount : 0,
    });
  }
  return out;
}

/** Map a FetchedGroup to the upsert shape (the Convex cache owns categories). */
export function toUpsert(g: FetchedGroup): Omit<GtmGroup, "id" | "isNew" | "cats"> {
  return { tgId: g.tgId, name: g.name, handle: g.handle, members: g.members };
}
