# Cross-device sync

Status: built for the web app against the development server (18 October
2026); the phone, payments and a production server are not built. The
direction was agreed on 18 October 2026 (see [DECISIONS.md](DECISIONS.md)).
Each rule below is marked as a founder decision or an assistant proposal or
implementation. Read [STORAGE.md](STORAGE.md) first: sync extends the event
log (storage v24, SQL schema 2), it does not replace it.

## What sync is

Sync is an optional paid service that keeps one person's habits the same on
their phones and in the browser, and keeps an encrypted copy in the cloud.

- **On-device use stays complete and account-free** (founder decision).
  Everything works offline, saves locally first and never waits for the
  network. Sync is a background copy.
- **Sync is its own subscription, independent of the one-time unlock**
  (founder decision). A free-tier user can subscribe to sync and keeps the
  five-habit limit; an unlocked user does not need sync.
- **Once someone has an account, the one-time unlock belongs to the account**
  (founder decision), so buying it on one platform unlocks every platform.
- **Payment never locks records** (existing rule). When a subscription lapses,
  every device keeps its full local copy and simply stops syncing. Assistant
  proposal: keep the cloud copy for 90 days after a lapse, warn before
  deleting it, and resume where it left off if the person subscribes again.
- **End-to-end encrypted from day one** (founder decision). The server stores
  and orders events it cannot read.

## Architecture

Founder decision: Cloudflare, with one small server and database per account
(a Durable Object), plus a separate sign-in service: Better Auth in the same
Worker.

```
 phone / browser                       Cloudflare
 ┌─────────────────────┐   HTTPS   ┌──────────────────────────────┐
 │ local event log     │ ───────▶  │ Worker: sign-in, entitlement │
 │ (SQLite, schema 2)  │ ◀───────  │ check, routing               │
 │ + sync state        │           └──────────────┬───────────────┘
 │ + encryption key    │                          │ one per account
 └─────────────────────┘           ┌──────────────▼───────────────┐
                                   │ Account mailbox (Durable     │
                                   │ Object with its own SQLite): │
                                   │ encrypted events in order,   │
                                   │ the wrapped account key      │
                                   └──────────────────────────────┘
```

| Part             | Job                                                                                    | Where                                |
| ---------------- | -------------------------------------------------------------------------------------- | ------------------------------------ |
| Account mailbox  | Stores encrypted events in arrival order, numbers them, refuses pushes that are behind | `apps/sync/src/mailbox.ts`           |
| Worker           | HTTPS API, sign-in, checks the sync entitlement, routes to the account's mailbox       | `apps/sync/src/api.ts`, `index.ts`   |
| Protocol         | Request/response shapes and limits shared by the server and both apps                  | `packages/core/src/sync/protocol.ts` |
| Device sync      | Pull, decrypt, rebase, conflicts, push, first sync; shared by both apps                | `packages/core/src/sync/`            |
| Sign-in          | Accounts, bearer sessions, passkeys; later Apple, Google and an emailed code           | `apps/sync/src/auth.ts`              |
| Web app          | Sign-in, unlocking, approvals, status, first-sync choice, conflicts, restore           | `apps/web/src/sync/`                 |
| Payments (to do) | Unlock and sync entitlements on every platform                                         | RevenueCat                           |

Why one mailbox per account: each handles one request at a time, so "refuse a
push that is behind" needs no locking; its SQLite sits in the same process, so
there is no database round trip; it is created near its first user; and one
heavy account cannot slow another. Cloudflare recommends this pattern for
per-user data. The cost is that work across all accounts (totals, fixes) has
to visit each mailbox, and each mailbox upgrades its own tables when it wakes.

## The mailbox protocol (version 1)

The server only sees, per event, an event ID, the writing device's ID, the
encrypted payload and the times. It assigns each event the next number in the
account's single order. Each mailbox also has an **epoch**, a random name for
its current contents; erasing the cloud copy starts a new one, so a device
notices instead of pushing onto it blindly.

