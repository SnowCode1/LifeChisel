import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  MAX_DESCRIPTION_LENGTH,
  normalizeDescription,
  validDescription,
  descriptionLink,
  parseDescription,
  descriptionSummary,
  descriptionPreview,
} from '../packages/core/src/description.ts';
import { demoHabits } from '../packages/core/src/habits.ts';
import {
  presetDescriptions,
  genericPlaceholderDescription,
} from '../packages/core/src/presetDescriptions.ts';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { browserRepository } from '../packages/core/src/storage/browserRepository.ts';
import {
  replayEvents,
  applyEvent,
} from '../packages/core/src/storage/model.ts';
import {
  encodeArchive,
  decodeArchive,
} from '../packages/core/src/storage/archive.ts';
import { applyPlaceholderDescriptions } from '../packages/core/src/storage/presetDescriptions.ts';
import {
  historyKind,
  historyPresentation,
} from '../packages/core/src/history.ts';
import {
  addNote,
  habitNotes,
  moveNote,
  noteVersions,
  removeNote,
  restoreNote,
  updateNote,
} from '../packages/core/src/notes.ts';

let counter = 0;
const metadata = (sequence) => ({
  version: 7,
  id: `note-${++counter}`,
  sequence,
  recordedAt: '2026-10-05T02:00:00.000Z',
  timeZone: 'Australia/Melbourne',
  utcOffsetMinutes: 660,
});
const digest = async (text) => createHash('sha256').update(text).digest('hex');
async function fixture(habits = demoHabits, version = 6) {
  let raw = null;
  const repository = browserRepository(
    {
      getItem: () => raw,
      setItem: (_, value) => {
        raw = value;
      },
    },
    () => ({ ...metadata(1), version, type: 'initialize', habits }),
  );
  const store = new ChangeStore(repository, metadata);
  await store.load();
  return { store, repository };
}

