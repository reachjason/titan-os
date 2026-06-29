import { withSession } from "./sessionLock";
import { connectClient } from "./telegramClient";

/**
 * broadcast — the guarded post-only send loop.
 *
 * Sends one message to each target group the user is already in, paced like a
 * human and obeying Telegram's anti-spam signals. This is the highest-risk
 * surface (it acts as the user's account), so the guardrails are not optional:
 *  - random jittered delay between sends (never a tight loop),
 *  - honor FLOOD_WAIT exactly (wait the server-told seconds, then retry),
 *  - treat PEER_FLOOD as a HARD STOP (the account is being flagged as spammy),
 *  - skip per-target errors (not admin, write-forbidden) and keep going,
 *  - abortable, and refresh the unlock window on each send.
 */

export interface BroadcastTarget {
  /** Telegram id (entity resolver input). */
  tgId: string;
  name: string;
}

export interface BroadcastProgress {
  index: number;
  total: number;
  target: BroadcastTarget;
  status: "sent" | "flood_wait" | "skipped" | "aborted";
  waitSeconds?: number;
  error?: string;
}

export interface BroadcastResult {
  sent: number;
  aborted: boolean;
  reason?: "user_stopped" | "peer_flood";
}

/** Min/max jitter (ms) between sends — human-paced, deliberately not 1/sec. */
const DELAY_MIN = 3000;
const DELAY_MAX = 12000;

function rand(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      signal.removeEventListener("abort", done);
      clearTimeout(t);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

function isPeerFlood(e: unknown): boolean {
  const msg = (e as { errorMessage?: string; message?: string });
  return msg?.errorMessage === "PEER_FLOOD" || /PEER_FLOOD/.test(msg?.message ?? "");
}

function floodWaitSeconds(e: unknown): number | null {
  const err = e as { className?: string; seconds?: number; errorMessage?: string };
  if (typeof err?.seconds === "number" && (err.className === "FloodWaitError" || /FLOOD_WAIT/.test(err.errorMessage ?? "")))
    return err.seconds;
  return null;
}

/**
 * Send `message` to each target. Decrypts the session once (via withSession),
 * connects a single client for the whole batch, and disconnects at the end.
 * Reports progress per target and stops hard on PEER_FLOOD or abort.
 */
export async function runBroadcast(
  targets: BroadcastTarget[],
  message: string,
  onProgress: (p: BroadcastProgress) => void,
  signal: AbortSignal
): Promise<BroadcastResult> {
  return withSession(async (sessionString) => {
    const client = await connectClient(sessionString);
    let sent = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        if (signal.aborted) return { sent, aborted: true, reason: "user_stopped" as const };
        const t = targets[i];
        try {
          const entity = await client.getEntity(t.tgId);
          await client.sendMessage(entity, { message });
          sent++;
          onProgress({ index: i, total: targets.length, target: t, status: "sent" });
        } catch (e) {
          const wait = floodWaitSeconds(e);
          if (wait !== null) {
            onProgress({ index: i, total: targets.length, target: t, status: "flood_wait", waitSeconds: wait });
            await sleep(wait * 1000 + 500, signal);
            i--; // retry the same target
            continue;
          }
          if (isPeerFlood(e)) {
            onProgress({ index: i, total: targets.length, target: t, status: "aborted", error: "PEER_FLOOD" });
            return { sent, aborted: true, reason: "peer_flood" as const };
          }
          // Recoverable per-target error (not admin, write forbidden, …) → skip.
          onProgress({
            index: i,
            total: targets.length,
            target: t,
            status: "skipped",
            error: (e as { errorMessage?: string; message?: string })?.errorMessage ??
              (e as Error)?.message ?? "send failed",
          });
        }
        // Human-paced jitter before the next target.
        if (i < targets.length - 1) await sleep(rand(DELAY_MIN, DELAY_MAX), signal);
      }
      return { sent, aborted: false };
    } finally {
      await client.disconnect();
    }
  });
}

/** "Test to myself" — send to Saved Messages before a real blast. */
export async function sendTestToSelf(message: string): Promise<void> {
  return withSession(async (sessionString) => {
    const client = await connectClient(sessionString);
    try {
      await client.sendMessage("me", { message });
    } finally {
      await client.disconnect();
    }
  });
}
