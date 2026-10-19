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
/**
 * Sync state kept beside the log (schema 2): the account this device syncs
 * with, the server's epoch (a reset starts a new one) and how many leading
 * events are confirmed in the account's order. Later events are pending.
 */
export type SyncState = {
  account: string;
  server: string;
  epoch: string;
  confirmed: number;
};
/** A sync conflict to review (core/sync/conflicts.ts owns the shape). */
export type StoredConflict = { id: string; createdAt: string } & Record<
  string,
  unknown
>;
export type LoadedStore = {
  events: StoredEvent[];
  replay: Replay;
  hasRecovery: boolean;
  /** This device's ID, written into every v24 event. */
  device: string;
  sync: SyncState | null;
  conflicts: StoredConflict[];
};
/**
 * Replace the log after its first `keep` events (which must be unchanged), in
 * one transaction with the sync state and conflicts. With `archive`, the
 * events being replaced are kept as a recovery copy first.
 */
export type RewritePlan = {
  keep: number;
  events: StoredEvent[];
  state: StoredState;
  archive: { id: string; recordedAt: string } | null;
  sync: SyncState | null;
  addConflicts: StoredConflict[];
  removeConflicts: string[];
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
  /** Sync support (schema 2); absent in sample and preview stores. */
  rewrite?(plan: RewritePlan): Promise<void>;
  saveSync?(sync: SyncState | null): Promise<void>;
  removeConflicts?(ids: string[]): Promise<void>;
}