test('plain text and Markdown keep whitespace meaning while blank notes become absent', () => {
  assert.equal(normalizeDescription(' \n\t'), undefined);
  assert.equal(
    normalizeDescription('  first\r\n\r    code\r'),
    '  first\n\n    code\n',
  );
  assert.ok(validDescription('x'.repeat(MAX_DESCRIPTION_LENGTH)));
  for (const invalid of [
    '',
    '  ',
    null,
    1,
    {},
    'x'.repeat(MAX_DESCRIPTION_LENGTH + 1),
  ])
    assert.equal(validDescription(invalid), false);
  assert.equal(
    descriptionSummary(
      '# Purpose\n\n**Start** with [my notes](https://example.com).\n\n- One\n- Two',
    ),
    'Purpose Start with my notes. One Two',
  );
});
test('rendering supports Markdown and explicit app links without executing HTML or loading images', () => {
  const source =
    '# Motivation\n\n**Bold** and _italic_, `code`.\n\n> A reminder\n\n1. Begin\n2. Continue\n\n[Notes](obsidian://open?vault=Personal) and https://example.com\n\n![Image description](https://example.com/image.png)\n\n<script>alert(1)</script>';
  const tokens = parseDescription(source);
  for (const type of ['heading_open', 'blockquote_open', 'ordered_list_open'])
    assert.ok(tokens.some((token) => token.type === type));
  const inline = tokens.flatMap((token) => token.children ?? []);
  for (const type of ['strong_open', 'em_open', 'code_inline', 'image'])
    assert.ok(inline.some((token) => token.type === type));
  assert.ok(
    inline.some(
      (token) =>
        token.type === 'link_open' &&
        token.attrGet('href').startsWith('obsidian:'),
    ),
  );
  assert.ok(
    inline.some(
      (token) =>
        token.type === 'link_open' &&
        token.attrGet('href') === 'https://example.com',
    ),
  );
  assert.equal(
    tokens.some((token) => token.type === 'html_block'),
    false,
  );
  assert.equal(
    inline.some((token) => token.type === 'html_inline'),
    false,
  );
  assert.ok(descriptionSummary(source).includes('Image description'));
  for (const link of [
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///secret',
    'intent://open',
    '/relative',
    'https:/bad',
    'http://',
    'https://exa mple.com',
    'foo:\u0000bar',
  ])
    assert.equal(descriptionLink(link), null);
  assert.equal(
    descriptionLink(' mailto:hello@example.com '),
    'mailto:hello@example.com',
  );
  assert.equal(
    parseDescription('[unsafe](javascript:alert(1))')
      .flatMap((token) => token.children ?? [])
      .some((token) => token.type === 'link_open'),
    false,
  );
});
test('stats previews retain complete Markdown blocks and expose long notes for expansion', () => {
  const text =
    '# Purpose\n\nA short purpose.\n\n[Notes](https://example.com)\n\n- first\n- second\n\nA fifth block.';
  const preview = descriptionPreview(text, false);
  assert.equal(preview.truncated, true);
  assert.equal(preview.tokens.at(-1).type, 'bullet_list_close');
  assert.equal(
    descriptionPreview(text, true).tokens.length,
    parseDescription(text).length,
  );
  assert.equal(descriptionPreview('Short', false).truncated, false);
  assert.equal(
    descriptionPreview('One\n\nTwo\n\nThree\n\nFour', false).truncated,
    false,
  );
  // A single block's cutoff is based on actual rendered height in the card.
  assert.equal(descriptionPreview('x'.repeat(500), false).truncated, false);
});
// A store over a log written directly at older versions (here v6/v7), so
// legacy description actions exist exactly as older apps saved them. New
// actions from the store are v23.
function legacyStore(habits, changes) {
  const events = [{ ...metadata(1), version: 6, type: 'initialize', habits }];
  for (const change of changes) {
    const meta = metadata(events.length + 1);
    events.push(
      change.kind === 'haptics'
        ? { ...meta, type: 'preference', change }
        : { ...meta, type: 'change', groupId: meta.id, change },
    );
  }
  let log = replayEvents(events);
  const repository = {
    async load() {
      return { ...replayEvents(log.events), hasRecovery: false };
    },
    async append(event) {
      log = { events: [...log.events, event], replay: null };
    },
    async replace() {},
    async recoveryEvents() {
      return [];
    },
  };
  const store = new ChangeStore(repository, metadata);
  return { store, repository, events: () => log.events, ready: store.load() };
}
// A v7 definition edit of `habit`, chained from its previous definition.
function legacyEdits(habit, ...descriptions) {
  const changes = [];
  let before = habit;
  for (const description of descriptions) {
    const { description: _description, ...rest } = before;
    const after =
      typeof description === 'object'
        ? description
        : description === undefined
          ? rest
          : { ...rest, description };
    changes.push({ kind: 'habit', habitId: habit.id, index: 0, before, after });
    before = after;
  }
  return changes;
}
// One change event whose group is itself, as every first edit is.
function changeEvent(sequence, change, version) {
  const meta = metadata(sequence);
  return {
    ...meta,
    ...(version ? { version } : {}),
    type: 'change',
    groupId: meta.id,
    change,
  };
}
const notesOf = (store, index = 0) => {
  const state = store.getSnapshot().replay.state;
  return habitNotes(state, state.habits[index]);
};

