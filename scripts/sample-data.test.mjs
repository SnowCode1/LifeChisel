import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSampleEvents,
  createSampleStore,
  SAMPLE_DAYS,
} from '../packages/core/src/dev/sampleData.ts';
import { replayEvents } from '../packages/core/src/storage/model.ts';
import { habitStatistics, dayNumber } from '../packages/core/src/statistics.ts';
import { sampleDescriptions } from '../packages/core/src/dev/sampleDescriptions.ts';
import { presetDescriptions } from '../packages/core/src/presetDescriptions.ts';
import { MAX_DESCRIPTION_LENGTH } from '../packages/core/src/description.ts';
import { demoHabits, isNumericHabit } from '../packages/core/src/habits.ts';
import { entryDay } from '../packages/core/src/calendar.ts';

const today = '2026-10-04';
test('calendar corrections update the same dated values and statistics and can be undone', async () => {
  const store = await createSampleStore(today);
  function stats(id) {
    const { replay, events } = store.getSnapshot();
    return habitStatistics(
      replay.state.habits.find((habit) => habit.id === id),
      replay.state.values,
      events,
      today,
      30,
    );
  }
  for (const [habitId, date, after] of [
    ['walk', '2026-10-03', null],
    ['meditate', '2026-10-02', 1],
    ['read', '2026-09-30', 12.5],
    ['water', '2026-10-01', 0],
    ['water', '2026-10-02', null],
    ['read', '2026-10-05', 42],
  ]) {
    const target = entryDay(date);
    const key = `${habitId}:${target.key}`;
    const before = store.getSnapshot().replay.state.values[key] ?? null;
    const originalStats = stats(habitId);
    assert.notEqual(before, after);
    assert.equal(
      store.change({ kind: 'entry', habitId, date: target.key, before, after }),
      true,
    );
    assert.equal(store.getSnapshot().replay.state.values[key] ?? null, after);
    const updatedStats = stats(habitId);
    if (date > today) assert.deepEqual(updatedStats, originalStats);
    else {
      const numeric = isNumericHabit(
        demoHabits.find((habit) => habit.id === habitId),
      );
      if (numeric)
        assert.equal(
          updatedStats.total,
          originalStats.total - (before ?? 0) + (after ?? 0),
        );
      else
        assert.equal(
          updatedStats.recorded,
          originalStats.recorded + (after === 1 ? 1 : -1),
        );
    }
    assert.equal(store.undo(), true);
    assert.deepEqual(stats(habitId), originalStats);
    assert.equal(store.getSnapshot().replay.state.values[key] ?? null, before);
    assert.equal(store.redo(), true);
    assert.deepEqual(stats(habitId), updatedStats);
  }
  await store.flush();
});
test('sample history is deterministic, valid and bounded to 180 local dates across DST and leap days', () => {
  for (const date of [today, '2024-03-05', '2026-04-05']) {
    const events = createSampleEvents(date);
    assert.deepEqual(events, createSampleEvents(date));
    const { replay } = replayEvents(events);
    assert.equal(events[0].type, 'initialize');
    assert.equal(events[0].version, 7);
    assert.deepEqual(
      replay.state.habits,
      demoHabits.map((habit) => ({
        ...habit,
        description: sampleDescriptions[habit.id],
      })),
    );
    const seen = new Set();
    for (const event of events.slice(1)) {
      const { habitId, date: day, after, before } = event.change;
      assert.equal(before, null);
      const ago = dayNumber(date) - dayNumber(day);
      assert.ok(ago >= 0 && ago < SAMPLE_DAYS);
      const key = `${habitId}:${day}`;
      assert.equal(seen.has(key), false);
      seen.add(key);
      assert.equal(replay.state.values[key], after);
      assert.ok(Number.isFinite(after) && after >= 0);
      const habit = demoHabits.find((habit) => habit.id === habitId);
      if (!isNumericHabit(habit)) assert.equal(after, 1);
    }
    assert.equal(Object.keys(replay.state.values).length, seen.size);
  }
});
test('sample statistics expose streaks, gaps, zeros, varied success rates and numeric totals in every range', () => {
  const events = createSampleEvents(today);
  const { state } = replayEvents(events).replay;
  const rates = new Set();
  for (const habit of state.habits) {
    for (const range of [30, 90, 365, 'all']) {
      const stats = habitStatistics(habit, state.values, events, today, range);
      assert.ok(stats.recorded > 0 && stats.recorded <= stats.eligible);
      assert.ok(stats.buckets.some((bucket) => bucket.value !== null));
      assert.equal(stats.weekday.length, 7);
      if (!stats.numeric) {
        assert.ok(stats.rate > 0 && stats.rate < 1);
        rates.add(stats.rate);
      } else assert.ok(stats.total > 0 && stats.average > 0);
    }
  }
  assert.ok(rates.size > 10);
  const walk = habitStatistics(
    state.habits.find((habit) => habit.id === 'walk'),
    state.values,
    events,
    today,
    30,
  );
  const meditate = habitStatistics(
    state.habits.find((habit) => habit.id === 'meditate'),
    state.values,
    events,
    today,
    30,
  );
  assert.ok(walk.streak >= 8);
  assert.equal(meditate.streak, 0);
  for (const id of ['read', 'water']) {
    const values = Object.entries(state.values)
      .filter(([key]) => key.startsWith(`${id}:`))
      .map(([, value]) => value);
    assert.ok(values.includes(0));
    assert.ok(values.length < SAMPLE_DAYS);
    assert.ok(new Set(values).size > 5);
  }
  assert.ok(
    Object.entries(state.values).some(
      ([key, value]) => key.startsWith('water:') && value % 1 !== 0,
    ),
  );
  const read = habitStatistics(
    state.habits.find((habit) => habit.id === 'read'),
    state.values,
    events,
    today,
    90,
  );
  assert.ok(read.average > read.previous.average);
});
test('sample edits and Undo/Redo affect only their own in-memory store; a fresh sample resets them', async () => {
  const first = await createSampleStore(today);
  const second = await createSampleStore(today);
  const untouched = structuredClone(second.getSnapshot());
  const key = `read:${today}`;
  const before = first.getSnapshot().replay.state.values[key] ?? null;
  assert.equal(
    first.change({
      kind: 'entry',
      habitId: 'read',
      date: today,
      before,
      after: 999,
    }),
    true,
  );
  await first.flush();
  assert.equal(first.getSnapshot().replay.state.values[key], 999);
  assert.equal(first.undo(), true);
  assert.equal(first.getSnapshot().replay.state.values[key] ?? null, before);
  assert.equal(first.redo(), true);
  await first.flush();
  assert.equal(first.getSnapshot().replay.state.values[key], 999);
  assert.deepEqual(second.getSnapshot(), untouched);
  const reset = await createSampleStore(today);
  assert.equal(reset.getSnapshot().replay.state.values[key] ?? null, before);
  assert.deepEqual(
    demoHabits.map((habit) => ({
      ...habit,
      description: sampleDescriptions[habit.id],
    })),
    createSampleEvents(today)[0].habits,
  );
});
test('sample mode cannot restore a backup or overwrite a persistent repository', async () => {
  const sample = await createSampleStore(today);
  const before = structuredClone(sample.getSnapshot().events);
  await assert.rejects(
    sample.exclusive(() => sample.replace(createSampleEvents('2026-10-01'))),
    /unavailable in sample mode/,
  );
  await assert.rejects(sample.recoveryEvents(), /no recovery archive/);
  assert.deepEqual(sample.getSnapshot().events, before);
  assert.equal(sample.getSnapshot().busy, false);
});

