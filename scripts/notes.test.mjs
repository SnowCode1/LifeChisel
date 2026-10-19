import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import {
  applyEvent,
  inverse,
  replayEvents,
  validateChange,
} from '../packages/core/src/storage/model.ts';
import {
  decodeArchive,
  encodeArchive,
} from '../packages/core/src/storage/archive.ts';
import {
  eventMeta,
  initialEvent,
} from '../packages/core/src/storage/newEvents.ts';
import {
  historyKind,
  historyPresentation,
} from '../packages/core/src/history.ts';
import {
  addNote,
  availablePresets,
  habitNotes,
  LEGACY_NOTE_ID,
  MAX_NOTE_TITLE,
  MAX_NOTES,
  moveNote,
  moveNoteTo,
  noteDraftKey,
  noteHint,
  notePresets,
  noteTitleProblem,
  noteVersions,
  removeNote,
  updateNote,
} from '../packages/core/src/notes.ts';
import { createSampleStore } from '../packages/core/src/dev/sampleData.ts';
import {
  createPresetEvents,
  samplePresets,
} from '../packages/core/src/dev/samplePresets.ts';

const digest = async (text) => createHash('sha256').update(text).digest('hex');
let counter = 0;
const metadata = (sequence) => ({
  version: 7,
  id: `notes-${++counter}`,
  sequence,
  recordedAt: '2026-10-17T02:00:00.000Z',
  timeZone: 'UTC',
  utcOffsetMinutes: 0,
});
const walk = {
  id: 'walk',
  name: 'Walk',
  color: '#82E6BC',
  description: 'Old **walk** note',
};
const read = { id: 'read', name: 'Read', color: '#BDA5FF', unit: 'minutes' };

// A store whose log starts at v7, so `walk` has a definition description.
async function fixture(habits = [walk, read], extra = []) {
  let events = [
    { ...metadata(1), type: 'initialize', habits },
    ...extra.map((change, index) => {
      const meta = metadata(index + 2);
      return { ...meta, type: 'change', groupId: meta.id, change };
    }),
  ];
  replayEvents(events);
  const repository = {
    async load() {
      return { ...replayEvents(events), hasRecovery: false };
    },
    async append(event) {
      events = [...events, event];
    },
    async replace() {},
    async recoveryEvents() {
      return [];
    },
  };
  const store = new ChangeStore(repository, metadata);
  await store.load();
  const state = () => store.getSnapshot().replay.state;
  const notes = (id = habits[0].id) =>
    habitNotes(
      state(),
      state().habits.find((habit) => habit.id === id),
    );
  return { store, state, notes, events: () => events, repository };
}

test('a v7 description reads as an Info note first, and the writer is v23', async () => {
  assert.equal(eventMeta(1, 'x').version, 25);
  const { state, notes } = await fixture();
  assert.deepEqual(notes(), [
    { id: LEGACY_NOTE_ID, title: 'Info', text: 'Old **walk** note' },
  ]);
  assert.deepEqual(notes('read'), []);
  // Repeated reads return the same list until the habit or its notes change.
  assert.equal(notes(), notes());
  assert.equal(state().notes, undefined);
  assert.equal(noteDraftKey('walk', LEGACY_NOTE_ID), 'habit-walk');
  assert.equal(noteDraftKey('walk', 'why'), 'habit-walk-note-why');
});