test('v7 rejects malformed descriptions and older definitions reject the new field', () => {
  const habit = demoHabits[0];
  for (const description of [
    '',
    '  ',
    null,
    1,
    {},
    'x'.repeat(MAX_DESCRIPTION_LENGTH + 1),
  ])
    assert.throws(() =>
      replayEvents([
        { ...metadata(1), version: 6, type: 'initialize', habits: [habit] },
        changeEvent(2, {
          kind: 'habit',
          habitId: habit.id,
          index: 0,
          before: habit,
          after: { ...habit, description },
        }),
      ]),
    );
  for (const version of [1, 2, 3, 4, 5, 6])
    assert.throws(() =>
      replayEvents([
        {
          ...metadata(1),
          version,
          type: 'initialize',
          habits: [
            { id: 'h', name: 'Habit', color: '#82E6BC', description: 'Note' },
          ],
        },
      ]),
    );
  const long = replayEvents([
    { ...metadata(1), version: 6, type: 'initialize', habits: [habit] },
    changeEvent(2, legacyEdits(habit, 'x'.repeat(MAX_DESCRIPTION_LENGTH))[0]),
  ]);
  assert.throws(
    () =>
      applyEvent(long.replay, {
        ...metadata(3),
        version: 6,
        type: 'preference',
        change: { kind: 'haptics', before: true, after: false },
      }),
    /version-7/,
  );
  // From v23 a new definition edit cannot rewrite the description.
  assert.throws(
    () =>
      applyEvent(
        long.replay,
        changeEvent(
          3,
          legacyEdits(long.replay.state.habits[0], 'Rewritten')[0],
          23,
        ),
      ),
    /note changes from version 23/,
  );
});
test('description edits and clears have concise History labels', async () => {
  const habit = demoHabits[0];
  const { store, ready } = legacyStore(
    [habit],
    legacyEdits(habit, 'Purpose', undefined),
  );
  await ready;
  const { undo, state } = store.getSnapshot().replay;
  assert.deepEqual(
    undo.map((action) => historyPresentation(action, state).summary),
    ['Description edited', 'Description cleared'],
  );
  assert.ok(undo.every((action) => historyKind(action) === 'notes'));
});
test('every existing preset and custom/archived habit gets an undoable placeholder note without losing entries', async () => {
  const custom = {
    id: 'custom',
    name: 'My custom habit',
    color: '#82E6BC',
    archived: true,
  };
  const { store, repository } = await fixture([...demoHabits, custom]);
  store.change({
    kind: 'entry',
    habitId: 'read',
    date: '2026-10-04',
    before: null,
    after: 25,
  });
  assert.equal(applyPlaceholderDescriptions(store), 13);
  await store.flush();
  const state = store.getSnapshot().replay.state;
  // Definitions stay as they were; each placeholder is an Info note.
  assert.deepEqual(state.habits, [...demoHabits, custom]);
  for (const habit of demoHabits)
    assert.deepEqual(habitNotes(state, habit), [
      { id: 'info', title: 'Info', text: presetDescriptions[habit.id] },
    ]);
  assert.deepEqual(habitNotes(state, state.habits.at(-1)), [
    { id: 'info', title: 'Info', text: genericPlaceholderDescription },
  ]);
  assert.equal(state.habits.at(-1).archived, true);
  assert.equal(state.values['read:2026-10-04'], 25);
  assert.equal(store.getSnapshot().replay.undo.length, 14);
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  assert.equal(applyPlaceholderDescriptions(reopened), 0);
  assert.ok(reopened.undo());
  await reopened.flush();
  assert.deepEqual(notesOf(reopened, 12), []);
  assert.equal(applyPlaceholderDescriptions(reopened), 0);
});
test('placeholder population respects notes, removals, Undo, and new intentionally blank habits', async () => {
  const { store } = await fixture();
  const state = () => store.getSnapshot().replay.state;
  store.change(addNote(state(), demoHabits[0].id, 'Why', 'My real purpose'));
  store.undo(); // Raw log still remembers an explicit note decision.
  assert.equal(applyPlaceholderDescriptions(store), 11);
  assert.deepEqual(notesOf(store, 0), []);
  store.change(removeNote(state(), demoHabits[1].id, 'info'));
  assert.equal(applyPlaceholderDescriptions(store), 0);
  assert.deepEqual(notesOf(store, 1), []);
  const fresh = await fixture(
    [{ id: 'new', name: 'New habit', color: '#82E6BC' }],
    7,
  );
  assert.equal(applyPlaceholderDescriptions(fresh.store), 0);
  // A v7 description already reads as the habit's Info note.
  const habit = demoHabits[0];
  const legacy = legacyStore([habit], legacyEdits(habit, 'Mine'));
  await legacy.ready;
  assert.equal(applyPlaceholderDescriptions(legacy.store), 0);
});
test('legacy v1–v6 backups accept v7 descriptions and retain every original raw event', async () => {
  for (const version of [1, 2, 3, 4, 5, 6]) {
    const original = JSON.parse(
      readFileSync(
        new URL(`../docs/examples/storage-v${version}.json`, import.meta.url),
        'utf8',
      ),
    );
    const { replay, events } = await decodeArchive(
      JSON.stringify(original),
      digest,
    );
    const before = replay.state.habits[0];
    const next = {
      ...metadata(events.length + 1),
      type: 'change',
      groupId: `upgrade-${version}`,
      change: {
        kind: 'habit',
        habitId: before.id,
        index: 0,
        before,
        after: {
          ...before,
          description: '**My motivation**\n\n[Notes](https://example.com)',
        },
      },
    };
    next.id = next.groupId;
    const result = await decodeArchive(
      await encodeArchive(
        [...events, next],
        '2026-10-05T03:00:00.000Z',
        digest,
      ),
      digest,
    );
    assert.deepEqual(result.events.slice(0, -1), original.events);
    assert.equal(
      result.replay.state.habits[0].description,
      next.change.after.description,
    );
    assert.deepEqual(result.replay.state.values, replay.state.values);
  }
});
test('documented v7 backup restores descriptions while keeping its legacy prefix', async () => {
  const prior = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v6.json', import.meta.url),
      'utf8',
    ),
  );
  const { events, replay } = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v7.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.deepEqual(events.slice(0, prior.events.length), prior.events);
  assert.ok(replay.state.habits[0].description.includes('[My notes]'));
  assert.equal(replay.state.values['walk:2026-10-04'], 1);
});

