// Sync for this browser (docs/SYNC.md): sign-in, the account key and the
// sync engine, with one snapshot for the interface. Saving habits never
// waits on any of it; the engine copies the log in the background.
//
// A new browser unlocks the account key, in order of convenience: with the
// passkey it signed in with (when the passkey supports PRF), by approval
// from a device that already syncs, or with the emergency recovery code.
import { createAuthClient } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import {
  syncApi,
  SyncHttpError,
  SyncOffline,
} from '@onpurpose/core/sync/client';
import {
  WrongRecoveryCode,
  passkeyPrfInput,
} from '@onpurpose/core/sync/crypto';
import {
  SyncEngine,
  accountHasKey,
  addPasskeyUnlock,
  createAccountKey,
  replaceRecoveryCode,
  saveAccountKey,
  unlockAccountKey,
  unlockWithPasskey,
  type SyncStatus,
} from '@onpurpose/core/sync/engine';
import {
  LinkDeclined,
  LinkExpired,
  LinkTampered,
  answerRequest,
  requestApproval,
  type PendingApproval,
} from '@onpurpose/core/sync/link';
import { SYNC_BASE, SYNC_SERVER, syncAvailable } from './config.ts';
import {
  confirmPresence,
  deviceLabel,
  evaluatePasskey,
  prfEnabled,
  prfExtension,
  prfSecret,
} from './passkeys.ts';
import {
  TOKEN,
  accountKey,
  deleteSecret,
  readSecret,
  writeSecret,
} from './secrets.ts';

export type SyncUser = { id: string; email: string; name: string };
export type SyncView =
  | { stage: 'unavailable' }
  | { stage: 'loading' }
  | { stage: 'signedOut' }
  /** The account has no key yet: this browser sets it up. */
  | { stage: 'needsKey'; user: SyncUser }
  /** A new emergency recovery code to save (first setup, or replacing). */
  | { stage: 'showCode'; user: SyncUser; code: string; replacing: boolean }
  /** Waiting for another device to approve this one; code once known. */
  | { stage: 'waiting'; user: SyncUser; code: string | null }
  /** The emergency recovery code, when nothing else can unlock. */
  | { stage: 'needsCode'; user: SyncUser }
  | { stage: 'ready'; user: SyncUser; status: SyncStatus }
  /** The server could not be reached to check the session. */
  | { stage: 'offline' };
/** A device asking this one for approval, with the code to compare. */
export type ApprovalRequest = { id: string; label: string; code: string };
export type SyncSnapshot = {
  view: SyncView;
  busy: boolean;
  /** The latest message for the person, error or not. */
  notice: { text: string; error: boolean } | null;
  approval: ApprovalRequest | null;
};

type SignedInPasskey = { credentialId: string; secret: Uint8Array | null };

const errorText = (error: unknown) =>
  error instanceof SyncOffline
    ? 'The sync server could not be reached. Check your connection and try again.'
    : error instanceof Error
      ? error.message
      : 'Something went wrong. Please try again.';

const LINK_CHECK_MS = 20_000;

export class SyncController {
  private snapshot: SyncSnapshot = {
    view: { stage: syncAvailable ? 'loading' : 'unavailable' },
    busy: false,
    notice: null,
    approval: null,
  };
  private listeners = new Set<() => void>();
  private readonly store: ChangeStore;
  private token: string | null = null;
  private engine: SyncEngine | null = null;
  private pending: { key: CryptoKey; wrapped: string } | null = null;
  /** The passkey used to sign in this session, and its PRF secret if any. */
  private passkey: SignedInPasskey | null = null;
  private waiting: AbortController | null = null;
  private answering: {
    approval: PendingApproval;
    abort: AbortController;
  } | null = null;
  private seenRequests = new Set<string>();
  private linkTimer: ReturnType<typeof setInterval> | null = null;
  // True private fields: the auth client is a Proxy, and React's
  // development profiler walks the props it can see (this controller is one).
  readonly #auth;
  readonly #api;

