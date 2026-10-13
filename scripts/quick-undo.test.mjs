import test from 'node:test';
import assert from 'node:assert/strict';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { replayEvents } from '../packages/core/src/storage/model.ts';
import {
  createQuickUndo,
  QUICK_UNDO_MS,
} from '../packages/core/src/quickUndo.ts';
let id = 0;
const meta = (sequence) => ({
  version: 17,
  id: `quick_${++id}`,
  sequence,
  recordedAt: '2026-10-07T04:00:00.000Z',
  timeZone: 'UTC',
  utcOffsetMinutes: 0,
});
async function fixture(t) {
  const events = [
    {
      ...meta(1),
      type: 'initialize',
      habits: [
        { id: 'walk', name: 'Walk', color: '#82E6BC' },
        { id: 'read', name: 'Read', color: '#BDA5FF', type: 'number' },
      ],
    },
  ];
  const store = new ChangeStore(
    {
      load: async () => ({ ...replayEvents(events), hasRecovery: false }),
      append: async (event) => {
        events.push(event);
      },
      replace: async () => {
        throw new Error('unused');
      },
      recoveryEvents: async () => [],
    },
    meta,
  );
  await store.load();
  const shortcut = createQuickUndo(store);
  t.after(() => shortcut.dispose());
  const apply = (change) => {
    assert.equal(store.change(change), true);
    shortcut.capture(change);
  };
  const entry = (id, date, before, after) => ({
    kind: 'entry',
    habitId: id,
    date,
    before,
    after,
  });
  const archive = () => {
    const before = store.getSnapshot().replay.state.habits[0];
    apply({
      kind: 'habit',
      habitId: before.id,
      index: 0,
      before,
      after: { ...before, archived: true },
    });
  };
  return { store, shortcut, apply, entry, archive };
}
test('temporary Undo works without filtering/goals for past/future entries, survives save acknowledgement and expires after four seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, shortcut, apply, entry } = await fixture(t);
  assert.equal(QUICK_UNDO_MS, 4000);
  apply(entry('read', '2026-10-08', null, 0));
  const receipt = shortcut.getSnapshot();
  assert.equal(receipt.action, 'entry');
  await store.flush();
  assert.equal(shortcut.getSnapshot(), receipt);
  t.mock.timers.tick(3999);
  assert.equal(shortcut.getSnapshot(), receipt);
  t.mock.timers.tick(1);
  assert.equal(shortcut.getSnapshot(), null);
  assert.equal(shortcut.undo(), false);
  apply(entry('read', '2024-01-01', null, 30));
  assert.equal(shortcut.undo(), true);
  assert.equal(
    store.getSnapshot().replay.state.values['read:2024-01-01'],
    undefined,
  );
  await store.flush();
});
test('archive Undo restores only archive state onto the current definition and leaves unrelated entries/order untouched', async (t) => {
  const { store, shortcut, apply, entry, archive } = await fixture(t);
  apply(entry('walk', '2026-10-07', null, 1));
  archive();
  const receipt = shortcut.getSnapshot();
  assert.equal(receipt.action, 'archive');
  store.change({
    kind: 'colour',
    habitId: 'walk',
    before: '#82E6BC',
    after: '#84C9FF',
  });
  store.change(entry('read', '2026-10-07', null, 20));
  store.change({
    kind: 'order',
    before: ['walk', 'read'],
    after: ['read', 'walk'],
  });
  assert.equal(shortcut.getSnapshot(), receipt);
  assert.equal(shortcut.undo(), true);
  const state = store.getSnapshot().replay.state;
  assert.deepEqual(
    state.habits.map((h) => h.id),
    ['read', 'walk'],
  );
  assert.equal(state.habits[1].archived, undefined);
  assert.equal(state.habits[1].color, '#84C9FF');
  assert.equal(state.values['walk:2026-10-07'], 1);
  assert.equal(state.values['read:2026-10-07'], 20);
  assert.equal(store.getSnapshot().events.at(-1).change.kind, 'habit');
  await store.flush();
});
test('entry retouches and archive restore/delete invalidate stale shortcuts; a new edit replaces the timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, shortcut, apply, entry, archive } = await fixture(t);
  apply(entry('walk', '2026-10-07', null, 1));
  store.change(entry('walk', '2026-10-07', 1, null));
  store.change(entry('walk', '2026-10-07', null, 1));
  assert.equal(shortcut.getSnapshot(), null);
  archive();
  store.undo();
  store.redo();
  assert.equal(shortcut.getSnapshot(), null);
  store.undo();
  archive();
  assert.equal(store.deleteArchivedHabit('walk'), true);
  assert.equal(shortcut.getSnapshot(), null);
  assert.equal(shortcut.undo(), false);
  apply(entry('read', '2026-10-07', null, 20));
  t.mock.timers.tick(3000);
  apply(entry('read', '2026-10-07', 20, 30));
  t.mock.timers.tick(1000);
  assert.equal(shortcut.getSnapshot().change.after, 30);
  assert.equal(shortcut.undo(), true);
  assert.equal(store.getSnapshot().replay.state.values['read:2026-10-07'], 20);
  await store.flush();
});