test('note versions filter only changed text, keep sequence order and preserve earlier Before versions', async () => {
  const initial = demoHabits[0];
  const other = demoHabits[1];
  const archived = {
    ...initial,
    name: 'Renamed',
    archived: true,
    description: 'First',
  };
  const { store, ready } = legacyStore(
    [initial, other],
    [
      ...legacyEdits(
        initial,
        'First',
        'Second',
        'First',
        { ...initial, name: 'Renamed', description: 'First' },
        archived,
      ),
      {
        kind: 'habit',
        habitId: other.id,
        index: 1,
        before: other,
        after: { ...other, description: 'Other habit' },
      },
      {
        kind: 'entry',
        habitId: initial.id,
        date: '2026-10-04',
        before: null,
        after: 1,
      },
      { kind: 'haptics', before: true, after: false },
    ],
  );
  await ready;
  const actions = store.getSnapshot().replay.undo;
  // Wall-clock rollback never changes the authoritative action order.
  const withClockRollback = actions.map((action, i) => ({
    ...action,
    recordedAt: i % 2 ? '2026-10-01T01:00:00.000Z' : '2026-10-05T01:00:00.000Z',
  }));
  const versions = noteVersions(withClockRollback, initial.id, 'description');
  assert.deepEqual(
    versions.map((version) => version.after),
    ['First', 'Second', 'First'],
  );
  assert.equal(versions[0].action.id, actions[2].id);
  assert.deepEqual(noteVersions(actions, initial.id, 'other'), []);
  // The first v23 edit moves the description into a note; renames and moves
  // keep the same words, so they are not versions.
  const state = () => store.getSnapshot().replay.state;
  assert.ok(
    store.change(
      updateNote(state(), initial.id, 'description', { text: 'Third' }),
    ),
  );
  assert.equal(state().habits[0].description, undefined);
  assert.ok(
    store.change(
      updateNote(state(), initial.id, 'description', { title: 'Purpose' }),
    ),
  );
  assert.ok(store.change(addNote(state(), initial.id, 'Rules', 'One rule')));
  assert.ok(store.change(moveNote(state(), initial.id, 'description', 1)));
  assert.deepEqual(
    noteVersions(
      store.getSnapshot().replay.undo,
      initial.id,
      'description',
    ).map((version) => [version.before, version.after, version.title]),
    [
      ['First', 'Third', 'Info'],
      ['Second', 'First', 'Info'],
      ['First', 'Second', 'Info'],
      ['', 'First', 'Info'],
    ],
  );
});

