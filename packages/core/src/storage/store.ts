import {
  applyEvent,
  sameValue,
  canCoalesce,
  emptyReplay,
  inverse,
  isPreference,
  replayEvents,
  type Change,
  type EventMeta,
  type Replay,
  type StoredEvent,
} from './model.ts';
import type { Repository } from './repository.ts';
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
  pending: number;
  error: string | null;
  busy: boolean;
  hasRecovery: boolean;
};
export type MetaFactory = (sequence: number) => EventMeta;
export class ChangeStore {
  private snapshot: StoreSnapshot = {
    status: 'loading',
    replay: emptyReplay(),
    events: [],
    pending: 0,
    error: null,
    busy: false,
    hasRecovery: false,
  };
  private listeners = new Set<() => void>();
  private queue: { event: StoredEvent; replay: Replay }[] = [];
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
        this.update({ ...loaded, status: 'ready', error: null });
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
  change(change: Change): boolean {
    if (!this.canEdit() || sameValue(change.before, change.after)) return false;
    const started = performanceEnabled ? performance.now() : 0;
    const meta = {
      ...this.metadata(this.snapshot.events.length + 1),
      version: 21 as const,
    };
    if (performanceEnabled)
      recordPerformance('store.metadata', performance.now() - started);
    if (isPreference(change))
      return this.enqueue({ ...meta, type: 'preference', change });
    const group = this.snapshot.replay.lastGroup;
    const groupId = canCoalesce(group, meta, change) ? group!.id : meta.id;
    return this.enqueue({ ...meta, type: 'change', groupId, change });
  }

  deleteArchivedHabit(habitId: string): boolean {
    if (!this.canEdit()) return false;
    const { habits, values } = this.snapshot.replay.state;
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
      before: { habit, entries },
      after: null,
    });
  }

  undo = (): boolean => {
    if (!this.canEdit()) return false;
    const target = this.snapshot.replay.undo.at(-1);
    if (!target) return false;
    return this.enqueue({
      ...this.metadata(this.snapshot.events.length + 1),
      version: 21,
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
      ...this.metadata(this.snapshot.events.length + 1),
      version: 21,
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
    this.queue.push({ event, replay });
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
  private drain(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = (async () => {
      while (this.queue.length) {
        const item = this.queue[0];
        const started = performanceEnabled ? performance.now() : 0;
        try {
          await this.repository.append(item.event, item.replay.state);
          this.queue.shift();
          timePerformance('store.ack', () =>
            this.update({ pending: this.queue.length, error: null }),
          );
        } catch {
          this.update({
            error: 'Changes are not saved. Keep the app open and retry.',
          });
          break;
        } finally {
          if (performanceEnabled)
            recordPerformance('store.append', performance.now() - started);
        }
      }
    })().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }
  retry = async () => {
    if (this.snapshot.status !== 'ready') return this.load();
    if (this.draining) await this.draining;
    if (this.queue.length) await this.drain();
  };
  async flush() {
    if (this.draining) await this.draining;
    if (this.queue.length || this.snapshot.error)
      throw new Error(
        'Wait for changes to save, or retry the failed save first.',
      );
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
    const { replay } = replayEvents(events);
    const meta = this.metadata(1);
    await this.repository.replace(events, meta.id, meta.recordedAt);
    this.update({ events, replay, hasRecovery: true, error: null });
  }
  recoveryEvents = () => this.repository.recoveryEvents();
}