async function readEvents(
  db: SqlPort,
  localDevice?: string,
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
  return timePerformance('repository.read.replay', () =>
    replayEvents(input, { localDevice }),
  );
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
async function insertEvents(db: SqlPort, events: StoredEvent[]) {
  for (const event of events)
    await db.runAsync(
      'INSERT INTO changes (sequence, id, event_json) VALUES (?, ?, ?)',
      event.sequence,
      event.id,
      JSON.stringify(event),
    );
}
async function writeSync(db: SqlPort, sync: SyncState | null) {
  await db.runAsync('DELETE FROM sync_state');
  if (sync)
    await db.runAsync(
      'INSERT INTO sync_state (singleton, state_json) VALUES (1, ?)',
      JSON.stringify(sync),
    );
}

// Schema 2 (v24): this device's ID, the sync state and open sync conflicts.
// It adds tables only; schema 1 stores upgrade in place.
const SCHEMA_2 = `CREATE TABLE device (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), id TEXT NOT NULL);
CREATE TABLE sync_state (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), state_json TEXT NOT NULL);
CREATE TABLE sync_conflicts (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, conflict_json TEXT NOT NULL);
PRAGMA user_version = 2;`;

const randomId = () => globalThis.crypto.randomUUID();

export function sqliteRepository(
  connection: TransactionalSql,
  /** The first event of a new store, written by this device. */
  initialize: (device: string) => StoredEvent,
  options: { newId?: () => string } = {},
): Repository {
  const db = profileSql(connection);
  const newId = options.newId ?? randomId;
  let device = '';
  return {
    async load() {
      const version = await db.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version',
      );
      if (!version || version.user_version > 2)
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
        const created = newId();
        const event = initialize(created);
        const { replay } = replayEvents([event], { localDevice: created });
        await db.withExclusiveTransactionAsync(async (tx) => {
          await tx.execAsync(`CREATE TABLE changes (sequence INTEGER PRIMARY KEY CHECK(sequence > 0), id TEXT UNIQUE NOT NULL, event_json TEXT NOT NULL);
CREATE TABLE current_state (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), last_sequence INTEGER NOT NULL, state_json TEXT NOT NULL);
CREATE TABLE recovery_archives (id TEXT PRIMARY KEY, recorded_at TEXT NOT NULL, events_json TEXT NOT NULL);
${SCHEMA_2}`);
          await tx.runAsync(
            'INSERT INTO device (singleton, id) VALUES (1, ?)',
            created,
          );
          await insertEvents(tx, [event]);
          await saveProjection(tx, 1, replay.state);
        });
      } else if (version.user_version === 1) {
        // Explicit, transactional upgrade; the log itself is untouched.
        await db.withExclusiveTransactionAsync(async (tx) => {
          await tx.execAsync(SCHEMA_2);
          await tx.runAsync(
            'INSERT INTO device (singleton, id) VALUES (1, ?)',
            newId(),
          );
        });
      }
      const stored = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM device WHERE singleton = 1',
      );
      if (!stored?.id) throw new Error('The device record is missing.');
      device = stored.id;
      const { events, replay } = await readEvents(db, device);
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
      const syncRow = await db.getFirstAsync<{ state_json: string }>(
        'SELECT state_json FROM sync_state WHERE singleton = 1',
      );
      const sync = syncRow
        ? (JSON.parse(syncRow.state_json) as SyncState)
        : null;
      if (sync && !(sync.confirmed >= 0 && sync.confirmed <= events.length))
        throw new Error('The sync state does not match the log.');
      const conflicts = (
        await db.getAllAsync<{ conflict_json: string }>(
          'SELECT conflict_json FROM sync_conflicts ORDER BY created_at, id',
        )
      ).map((row) => JSON.parse(row.conflict_json) as StoredConflict);
      return {
        events,
        replay,
        hasRecovery: (recovery?.count ?? 0) > 0,
        device,
        sync,
        conflicts,
      };
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
      const { replay } = replayEvents(events, { localDevice: device });
      await db.withExclusiveTransactionAsync(async (tx) => {
        const previous = await readEvents(tx, device);
        await tx.runAsync(
          'INSERT INTO recovery_archives (id, recorded_at, events_json) VALUES (?, ?, ?)',
          recoveryId,
          recordedAt,
          JSON.stringify(previous.events),
        );
        await tx.execAsync('DELETE FROM changes;');
        await insertEvents(tx, events);
        await saveProjection(tx, events.length, replay.state);
        // A replaced log is no longer the account's; sync must link again.
        await writeSync(tx, null);
      });
    },
    async recoveryEvents() {
      const row = await db.getFirstAsync<{ events_json: string }>(
        'SELECT events_json FROM recovery_archives ORDER BY rowid DESC LIMIT 1',
      );
      if (!row) throw new Error('No pre-restore copy is available.');
      return replayEvents(JSON.parse(row.events_json)).events;
    },
    async rewrite(plan) {
      // The caller replayed plan.events; check it again before replacing data.
      const { replay } = replayEvents(plan.events, { localDevice: device });
      if (JSON.stringify(replay.state) !== JSON.stringify(plan.state))
        throw new Error('Rewritten log does not match its projection.');
      await db.withExclusiveTransactionAsync(async (tx) => {
        const kept = await tx.getAllAsync<{ sequence: number; id: string }>(
          'SELECT sequence, id FROM changes WHERE sequence <= ? ORDER BY sequence',
          plan.keep,
        );
        if (
          kept.length !== plan.keep ||
          kept.some((row, index) => row.id !== plan.events[index]?.id)
        )
          throw new Error('The kept part of the log changed.');
        if (plan.archive) {
          const previous = await readEvents(tx, device);
          await tx.runAsync(
            'INSERT INTO recovery_archives (id, recorded_at, events_json) VALUES (?, ?, ?)',
            plan.archive.id,
            plan.archive.recordedAt,
            JSON.stringify(previous.events),
          );
        }
        await tx.runAsync('DELETE FROM changes WHERE sequence > ?', plan.keep);
        await insertEvents(tx, plan.events.slice(plan.keep));
        await saveProjection(tx, plan.events.length, plan.state);
        await writeSync(tx, plan.sync);
        for (const id of plan.removeConflicts)
          await tx.runAsync('DELETE FROM sync_conflicts WHERE id = ?', id);
        for (const conflict of plan.addConflicts)
          await tx.runAsync(
            'INSERT OR REPLACE INTO sync_conflicts (id, created_at, conflict_json) VALUES (?, ?, ?)',
            conflict.id,
            conflict.createdAt,
            JSON.stringify(conflict),
          );
      });
    },
    async saveSync(sync) {
      await db.withExclusiveTransactionAsync(async (tx) => {
        if (sync) {
          const count = await tx.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) AS count FROM changes',
          );
          if (!(sync.confirmed >= 0 && sync.confirmed <= (count?.count ?? 0)))
            throw new Error('The sync state does not match the log.');
        }
        await writeSync(tx, sync);
      });
    },
    async removeConflicts(ids) {
      await db.withExclusiveTransactionAsync(async (tx) => {
        for (const id of ids)
          await tx.runAsync('DELETE FROM sync_conflicts WHERE id = ?', id);
      });
    },
  };
}
