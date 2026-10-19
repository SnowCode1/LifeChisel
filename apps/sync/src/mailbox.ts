// One account's mailbox (docs/SYNC.md): encrypted events in the order they
// arrived, numbered from 1, copies of the account key wrapped by each unlock
// secret, and device approval requests it relays. It never reads payloads
// and never merges; a push from a device that has not seen the latest events
// is refused, and the device pulls and rebases. Written against a small SQL
// interface so the Durable Object and Node's SQLite in the tests run the
// same code.
import {
  LINK_LIFETIME_MS,
  LINK_STEPS,
  MAX_OPEN_LINKS,
  type LinkRecord,
  type LinkStep,
} from '@onpurpose/core/sync/link';
import {
  MAX_BATCH_PAYLOAD,
  MAX_KEY_COPIES,
  RECOVERY_COPY,
  type KeyCopy,
  type KeyCopyRequest,
  type KeyCopyResult,
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
// 3: several wrapped copies of the key, and device approval requests.
const SCHEMA_VERSION = 3;

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
      let at = schema ?? 0;
      if (at < 1) {
        this.sql.run(
          'CREATE TABLE events (sequence INTEGER PRIMARY KEY CHECK(sequence > 0), id TEXT UNIQUE NOT NULL, device TEXT NOT NULL, received_at TEXT NOT NULL, payload TEXT NOT NULL)',
        );
        this.sql.run(
          "INSERT INTO mailbox_meta (key, value) VALUES ('schema', 1)",
        );
        at = 1;
      }
      if (at < 2) {
        // Text settings with a first epoch.
        this.sql.run(
          'CREATE TABLE mailbox_text (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
        );
        this.sql.run(
          "INSERT INTO mailbox_text (key, value) VALUES ('epoch', ?)",
          this.newEpoch(),
        );
      }
      if (at < 3) {
        // Key copies; a layout-2 key becomes the recovery copy.
        this.sql.run(
          'CREATE TABLE key_copies (id TEXT PRIMARY KEY, copy_json TEXT NOT NULL)',
        );
        this.sql.run(
          'CREATE TABLE links (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, link_json TEXT NOT NULL)',
        );
        const old = this.text('wrapped_key');
        if (old) {
          this.writeCopy({
            id: RECOVERY_COPY,
            kind: 'recovery',
            label: 'Emergency recovery code',
            credentialId: null,
            wrapped: old,
            createdAt: this.now().toISOString(),
          });
          this.setText('wrapped_key', null);
        }
      }
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
      return {
        epoch,
        head,
        events,
        more: last < head,
        links: this.linkCount(),
      };
    });
  }

  // Copies of the account key (see crypto.ts).

  private writeCopy(copy: KeyCopy) {
    this.sql.run(
      'INSERT INTO key_copies (id, copy_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET copy_json = excluded.copy_json',
      copy.id,
      JSON.stringify(copy),
    );
  }

  keys(): KeyCopy[] {
    return this.sql
      .all<{ copy_json: string }>(
        'SELECT copy_json FROM key_copies ORDER BY id',
      )
      .map((row) => JSON.parse(row.copy_json) as KeyCopy);
  }

  /** Compare-and-set, so two devices cannot replace each other's copy. */
  putKey(id: string, request: KeyCopyRequest): KeyCopyResult {
    return this.sql.transaction(() => {
      const current = this.keys().find((copy) => copy.id === id) ?? null;
      if ((current?.wrapped ?? null) !== request.previous)
        return { ok: false, copy: current };
      if (!current && this.keys().length >= MAX_KEY_COPIES)
        return { ok: false, copy: null };
      const { previous: _previous, ...fields } = request;
      const copy: KeyCopy = {
        id,
        ...fields,
        createdAt: current?.createdAt ?? this.now().toISOString(),
      };
      this.writeCopy(copy);
      return { ok: true, copy };
    });
  }

  /** The recovery copy stays; it is the way back when nothing else works. */
  deleteKey(id: string): boolean {
    if (id === RECOVERY_COPY) return false;
    return this.sql.transaction(() => {
      const found = this.keys().some((copy) => copy.id === id);
      this.sql.run('DELETE FROM key_copies WHERE id = ?', id);
      return found;
    });
  }

  // Device approval requests (see link.ts). The mailbox only relays: each
  // step is written once, in order, and requests expire.

  private openLinks(): LinkRecord[] {
    const cutoff = new Date(
      this.now().getTime() - LINK_LIFETIME_MS,
    ).toISOString();
    this.sql.run('DELETE FROM links WHERE created_at < ?', cutoff);
    return this.sql
      .all<{ link_json: string }>(
        'SELECT link_json FROM links ORDER BY created_at',
      )
      .map((row) => JSON.parse(row.link_json) as LinkRecord);
  }

  private linkCount(): number {
    return this.openLinks().filter((link) => !link.sealedKey && !link.declined)
      .length;
  }

  createLink(request: { id: string; label: string; newKey: string }): boolean {
    return this.sql.transaction(() => {
      const open = this.openLinks();
      if (
        open.some((link) => link.id === request.id) ||
        open.filter((link) => !link.sealedKey && !link.declined).length >=
          MAX_OPEN_LINKS
      )
        return false;
      const link: LinkRecord = {
        ...request,
        createdAt: this.now().toISOString(),
      };
      this.sql.run(
        'INSERT INTO links (id, created_at, link_json) VALUES (?, ?, ?)',
        link.id,
        link.createdAt,
        JSON.stringify(link),
      );
      return true;
    });
  }

  links(): LinkRecord[] {
    return this.sql.transaction(() =>
      this.openLinks().filter((link) => !link.sealedKey && !link.declined),
    );
  }

  link(id: string): LinkRecord | null {
    return this.sql.transaction(
      () => this.openLinks().find((link) => link.id === id) ?? null,
    );
  }

  /** Write one step, if every earlier step is written and this one is not. */
  postLink(id: string, step: LinkStep, value: string): LinkRecord | null {
    return this.sql.transaction(() => {
      const link = this.openLinks().find((item) => item.id === id);
      if (!link || link.sealedKey || link.declined) return null;
      if (step === 'declined') {
        link.declined = true;
      } else {
        const index = LINK_STEPS.indexOf(step);
        if (
          link[step] !== undefined ||
          LINK_STEPS.slice(0, index).some(
            (earlier) => link[earlier] === undefined,
          )
        )
          return null;
        link[step] = value;
      }
      this.sql.run(
        'UPDATE links SET link_json = ? WHERE id = ?',
        JSON.stringify(link),
        id,
      );
      return link;
    });
  }

  /** Erase the events and start a new epoch; the key copies stay. */
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
      this.sql.run('DELETE FROM key_copies');
      this.sql.run('DELETE FROM links');
      this.setText('epoch', this.newEpoch());
    });
  }
}
