import {
  applyEvent,
  canCoalesce,
  emptyReplay,
  inverse,
  isNoChange,
  isPreference,
  replayEvents,
  type BatchChange,
  type BatchItem,
  type Change,
  type EventMeta,
  type Replay,
  type StoredEvent,
} from './model.ts';
import type {
  Repository,
  RewritePlan,
  StoredConflict,
  SyncState,
} from './repository.ts';
import {
  performanceEnabled,
  recordPerformance,
  timePerformanceAsync,
  timePerformance,
} from '../performance.ts';

export type StoreSnapshot = {
  status: 'loading' | 'ready' | 'load-error';
  replay: Replay;
  events: StoredEvent[];
  /** Writes (edits and sync tasks) not yet saved. */
  pending: number;
  error: string | null;
  busy: boolean;
  hasRecovery: boolean;
  /** This device's ID (v24); empty until loaded. */
  device: string;
  sync: SyncState | null;
  conflicts: StoredConflict[];
};
export type MetaFactory = (sequence: number) => EventMeta;

/**
 * A log rewrite worked out from the snapshot at the moment it runs (after
 * every earlier write is saved). Events after `keep` replace the rest of the
 * log, including local edits still waiting to be written.
 */
export type RewriteRequest = Omit<RewritePlan, 'state'>;

type Task = {
  kind: 'task';
  prepare: (() => void) | null;
  run: () => Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
  settled: boolean;
};
type QueueItem = { kind: 'append'; event: StoredEvent; replay: Replay } | Task;

const WRITER_VERSION = 25 as const;