test('editing, renaming, moving or removing the description moves it out exactly once, and Undo puts it back', async () => {
  for (const make of [
    (state) => updateNote(state, 'walk', LEGACY_NOTE_ID, { text: 'New text' }),
    (state) => updateNote(state, 'walk', LEGACY_NOTE_ID, { title: 'Purpose' }),
    (state) => removeNote(state, 'walk', LEGACY_NOTE_ID),
  ]) {
    const { store, state, notes } = await fixture();
    const before = state();
    const change = make(state());
    assert.equal(change.before.legacy, true);
    assert.equal(change.after?.legacy, undefined);
    assert.ok(store.change(change));
    // The definition no longer carries text; any note is saved on its own.
    assert.equal(state().habits[0].description, undefined);
    assert.equal(notes().length, change.after ? 1 : 0);
    assert.ok(store.undo());
    assert.deepEqual(state(), before);
    assert.ok(store.redo());
    assert.equal(state().habits[0].description, undefined);
  }
  // Moving the second note up moves the description down instead.
  const { store, state, notes } = await fixture();
  store.change(addNote(state(), 'walk', 'Why', 'Because', 'why'));
  assert.deepEqual(
    notes().map((note) => note.id),
    [LEGACY_NOTE_ID, 'why'],
  );
  const up = moveNote(state(), 'walk', 'why', -1);
  assert.equal(up.before.note.id, LEGACY_NOTE_ID);
  assert.ok(store.change(up));
  assert.deepEqual(
    notes().map((note) => note.id),
    ['why', LEGACY_NOTE_ID],
  );
  assert.equal(state().habits[0].description, undefined);
  assert.equal(moveNote(state(), 'walk', 'why', -1), null);
  assert.ok(store.undo());
  assert.equal(state().habits[0].description, 'Old **walk** note');
});

test('Undo reaches an older description edit after the note change is undone', async () => {
  const edited = { ...walk, description: 'Second' };
  const { store, state, notes } = await fixture(
    [walk, read],
    [{ kind: 'habit', habitId: 'walk', index: 0, before: walk, after: edited }],
  );
  store.change(updateNote(state(), 'walk', LEGACY_NOTE_ID, { text: 'Third' }));
  assert.equal(notes()[0].text, 'Third');
  assert.ok(store.undo());
  assert.ok(store.undo());
  assert.equal(state().habits[0].description, 'Old **walk** note');
  assert.ok(store.redo());
  assert.ok(store.redo());
  assert.deepEqual(notes(), [
    { id: LEGACY_NOTE_ID, title: 'Info', text: 'Third' },
  ]);
  assert.equal(
    noteVersions(store.getSnapshot().replay.undo, 'walk', LEGACY_NOTE_ID)
      .length,
    2,
  );
});

test('habit edits never copy notes, and notes never coalesce with each other', async () => {
  const { store, state, events } = await fixture([read]);
  store.change(addNote(state(), 'read', 'Links', '- one', 'links'));
  store.change(updateNote(state(), 'read', 'links', { text: '- one\n- two' }));
  store.change(updateNote(state(), 'read', 'links', { text: '- two' }));
  const habit = state().habits[0];
  store.change({
    kind: 'habit',
    habitId: 'read',
    index: 0,
    before: habit,
    after: { ...habit, name: 'Read more' },
  });
  const definitionEdit = events().at(-1).change;
  assert.equal(JSON.stringify(definitionEdit).includes('two'), false);
  const undo = store.getSnapshot().replay.undo;
  assert.equal(undo.length, 4);
  assert.deepEqual(
    undo
      .slice(0, 3)
      .map((action) => historyPresentation(action, state()).summary),
    ['Links note added', 'Links note edited', 'Links note edited'],
  );
  assert.ok(
    undo.slice(0, 3).every((action) => historyKind(action) === 'notes'),
  );
  assert.equal(historyKind(undo[3]), 'edits');
});

test('History names renames, moves, clears and removals', async () => {
  const { store, state } = await fixture([read]);
  const summaries = [];
  const apply = (change) => {
    assert.ok(store.change(change));
    summaries.push(
      historyPresentation(store.getSnapshot().replay.undo.at(-1), state())
        .summary,
    );
  };
  apply(addNote(state(), 'read', 'Why', 'Because', 'why'));
  apply(addNote(state(), 'read', 'Rules', '', 'rules'));
  apply(updateNote(state(), 'read', 'why', { title: 'Reasons' }));
  apply(updateNote(state(), 'read', 'why', { text: '  ' }));
  apply(moveNote(state(), 'read', 'rules', -1));
  apply(updateNote(state(), 'read', 'rules', { title: 'How', text: 'Steps' }));
  apply(removeNote(state(), 'read', 'why'));
  assert.deepEqual(summaries, [
    'Why note added',
    'Rules note added',
    'Why note renamed Reasons',
    'Reasons note cleared',
    'Rules note moved',
    'How note renamed and edited',
    'Reasons note removed',
  ]);
});