test('version restores preserve current fields and entries through Undo, Redo, reopening and backup replay', async () => {
  const { store, repository } = await fixture();
  const state = () => store.getSnapshot().replay.state;
  const initial = state().habits[0];
  store.change(
    addNote(state(), initial.id, 'Why', '**First motivation**', 'why'),
  );
  store.change(
    updateNote(state(), initial.id, 'why', { text: 'Second motivation' }),
  );
  store.change({
    kind: 'habit',
    habitId: initial.id,
    index: 0,
    before: initial,
    after: { ...initial, name: 'My habit', color: '#ABCDEF', icon: 'emoji:🌱' },
  });
  store.change({
    kind: 'entry',
    habitId: initial.id,
    date: '2026-10-04',
    before: null,
    after: 1,
  });
  // The definition edit carried no note text.
  assert.equal(
    store.getSnapshot().events.at(-2).change.after.description,
    undefined,
  );
  const before = state();
  const old = noteVersions(
    store.getSnapshot().replay.undo,
    initial.id,
    'why',
  )[1];
  assert.equal(old.after, '**First motivation**');
  // Restore only the text onto the current note, never the old habit.
  assert.ok(
    store.change(
      restoreNote(state(), initial.id, {
        id: 'why',
        title: old.title,
        text: old.after,
      }),
    ),
  );
  const restored = state();
  assert.deepEqual(restored.habits, before.habits);
  assert.deepEqual(restored.values, before.values);
  assert.deepEqual(restored.notes, {
    [initial.id]: [{ id: 'why', title: 'Why', text: '**First motivation**' }],
  });
  const rows = noteVersions(store.getSnapshot().replay.undo, initial.id, 'why');
  assert.deepEqual(
    rows.map((version) => version.after),
    ['**First motivation**', 'Second motivation', '**First motivation**'],
  );
  assert.equal(store.undo(), true);
  assert.deepEqual(state(), before);
  assert.equal(store.redo(), true);
  await store.flush();
  const reopened = new ChangeStore(repository, metadata);
  await reopened.load();
  assert.deepEqual(
    noteVersions(reopened.getSnapshot().replay.undo, initial.id, 'why'),
    noteVersions(store.getSnapshot().replay.undo, initial.id, 'why'),
  );
  const events = store.getSnapshot().events;
  const backup = await decodeArchive(
    await encodeArchive(events, '2026-10-05T03:00:00.000Z', digest),
    digest,
  );
  assert.deepEqual(backup.events, events);
  assert.deepEqual(backup.replay.state, restored);
  // A removed note comes back at the end under its old title.
  store.change(removeNote(state(), initial.id, 'why'));
  store.change(addNote(state(), initial.id, 'Why', 'A new why', 'why-2'));
  assert.ok(
    store.change(
      restoreNote(state(), initial.id, {
        id: 'why',
        title: 'Why',
        text: 'Second motivation',
      }),
    ),
  );
  assert.deepEqual(
    notesOf(store).map((note) => note.title),
    ['Why', 'Why 2'],
  );
});

test('creation notes are available in versions while deleted, empty and unrelated definitions are omitted', async () => {
  const habit = {
    id: 'new',
    name: 'New habit',
    color: '#ABCDEF',
    description: 'My purpose',
  };
  const seed = { id: 'seed', name: 'Seed', color: '#82E6BC' };
  const { store, ready } = legacyStore(
    [seed],
    [
      {
        kind: 'habit',
        habitId: habit.id,
        index: 1,
        before: null,
        after: habit,
      },
    ],
  );
  await ready;
  const creation = store.getSnapshot().replay.undo[0];
  assert.deepEqual(
    noteVersions([creation], habit.id, 'description').map((v) => v.after),
    ['My purpose'],
  );
  assert.deepEqual(noteVersions([creation], 'other', 'description'), []);
  const removal = {
    ...creation,
    change: { ...creation.change, before: habit, after: null },
  };
  assert.deepEqual(noteVersions([removal], habit.id, 'description'), []);
  const empty = {
    ...creation,
    change: {
      ...creation.change,
      after: { id: 'new', name: 'New habit', color: '#ABCDEF' },
    },
  };
  assert.deepEqual(noteVersions([empty], habit.id, 'description'), []);
});
