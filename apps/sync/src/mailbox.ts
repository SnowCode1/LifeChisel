// One account's mailbox (docs/SYNC.md): encrypted events in the order they
// arrived, numbered from 1, plus the account key wrapped with the recovery
// code. It never reads payloads and never merges; a push from a device that
// has not seen the latest events is refused, and the device pulls and
// rebases. Written against a small SQL interface so the Durable Object and
// Node's SQLite in the tests run the same code.
import {
  MAX_BATCH_PAYLOAD,
  type KeyRequest,
  type KeyResult,
  type MailboxEvent,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type ResetResult,
} from '@onpurpose/core/sync/protocol';

export type SqlValue = string | number | null;
export type MailboxSql = {
  all<T>(query: string, ...params: SqlValue[]): T[];
  run(query: string, ...params: SqlValue[]): void;
  /** Runs synchronously; a throw rolls everything back. */
  transaction<T>(task: () => T): T;
};

// 1: events. 2: an epoch naming the current contents, and the wrapped key.
const SCHEMA_VERSION = 2;

type EventRow = {
  sequence: number;
  id: string;
  device: string;
  received_at: string;
  payload: string;
};

export class Mailbox {
  private readonly sql: MailboxSql;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(
    sql: MailboxSql,
    now = () => new Date(),
    newId = () => crypto.randomUUID(),
  ) {
    this.sql = sql;
    this.now = now;
    this.newId = newId;
  }

  /** Creates or upgrades the tables; refuses a newer layout. */
  migrate() {
    this.sql.transaction(() => {
      this.sql.run(
        'CREATE TABLE IF NOT EXISTS mailbox_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)',
      );
      const schema = this.sql.all<{ value: number }>(
        "SELECT value FROM mailbox_meta WHERE key = 'schema'",
      )[0]?.value;
      if (schema === SCHEMA_VERSION) return;
      if (schema !== undefined && schema > SCHEMA_VERSION)
        throw new Error(`Mailbox schema ${schema} is newer than this server.`);
      if (schema === undefined) {
        this.sql.run(
          'CREATE TABLE events (sequence INTEGER PRIMARY KEY CHECK(sequence > 0), id TEXT UNIQUE NOT NULL, device TEXT NOT NULL, received_at TEXT NOT NULL, payload TEXT NOT NULL)',
        );
        this.sql.run(
          "INSERT INTO mailbox_meta (key, value) VALUES ('schema', 1)",
        );
      }
      // 1 → 2: add the text settings with a first epoch.
      this.sql.run(
        'CREATE TABLE mailbox_text (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
      );
      this.sql.run(
        "INSERT INTO mailbox_text (key, value) VALUES ('epoch', ?)",
        this.newEpoch(),
      );
      this.sql.run(
        "UPDATE mailbox_meta SET value = ? WHERE key = 'schema'",
        SCHEMA_VERSION,
      );
    });
  }

  private newEpoch() {
    return this.newId()
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(0, 64);
  }

  private text(key: string): string | null {
    return (
      this.sql.all<{ value: string }>(
        'SELECT value FROM mailbox_text WHERE key = ?',
        key,
      )[0]?.value ?? null
    );
  }

  private setText(key: string, value: string | null) {
    if (value === null)
      this.sql.run('DELETE FROM mailbox_text WHERE key = ?', key);
    else
      this.sql.run(
        'INSERT INTO mailbox_text (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        value,
      );
  }

  epoch(): string {
    return this.text('epoch')!;
  }

  head(): number {
    return this.sql.all<{ head: number }>(
      'SELECT COALESCE(MAX(sequence), 0) AS head FROM events',
    )[0]!.head;
  }

  /** Appends every event or none. The request must already be validated. */
  push(request: PushRequest): PushResponse {
    return this.sql.transaction(() => {
      const epoch = this.epoch();
      const head = this.head();
      if (request.epoch !== epoch)
        return { ok: false, reason: 'reset', epoch, head };
      if (request.expectedHead !== head)
        return { ok: false, reason: 'behind', epoch, head };
      for (const event of request.events) {
        const seen = this.sql.all(
          'SELECT 1 FROM events WHERE id = ?',
          event.id,
        );
        if (seen.length > 0)
          return { ok: false, reason: 'duplicate', epoch, head };
      }
      const receivedAt = this.now().toISOString();
      request.events.forEach((event, index) =>
        this.sql.run(
          'INSERT INTO events (sequence, id, device, received_at, payload) VALUES (?, ?, ?, ?, ?)',
          head + index + 1,
          event.id,
          event.device,
          receivedAt,
          event.payload,
        ),
      );
      return {
        ok: true,
        epoch,
        head: head + request.events.length,
        receivedAt,
      };
    });
  }

  /**
   * Events after `after`, oldest first: at most `limit` of them and about
   * MAX_BATCH_PAYLOAD characters, but always at least one if any remain.
   */
  pull(after: number, limit: number): PullResponse {
    return this.sql.transaction(() => {
      const epoch = this.epoch();
      const head = this.head();
      // Measure first so a page of large payloads is never loaded at once.
      const sizes = this.sql.all<{ sequence: number; size: number }>(
        'SELECT sequence, length(payload) AS size FROM events WHERE sequence > ? ORDER BY sequence LIMIT ?',
        after,
        limit,
      );
      let last = after;
      let total = 0;
      for (const row of sizes) {
        if (last > after && total + row.size > MAX_BATCH_PAYLOAD) break;
        total += row.size;
        last = row.sequence;
      }
      const events = this.sql
        .all<EventRow>(
          'SELECT sequence, id, device, received_at, payload FROM events WHERE sequence > ? AND sequence <= ? ORDER BY sequence',
          after,
          last,
        )
        .map((row): MailboxEvent => ({
          sequence: row.sequence,
          id: row.id,
          device: row.device,
          receivedAt: row.received_at,
          payload: row.payload,
        }));
      return { epoch, head, events, more: last < head };
    });
  }

  key(): string | null {
    return this.text('wrapped_key');
  }

  /** Compare-and-set, so two devices cannot replace each other's key. */
  putKey(request: KeyRequest): KeyResult {
    return this.sql.transaction(() => {
      const current = this.key();
      if (current !== request.previous) return { ok: false, wrapped: current };
      this.setText('wrapped_key', request.wrapped);
      return { ok: true, wrapped: request.wrapped };
    });
  }

  /** Erase the events and start a new epoch; the key stays. */
  reset(epoch: string): ResetResult {
    return this.sql.transaction(() => {
      const current = this.epoch();
      if (epoch !== current) return { ok: false, epoch: current };
      this.sql.run('DELETE FROM events');
      const next = this.newEpoch();
      this.setText('epoch', next);
      return { ok: true, epoch: next };
    });
  }

  /** Remove everything, for account deletion. */
  erase() {
    this.sql.transaction(() => {
      this.sql.run('DELETE FROM events');
      this.setText('wrapped_key', null);
      this.setText('epoch', this.newEpoch());
    });
  }
}