  constructor(store: ChangeStore) {
    this.store = store;
    const origin = typeof location === 'undefined' ? '' : location.origin;
    this.#auth = createAuthClient({
      baseURL: `${SYNC_BASE.startsWith('/') ? origin : ''}${SYNC_BASE}/api/auth`,
      plugins: [passkeyClient()],
      fetchOptions: {
        auth: { type: 'Bearer', token: () => this.token ?? undefined },
        onSuccess: (context) => {
          const token = context.response.headers.get('set-auth-token');
          if (token) void this.saveToken(token);
        },
      },
    });
    this.#api = syncApi((path, init) =>
      fetch(`${SYNC_BASE}${path}`, {
        method: init.method,
        body: init.body,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
      }),
    );
    if (typeof window !== 'undefined') {
      // Someone setting up another device usually comes back to this one.
      window.addEventListener('focus', () => void this.checkRequests());
    }
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(next: Partial<SyncSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }
  private user(): SyncUser | null {
    const view = this.snapshot.view;
    return 'user' in view ? view.user : null;
  }
  private async saveToken(token: string) {
    this.token = token;
    await writeSecret(TOKEN, token);
  }

  // One action at a time; failures become a visible notice.
  private async act(task: () => Promise<string | void>) {
    if (this.snapshot.busy) return;
    this.set({ busy: true, notice: null });
    try {
      const text = await task();
      if (text) this.set({ notice: { text, error: false } });
    } catch (error) {
      this.set({ notice: { text: errorText(error), error: true } });
    } finally {
      this.set({ busy: false });
    }
  }

  /** Restore a saved session on page load. */
  async init() {
    if (!syncAvailable) return;
    try {
      this.token = (await readSecret<string>(TOKEN)) ?? null;
      if (!this.token) {
        this.set({ view: { stage: 'signedOut' } });
        return;
      }
      const { data, error } = await this.#auth.getSession();
      if (error || !data) {
        if (error && !error.status) {
          this.set({ view: { stage: 'offline' } });
          return;
        }
        await this.forget();
        this.set({ view: { stage: 'signedOut' } });
        return;
      }
      await this.signedIn(data.user);
    } catch {
      this.set({ view: { stage: 'offline' } });
    }
  }

  private async signedIn(user: SyncUser) {
    const stored = await readSecret<CryptoKey>(accountKey(user.id));
    if (stored) {
      await this.unlocked(user, stored);
      return;
    }
    try {
      if (!(await accountHasKey(this.#api))) {
        this.set({ view: { stage: 'needsKey', user } });
        return;
      }
      // 1. The passkey just used to sign in, when it can unlock.
      const passkey = this.passkey;
      if (passkey?.secret) {
        const key = await unlockWithPasskey(this.#api, user.id, {
          credentialId: passkey.credentialId,
          prfSecret: passkey.secret,
        });
        if (key) {
          await this.unlocked(user, key);
          return;
        }
      }
      // 2. Approval from a device that already syncs.
      this.waitForApproval(user);
    } catch (error) {
      if (error instanceof SyncHttpError && error.status === 403)
        this.set({
          view: { stage: 'ready', user, status: { state: 'unpaid' } },
        });
      else throw error;
    }
  }

  // The account key is here: keep it, let this sign-in's passkey unlock next
  // time, and start syncing.
  private async unlocked(user: SyncUser, key: CryptoKey) {
    await writeSecret(accountKey(user.id), key);
    const passkey = this.passkey;
    if (passkey?.secret)
      await addPasskeyUnlock(this.#api, user.id, key, {
        credentialId: passkey.credentialId,
        label: deviceLabel(),
        prfSecret: passkey.secret,
      }).catch(() => {});
    this.startEngine(user, key);
  }

  private startEngine(user: SyncUser, key: CryptoKey) {
    this.engine?.stop();
    const engine = new SyncEngine({
      store: this.store,
      api: this.#api,
      account: user.id,
      server: SYNC_SERVER,
      key,
      newId: () => crypto.randomUUID(),
      onLinkRequests: () => void this.checkRequests(),
    });
    this.engine = engine;
    engine.subscribe(() => {
      if (this.engine !== engine) return;
      this.set({ view: { stage: 'ready', user, status: engine.getStatus() } });
    });
    this.set({ view: { stage: 'ready', user, status: engine.getStatus() } });
    engine.start();
    if (!this.linkTimer)
      this.linkTimer = setInterval(() => {
        if (typeof document === 'undefined' || !document.hidden)
          void this.checkRequests();
      }, LINK_CHECK_MS);
    void this.checkRequests();
  }

  private async forget(account?: string) {
    this.engine?.stop();
    this.engine = null;
    this.waiting?.abort();
    this.waiting = null;
    this.answering?.abort.abort();
    this.answering = null;
    if (this.linkTimer) clearInterval(this.linkTimer);
    this.linkTimer = null;
    this.token = null;
    this.pending = null;
    this.passkey = null;
    this.set({ approval: null });
    await deleteSecret(TOKEN);
    if (account) await deleteSecret(accountKey(account));
  }

  // Sign-in. Email and password exist only on development servers.

  signUp(email: string, password: string) {
    return this.act(async () => {
      const { data, error } = await this.#auth.signUp.email({
        email,
        password,
        name: email.split('@')[0] || 'OnPurpose',
      });
      if (error)
        throw new Error(error.message ?? 'Could not create the account.');
      this.passkey = null;
      await this.signedIn(data.user);
    });
  }
  signIn(email: string, password: string) {
    return this.act(async () => {
      const { data, error } = await this.#auth.signIn.email({
        email,
        password,
      });
      if (error) throw new Error(error.message ?? 'Could not sign in.');
      this.passkey = null;
      await this.signedIn(data.user);
    });
  }
  signInWithPasskey() {
    return this.act(async () => {
      const result = await this.#auth.signIn.passkey({
        extensions: prfExtension(await passkeyPrfInput()),
        returnWebAuthnResponse: true,
      });
      if (!result || result.error)
        throw new Error(
          result?.error?.message ?? 'Passkey sign-in did not finish.',
        );
      const webauthn = (
        result as {
          webauthn?: {
            response: { id: string };
            clientExtensionResults: unknown;
          };
        }
      ).webauthn;
      this.passkey = webauthn
        ? {
            credentialId: webauthn.response.id,
            secret: prfSecret(webauthn.clientExtensionResults),
          }
        : null;
      const { data } = await this.#auth.getSession();
      if (!data) throw new Error('Passkey sign-in did not finish.');
      await this.signedIn(data.user);
    });
  }
  /**
   * Add a passkey for this account. When the account key is here and the
   * passkey supports it, the passkey can unlock sync on new devices too.
   */
  addPasskey() {
    return this.act(async () => {
      const input = await passkeyPrfInput();
      const result = await this.#auth.passkey.addPasskey({
        name: deviceLabel(),
        extensions: prfExtension(input),
        returnWebAuthnResponse: true,
      });
      if (!result || result.error)
        throw new Error(result?.error?.message ?? 'The passkey was not added.');
      const webauthn = (
        result as {
          webauthn?: {
            response: { id: string };
            clientExtensionResults: unknown;
          };
        }
      ).webauthn;
      const user = this.user();
      const key = user && (await readSecret<CryptoKey>(accountKey(user.id)));
      if (!webauthn || !user || !key)
        return 'Passkey added. Next time you can sign in with it.';
      const results = webauthn.clientExtensionResults;
      let secret = prfSecret(results);
      // Some providers give the secret only when signing in: ask once more.
      if (!secret && prfEnabled(results))
        secret = await evaluatePasskey(webauthn.response.id, input).catch(
          () => null,
        );
      if (!secret)
        return 'Passkey added. It signs you in; this passkey provider cannot unlock sync by itself, so new devices are approved from this one.';
      await addPasskeyUnlock(this.#api, user.id, key, {
        credentialId: webauthn.response.id,
        label: deviceLabel(),
        prfSecret: secret,
      });
      this.passkey = { credentialId: webauthn.response.id, secret };
      return 'Passkey added. Signing in with it also unlocks sync on new devices.';
    });
  }

  // Setting up the account key, and the emergency recovery code.

  createKey() {
    return this.act(async () => {
      const user = this.user();
      if (!user) return;
      const { key, code, wrapped } = await createAccountKey(user.id);
      this.pending = { key, wrapped };
      this.set({ view: { stage: 'showCode', user, code, replacing: false } });
    });
  }
  /** After the person has saved the code: store the key and start syncing. */
  confirmCode() {
    return this.act(async () => {
      const view = this.snapshot.view;
      if (view.stage !== 'showCode') return;
      if (view.replacing) {
        this.startEngine(view.user, await this.key(view.user));
        return;
      }
      const pending = this.pending;
      if (!pending) return;
      this.pending = null;
      if (!(await saveAccountKey(this.#api, pending.wrapped))) {
        // Another device set up the account meanwhile: unlock from it.
        this.waitForApproval(view.user);
        return;
      }
      await this.unlocked(view.user, pending.key);
    });
  }
  /** Use the emergency recovery code instead of waiting for approval. */
  useRecoveryCode = () => {
    const user = this.user();
    if (!user) return;
    this.waiting?.abort();
    this.waiting = null;
    this.set({ view: { stage: 'needsCode', user }, notice: null });
  };
  enterCode(code: string) {
    return this.act(async () => {
      const user = this.user();
      if (!user) return;
      try {
        const key = await unlockAccountKey(this.#api, user.id, code);
        if (!key) {
          this.set({ view: { stage: 'needsKey', user } });
          return;
        }
        await this.unlocked(user, key);
      } catch (error) {
        if (error instanceof WrongRecoveryCode)
          throw new Error(
            'That emergency recovery code does not match this account.',
          );
        throw error;
      }
    });
  }
  replaceCode() {
    return this.act(async () => {
      const user = this.user();
      if (!user) return;
      const code = await replaceRecoveryCode(
        this.#api,
        user.id,
        await this.key(user),
      );
      this.engine?.stop();
      this.set({ view: { stage: 'showCode', user, code, replacing: true } });
    });
  }
  private async key(user: SyncUser) {
    const key = await readSecret<CryptoKey>(accountKey(user.id));
    if (!key) throw new Error('This browser no longer has the account key.');
    return key;
  }

  // Approval between devices (core link.ts). This browser asks when it has
  // no key; a browser that syncs answers.

  /** Ask a device that already syncs to approve this one. */
  waitForApproval = (user = this.user()) => {
    if (!user) return;
    this.waiting?.abort();
    const abort = new AbortController();
    this.waiting = abort;
    this.set({ view: { stage: 'waiting', user, code: null }, notice: null });
    requestApproval({
      api: this.#api,
      account: user.id,
      label: deviceLabel(),
      newId: () => crypto.randomUUID(),
      signal: abort.signal,
      onCode: (code) => {
        if (this.waiting === abort)
          this.set({ view: { stage: 'waiting', user, code } });
      },
    }).then(
      async (key) => {
        if (this.waiting !== abort) return;
        this.waiting = null;
        await this.unlocked(user, key);
        this.set({
          notice: { text: 'Approved. This browser now syncs.', error: false },
        });
      },
      (error: unknown) => {
        if (this.waiting !== abort || abort.signal.aborted) return;
        this.waiting = null;
        this.set({
          view: { stage: 'waiting', user, code: null },
          notice: {
            text:
              error instanceof LinkDeclined
                ? 'The other device declined. Ask again, or use the emergency recovery code.'
                : error instanceof LinkExpired
                  ? 'The request expired. Ask again.'
                  : error instanceof LinkTampered
                    ? 'The devices did not agree, so nothing was shared. Ask again.'
                    : errorText(error),
            error: true,
          },
        });
      },
    );
  };
  /** True while this browser's request for approval is open. */
  isWaiting = () => this.waiting !== null;

  // On a device that syncs: notice requests and prepare the code to compare.
  private async checkRequests() {
    const view = this.snapshot.view;
    if (view.stage !== 'ready' || this.answering) return;
    try {
      const requests = await this.#api.listLinks();
      const next = requests.find(
        (request) => !request.approverKey && !this.seenRequests.has(request.id),
      );
      if (!next) return;
      this.seenRequests.add(next.id);
      const abort = new AbortController();
      const approval = await answerRequest({
        api: this.#api,
        account: view.user.id,
        id: next.id,
        signal: abort.signal,
      });
      if (!approval) return;
      this.answering = { approval, abort };
      this.set({
        approval: {
          id: approval.id,
          label: approval.label,
          code: approval.code,
        },
      });
    } catch (error) {
      if (error instanceof LinkTampered)
        this.set({
          notice: {
            text: 'A device asked to sync, but the request was altered on the way, so it was refused.',
            error: true,
          },
        });
    }
  }
  /** The person checked the code: confirm with a passkey, then send the key. */
  approve() {
    return this.act(async () => {
      const user = this.user();
      const answering = this.answering;
      if (!user || !answering) return;
      const passkeys = await this.#auth.passkey
        .listUserPasskeys()
        .then((result) => result.data ?? [])
        .catch(() => []);
      if (
        passkeys.length &&
        !(await confirmPresence(
          passkeys.map((passkey) => passkey.credentialID),
        ))
      )
        throw new Error('Approval needs your passkey on this device.');
      await answering.approval.approve(await this.key(user));
      this.answering = null;
      this.set({ approval: null });
      return `${answering.approval.label} can now sync.`;
    });
  }
  decline() {
    return this.act(async () => {
      const answering = this.answering;
      if (!answering) return;
      this.answering = null;
      this.set({ approval: null });
      await answering.approval.decline();
      return 'Declined. Nothing was shared.';
    });
  }

  // Syncing.

  syncNow() {
    return this.act(async () => {
      await this.engine?.sync();
    });
  }
  choose(
    option: 'device' | 'cloud' | 'combine',
    matches?: Record<string, string | null>,
  ) {
    return this.act(async () => {
      await this.engine?.choose(option, matches);
    });
  }

  signOut() {
    return this.act(async () => {
      const user = this.user();
      await this.#auth.signOut().catch(() => {});
      await this.forget(user?.id);
      this.set({ view: { stage: 'signedOut' } });
      return 'Signed out. Your habits stay in this browser.';
    });
  }
  /** Delete the account and its cloud copy; this browser keeps its data. */
  deleteAccount(password?: string) {
    return this.act(async () => {
      const user = this.user();
      const { error } = await this.#auth.deleteUser(
        password ? { password } : {},
      );
      if (error)
        throw new Error(
          error.message ??
            'The account could not be deleted. Sign in again, then try once more.',
        );
      await this.forget(user?.id);
      await this.store.saveSync(null);
      this.set({ view: { stage: 'signedOut' } });
      return 'Your account and its cloud copy are deleted. Your habits stay in this browser.';
    });
  }
  dismissNotice = () => this.set({ notice: null });
}