export class ChangeStore {
  private snapshot: StoreSnapshot = {
    status: 'loading',
    replay: emptyReplay(),
    events: [],
    pending: 0,
    error: null,
    busy: false,
    hasRecovery: false,
    device: '',
    sync: null,
    conflicts: [],
  };
  private listeners = new Set<() => void>();
  private queue: QueueItem[] = [];
  private draining: Promise<void> | null = null;
  private loading: Promise<void> | null = null;
  private repository: Repository;
  private metadata: MetaFactory;
  constructor(repository: Repository, metadata: MetaFactory) {
    this.repository = repository;
    this.metadata = metadata;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(next: Partial<StoreSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }
  load = (): Promise<void> => {
    if (this.loading) return this.loading;
    if (this.snapshot.status === 'ready') return Promise.resolve();
    this.update({ status: 'loading', error: null });
    this.loading = timePerformanceAsync('store.load', () =>
      this.repository.load(),
    )
      .then((loaded) => {
        this.update({
          ...loaded,
          // Test doubles may not track a device; real repositories always do.
          device: loaded.device || 'unknown-device',
          sync: loaded.sync ?? null,
          conflicts: loaded.conflicts ?? [],
          status: 'ready',
          error: null,
        });
      })
      .catch(() => {
        this.update({
          status: 'load-error',
          error:
            'Saved data could not be opened. Your database has not been reset.',
        });
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  };
  canEdit = () =>
    this.snapshot.status === 'ready' &&
    !this.snapshot.error &&
    !this.snapshot.busy;
  private meta(): EventMeta & { version: typeof WRITER_VERSION } {
    const started = performanceEnabled ? performance.now() : 0;
    const meta = {
      ...this.metadata(this.snapshot.events.length + 1),
      version: WRITER_VERSION,
      device: this.snapshot.device,
    };
    if (performanceEnabled)
      recordPerformance('store.metadata', performance.now() - started);
    return meta;
  }
  change(change: Change): boolean {
    if (!this.canEdit() || isNoChange(change)) return false;
    const meta = this.meta();
    if (isPreference(change))
      return this.enqueue({ ...meta, type: 'preference', change });
    const group = this.snapshot.replay.lastGroup;
    const groupId = canCoalesce(group, meta, change) ? group!.id : meta.id;
    return this.enqueue({ ...meta, type: 'change', groupId, change });
  }
  /** v24: several habit changes as one undoable action. */
  applyBatch(label: BatchChange['label'], changes: BatchItem[]): boolean {
    if (changes.length === 0) return false;
    return this.change({ kind: 'batch', label, changes });
  }

  deleteArchivedHabit(habitId: string): boolean {
    if (!this.canEdit()) return false;
    const { habits, values, notes } = this.snapshot.replay.state;
    const index = habits.findIndex((habit) => habit.id === habitId);
    const habit = habits[index];
    if (!habit?.archived) return false;
    const prefix = `${habitId}:`;
    const entries = Object.fromEntries(
      Object.entries(values)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key.slice(prefix.length), value]),
    );
    return this.change({
      kind: 'deleteHabit',
      habitId,
      index,
      before: {
        habit,
        entries,
        ...(notes?.[habitId] ? { notes: notes[habitId] } : {}),
      },
      after: null,
    });
  }

  undo = (): boolean => {
    if (!this.canEdit()) return false;
    const target = this.snapshot.replay.undo.at(-1);
    if (!target) return false;
    return this.enqueue({
      ...this.meta(),
      type: 'undo',
      targetId: target.id,
      change: inverse(target.change) as typeof target.change,
    });
  };
  redo = (): boolean => {
    if (!this.canEdit()) return false;
    const target = this.snapshot.replay.redo.at(-1);
    if (!target) return false;
    return this.enqueue({
      ...this.meta(),
      type: 'redo',
      targetId: target.undoId,
      change: target.action.change,
    });
  };
  private enqueue(event: StoredEvent): boolean {
    const started = performanceEnabled ? performance.now() : 0;
    const replay = applyEvent(this.snapshot.replay, event);
    if (performanceEnabled)
      recordPerformance('store.apply', performance.now() - started);
    this.queue.push({ kind: 'append', event, replay });
    const publishing = performanceEnabled ? performance.now() : 0;
    this.update({
      replay,
      events: [...this.snapshot.events, event],
      pending: this.queue.length,
    });
    if (performanceEnabled)
      recordPerformance('store.publish', performance.now() - publishing);
    void this.drain();
    return true;
  }
  // Queue a write that runs in order with edits. `prepare` runs synchronously
  // once every earlier write is saved, so it sees exactly what is on disk plus
  // any newer unsaved edits; `run` then saves.
  private enqueueTask(
    prepare: (() => void) | null,
    run: () => Promise<void>,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        kind: 'task',
        prepare,
        run,
        resolve,
        reject,
        settled: false,
      });
      this.update({ pending: this.queue.length });
      void this.drain();
    });
  }
  private drain(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = (async () => {
      while (this.queue.length) {
        const item = this.queue[0];
        if (item.kind === 'task' && item.prepare) {
          const prepare = item.prepare;
          item.prepare = null;
          try {
            prepare();
          } catch (error) {
            // Nothing was saved or published; drop the task, keep editing.
            this.queue.splice(this.queue.indexOf(item), 1);
            this.update({ pending: this.queue.length });
            item.settled = true;
            item.reject(error);
            continue;
          }
        }
        const started = performanceEnabled ? performance.now() : 0;
        try {
          if (item.kind === 'append')
            await this.repository.append(item.event, item.replay.state);
          else await item.run();
          this.queue.shift();
          if (item.kind === 'task' && !item.settled) {
            item.settled = true;
            item.resolve();
          }
          timePerformance('store.ack', () =>
            this.update({ pending: this.queue.length, error: null }),
          );
        } catch (error) {
          this.update({
            error: 'Changes are not saved. Keep the app open and retry.',
          });
          if (item.kind === 'task' && !item.settled) {
            item.settled = true;
            item.reject(error);
          }
          break;
        } finally {
          if (performanceEnabled)
            recordPerformance('store.append', performance.now() - started);
        }
      }
    })().finally(() => {
      this.draining = null;
      // A write queued while the loop was finishing (for instance by code
      // awaiting a task it just resolved) still needs a loop; failed writes
      // wait for retry().
      if (this.queue.length && !this.snapshot.error) void this.drain();
    });
    return this.draining;
  }
  retry = async () => {
    if (this.snapshot.status !== 'ready') return this.load();
    while (this.draining) await this.draining;
    if (this.queue.length) await this.drain();
  };
  async flush() {
    while (this.draining) await this.draining;
    if (this.queue.length || this.snapshot.error)
      throw new Error(
        'Wait for changes to save, or retry the failed save first.',
      );
  }
  /** Resolves once every queued write so far is saved. */
  settled(): Promise<void> {
    return this.enqueueTask(null, async () => {});
  }
  async exclusive<T>(task: () => Promise<T>): Promise<T> {
    if (!this.canEdit()) throw new Error('The local store is not ready.');
    this.update({ busy: true });
    try {
      await this.flush();
      return await task();
    } finally {
      this.update({ busy: false });
    }
  }
  async replace(events: StoredEvent[]) {
    if (!this.snapshot.busy) throw new Error('Restore must run exclusively.');
    const { replay } = replayEvents(events, {
      localDevice: this.snapshot.device,
    });
    const meta = this.metadata(1);
    await this.repository.replace(events, meta.id, meta.recordedAt);
    this.update({ events, replay, hasRecovery: true, error: null, sync: null });
  }
  recoveryEvents = () => this.repository.recoveryEvents();

  // Sync (docs/SYNC.md). These run in order with edits.

  /**
   * Rewrite the log from the snapshot when the write runs. `compute` returns
   * null to change nothing. Unsaved edits made before it runs are in the
   * snapshot it sees, so they must be part of what it returns.
   */
  rewriteLog(
    compute: (snapshot: StoreSnapshot) => RewriteRequest | null,
  ): Promise<void> {
    const rewrite = this.repository.rewrite?.bind(this.repository);
    if (!rewrite) return Promise.reject(new Error('Sync is unavailable here.'));
    let plan: RewritePlan | null = null;
    return this.enqueueTask(
      () => {
        const request = compute(this.snapshot);
        if (!request) return;
        const { replay } = replayEvents(request.events, {
          localDevice: this.snapshot.device,
        });
        plan = { ...request, state: replay.state };
        const removed = new Set(request.removeConflicts);
        const added = new Set(request.addConflicts.map((c) => c.id));
        // Later queued edits are inside the new log; do not write them twice.
        const index = this.queue.findIndex((item) => item.kind === 'task');
        this.queue = this.queue.filter(
          (item, position) => position <= index || item.kind === 'task',
        );
        this.update({
          events: request.events,
          replay,
          sync: request.sync,
          conflicts: [
            ...this.snapshot.conflicts.filter(
              (c) => !removed.has(c.id) && !added.has(c.id),
            ),
            ...request.addConflicts,
          ],
          pending: this.queue.length,
          ...(request.archive ? { hasRecovery: true } : {}),
        });
      },
      async () => {
        if (plan) await rewrite(plan);
      },
    );
  }
  saveSync(sync: SyncState | null): Promise<void> {
    const save = this.repository.saveSync?.bind(this.repository);
    if (!save) return Promise.reject(new Error('Sync is unavailable here.'));
    return this.enqueueTask(
      () => this.update({ sync }),
      () => save(sync),
    );
  }
  removeConflicts(ids: string[]): Promise<void> {
    const remove = this.repository.removeConflicts?.bind(this.repository);
    if (!remove) return Promise.reject(new Error('Sync is unavailable here.'));
    const gone = new Set(ids);
    return this.enqueueTask(
      () =>
        this.update({
          conflicts: this.snapshot.conflicts.filter((c) => !gone.has(c.id)),
        }),
      () => remove(ids),
    );
  }
}
