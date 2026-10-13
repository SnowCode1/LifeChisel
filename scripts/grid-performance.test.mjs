import assert from 'node:assert/strict';
import test from 'node:test';
import { createGridPalette } from '../packages/core/src/gridAppearance.ts';
import {
  colorOnBlack,
  contrastOnBlack,
  checkmarkColor,
} from '../packages/core/src/colors.ts';
import { blackTheme } from '../packages/core/src/theme.ts';
import { demoHabits } from '../packages/core/src/habits.ts';
import {
  createGridDayCache,
  makeGridDays,
} from '../packages/core/src/calendar.ts';
import { createSampleStore } from '../packages/core/src/dev/sampleData.ts';
import {
  entrySelection,
  recordedDaySelection,
  selectStore,
} from '../packages/core/src/storage/selection.ts';

function change(store, habitId, date, after) {
  const before =
    store.getSnapshot().replay.state.values[`${habitId}:${date}`] ?? null;
  assert.equal(
    store.change({ kind: 'entry', habitId, date, before, after }),
    true,
  );
}
test('precomputed grid palettes keep every readable colour, with one tone for all dates', () => {
  for (const colour of [
    ...demoHabits.map((habit) => habit.color),
    '#FF0000',
    '#000001',
    '#FFFFFF',
    '#00FFAA',
  ]) {
    const palette = createGridPalette(colour);
    // Readable colours (every preset) are untouched on black; an unreadable
    // one is lightened first and keeps the original tone rules from there.
    const shown = blackTheme.colour(colour);
    if (contrastOnBlack(colour) >= 4.5) assert.equal(shown, colour);
    else assert.ok(contrastOnBlack(shown) >= 4.5);
    assert.equal(palette.colour, shown);
    assert.equal(palette.checkmark, checkmarkColor(shown));
    assert.equal(palette.checkbox, colorOnBlack(shown, 170 / 255));
    assert.equal(palette.number, colorOnBlack(shown, 0.65));
    assert.equal(palette.rule, `${shown}20`);
  }
});
test('grid date cache preserves identities through history/future expansion and today collapse', () => {
  for (const today of [
    '2026-10-04',
    '2026-04-05',
    '2024-03-01',
    '2026-01-01',
  ]) {
    const cache = createGridDayCache(today);
    const original = cache(90);
    const expanded = cache(540, 60);
    assert.deepEqual(expanded, makeGridDays(today, 540, 60));
    for (let i = 0; i < 90; i++) assert.equal(expanded[i + 60], original[i]);
    const collapsed = cache(540);
    for (let i = 0; i < 90; i++) assert.equal(collapsed[i], original[i]);
    assert.notEqual(createGridDayCache(today)(90)[0], original[0]);
  }
});
test('a single edit notifies only its entry subscribers; acknowledgements/preferences leave cells alone', async () => {
  const store = await createSampleStore('2026-10-04');
  const selected = entrySelection(store, 'walk:2026-10-04');
  const other = entrySelection(store, 'read:2026-10-04');
  const definitions = selectStore(
    store,
    (snapshot) => snapshot.replay.state.habits,
  );
  let changed = 0,
    unrelated = 0,
    habits = 0;
  const unsubscribe = selected.subscribe(() => changed++);
  const unsubscribeOther = other.subscribe(() => unrelated++);
  const unsubscribeDefinitions = definitions.subscribe(() => habits++);
  change(store, 'walk', '2026-10-04', null);
  assert.equal(changed, 1);
  await store.flush();
  assert.equal(changed, 1);
  store.change({ kind: 'haptics', before: true, after: false });
  await store.flush();
  assert.equal(changed, 1);
  assert.equal(unrelated, 0);
  assert.equal(habits, 0);
  assert.equal(store.undo(), true);
  assert.equal(selected.getSnapshot(), 1);
  assert.equal(changed, 2);
  assert.equal(store.redo(), true);
  assert.equal(selected.getSnapshot(), undefined);
  assert.equal(changed, 3);
  unsubscribe();
  unsubscribeOther();
  unsubscribeDefinitions();
  change(store, 'walk', '2026-10-04', 1);
  await store.flush();
  assert.equal(changed, 3);
});
test('date-heading selection counts numeric zero, ignores other dates, and changes only at empty/recorded boundaries', async () => {
  const store = await createSampleStore('2026-10-04');
  const habits = store.getSnapshot().replay.state.habits;
  const selection = recordedDaySelection(store, habits, '2026-10-05');
  let changed = 0;
  const unsubscribe = selection.subscribe(() => changed++);
  assert.equal(selection.getSnapshot(), false);
  change(store, 'water', '2026-10-05', 0);
  assert.equal(selection.getSnapshot(), true);
  assert.equal(changed, 1);
  change(store, 'walk', '2026-10-05', 1);
  change(store, 'water', '2026-10-05', null);
  change(store, 'read', '2026-10-06', 9);
  assert.equal(changed, 1);
  change(store, 'walk', '2026-10-05', null);
  assert.equal(selection.getSnapshot(), false);
  assert.equal(changed, 2);
  await store.flush();
  assert.equal(changed, 2);
  unsubscribe();
});
test('mounted entry selectors see restore and rapid latest values without a second cached projection', async () => {
  const store = await createSampleStore('2026-10-04');
  // A production-like replace-capable memory repository exercises store.replace.
  const { ChangeStore } = await import('../packages/core/src/storage/store.ts');
  const { replayEvents } =
    await import('../packages/core/src/storage/model.ts');
  const { events } = store.getSnapshot();
  let journal = events;
  const repository = {
    load: async () => ({ ...replayEvents(journal), hasRecovery: false }),
    append: async (event) => {
      journal = [...journal, event];
    },
    replace: async (replacement) => {
      journal = replacement;
    },
    recoveryEvents: async () => events,
  };
  const target = new ChangeStore(repository, (sequence) => ({
    version: 4,
    id: `restore_test_${sequence}`,
    sequence,
    recordedAt: '2026-10-04T12:00:00.000Z',
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
  }));
  await target.load();
  const selection = entrySelection(target, 'walk:2026-10-04');
  let notified = 0;
  const unsubscribe = selection.subscribe(() => notified++);
  for (let i = 0; i < 9; i++)
    change(target, 'walk', '2026-10-04', i % 2 ? 1 : null);
  assert.equal(selection.getSnapshot(), undefined);
  assert.equal(notified, 9);
  await target.exclusive(() => target.replace(events));
  assert.equal(selection.getSnapshot(), 1);
  assert.equal(notified, 10);
  unsubscribe();
});