- `GET /v1/events?after=N&limit=M`: the epoch, the head (newest number), the
  events numbered after `N` oldest first, and whether more remain. It also
  counts the open device approval requests (`links`), so a signed-in device
  notices one without asking separately.
- `POST /v1/events` with `{ epoch, expectedHead, events }`: appends the
  events in order, all or nothing, if both still match. Otherwise `409` with
  the reason: `behind` (pull first), `duplicate` (a retried push that had
  landed; pull to see it) or `reset` (the cloud copy was erased).
- `GET /v1/keys`: the account key's wrapped copies (see
  [Unlocking a new device](#unlocking-a-new-device)), each with an ID, kind,
  label and wrapped key. `PUT /v1/keys/:id` with
  `{ kind, label, wrapped, previous }` saves one, compare-and-set, so two
  devices cannot replace each other's copy; the copy named `recovery` is the
  emergency recovery code's. `DELETE /v1/keys/:id` removes a passkey copy;
  the recovery copy cannot be removed. At most 20 copies.
- `POST /v1/links` with `{ id, label, newKey }`, `GET /v1/links` (the open
  requests), `GET /v1/links/:id` and `POST /v1/links/:id` with
  `{ step, value }`: the relay for device approval. Each step can be written
  once and only in order; requests expire after ten minutes, and at most five
  can be open.
- `POST /v1/reset` with `{ epoch }`: erase the events and start a new epoch;
  the key copies stay.
- Account deletion is Better Auth's `POST /api/auth/delete-user`; it erases the
  mailbox (events, key copies and requests) before the sign-in records go.

There is no other merge on the server. The limits live in `protocol.ts`; the
device-side client (`client.ts`) checks every answer rather than trusting it.

Later addition (assistant proposal): a WebSocket "poke" so open devices pull
straight away, using hibernation so idle connections cost nothing. Until then
devices sync two seconds after an edit, every minute while open, and when
asked.

## The device side

Assistant implementation in `packages/core/src/sync/`, shared by both apps:
`engine.ts` (the cycle and first sync), `rebase.ts`, `conflicts.ts`, `plan.ts`
(changes towards another state), `crypto.ts` and `client.ts`.

Each device's log has two parts: the **confirmed** events, which match the
account's order exactly, and a **pending** tail of local events not yet sent.
`sync_state.confirmed` is the boundary. The engine:

1. saves nothing itself: edits save locally at once, as always;
2. pulls new events, decrypts them and checks that the account's order
   replays;
3. **rebases** inside the store's write queue: replays the pending events on
   top of the new ones and rewrites the log after the confirmed part in one
   transaction (see STORAGE.md, schema 2);
4. pushes the pending events in batches with the head it last saw; on
   `behind` or `duplicate` it repeats from step 2.

Rebasing re-checks every pending edit against the current value, because
replay checks every event strictly:

| Rule today                                                  | During a rebase                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `sequence` is contiguous and never changes                  | Pending events are renumbered after the new confirmed ones. Confirmed events never change.                          |
| Each change's `before` must match the current value         | Unchanged on the other device: `before` is re-derived. Already made there: dropped silently. Different: a conflict. |
| A habit definition is one before/after value                | Merged field by field: a rename on one device and a new icon on the other both apply.                               |
| An order change lists every habit                           | This device's relative order of the habits it moved is kept; habits added elsewhere keep their places.              |
| A correction group continues only right after its last edit | A remote event in between makes the pending edit start its own group.                                               |
| Undo must target the newest action, with its exact inverse  | Still the newest: it undoes it as it is now. Otherwise it becomes an ordinary change back, checked value by value.  |
| Redo is cleared by any new change                           | Remote changes clear Redo, as a local change would; a Redo whose target is gone becomes an ordinary change.         |

When a rebase changes or drops a pending edit (not just renumbers it), the
device first keeps a copy of its whole log in its recovery archive. A pending
event that was pushed before but whose reply was lost is recognised by its ID
and not sent twice. Events written before sync was set up are never rebased:
they reach the account only by the first upload.

### Conflicts

Founder decision: conflicts are resolved with a best guess applied straight
away, and only the bad cases are shown to the person, who can change the
choice. Assistant implementation:

| Case                                                             | Handling                                            |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| Both devices made the same change (both ticked Tuesday)          | Merged silently                                     |
| Different values for one day (5 on one, 7 on the other)          | The later edit is kept; listed                      |
| The same field of a habit, or the same note, changed differently | The later edit is kept; listed with the other value |
| A habit deleted on one device but changed on the other           | Kept; listed, with Delete it as the other choice    |
| An edit that no longer applies at all (its habit is gone)        | Dropped; listed                                     |
| Preferences                                                      | The later choice is kept, not listed                |

The grid is never blocked: the guess is saved like any edit, and History lists
the conflicts at the top (web: `apps/web/src/sync/Conflicts.tsx`, wording from
core `conflictText`). Choosing the other value is an ordinary, undoable edit;
OK clears the notice. Conflicts stay on the device that found them, in the
`sync_conflicts` table, outside the log and backups.

"Later" uses each event's `recordedAt`. It never decides the log's order,
because device clocks can be wrong. An edit time more than five minutes after
the moment the edit could have reached the server (its `receivedAt`, or now
for this device's own) is clearly wrong, and that moment is used instead. A
slow clock cannot be told apart from an offline device, so its edit counts as
older.

## Preferences: shared or per device

Founder decision: sync how habits look and are counted; keep what depends on
the screen or the hardware on each device. This supersedes the 13 October
assistant proposal that grid sizes travel with sync.

| Synced to every device                   | Kept per device                             |
| ---------------------------------------- | ------------------------------------------- |
| Week start, Hide completed               | Text size                                   |
| Theme mode and both backgrounds          | Grid sizes (name column, day columns, rows) |
| Checkbox style, cell look, week dividers | Haptics, tap animations                     |
|                                          | Home view (already per device)              |

Assistant implementation (storage v24): a device follows the latest choice
from any device until it makes its own, then keeps its own. Choices made
before v24 count as every device's own, so a device that took over an older
log keeps the text size that log had. Haptics never follows another device.

## Encryption

Founder decision: from day one. Assistant implementation (`crypto.ts`):

- The account gets a random AES-256-GCM key on the first device that sets up
  sync. Each event is encrypted with it before it leaves the device; the
  ciphertext is bound to the event's position, ID and device, so the server
  cannot reorder, renumber or swap events without decryption failing.
- The server keeps the key only in **wrapped copies**, each encrypted with a
  key that only the person can produce (HKDF-SHA-256, bound to the account
  and to the kind of copy). There is one copy for the emergency recovery code
  and one for each passkey that can unlock; how a new device gets the key is
  described in [Unlocking a new device](#unlocking-a-new-device).
- The person saves an **emergency recovery code** once: 160 random bits shown
  as eight groups of four characters (Crockford base32; I, L and O are read as
  1, 1 and 0, and case and dashes do not matter).
- A signed-in device can make a new code (Settings → Sync); the old one stops
  working. For that the key is kept extractable, in IndexedDB in the browser
  (never `localStorage`). This replaces the earlier proposal of a
  non-extractable key: a page script could use either kind to decrypt, so not
  being able to make a new code was the larger risk.
- The server sees: the account, event IDs, device IDs, sizes and times, and
  the names of the passkeys and devices involved in unlocking (such as "Edge
  on Windows"). It never sees habit names, notes or values.
- If every device, every unlocking passkey and the emergency code are lost,
  nobody can read the cloud copy, including us. Local backup files are
  unaffected. The app says this when sync is set up.
- The phone still needs a native AES-GCM library.

## Unlocking a new device

Founder decision (19 October 2026, see DECISIONS.md): a passkey unlocks sync
at sign-in for convenience; approving from a device that is already synced is
the fallback; the recovery code becomes the **emergency recovery code**, for
when neither is possible. Assistant implementation:

A signed-in device tries, in order: the key it already holds; a passkey copy
(if it signed in with a passkey that can unlock); otherwise it asks the
person's other devices for approval, offering the emergency code as a link.
An account with no key yet shows Set up sync.

**Passkey unlock** (`crypto.ts`, `engine.ts`, web `passkeys.ts`). Passkeys
with the WebAuthn PRF extension give the site a secret that only that passkey
can produce, after the person's fingerprint, face or PIN. The app asks for it
with the same input everywhere (SHA-256 of `onpurpose-passkey-unlock-v1`) at
every passkey sign-in, and wraps the account key with a key derived from that
secret. The copy is named after the passkey (`pk-` and a hash of its
credential ID), so the server cannot tell which secret belongs to which
passkey beyond that name. Better Auth's passkey client is used as is: with
`returnWebAuthnResponse` it hands the extension result to the app and does not
send it to the server. Adding a passkey in Settings → Sync stores its copy
straight away when the provider supports PRF; otherwise the next passkey
sign-in on a synced device does. A passkey synced through iCloud Keychain,
Google Password Manager or another manager unlocks on every device it reaches.
Support depends on the browser and the passkey provider:
`/passkey-check.html` (development only) tests a browser.

**Approval from another device** (`link.ts`). The server relays messages
between the two devices but must not be able to slip in its own key. This is
the numeric comparison used to pair Bluetooth devices:

1. The new device makes a one-time P-256 key pair and posts a request with
   its public key and a label ("Edge on Windows").
2. A synced device that notices the request (on focus, every 20 seconds while
   visible, or from a pull's `links` count) posts its own one-time public key.
3. The new device posts a commitment: SHA-256 of both public keys and a random
   nonce that it keeps secret for now.
4. The approver posts its random nonce; then the new device reveals its own.
   The approver checks it against the commitment.
5. Both show a six-digit code computed from both keys and both nonces. A
   relay that substituted keys would have had to commit before seeing the
   approver's nonce, so it gets a matching code only by a one-in-a-million
   guess, once per request.
6. The person compares the codes and approves (confirming with one of the
   account's passkeys when it has any). The approver then seals the account
   key for the new device with a key from the ECDH secret and the whole
   transcript, and the new device opens it. Declining, or closing the prompt,
   ends the request.

Each step is write-once in the mailbox, so a second approver cannot take over
a request; a request lasts ten minutes. Signing in still needs the account
(password or passkey); approval only moves the key.

**Emergency recovery code**: typed on the new device, it unwraps the
`recovery` copy as before. It is offered from the approval screen and in
Settings → Sync.

Encryption limits the harm of a breach, including a sign-in breach, but the
account email, billing records and metadata are still personal data.

## First sync on a device that already has data

Founder decision, from an assistant proposal; implemented in `engine.ts`:

- If the account is empty, this device uploads its log. If this device has
  no habit actions of its own (a new phone, a fresh browser), it takes the
  account's log without asking.
- If both have data, the person chooses: combine (suggested), use the
  account's, or use this device's. Combining takes the account's log and adds
  this device's habits, days and notes as one undoable `combine` batch;
  habits with the same ID, or the same name and kind, are offered as matches
  to confirm (`plan.ts`). Where both have a value for a day, the account's is
  kept. Using this device's erases the cloud copy (a new epoch) and uploads
  this device's log.
- Whatever is replaced on this device is kept first as a recovery copy.
- When another device has erased the cloud copy, a device with nothing unsent
  follows it quietly; one with unsent edits is asked, as on first sync.

## Restoring a backup

Founder decision, from an assistant proposal; implemented on the web: a
restore is one ordinary undoable action, "Restored from a backup", made of the
changes that bring today's data to the backup's (`restorePlan` in `plan.ts`).
It syncs like any edit and keeps History. Two forms are offered: bring back
what is missing (the default: habits, days and notes this device lacks), or
make everything match (days, notes, definitions and order; habits the backup
lacks are archived). Without sync, Replace everything (the earlier full
replacement, including History) is still offered. Restoring the kept
pre-restore copy works the same way while synced. Preferences are not part of
a change-based restore.

Separately, the mailbox's 30-day point-in-time restore is an operator tool for
a sync bug that damages data; it works on encrypted data too.

## Accounts, sign-in and payment

- **Sign-in** (Better Auth, open source, in the Worker, accounts in D1; see
  [Development](#development)): passkeys now; later Sign in with Apple (the
  native sheet on iPhone), Google (Android's account picker) and an emailed
  code. Offering Apple satisfies Apple's rule that Google sign-in needs a
  private alternative. An account is needed only for sync and for carrying
  the unlock.
- **Account deletion** (both stores require it): Settings → Sync → Delete
  account deletes the account and its cloud copy; each device keeps its own
  habits. Better Auth may ask to sign in again if the session is old. A
  deletion web page (Google requires one) is not built yet.
- **Payments:** RevenueCat with two entitlements on one account: the one-time
  unlock and the sync subscription. The Worker learns of subscription changes
  through RevenueCat webhooks and checks the entitlement before mailbox calls.
  Web purchases go through Stripe via RevenueCat. Not built; until then only
  servers with `DEV_FREE_SYNC` allow sync.
- **Store rules** (checked 18 October 2026, not legal advice): the iPhone app
  must also sell sync through Apple's in-app purchase; a subscription bought on
  Android or the web may then be used on iPhone. Data held on the server must
  be declared in Google's Data safety form and the privacy policy.
- **F-Droid** (founder decision): no sync at launch. Because the server checks
  payment, a sync subscription bought on the web could later work in an
  F-Droid build without store billing.

## Backups and recovery

- Every synced device holds a full copy of the log, so one lost device loses
  nothing.
- Each mailbox can be restored to any moment in the last 30 days (Cloudflare's
  point-in-time recovery for Durable Object SQLite).
- Assistant proposal: an off-site nightly copy of each mailbox's encrypted
  events to R2 for longer retention.
- Backup files from Settings hold the whole log as before.

## Expected costs

Estimates from Cloudflare's published prices on 18 October 2026, assuming
about 20 edits a day and five syncs a day per person and about 2 MB stored per
person per year. Rows written dominate, so pushes are batched.

| Sync users | Cloudflare per month (first year) |
| ---------: | --------------------------------: |
|     10,000 |                        about $8–9 |
|    100,000 |                        about $155 |

The paid Workers plan has a $5 monthly minimum. Store fees (15%) and RevenueCat
(1% above US$2,500 a month) cost more than the hosting.

## Security

Founder-approved principle: the source is public, so nothing may depend on the
app behaving. Every check that matters runs on the server with keys that never
appear in the code, and every device distrusts what it pulls.

| Threat                                                 | Protection                                                                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A modified app claims sync it has not paid for         | The Worker checks the entitlement with RevenueCat using a secret held only in Cloudflare. Until that exists, sync is refused everywhere except development servers (`DEV_FREE_SYNC`).      |
| A modified app reads or writes another account         | The mailbox is chosen from the signed-in session (`user:<id>`), never from anything the request names.                                                                                     |
| Leaked secrets                                         | Secrets are Worker secrets (`wrangler secret put`), never in the repository. The public local secret is refused off localhost.                                                             |
| Password guessing and sign-up abuse                    | Better Auth rate limits per address, stored in D1. Before launch: Cloudflare Turnstile on sign-up and rate limits on the sync API.                                                         |
| A fake app harvesting sign-ins                         | Passkeys belong to the apps' domain, so another app cannot use them.                                                                                                                       |
| Abuse or running up costs                              | Payload and batch limits (in the protocol). Before launch: a storage quota per account. Only paying accounts may push.                                                                     |
| A breached server or a Cloudflare insider              | Contents are encrypted, and each ciphertext is bound to its position, ID and device, so reordering, renumbering or swapping fails to decrypt. Withholding the newest events is not caught. |
| A buggy or hostile device in the person's own account  | Tampered data fails decryption, and pulled events must replay before anything is rewritten; on either failure sync stops and says so, and nothing on this device changes.                  |
| Theft of the encryption key in the browser             | Kept in IndexedDB, never `localStorage`; Markdown is already rendered safely; strict security headers when the web app is hosted.                                                          |
| Guessing a recovery code                               | 160 random bits, so guessing is not feasible.                                                                                                                                              |
| A server answering a device approval with its own key  | The six-digit codes on both screens differ unless the server guesses one in a million before seeing the approver's nonce; the person declines, and the key never leaves the approver.      |
| Someone approving their own device on a stolen session | Approval needs the person at a synced device, comparing codes and (with passkeys) confirming one. The new device can sign in but cannot read anything until then.                          |
| A passkey copy read from the server                    | It opens only with the PRF secret, which only that passkey produces after user verification; the secret is never sent.                                                                     |

One limit is accepted (founder agreement): the one-time unlock is enforced on
the device, so anyone who builds the GPL source can remove the habit limit,
and the server cannot see habits to enforce it. No obfuscation is planned.
Anyone may also run their own sync server, at their own cost.

## Development

`apps/sync` is the Worker:

| File                       | Job                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `src/api.ts`               | Routes, sessions, the sync entitlement rule, CORS; no Cloudflare imports               |
| `src/auth.ts`              | Better Auth settings: bearer tokens, passkeys, development passwords, deletion, limits |
| `src/mailbox.ts`           | The account mailbox over a small SQL interface (layout 3: epoch, key copies, requests) |
| `src/index.ts`             | Cloudflare wiring: the Durable Object, D1 and secrets                                  |
| `migrations/0001_auth.sql` | D1 sign-in tables, generated by `scripts/generate-auth-schema.mjs`                     |

`apps/web/src/sync/` holds the browser side: `controller.ts` (sign-in, key,
engine and one snapshot for the interface; loaded after the grid opens),
`SyncSettings.tsx` (Settings → Sync, including the waiting and emergency code
screens), `ApprovalPrompt.tsx` (the "Sync a new device?" dialog on a synced
device), `passkeys.ts` (PRF requests and device labels), `Conflicts.tsx` (top
of History), `secrets.ts` (the session token and key in IndexedDB) and
`config.ts`. Mailboxes upgrade layout 1 or 2 to 3 when they wake; a layout 2
wrapped key becomes the `recovery` copy.

`apps/web/passkey-check.html` is served by the Vite dev server only: it makes
a test passkey ("Passkey check (safe to delete)") and reports whether this
browser and provider return a stable PRF secret. Nothing leaves the page.

Sign-in: sessions are bearer tokens (the `set-auth-token` response header, then
`Authorization: Bearer`), the same for the browser and the phone. Passkeys are
added once signed in. Email and password sign-in exists only where
`DEV_PASSWORD_SIGN_IN` is set, until Apple, Google and emailed codes arrive.
`SIGNUP_ALLOWLIST` (a Worker secret) limits who can create accounts on a
deployed development server. Without email verification, someone could still
claim an allowed address first, which is acceptable for testing only. Better
Auth is built per request: a Worker cannot await work begun by another
request.

The passkey challenge is kept in a cookie, so the web app and the server must
be on the same site. In development the web app reaches the server through
Vite's proxy at `/sync` (`apps/web/vite.config.ts`): the deployed development
server by default, or `VITE_SYNC_TARGET=http://localhost:8787` (shell or
`apps/web/.env.local`) for `npm run sync:dev`. Production builds offer sync
only when `VITE_SYNC_URL` names a server on the same parent domain as the app
(for example `app.` and `sync.` of one domain), which is also the passkey
domain.

### Running locally

No Cloudflare account is needed. `npm run sync:dev` applies the D1 migrations
to a local database and starts the Worker at `http://localhost:8787` with the
development environment and a public, local-only secret.

```sh
npm run sync:dev
curl -s -D - -H "Origin: http://localhost:5173" -H "Content-Type: application/json" \
  -d '{"email":"me@example.com","password":"correct horse battery","name":"Me"}' \
  http://localhost:8787/api/auth/sign-up/email
# then, with the set-auth-token header from that response:
curl -s -H "Authorization: Bearer <token>" "http://localhost:8787/v1/events?after=0"
```

Stop it with Ctrl+C in its own terminal; ending the npm process from another
tool can leave `workerd.exe` holding the port.

`npm run sync:build` bundles both environments without deploying (a dry run).
`npm test` runs the mailbox and the API with real Better Auth against Node's
SQLite, and two simulated devices syncing through a real mailbox with real
encryption (`scripts/sync-engine.test.mjs`), and device approval and passkey
copies, including a relay that swaps keys (`scripts/sync-link.test.mjs`).

### Deploying the development server

The development server is deployed (18 October 2026) at
`https://onpurpose-sync-dev.onpurpose-dev.workers.dev`, in the founder's
Cloudflare account on the free plan. Its D1 database `onpurpose-sync-dev` is
in the Oceania region. The account's `workers.dev` subdomain was registered as
the neutral `onpurpose-dev`, so the public address names no person; it can be
renamed in the dashboard. `BETTER_AUTH_SECRET` (random) and `SIGNUP_ALLOWLIST`
(the founder's email) are Worker secrets, readable only in the dashboard.

To redeploy after code changes, with Wrangler logged in to that account:
`npm run sync:deploy:dev` from the repository root. It applies any new D1
migrations remotely, then deploys; existing secrets are kept. Mailboxes
upgrade their own tables when next used. To change a secret, run
`npx wrangler secret put <NAME> --env dev` from `apps/sync` and type the value
when asked (never as a command argument); this deploys a new version straight
away. The first deploy instead passed both secrets with
`wrangler deploy --secrets-file` from a temporary file outside the repository,
so the server never ran without them.

The development server allows password sign-in and free sync for the
allowlisted accounts. Its `APP_ORIGINS` is `http://localhost:5173`, so only the
local web app may call it from a browser. Its free plan stops serving at the
daily limits rather than billing.

## Build order

Founder decision (18 October 2026): sync reaches the web app first, because
the browser has Web Crypto, needs no native build and is covered by the
Cloudflare account alone; the phone follows.

1. Mailbox server and protocol. **Done.**
2. Sign-in on the server: Better Auth with bearer tokens, passkeys and
   development passwords, and the development environment. **Done**, and
   deployed as the development server.
3. Storage v24 and schema 2 (founder-approved). **Done.**
4. Device sync in core: push, pull, rebase and conflicts. **Done.**
5. Encryption and the recovery code. **Done.** Passkey unlock and approval
   from another device (19 October 2026). **Done** on the web; real-device PRF
   support is still to be checked.
6. The web app: sign-in, passkeys, sync, conflicts in History, first sync and
   restore as changes. **Done** against the development server.
7. The phone: Sign in with Apple (needs the Apple Developer membership),
   Google sign-in (needs a free Google Cloud OAuth client), emailed codes, a
   native AES-GCM library and the same sync screens. The phone already writes
   v24 events and schema 2.
8. RevenueCat entitlements, the paywall, the account deletion web page.
9. Before launch: Turnstile, sync rate limits, storage quotas, the production
   server and its address, the privacy policy and store forms.

## Open questions

- Events larger than the payload limit (an archived-habit deletion carrying
  years of records): split them, compress them, or raise the limit.
- Which native AES-GCM library to use on the phone.
- Sync subscription price; whether sync turns on automatically for subscribers.
- Hosting region and data-location wording for the privacy policy.
- Whether a device should be able to name itself, so conflicts can say which
  device made the other edit.
