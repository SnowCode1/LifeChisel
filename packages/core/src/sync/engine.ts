// The sync engine (docs/SYNC.md): one per signed-in account on a device.
// It pulls the account's newer events, decrypts and checks them, rebases this
// device's unsent edits on top (inside the store's ordered write queue), and
// pushes what is left. Local saving never waits for it.
import {
  replayEvents,
  type StoredEvent,
  type StoredState,
} from '../storage/model.ts';
import type { ChangeStore } from '../storage/store.ts';
import type { SyncState } from '../storage/repository.ts';
import { SyncHttpError, SyncOffline, type SyncApi } from './client.ts';
import {
  SyncDecryptError,
  newAccountKey,
  newRecoveryCode,
  openEvent,
  sealEvent,
  unwrapAccountKey,
  wrapAccountKey,
} from './crypto.ts';
import { combinePlan, hasHabitActions, suggestMatches } from './plan.ts';
import { MAX_BATCH_PAYLOAD, MAX_PUSH_EVENTS } from './protocol.ts';
import { rebase } from './rebase.ts';

/** What the person sees about sync on this device. */
export type SyncStatus =
  | { state: 'idle'; lastSynced: string | null }
  | { state: 'syncing'; lastSynced: string | null }
  | { state: 'offline'; lastSynced: string | null }
  /** Both this device and the account have data: the person chooses. */
  | { state: 'choice'; reason: 'first' | 'reset'; choice: SyncChoice }
  | { state: 'signedOut' }
  | { state: 'unpaid' }
  | { state: 'error'; message: string };

/** Enough to explain the choice, and to carry it out without re-downloading. */
export type SyncChoice = {
  epoch: string;
  cloud: StoredEvent[];
  cloudSummary: DataSummary;
  localSummary: DataSummary;
  /** Suggested habit matches for combining (this device → account). */
  matches: Record<string, string | null>;
  cloudHabits: { id: string; name: string }[];
  localHabits: { id: string; name: string }[];
};
export type DataSummary = {
  habits: number;
  days: number;
  lastEdit: string | null;
};

export function summarize(events: readonly StoredEvent[]): DataSummary {
  const { state } = replayEvents(events).replay;
  const days = new Set(
    Object.keys(state.values).map((key) => key.slice(key.lastIndexOf(':') + 1)),
  );
  const last = [...events]
    .reverse()
    .find(
      (event) => event.type !== 'initialize' && event.type !== 'preference',
    );
  return {
    habits: state.habits.filter((habit) => !habit.archived).length,
    days: days.size,
    lastEdit: last?.recordedAt ?? null,
  };
}

export type EngineOptions = {
  store: ChangeStore;
  api: SyncApi;
  /** The signed-in account's ID, and the server's address. */
  account: string;
  server: string;
  key: CryptoKey;
  newId: () => string;
  now?: () => Date;
};

type Pulled = {
  epoch: string;
  head: number;
  events: StoredEvent[];
  receivedAt: Record<string, string>;
};

const DEBOUNCE_MS = 2000;
const INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 10 * 60_000;

export class SyncEngine {
  private readonly options: EngineOptions;
  private readonly now: () => Date;
  private status: SyncStatus;
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private failures = 0;
  private lastSynced: string | null = null;

  constructor(options: EngineOptions) {
    this.options = options;
    this.now = options.now ?? (() => new Date());
    this.status = { state: 'idle', lastSynced: null };
  }

  getStatus = () => this.status;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private setStatus(status: SyncStatus) {
    this.status = status;
    for (const listener of this.listeners) listener();
  }

  /** True when this device is linked to the engine's account. */
  linked(): boolean {
    const sync = this.options.store.getSnapshot().sync;
    return (
      !!sync &&
      sync.account === this.options.account &&
      sync.server === this.options.server
    );
  }