test('builders keep titles unique, respect the limit and skip no-op edits', async () => {
  const { store, state, notes } = await fixture([read]);
  assert.equal(addNote(state(), 'read', '  '), null);
  assert.equal(addNote(state(), 'read', 'x'.repeat(MAX_NOTE_TITLE + 1)), null);
  assert.equal(addNote(state(), 'missing', 'Why'), null);
  for (const preset of notePresets) {
    assert.ok(store.change(addNote(state(), 'read', preset.title)));
  }
  assert.equal(notes().length, MAX_NOTES);
  assert.equal(addNote(state(), 'read', 'One more'), null);
  assert.deepEqual(availablePresets(notes()), []);
  assert.equal(addNote(state(), 'read', 'why'), null);
  assert.equal(
    noteTitleProblem(notes(), 'RULES'),
    'This habit already has a note with that name.',
  );
  const rules = notes().find((note) => note.title === 'Rules');
  assert.equal(noteTitleProblem(notes(), 'rules', rules.id), null);
  assert.equal(updateNote(state(), 'read', rules.id, { title: 'Why' }), null);
  assert.equal(updateNote(state(), 'read', rules.id, { text: '' }), null);
  assert.equal(moveNote(state(), 'read', notes()[0].id, -1), null);
  assert.equal(moveNote(state(), 'read', notes().at(-1).id, 1), null);
  assert.equal(noteHint('rules'), notePresets[2].hint);
  assert.match(noteHint('Recipes'), /anything worth keeping/);
  // Titles are trimmed and single-spaced; text keeps meaningful whitespace.
  const fresh = await fixture([read]);
  const change = addNote(fresh.state(), 'read', '  My   plan ', '  a\r\nb  ');
  assert.equal(change.after.note.title, 'My plan');
  assert.equal(change.after.note.text, '  a\nb  ');
});

test('note changes validate their exact shape and version', () => {
  const note = { id: 'why', title: 'Why', text: 'Because' };
  const valid = {
    kind: 'note',
    habitId: 'walk',
    before: null,
    after: { index: 0, note },
  };
  validateChange(valid, 23);
  assert.throws(() => validateChange(valid, 22), /Notes require version 23/);
  for (const bad of [
    { ...valid, extra: 1 },
    { ...valid, after: null },
    { ...valid, after: { index: MAX_NOTES, note } },
    { ...valid, after: { index: 0, note, extra: true } },
    { ...valid, after: { index: 0, note: { ...note, title: ' Why' } } },
    { ...valid, after: { index: 0, note: { ...note, title: '' } } },
    { ...valid, after: { index: 0, note: { ...note, id: 'bad id' } } },
    { ...valid, after: { index: 0, note: { ...note, text: 1 } } },
    { ...valid, after: { index: 0, note: { ...note, extra: 1 } } },
    // A description slot is always first, titled Info, with nonblank text.
    { ...valid, after: { index: 0, note, legacy: true } },
    {
      ...valid,
      after: {
        index: 1,
        note: { id: LEGACY_NOTE_ID, title: 'Info', text: 'x' },
        legacy: true,
      },
    },
    {
      ...valid,
      before: { index: 0, note },
      after: { index: 0, note: { ...note, id: 'other' } },
    },
  ])
    assert.throws(() => validateChange(bad, 23));
});

