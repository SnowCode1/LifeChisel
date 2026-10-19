// Sync for this browser (docs/SYNC.md): sign-in, the account key and the
// sync engine, with one snapshot for the interface. Saving habits never
// waits on any of it; the engine copies the log in the background.
import { createAuthClient } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import {
  syncApi,
  SyncHttpError,
  SyncOffline,
} from '@onpurpose/core/sync/client';
import { WrongRecoveryCode } from '@onpurpose/core/sync/crypto';
import {
  SyncEngine,
  createAccountKey,
  replaceRecoveryCode,
  saveAccountKey,
  unlockAccountKey,
  type SyncStatus,
} from '@onpurpose/core/sync/engine';
import { SYNC_BASE, SYNC_SERVER, syncAvailable } from './config.ts';
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
  /** The account has no key yet: this device creates it. */
  | { stage: 'needsKey'; user: SyncUser }
  /** A new recovery code to save before sync starts (or replacing one). */
  | { stage: 'showCode'; user: SyncUser; code: string; replacing: boolean }
  /** The account has a key; this device needs the recovery code. */
  | { stage: 'needsCode'; user: SyncUser }
  | { stage: 'ready'; user: SyncUser; status: SyncStatus }
  /** The server could not be reached to check the session. */
  | { stage: 'offline' };
export type SyncSnapshot = {
  view: SyncView;
  busy: boolean;
  /** The latest message for the person, error or not. */
  notice: { text: string; error: boolean } | null;
};

const errorText = (error: unknown) =>
  error instanceof SyncOffline
    ? 'The sync server could not be reached. Check your connection and try again.'
    : error instanceof Error
      ? error.message
      : 'Something went wrong. Please try again.';

export class SyncController {
  private snapshot: SyncSnapshot = {
    view: { stage: syncAvailable ? 'loading' : 'unavailable' },
    busy: false,
    notice: null,
  };
  private listeners = new Set<() => void>();
  private readonly store: ChangeStore;
  private token: string | null = null;
  private engine: SyncEngine | null = null;
  private pending: { key: CryptoKey; wrapped: string } | null = null;
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
    const key = await readSecret<CryptoKey>(accountKey(user.id));
    if (key) {
      this.startEngine(user, key);
      return;
    }
    try {
      const wrapped = await this.#api.key();
      this.set({
        view: wrapped
          ? { stage: 'needsCode', user }
          : { stage: 'needsKey', user },
      });
    } catch (error) {
      if (error instanceof SyncHttpError && error.status === 403)
        this.set({
          view: { stage: 'ready', user, status: { state: 'unpaid' } },
        });
      else throw error;
    }
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
    });
    this.engine = engine;
    engine.subscribe(() => {
      if (this.engine !== engine) return;
      this.set({ view: { stage: 'ready', user, status: engine.getStatus() } });
    });
    this.set({ view: { stage: 'ready', user, status: engine.getStatus() } });
    engine.start();
  }

  private async forget(account?: string) {
    this.engine?.stop();
    this.engine = null;
    this.token = null;
    this.pending = null;
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
      await this.signedIn(data.user);
    });
  }
  signInWithPasskey() {
    return this.act(async () => {
      const result = await this.#auth.signIn.passkey();
      if (result?.error)
        throw new Error(
          result.error.message ?? 'Passkey sign-in did not finish.',
        );
      const { data } = await this.#auth.getSession();
      if (!data) throw new Error('Passkey sign-in did not finish.');
      await this.signedIn(data.user);
    });
  }
  addPasskey() {
    return this.act(async () => {
      const result = await this.#auth.passkey.addPasskey({
        name: 'This browser',
      });
      if (result?.error)
        throw new Error(result.error.message ?? 'The passkey was not added.');
      return 'Passkey added. Next time you can sign in with it.';
    });
  }

  // The account key and recovery code.

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
      if (!(await saveAccountKey(this.#api, pending.wrapped))) {
        this.pending = null;
        this.set({ view: { stage: 'needsCode', user: view.user } });
        return 'Another device set up encryption first. Enter its recovery code.';
      }
      await writeSecret(accountKey(view.user.id), pending.key);
      this.pending = null;
      this.startEngine(view.user, pending.key);
    });
  }
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
        await writeSecret(accountKey(user.id), key);
        this.startEngine(user, key);
      } catch (error) {
        if (error instanceof WrongRecoveryCode)
          throw new Error('That recovery code does not match this account.');
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