  /** Sync after local edits (debounced), on an interval and when asked. */
  start() {
    if (this.unsubscribe) return;
    let seen = this.options.store.getSnapshot().events.length;
    this.unsubscribe = this.options.store.subscribe(() => {
      const length = this.options.store.getSnapshot().events.length;
      if (length !== seen) {
        seen = length;
        this.schedule(DEBOUNCE_MS);
      }
    });
    this.interval = setInterval(() => this.schedule(0), INTERVAL_MS);
    this.schedule(0);
  }
  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.interval) clearInterval(this.interval);
    if (this.timer) clearTimeout(this.timer);
    this.interval = this.timer = null;
  }
  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sync().catch(() => {});
    }, delay);
  }

  /** One sync, or join the one already running (then run once more). */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.cycle();
        } while (this.again);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async cycle() {
    const { store } = this.options;
    if (!this.linked()) {
      const result = await this.link();
      if (result !== 'linked') return;
    }
    if (this.status.state === 'choice') return;
    this.setStatus({ state: 'syncing', lastSynced: this.lastSynced });
    try {
      for (let round = 0; round < 20; round++) {
        const sync = store.getSnapshot().sync!;
        const pulled = await this.pullAll(sync.confirmed);
        if (pulled.epoch !== sync.epoch) {
          await this.cloudWasReset();
          return;
        }
        if (pulled.events.length) await this.integrate(sync, pulled);
        const result = await this.pushPending();
        if (result === 'reset') {
          await this.cloudWasReset();
          return;
        }
        if (result === 'done') break;
      }
      this.failures = 0;
      this.lastSynced = this.now().toISOString();
      this.setStatus({ state: 'idle', lastSynced: this.lastSynced });
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown) {
    if (error instanceof SyncOffline) {
      this.setStatus({ state: 'offline', lastSynced: this.lastSynced });
    } else if (error instanceof SyncHttpError && error.status === 401) {
      this.setStatus({ state: 'signedOut' });
      return;
    } else if (error instanceof SyncHttpError && error.status === 403) {
      this.setStatus({ state: 'unpaid' });
      return;
    } else if (error instanceof SyncDecryptError) {
      this.setStatus({
        state: 'error',
        message:
          'Cloud data could not be decrypted with this device’s key. Nothing was changed here.',
      });
      return;
    } else {
      this.setStatus({
        state: 'error',
        message:
          error instanceof Error ? error.message : 'Sync failed unexpectedly.',
      });
    }
    // Try again later, backing off while it keeps failing.
    this.failures++;
    this.schedule(Math.min(MAX_BACKOFF_MS, 15_000 * 2 ** (this.failures - 1)));
  }

  /** Every account event after `after`, decrypted, in order. */
  private async pullAll(after: number): Promise<Pulled> {
    const { api, key } = this.options;
    const events: StoredEvent[] = [];
    const receivedAt: Record<string, string> = {};
    let epoch = '';
    let head = after;
    let cursor = after;
    for (;;) {
      const page = await api.pull(cursor);
      if (epoch && page.epoch !== epoch) return this.pullAll(0);
      epoch = page.epoch;
      head = page.head;
      for (const item of page.events) {
        const event = await openEvent(key, item);
        events.push(event);
        receivedAt[event.id] = item.receivedAt;
      }
      cursor = after + events.length;
      if (!page.more || page.events.length === 0) break;
    }
    return { epoch, head, events, receivedAt };
  }

  private async integrate(
    sync: SyncState,
    pulled: { events: StoredEvent[]; receivedAt: Record<string, string> },
  ) {
    const { store, newId } = this.options;
    await store.rewriteLog((snapshot) => {
      const current = snapshot.sync;
      if (
        !current ||
        current.epoch !== sync.epoch ||
        current.confirmed !== sync.confirmed
      )
        return null;
      const base = [
        ...snapshot.events.slice(0, current.confirmed),
        ...pulled.events,
      ];
      // Check the account's order replays before rewriting anything here.
      replayEvents(base, { localDevice: snapshot.device });
      const result = rebase({
        base,
        confirmed: current.confirmed,
        receivedAt: pulled.receivedAt,
        pending: snapshot.events.slice(current.confirmed),
        localDevice: snapshot.device,
        now: this.now(),
        newId,
      });
      return {
        keep: current.confirmed,
        events: result.events,
        archive: result.changed
          ? { id: newId(), recordedAt: this.now().toISOString() }
          : null,
        sync: { ...current, confirmed: base.length },
        addConflicts: result.conflicts,
        removeConflicts: [],
      };
    });
  }

  /** Push unsent events in batches; 'retry' when others arrived first. */
  private async pushPending(): Promise<'done' | 'retry' | 'reset'> {
    const { store, api, key } = this.options;
    for (;;) {
      const snapshot = store.getSnapshot();
      const sync = snapshot.sync!;
      const pending = snapshot.events.slice(sync.confirmed);
      if (!pending.length) return 'done';
      const batch = [];
      let size = 0;
      for (const event of pending.slice(0, MAX_PUSH_EVENTS)) {
        const sealed = await sealEvent(
          key,
          event,
          event.device ?? snapshot.device,
        );
        if (batch.length && size + sealed.payload.length > MAX_BATCH_PAYLOAD)
          break;
        size += sealed.payload.length;
        batch.push(sealed);
      }
      const result = await api.push({
        epoch: sync.epoch,
        expectedHead: sync.confirmed,
        events: batch,
      });
      if (!result.ok) return result.reason === 'reset' ? 'reset' : 'retry';
      await store.saveSync({ ...sync, confirmed: result.head });
    }
  }

  /**
   * First sync on this device: upload if the account is empty, take the
   * account's data if this device has none of its own, otherwise ask.
   */
  async link(): Promise<'linked' | 'choice'> {
    const { store, account, server } = this.options;
    this.setStatus({ state: 'syncing', lastSynced: null });
    try {
      const pulled = await this.pullAll(0);
      const sync: SyncState = {
        account,
        server,
        epoch: pulled.epoch,
        confirmed: 0,
      };
      if (pulled.events.length === 0) {
        await store.saveSync(sync);
        return 'linked';
      }
      if (!hasHabitActions(store.getSnapshot().events)) {
        await this.adopt(sync, pulled.events);
        return 'linked';
      }
      this.offerChoice('first', pulled.epoch, pulled.events);
      return 'choice';
    } catch (error) {
      this.fail(error);
      return 'choice';
    }
  }

  private offerChoice(
    reason: 'first' | 'reset',
    epoch: string,
    cloud: StoredEvent[],
  ) {
    const local = this.options.store.getSnapshot();
    const cloudState = replayEvents(cloud).replay.state;
    this.setStatus({
      state: 'choice',
      reason,
      choice: {
        epoch,
        cloud,
        cloudSummary: summarize(cloud),
        localSummary: summarize(local.events),
        matches: suggestMatches(cloudState, local.replay.state),
        cloudHabits: cloudState.habits.map(({ id, name }) => ({ id, name })),
        localHabits: local.replay.state.habits.map(({ id, name }) => ({
          id,
          name,
        })),
      },
    });
  }

  // Another device erased the cloud copy. With nothing unsent here, follow
  // it quietly; otherwise ask, as on first sync.
  private async cloudWasReset() {
    const { store } = this.options;
    const pulled = await this.pullAll(0);
    const snapshot = store.getSnapshot();
    const sync = snapshot.sync!;
    const next = { ...sync, epoch: pulled.epoch, confirmed: 0 };
    if (snapshot.events.length === sync.confirmed) {
      if (pulled.events.length) await this.adopt(next, pulled.events);
      else await store.saveSync(next);
      this.again = true;
      return;
    }
    this.offerChoice('reset', pulled.epoch, pulled.events);
  }

  // Replace this device's log with the account's, keeping a recovery copy.
  private async adopt(sync: SyncState, cloud: StoredEvent[]) {
    const { store, newId } = this.options;
    await store.rewriteLog(() => ({
      keep: 0,
      events: cloud,
      archive: { id: newId(), recordedAt: this.now().toISOString() },
      sync: { ...sync, confirmed: cloud.length },
      addConflicts: [],
      removeConflicts: [],
    }));
  }

  /**
   * Carry out the person's choice. 'device' erases the cloud copy and
   * uploads this device's; 'cloud' replaces this device's data with the
   * account's; 'combine' takes the account's and adds this device's habits,
   * days and notes as one undoable change.
   */
  async choose(
    option: 'device' | 'cloud' | 'combine',
    matches?: Record<string, string | null>,
  ): Promise<void> {
    if (this.status.state !== 'choice') return;
    const { choice } = this.status;
    const { store, api, account, server, newId } = this.options;
    const base: SyncState = {
      account,
      server,
      epoch: choice.epoch,
      confirmed: 0,
    };
    this.setStatus({ state: 'syncing', lastSynced: this.lastSynced });
    try {
      if (option === 'device') {
        const reset = await api.reset(choice.epoch);
        if (!reset.ok) throw new Error('The cloud copy changed; try again.');
        await store.saveSync({ ...base, epoch: reset.epoch, confirmed: 0 });
      } else {
        const local: StoredState = store.getSnapshot().replay.state;
        await this.adopt(base, choice.cloud);
        if (option === 'combine') {
          const cloudState = store.getSnapshot().replay.state;
          const plan = combinePlan(
            cloudState,
            local,
            matches ?? choice.matches,
            newId,
          );
          store.applyBatch('combine', plan.changes);
        }
      }
      this.setStatus({ state: 'idle', lastSynced: this.lastSynced });
      await this.sync();
    } catch (error) {
      this.fail(error);
    }
  }
}