test('replay rejects stale notes, orphans and a description returning beside its note', async () => {
  const { store, state } = await fixture();
  const event = (change, type = 'change') => {
    const meta = {
      ...metadata(store.getSnapshot().events.length + 1),
      version: 25,
      device: 'test-device',
    };
    return type === 'change'
      ? { ...meta, type, groupId: meta.id, change }
      : { ...meta, type, targetId: 'x', change };
  };
  const replay = () => store.getSnapshot().replay;
  // New actions never write text into a definition, even as a note slot.
  const back = inverse(
    updateNote(state(), 'walk', LEGACY_NOTE_ID, { text: 'x' }),
  );
  assert.throws(
    () => applyEvent(replay(), event(back)),
    /note changes from version 23|precondition/,
  );
  store.change(addNote(state(), 'read', 'Why', 'Because', 'why'));
  const stale = updateNote(state(), 'read', 'why', { text: 'New' });
  store.change(updateNote(state(), 'read', 'why', { text: 'Other' }));
  assert.throws(() => applyEvent(replay(), event(stale)), /Note precondition/);
  // A habit with notes cannot be removed as a definition.
  const habit = state().habits[1];
  assert.throws(
    () =>
      applyEvent(
        replay(),
        event({
          kind: 'habit',
          habitId: 'read',
          index: 1,
          before: habit,
          after: null,
        }),
      ),
    /Cannot remove a habit/,
  );
  // Two notes cannot share an id.
  assert.throws(
    () =>
      applyEvent(
        replay(),
        event({
          kind: 'note',
          habitId: 'read',
          before: null,
          after: { index: 0, note: { id: 'why', title: 'Again', text: '' } },
        }),
      ),
    /identity is invalid/,
  );
  // A v23 definition edit cannot add or change a description.
  assert.throws(
    () =>
      applyEvent(
        replay(),
        event({
          kind: 'habit',
          habitId: 'read',
          index: 1,
          before: habit,
          after: { ...habit, description: 'Sneaky' },
        }),
      ),
    /note changes from version 23/,
  );
});

test('deleting an archived habit keeps its notes in the snapshot and Undo restores them', async () => {
  const { store, state, notes } = await fixture([read]);
  store.change(
    addNote(state(), 'read', 'Links', '- [List](https://example.com)', 'links'),
  );
  const habit = state().habits[0];
  store.change({
    kind: 'habit',
    habitId: 'read',
    index: 0,
    before: habit,
    after: { ...habit, archived: true },
  });
  assert.ok(store.deleteArchivedHabit('read'));
  const deletion = store.getSnapshot().events.at(-1).change;
  assert.deepEqual(deletion.before.notes, [
    { id: 'links', title: 'Links', text: '- [List](https://example.com)' },
  ]);
  assert.equal(state().notes, undefined);
  assert.ok(store.undo());
  assert.equal(notes()[0].id, 'links');
  // Older deletion snapshots never carry notes.
  assert.throws(() =>
    validateChange({ ...deletion, before: { ...deletion.before } }, 22),
  );
});

test('the v23 fixture extends v22 exactly and replays notes, moves, renames and deletion', async () => {
  const previous = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v22.json', import.meta.url),
      'utf8',
    ),
  );
  const next = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v23.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.deepEqual(
    next.events.slice(0, previous.events.length),
    previous.events,
  );
  const added = next.events.slice(previous.events.length);
  assert.ok(added.every((event) => event.version === 23));
  assert.ok(added.some((event) => event.change.kind === 'note'));
  assert.ok(added.some((event) => event.change.kind === 'deleteHabit'));
  const { state, hasV23 } = next.replay;
  assert.equal(hasV23, true);
  const walkHabit = state.habits.find((habit) => habit.id === 'walk');
  assert.equal(walkHabit.description, undefined);
  assert.deepEqual(
    habitNotes(state, walkHabit).map((note) => note.title),
    ['Why', 'Info', 'What counts'],
  );
  assert.deepEqual(
    state.notes.highlight.map((note) => note.id),
    ['links'],
  );
  // The committed file is formatted for reading; its checksum covers the
  // events themselves, so exporting the same log reproduces it.
  const file = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v23.json', import.meta.url),
      'utf8',
    ),
  );
  const again = JSON.parse(
    await encodeArchive(next.events, file.exportedAt, digest),
  );
  assert.equal(again.sha256, file.sha256);
  assert.equal(again.version, 25);
});

