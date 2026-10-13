import assert from 'node:assert/strict';
import test from 'node:test';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { replayEvents } from '../packages/core/src/storage/model.ts';
import {
  entryMinutes,
  timeOfDayStatistics,
} from '../packages/core/src/timeOfDay.ts';
import { createSampleStore } from '../packages/core/src/dev/sampleData.ts';

const walk = { id: 'walk', name: 'Walk', color: '#82E6BC' };
const water = {
  id: 'water',
  name: 'Water',
  color: '#7DDDD9',
  unit: 'glasses',
};

// A memory store whose edit clock and UTC offset each test controls.
async function fixture() {
  const clock = { at: '2026-10-01T06:00:00.000Z', offset: 0 };
  let counter = 0;
  const meta = (sequence) => ({
    version: 18,
    id: `time-${++counter}`,
    sequence,
    recordedAt: clock.at,
    timeZone: 'UTC',
    utcOffsetMinutes: clock.offset,
  });
  const repository = {
    async load() {
      return {
        ...replayEvents([
          { ...meta(1), type: 'initialize', habits: [walk, water] },
        ]),
        hasRecovery: false,
      };
    },
    async append() {},
    async replace() {},
    async recoveryEvents() {
      return [];
    },
  };
  const store = new ChangeStore(repository, meta);
  await store.load();
  const edit = (habitId, date, after, at, offset = 0) => {
    clock.at = at;
    clock.offset = offset;
    const values = store.getSnapshot().replay.state.values;
    assert.equal(
      store.change({
        kind: 'entry',
        habitId,
        date,
        before: values[`${habitId}:${date}`] ?? null,
        after,
      }),
      true,
    );
  };
  const minutes = (habit) =>
    Object.fromEntries(entryMinutes(habit, store.getSnapshot().replay.undo));
  const stats = (habit, from = '2026-09-01', to = '2026-10-31') => {
    const { replay } = store.getSnapshot();
    return timeOfDayStatistics(
      habit,
      replay.state.values,
      replay.undo,
      from,
      to,
    );
  };
  return { store, clock, edit, minutes, stats };
}

test('same-day entries use the local time captured with the edit', async () => {
  const { edit, minutes, stats } = await fixture();
  edit('walk', '2026-10-01', 1, '2026-10-01T07:30:00.000Z');
  // Travelling at UTC+10: 21:15 UTC is 07:15 the next local morning.
  edit('walk', '2026-10-03', 1, '2026-10-02T21:15:00.000Z', 600);
  // UTC-5: 02:00 UTC is still 21:00 on the previous local day.
  edit('walk', '2026-10-04', 1, '2026-10-05T02:00:00.000Z', -300);
  assert.deepEqual(minutes(walk), {
    '2026-10-01': 450,
    '2026-10-03': 435,
    '2026-10-04': 1260,
  });
  const result = stats(walk);
  assert.equal(result.counted, 3);
  assert.equal(result.hours[7], 2);
  assert.equal(result.hours[21], 1);
  assert.equal(result.peak, 7);
});

test('entries added on a later day are left out but still counted as recorded', async () => {
  const { edit, minutes, stats } = await fixture();
  edit('walk', '2026-10-01', 1, '2026-10-02T08:00:00.000Z');
  edit('walk', '2026-10-02', 1, '2026-10-02T08:05:00.000Z');
  assert.deepEqual(minutes(walk), { '2026-10-02': 485 });
  const result = stats(walk);
  assert.equal(result.counted, 1);
  assert.equal(result.recorded, 2);
});

test('undone entries are excluded and Redo restores the original time', async () => {
  const { store, edit, stats, minutes } = await fixture();
  edit('walk', '2026-10-01', 1, '2026-10-01T07:00:00.000Z');
  edit('walk', '2026-10-02', 1, '2026-10-02T18:00:00.000Z');
  assert.equal(store.undo(), true);
  assert.deepEqual(minutes(walk), { '2026-10-01': 420 });
  assert.equal(stats(walk).counted, 1);
  assert.equal(stats(walk).recorded, 1);
  assert.equal(store.redo(), true);
  assert.deepEqual(minutes(walk), {
    '2026-10-01': 420,
    '2026-10-02': 1080,
  });
});

test('corrections keep the first recorded time; refilling an emptied entry moves it', async () => {
  const { edit, minutes } = await fixture();
  edit('water', '2026-10-01', 1, '2026-10-01T08:00:00.000Z');
  edit('water', '2026-10-01', 4, '2026-10-01T15:00:00.000Z');
  assert.deepEqual(minutes(water), { '2026-10-01': 480 });
  edit('walk', '2026-10-01', 1, '2026-10-01T07:00:00.000Z');
  edit('walk', '2026-10-01', null, '2026-10-01T07:10:00.000Z');
  edit('walk', '2026-10-01', 1, '2026-10-01T19:00:00.000Z');
  assert.deepEqual(minutes(walk), { '2026-10-01': 1140 });
});

test('numeric zero is a recorded value; checkbox Off is not', async () => {
  const { edit, stats } = await fixture();
  edit('water', '2026-10-01', 0, '2026-10-01T09:00:00.000Z');
  edit('walk', '2026-10-01', 0, '2026-10-01T09:00:00.000Z');
  assert.equal(stats(water).counted, 1);
  assert.equal(stats(walk).counted, 0);
  assert.equal(stats(walk).recorded, 0);
  assert.equal(stats(walk).peak, null);
});

test('the period bounds which entry dates are counted', async () => {
  const { edit, stats } = await fixture();
  edit('walk', '2026-10-01', 1, '2026-10-01T07:00:00.000Z');
  edit('walk', '2026-10-05', 1, '2026-10-05T07:00:00.000Z');
  assert.equal(stats(walk, '2026-10-02', '2026-10-31').counted, 1);
  assert.equal(stats(walk, '2026-09-01', '2026-10-01').counted, 1);
});

test('sample presets spread across realistic times of day', async () => {
  const store = await createSampleStore('2026-10-10');
  const { replay } = store.getSnapshot();
  const habit = (id) => replay.state.habits.find((item) => item.id === id);
  const peak = (id) =>
    timeOfDayStatistics(
      habit(id),
      replay.state.values,
      replay.undo,
      '2026-01-01',
      '2026-10-10',
    ).peak;
  assert.ok(peak('meditate') < 9);
  assert.ok(peak('read') >= 20);
  assert.notEqual(peak('meditate'), peak('read'));
});
