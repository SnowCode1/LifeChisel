// Where the sync server is (docs/SYNC.md). In development the web app reaches
// it through Vite's proxy at /sync, so the passkey challenge cookie stays on
// this site; VITE_SYNC_TARGET (vite.config.ts) picks the server behind it.
// Production builds offer sync only once VITE_SYNC_URL names a server on the
// same site as the app.

/** The development server, deployed to the founder's Cloudflare account. */
export const DEV_SYNC_TARGET =
  'https://onpurpose-sync-dev.onpurpose-dev.workers.dev';

const configured = import.meta.env.VITE_SYNC_URL as string | undefined;

/** Base address for sync requests from this page. */
export const SYNC_BASE = configured ?? '/sync';

/**
 * Names the server in this device's sync state, so pointing the app at
 * another server links again instead of mixing accounts.
 */
export const SYNC_SERVER =
  configured ??
  (import.meta.env.VITE_SYNC_TARGET as string | undefined) ??
  DEV_SYNC_TARGET;

export const syncAvailable = import.meta.env.DEV || !!configured;