// Account key setup (docs/SYNC.md, Encryption).

/** A new account key and recovery code; nothing is saved yet. */
export async function createAccountKey(account: string) {
  const key = await newAccountKey();
  const code = newRecoveryCode();
  return { key, code, wrapped: await wrapAccountKey(key, code, account) };
}

/**
 * Store the wrapped key for the account. False when another device set one
 * first; then this device must unlock with that recovery code instead.
 */
export async function saveAccountKey(api: SyncApi, wrapped: string) {
  return (await api.putKey({ wrapped, previous: null })).ok;
}

/** Unlock the account key on a new device with the recovery code. */
export async function unlockAccountKey(
  api: SyncApi,
  account: string,
  code: string,
): Promise<CryptoKey | null> {
  const wrapped = await api.key();
  if (!wrapped) return null;
  return unwrapAccountKey(wrapped, code, account);
}

/** Replace the recovery code; the old one stops working. */
export async function replaceRecoveryCode(
  api: SyncApi,
  account: string,
  key: CryptoKey,
): Promise<string> {
  const previous = await api.key();
  const code = newRecoveryCode();
  const wrapped = await wrapAccountKey(key, code, account);
  const result = await api.putKey({ wrapped, previous });
  if (!result.ok)
    throw new Error('The recovery code changed elsewhere; try again.');
  return code;
}