test('new stores, marketing presets and the sample store start with notes, not descriptions', async () => {
  const first = initialEvent(
    'first',
    'test-device',
    new Date('2026-10-17T02:00:00Z'),
  );
  assert.ok(first.habits.every((habit) => habit.description === undefined));
  assert.equal(first.notes.walk[0].title, 'Info');
  const { replay } = replayEvents([first]);
  assert.equal(habitNotes(replay.state, replay.state.habits[0]).length, 1);
  assert.throws(() =>
    replayEvents([
      { ...first, habits: [{ ...first.habits[0], description: 'Old style' }] },
    ]),
  );
  assert.throws(() =>
    replayEvents([{ ...first, notes: { missing: first.notes.walk } }]),
  );
  for (const preset of samplePresets) {
    const events = createPresetEvents(preset.id, '2026-10-17');
    const { state } = replayEvents(events).replay;
    assert.ok(state.habits.every((habit) => habit.description === undefined));
    for (const habit of preset.habits.filter((item) => item.description))
      assert.equal(state.notes[habit.id][0].text, habit.description);
  }
  const sample = await createSampleStore('2026-10-17');
  const state = sample.getSnapshot().replay.state;
  const walkHabit = state.habits.find((habit) => habit.id === 'walk');
  assert.deepEqual(
    habitNotes(state, walkHabit).map((note) => note.title),
    ['Info', 'Why', 'Rules'],
  );
  // The sample's first edit moves Info out of the definition like real data.
  assert.ok(
    sample.change(
      updateNote(state, 'walk', LEGACY_NOTE_ID, { text: 'Edited in sample' }),
    ),
  );
  await sample.flush();
});

test('dragging a note moves it in one change, or two past a v7 description', async () => {
  const { store, state, notes } = await fixture();
  for (const title of ['Why', 'Rules', 'Links'])
    store.change(addNote(state(), 'walk', title, '', title.toLowerCase()));
  const ids = () => notes().map((note) => note.id);
  assert.deepEqual(ids(), [LEGACY_NOTE_ID, 'why', 'rules', 'links']);
  assert.deepEqual(moveNoteTo(state(), 'walk', 'why', 1), []);
  assert.deepEqual(moveNoteTo(state(), 'walk', 'why', 9), []);
  // Down past others: one change, the description stays in the definition.
  const down = moveNoteTo(state(), 'walk', 'why', 3);
  assert.equal(down.length, 1);
  assert.ok(store.change(down[0]));
  assert.deepEqual(ids(), [LEGACY_NOTE_ID, 'rules', 'links', 'why']);
  assert.equal(state().habits[0].description, 'Old **walk** note');
  // To the top while the description is first: it leaves, then the move.
  const top = moveNoteTo(state(), 'walk', 'links', 0);
  assert.equal(top.length, 2);
  for (const change of top) assert.ok(store.change(change));
  assert.deepEqual(ids(), ['links', LEGACY_NOTE_ID, 'rules', 'why']);
  assert.equal(state().habits[0].description, undefined);
  assert.ok(store.undo());
  assert.ok(store.undo());
  assert.equal(state().habits[0].description, 'Old **walk** note');
  // The description itself can be dragged anywhere in one change.
  const info = moveNoteTo(state(), 'walk', LEGACY_NOTE_ID, 2);
  assert.equal(info.length, 1);
  assert.ok(store.change(info[0]));
  assert.deepEqual(ids(), ['rules', 'links', LEGACY_NOTE_ID, 'why']);
});
