import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { descriptionPositionKey } from '../packages/core/src/descriptionPosition.ts';
import {
  descriptionResume,
  completeDescriptionDraft,
  rememberDescriptionPosition,
} from '../packages/core/src/storage/descriptionBookmarks.ts';
import {
  serializedDrafts,
  sqliteDrafts,
  memoryDrafts,
  validateDraft,
} from '../packages/core/src/storage/descriptionDraftModel.ts';
const draft = { version: 1, base: 'Saved note', text: '**Unfinished** draft' };
const port = (db) => ({
  async getFirstAsync(sql, ...params) {
    return db.prepare(sql).get(...params) ?? null;
  },
  async runAsync(sql, ...params) {
    db.prepare(sql).run(...params);
  },
});
test('draft format permits empty edits but rejects invalid, oversized or future data', () => {
  validateDraft({ version: 1, base: '', text: '' });
  for (const invalid of [
    null,
    [],
    {},
    { ...draft, version: 3 },
    { ...draft, text: 1 },
    { ...draft, base: null },
    { ...draft, extra: true },
    { ...draft, text: 'x'.repeat(20001) },
  ])
    assert.throws(() => validateDraft(invalid));
});
test('native draft SQL survives reopen separately, binds user text and retains corrupt data for visible recovery errors', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'onpurpose-drafts-'));
  const file = join(directory, 'drafts.db');
  let db = new DatabaseSync(file);
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  db.exec(
    'CREATE TABLE description_drafts (draft_key TEXT PRIMARY KEY, draft_json TEXT NOT NULL)',
  );
  let adapter = serializedDrafts(sqliteDrafts(port(db)));
  const maliciousText = {
    ...draft,
    text: "quote'); DROP TABLE description_drafts; --\n[notes](https://example.com)",
  };
  await adapter.put('habit-test', maliciousText);
  await adapter.put('new-habit', { ...draft, text: '' });
  db.close();
  db = new DatabaseSync(file);
  adapter = serializedDrafts(sqliteDrafts(port(db)));
  assert.deepEqual(await adapter.get('habit-test'), maliciousText);
  assert.equal((await adapter.get('new-habit')).text, '');
  await adapter.remove('habit-test');
  assert.equal(await adapter.get('habit-test'), null);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS total FROM sqlite_master WHERE name = 'changes'",
      )
      .get().total,
    0,
  );
  db.prepare('UPDATE description_drafts SET draft_json = ?').run('broken');
  await assert.rejects(adapter.get('new-habit'));
  assert.equal(
    db.prepare('SELECT draft_json FROM description_drafts').get().draft_json,
    'broken',
  );
});
test('writes and discard are serialized, including after a failed write', async () => {
  const memory = memoryDrafts();
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  let first = true;
  const adapter = serializedDrafts({
    ...memory,
    async put(key, value) {
      if (first) {
        first = false;
        await waiting;
        throw new Error('Unavailable');
      }
      return memory.put(key, value);
    },
  });
  const failed = adapter.put('h', draft);
  const accepted = adapter.put('h', { ...draft, text: 'Latest draft' });
  const discarded = adapter.remove('h');
  release();
  await assert.rejects(failed);
  await accepted;
  await discarded;
  assert.equal(await adapter.get('h'), null);
});
test('sample drafts are memory-only and isolated from real draft adapters', async () => {
  const sample = memoryDrafts(),
    real = memoryDrafts();
  await sample.put('h', draft);
  assert.equal(await real.get('h'), null);
  await sample.remove('h');
  assert.equal(await sample.get('h'), null);
});

test('v2 drafts and clean position bookmarks survive SQLite reopen without rewriting legacy drafts', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'onpurpose-positions-'));
  const file = join(directory, 'drafts.db');
  let db = new DatabaseSync(file);
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  db.exec(
    'CREATE TABLE description_drafts (draft_key TEXT PRIMARY KEY, draft_json TEXT NOT NULL)',
  );
  let adapter = serializedDrafts(sqliteDrafts(port(db)));
  const position = { anchor: 20, head: 10, scrollTop: 456.5 };
  const unfinished = { ...draft, version: 2, position };
  await adapter.put('legacy', draft);
  const legacyJson = db
    .prepare('SELECT draft_json FROM description_drafts WHERE draft_key = ?')
    .get('legacy').draft_json;
  await adapter.put('habit', unfinished);
  await rememberDescriptionPosition(adapter, 'saved', 'Applied text', position);
  db.close();
  db = new DatabaseSync(file);
  adapter = serializedDrafts(sqliteDrafts(port(db)));
  assert.deepEqual(await adapter.get('habit'), unfinished);
  assert.deepEqual(await adapter.get(descriptionPositionKey('saved')), {
    version: 2,
    base: 'Applied text',
    text: 'Applied text',
    position,
  });
  assert.deepEqual(await adapter.get('legacy'), draft);
  assert.equal(
    db
      .prepare('SELECT draft_json FROM description_drafts WHERE draft_key = ?')
      .get('legacy').draft_json,
    legacyJson,
  );
});