test('three sample notes grow progressively towards the limit without altering real preset notes', () => {
  const lengths = ['walk', 'read', 'meditate'].map(
    (id) => sampleDescriptions[id].length,
  );
  assert.ok(lengths[0] > 1500 && lengths[0] < 2500);
  assert.ok(lengths[1] > 7000 && lengths[1] < 9000);
  assert.ok(lengths[2] > 17000 && lengths[2] <= MAX_DESCRIPTION_LENGTH);
  for (const habit of demoHabits) {
    assert.ok(presetDescriptions[habit.id].length < 1000);
    assert.ok(sampleDescriptions[habit.id].length <= MAX_DESCRIPTION_LENGTH);
    if (!['walk', 'read', 'meditate'].includes(habit.id))
      assert.equal(sampleDescriptions[habit.id], presetDescriptions[habit.id]);
  }
});

test('marketing presets are deterministic, valid and show every habit type across DST and leap days', async () => {
  const { createPresetEvents, samplePresets, PRESET_DAYS } =
    await import('../packages/core/src/dev/samplePresets.ts');
  const { habitType } = await import('../packages/core/src/habits.ts');
  assert.equal(samplePresets.length, 5);
  for (const preset of samplePresets)
    for (const date of [today, '2024-03-05', '2026-04-05', '2026-10-26']) {
      const events = createPresetEvents(preset.id, date);
      assert.deepEqual(events, createPresetEvents(preset.id, date));
      const { replay } = replayEvents(events);
      const { habits, values } = replay.state;
      assert.deepEqual(
        new Set(habits.map(habitType)),
        new Set(['checkbox', 'number', 'categorical', 'text']),
      );
      const recent = Array.from({ length: 14 }, (_, ago) =>
        new Date(Date.parse(`${date}T12:00:00Z`) - ago * 864e5)
          .toISOString()
          .slice(0, 10),
      );
      for (const habit of habits) {
        // Every row has something to show in a two-week screenshot.
        assert.ok(
          habit.goals?.[0]?.defaultChecked ||
            recent.some((day) => values[`${habit.id}:${day}`] !== undefined),
          `${preset.id}/${habit.id}`,
        );
        // Habits logged late in the evening are still open today.
        const late = preset.habits.find((item) => item.id === habit.id).at[0];
        if (late >= 20) assert.equal(values[`${habit.id}:${date}`], undefined);
      }
      for (const event of events.slice(1)) {
        const ago = dayNumber(date) - dayNumber(event.change.date);
        assert.ok(ago >= 0 && ago < PRESET_DAYS);
      }
    }
  assert.throws(() => createPresetEvents('nobody', today), /Unknown/);
});

test('a preset opens as its own in-memory sample store', async () => {
  const store = await createSampleStore(today, 'athlete');
  const { state } = store.getSnapshot().replay;
  assert.ok(state.habits.every((habit) => habit.id.startsWith('athlete-')));
  const key = `athlete-mobility:${today}`;
  const before = state.values[key] ?? null;
  assert.equal(
    store.change({
      kind: 'entry',
      habitId: 'athlete-mobility',
      date: today,
      before,
      after: before === 1 ? null : 1,
    }),
    true,
  );
  await store.flush();
  assert.equal(store.undo(), true);
  assert.equal(store.getSnapshot().replay.state.values[key] ?? null, before);
  await assert.rejects(createSampleStore(today, 'nobody'), /Unknown/);
});
