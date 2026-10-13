import {
  replayEvents,
  applyChange,
  type StoredEvent,
  type Replay,
  type StoredState,
} from './model.ts';
import { timePerformance } from '../performance.ts';
import { profileSql } from './profileSql.ts';

export interface SqlPort {
  execAsync(sql: string): Promise<void>;
  runAsync(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<unknown>;
  getFirstAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T | null>;
  getAllAsync<T>(
    sql: string,
    ...params: (string | number | null)[]
  ): Promise<T[]>;
}
export interface TransactionalSql extends SqlPort {
  withExclusiveTransactionAsync(
    task: (tx: SqlPort) => Promise<void>,
  ): Promise<void>;
}
export type LoadedStore = {
  events: StoredEvent[];
  replay: Replay;
  hasRecovery: boolean;
};
export interface Repository {
  load(): Promise<LoadedStore>;
  append(event: StoredEvent, state: StoredState): Promise<void>;
  replace(
    events: StoredEvent[],
    recoveryId: string,
    recordedAt: string,
  ): Promise<void>;
  recoveryEvents(): Promise<StoredEvent[]>;
}

async function readEvents(
  db: SqlPort,
): Promise<{ events: StoredEvent[]; replay: Replay }> {
  const rows = await db.getAllAsync<{
    sequence: number;
    id: string;
    event_json: string;
  }>('SELECT sequence, id, event_json FROM changes ORDER BY sequence');
  const input = timePerformance('repository.read.parse', () =>
    rows.map((row) => {
      const parsed: unknown = JSON.parse(row.event_json);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('sequence' in parsed) ||
        !('id' in parsed) ||
        parsed.sequence !== row.sequence ||
        parsed.id !== row.id
      )
        throw new Error('The change log is inconsistent.');
      return parsed;
    }),
  );
  return timePerformance('repository.read.replay', () => replayEvents(input));
}
async function saveProjection(
  db: SqlPort,
  sequence: number,
  state: StoredState,
) {
  await db.runAsync(
    'INSERT INTO current_state (singleton, last_sequence, state_json) VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET last_sequence = excluded.last_sequence, state_json = excluded.state_json',
    sequence,
    timePerformance('repository.projection.serialize', () =>
      JSON.stringify(state),
    ),
  );
}

export function sqliteRepository(
  connection: TransactionalSql,
  initialize: () => StoredEvent,
): Repository {
  const db = profileSql(connection);
  return {
    async load() {
      const version = await db.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version',
      );
      if (!version || version.user_version > 1)
        throw new Error('This database needs a newer version of OnPurpose.');
      const integrity = await db.getFirstAsync<{ quick_check: string }>(
        'PRAGMA quick_check',
      );
      if (integrity?.quick_check !== 'ok')
        throw new Error(
          'The saved database needs recovery. It has not been reset.',
        );
      await db.execAsync(
        'PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;',
      );
      if (version.user_version === 0) {
        const existing = await db.getFirstAsync<{ count: number }>(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        );
        if (existing?.count !== 0)
          throw new Error(
            'Unrecognized database; saved data has not been replaced.',
          );
        const event = initialize();
        const { replay } = replayEvents([event]);
        await db.withExclusiveTransactionAsync(async (tx) => {
          await tx.execAsync(`CREATE TABLE changes (sequence INTEGER PRIMARY KEY CHECK(sequence > 0), id TEXT UNIQUE NOT NULL, event_json TEXT NOT NULL);
CREATE TABLE current_state (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), last_sequence INTEGER NOT NULL, state_json TEXT NOT NULL);
CREATE TABLE recovery_archives (id TEXT PRIMARY KEY, recorded_at TEXT NOT NULL, events_json TEXT NOT NULL);
PRAGMA user_version = 1;`);
          await tx.runAsync(
            'INSERT INTO changes (sequence, id, event_json) VALUES (?, ?, ?)',
            event.sequence,
            event.id,
            JSON.stringify(event),
          );
          await saveProjection(tx, 1, replay.state);
        });
      }
      const { events, replay } = await readEvents(db);
      const projection = await db.getFirstAsync<{
        last_sequence: number;
        state_json: string;
      }>(
        'SELECT last_sequence, state_json FROM current_state WHERE singleton = 1',
      );
      // The log is authoritative. Repair only derived data, never invalid events.
      if (
        projection?.last_sequence !== events.length ||
        projection?.state_json !== JSON.stringify(replay.state)
      ) {
        await db.withExclusiveTransactionAsync((tx) =>
          saveProjection(tx, events.length, replay.state),
        );
      }
      const recovery = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM recovery_archives',
      );
      return { events, replay, hasRecovery: (recovery?.count ?? 0) > 0 };
    },
    async append(event, state) {
      await db.withExclusiveTransactionAsync(async (tx) => {
        const existing = await tx.getFirstAsync<{
          sequence: number;
          event_json: string;
        }>('SELECT sequence, event_json FROM changes WHERE id = ?', event.id);
        if (existing) {
          if (
            existing.sequence !== event.sequence ||
            existing.event_json !== JSON.stringify(event)
          )
            throw new Error('Conflicting change identifier.');
          return; // Retry after an uncertain commit is idempotent.
        }
        const previous = await tx.getFirstAsync<{
          last_sequence: number;
          state_json: string;
        }>(
          'SELECT last_sequence, state_json FROM current_state WHERE singleton = 1',
        );
        if (previous?.last_sequence !== event.sequence - 1)
          throw new Error(
            'Another writer changed the database. Reopen OnPurpose.',
          );
        // Validate the before-value against the transaction's committed projection.
        const matches = timePerformance('repository.append.validate', () => {
          const current = JSON.parse(previous.state_json) as StoredState;
          const projected =
            event.type === 'initialize'
              ? null
              : applyChange(current, event.change);
          return JSON.stringify(projected) === JSON.stringify(state);
        });
        if (!matches) throw new Error('Current-state projection mismatch.');
        await tx.runAsync(
          'INSERT INTO changes (sequence, id, event_json) VALUES (?, ?, ?)',
          event.sequence,
          event.id,
          timePerformance('repository.append.serialize', () =>
            JSON.stringify(event),
          ),
        );
        await saveProjection(tx, event.sequence, state);
      });
    },
    async replace(events, recoveryId, recordedAt) {
      const { replay } = replayEvents(events);
      await db.withExclusiveTransactionAsync(async (tx) => {
        const previous = await readEvents(tx);
        await tx.runAsync(
          'INSERT INTO recovery_archives (id, recorded_at, events_json) VALUES (?, ?, ?)',
          recoveryId,
          recordedAt,
          JSON.stringify(previous.events),
        );
        await tx.execAsync('DELETE FROM changes;');
        for (const event of events)
          await tx.runAsync(
            'INSERT INTO changes (sequence, id, event_json) VALUES (?, ?, ?)',
            event.sequence,
            event.id,
            JSON.stringify(event),
          );
        await saveProjection(tx, events.length, replay.state);
      });
    },
    async recoveryEvents() {
      const row = await db.getFirstAsync<{ events_json: string }>(
        'SELECT events_json FROM recovery_archives ORDER BY rowid DESC LIMIT 1',
      );
      if (!row) throw new Error('No pre-restore copy is available.');
      return replayEvents(JSON.parse(row.events_json)).events;
    },
  };
}