test('v2 position validation rejects corrupt offsets, extra fields and unsupported versions', () => {
  const position = { anchor: 0, head: 10, scrollTop: 0.5 };
  validateDraft({ ...draft, version: 2, position });
  validateDraft({ ...draft, version: 2 });
  for (const invalid of [
    { ...draft, position },
    { ...draft, version: 2, position: null },
    { ...draft, version: 2, position: { ...position, anchor: -1 } },
    { ...draft, version: 2, position: { ...position, head: 1.5 } },
    { ...draft, version: 2, position: { ...position, anchor: 100001 } },
    { ...draft, version: 2, position: { ...position, scrollTop: Infinity } },
    { ...draft, version: 2, position: { ...position, scrollTop: -1 } },
    { ...draft, version: 2, position: { ...position, scrollTop: 10000001 } },
    { ...draft, version: 2, position: { ...position, extra: true } },
    { ...draft, version: 2, extra: true },
  ])
    assert.throws(() => validateDraft(invalid));
});

test('outer-form application transfers the matching position to the actual habit and removes only the unfinished draft', async () => {
  const memory = memoryDrafts();
  const position = { anchor: 2, head: 6, scrollTop: 250 };
  await memory.put('new-habit', {
    version: 2,
    base: '',
    text: 'New note',
    position,
  });
  await completeDescriptionDraft(
    memory,
    'new-habit',
    'New note',
    'habit-created',
  );
  assert.equal(await memory.get('new-habit'), null);
  assert.deepEqual(await memory.get(descriptionPositionKey('habit-created')), {
    version: 2,
    base: 'New note',
    text: 'New note',
    position,
  });
  await memory.put('habit-created', {
    version: 2,
    base: 'New note',
    text: 'Discarded edit',
    position,
  });
  await memory.remove('habit-created');
  assert.equal(
    (await memory.get(descriptionPositionKey('habit-created'))).text,
    'New note',
  );
  await memory.put('habit-created', {
    version: 2,
    base: 'New note',
    text: 'Stale text',
    position,
  });
  await completeDescriptionDraft(
    memory,
    'habit-created',
    'Different applied text',
  );
  assert.equal(
    (await memory.get(descriptionPositionKey('habit-created'))).text,
    'New note',
  );
});

test('position recovery uses matching text, ignores stale clean buffers, and retains unfinished/conflicting form drafts', () => {
  const position = { anchor: 2, head: 4, scrollTop: 100 };
  const clean = { version: 2, base: 'Saved', text: 'Saved', position };
  assert.deepEqual(descriptionResume(clean, null, 'Saved', 'Saved'), {
    position,
    draft: null,
  });
  assert.deepEqual(descriptionResume(clean, null, 'Restored', 'Restored'), {
    position: undefined,
    draft: null,
  });
  const unfinished = { ...clean, text: 'Unfinished text' };
  assert.deepEqual(descriptionResume(unfinished, clean, 'Saved', 'Saved'), {
    position,
    draft: unfinished,
  });
  assert.deepEqual(
    descriptionResume(unfinished, clean, 'Restored', 'Restored'),
    { position: undefined, draft: unfinished },
  );
  assert.deepEqual(
    descriptionResume(unfinished, null, 'Unfinished text', 'Saved'),
    { position, draft: null },
  );
  // Returning an outer-form draft to its original applied text is still recoverable
  // while the parent form holds a different description.
  assert.equal(
    descriptionResume(clean, null, 'Outer form edit', 'Saved').draft,
    clean,
  );
  const legacy = { version: 1, base: 'Saved', text: 'Saved' };
  assert.deepEqual(descriptionResume(legacy, clean, 'Saved', 'Saved'), {
    position,
    draft: null,
  });
});

test('completion keeps its read, bookmark write and discard together before a reopened editor can save a new draft', async () => {
  const memory = memoryDrafts();
  const position = { anchor: 1, head: 3, scrollTop: 100 };
  await memory.put('habit', {
    version: 2,
    base: 'Original',
    text: 'Applied',
    position,
  });
  let release, started;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const writing = new Promise((resolve) => {
    started = resolve;
  });
  const adapter = serializedDrafts({
    ...memory,
    async put(key, value) {
      if (key === descriptionPositionKey('habit')) {
        started();
        await blocked;
      }
      return memory.put(key, value);
    },
  });
  const complete = completeDescriptionDraft(adapter, 'habit', 'Applied');
  await writing;
  const fresh = {
    version: 2,
    base: 'Applied',
    text: 'Fresh unsaved edit',
    position,
  };
  const reopenedEdit = adapter.put('habit', fresh);
  release();
  await complete;
  await reopenedEdit;
  assert.deepEqual(await adapter.get('habit'), fresh);
  assert.equal(
    (await adapter.get(descriptionPositionKey('habit'))).text,
    'Applied',
  );
});
