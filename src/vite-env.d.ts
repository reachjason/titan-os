/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_CONVEX_SITE_URL: string;
  /** Telegram app identity (api_id / api_hash from my.telegram.org/apps).
   *  App-level, low-sensitivity — like Telegram's own web client embeds. NOT
   *  account credentials; the session string is the secret, and it never leaves
   *  the device. Ships in the client bundle (Option A). */
  readonly VITE_TG_API_ID: string;
  readonly VITE_TG_API_HASH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
