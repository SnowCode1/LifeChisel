import assert from 'node:assert/strict';
import test from 'node:test';
import { localDateKey } from '../src/calendar.ts';
import {
  burstGapMs,
  burstMemberLabel,
  historyCountLabel,
  historyDayLabel,
  historyHabits,
  historyKind,
  historyPresentation,
  historyDayIndex,
  historyDays,
  historyRows,
} from '../src/history.ts';

const days = (actions, filter, limit) =>
  historyDays(actions, filter, limit).days;

process.env.TZ = 'Australia/Melbourne';
const state = {
  habits: [
    { id: 'walk', name: 'Walk', color: '#82E6BC' },
    { id: 'read', name: 'Read', color: '#BDA5FF', unit: 'minutes' },
  ],
  values: {},
  hapticsEnabled: true,
};
function action(
  sequence,
  recordedAt,
  change = {
    kind: 'entry',
    habitId: 'walk',
    date: '2026-10-04',
    before: null,
    after: 1,
  },
) {
  return {
    version: 2,
    id: `e${sequence}`,
    sequence,
    recordedAt,
    timeZone: 'Australia/Melbourne',
    utcOffsetMinutes: 660,
    type: 'change',
    change,
    firstRecordedAt: recordedAt,
    firstSequence: sequence,
    editCount: 1,
    lastChangedSequence: sequence,
  };
}

test('history groups active actions by local edit day, retaining newest-first sequence', () => {
  const events = [
    action(2, '2026-10-03T13:59:59.000Z'),
    action(3, '2026-10-03T14:00:00.000Z'),
    action(4, '2026-10-03T16:00:00.000Z'),
  ];
  const sections = days(events);
  assert.deepEqual(
    sections.map((section) => section.date),
    ['2026-10-04', '2026-10-03'],
  );
  assert.deepEqual(
    sections.map((section) => section.actions.map((event) => event.id)),
    [['e4', 'e3'], ['e2']],
  );
});

test('day paging returns whole days and keeps keys as more days load', () => {
  // Three actions on each of five earlier days, then 105 on 4 Oct.
  const earlier = ['09-29', '09-30', '10-01', '10-02', '10-03'];
  const events = [
    ...Array.from({ length: 15 }, (_, index) =>
      action(index + 2, `2026-${earlier[Math.floor(index / 3)]}T05:00:00.000Z`),
    ),
    ...Array.from({ length: 105 }, (_, index) =>
      action(index + 20, '2026-10-04T05:30:00.000Z'),
    ),
  ];
  const first = historyDays(events, undefined, 1);
  assert.equal(first.more, true);
  assert.equal(first.days.length, 1);
  assert.equal(first.days[0].actions.length, 105);
  const three = historyDays(events, undefined, 3);
  assert.equal(three.more, true);
  assert.deepEqual(
    three.days.map((day) => day.actions.length),
    [105, 3, 3],
  );
  const all = historyDays(events, undefined, 40);
  assert.equal(all.more, false);
  assert.equal(all.days.length, 6);
  assert.equal(first.days[0].key, all.days[0].key);
  assert.deepEqual(
    all.days.map((day) => day.key),
    days(events).map((day) => day.key),
  );
  assert.deepEqual(historyDays([]), { days: [], more: false });
});

test('a backward clock adjustment keeps the log order instead of moving edits between day buckets', () => {
  const events = [
    action(2, '2026-10-03T15:00:00.000Z'),
    action(3, '2026-10-02T15:00:00.000Z'),
    action(4, '2026-10-03T16:00:00.000Z'),
  ];
  const sections = days(events);
  assert.deepEqual(
    sections.map((section) => section.date),
    ['2026-10-04', '2026-10-03', '2026-10-04'],
  );
  assert.deepEqual(
    sections.flatMap((section) => section.actions.map((event) => event.id)),
    ['e4', 'e3', 'e2'],
  );
  assert.equal(new Set(sections.map((section) => section.key)).size, 3);
});

test('grouping follows the viewer timezone consistently through daylight saving and travel', () => {
  const events = [
    action(2, '2026-10-04T12:59:59.000Z'),
    action(3, '2026-10-04T13:00:00.000Z'),
  ];
  assert.deepEqual(
    days(events).map((section) => section.date),
    ['2026-10-05', '2026-10-04'],
  );
  const saved = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    assert.deepEqual(
      days(events).map((section) => section.date),
      ['2026-10-04'],
    );
  } finally {
    process.env.TZ = saved;
  }
});

test('a habit date is shown only when it differs from the displayed edit day', () => {
  const sameDay = action(2, '2026-10-03T14:01:00.000Z');
  assert.equal(historyPresentation(sameDay, state).effectiveDate, null);
  const backdated = {
    ...sameDay,
    change: { ...sameDay.change, date: '2026-10-02' },
  };
  const future = {
    ...sameDay,
    change: { ...sameDay.change, date: '2026-10-05' },
  };
  assert.equal(
    historyPresentation(backdated, state).effectiveDate,
    '2026-10-02',
  );
  assert.equal(historyPresentation(future, state).effectiveDate, '2026-10-05');
  assert.equal(days([future])[0].date, '2026-10-04');
});

test('numeric descriptions preserve zero, correction direction, units and clearing', () => {
  const row = (change) =>
    historyPresentation(
      action(2, '2026-10-04T05:00:00.000Z', {
        kind: 'entry',
        habitId: 'read',
        date: '2026-10-04',
        ...change,
      }),
      state,
    );
  assert.equal(row({ before: null, after: 0 }).summary, '— → 0 minutes');
  assert.equal(row({ before: 0, after: 30 }).summary, '0 → 30 minutes');
  assert.equal(
    row({ before: 30, after: null }).summary,
    '30 minutes → Cleared',
  );
  assert.equal(row({ before: 30, after: null }).icon, 'erase');
});

test('colour actions remain explicit, and yesterday handles year/DST boundaries', () => {
  assert.equal(
    historyPresentation(
      action(2, '2026-10-04T05:00:00.000Z', {
        kind: 'colour',
        habitId: 'walk',
        before: '#82E6BC',
        after: '#FFFFFF',
      }),
      state,
    ).icon,
    'palette',
  );
  assert.match(historyDayLabel('2026-10-04', '2026-10-05'), /^Yesterday/);
  assert.match(historyDayLabel('2026-10-04', '2026-10-04'), /^Today/);
});

const entry = (sequence, recordedAt, habitId, date, after = 1, before = null) =>
  action(sequence, recordedAt, {
    kind: 'entry',
    habitId,
    date,
    before,
    after,
  });
const definition = (habitId, before, after) => ({
  kind: 'habit',
  habitId,
  index: 0,
  before: { id: habitId, name: 'Walk', color: '#82E6BC', ...before },
  after: { id: habitId, name: 'Walk', color: '#82E6BC', ...after },
});

test('filters separate entries, habit edits and description edits, and by habit', () => {
  const events = [
    entry(2, '2026-10-04T05:00:00.000Z', 'walk', '2026-10-04'),
    action(
      3,
      '2026-10-04T05:01:00.000Z',
      definition('walk', {}, { name: 'Run' }),
    ),
    action(
      4,
      '2026-10-04T05:02:00.000Z',
      definition('walk', { description: 'a' }, { description: 'b' }),
    ),
    action(5, '2026-10-04T05:03:00.000Z', {
      kind: 'order',
      before: ['walk', 'read'],
      after: ['read', 'walk'],
    }),
    entry(6, '2026-10-04T05:04:00.000Z', 'read', '2026-10-04', 30),
  ];
  const ids = (filter) =>
    days(events, filter).flatMap((section) =>
      section.actions.map((event) => event.id),
    );
  assert.deepEqual(ids({ kind: 'all', habitId: null }), [
    'e6',
    'e5',
    'e4',
    'e3',
    'e2',
  ]);
  assert.deepEqual(ids({ kind: 'entries', habitId: null }), ['e6', 'e2']);
  assert.deepEqual(ids({ kind: 'edits', habitId: null }), ['e5', 'e3']);
  assert.deepEqual(ids({ kind: 'notes', habitId: null }), ['e4']);
  // Order changes belong to no single habit.
  assert.deepEqual(ids({ kind: 'all', habitId: 'walk' }), ['e4', 'e3', 'e2']);
  assert.deepEqual(ids({ kind: 'edits', habitId: 'read' }), []);
  assert.equal(historyKind(events[2]), 'notes');
  // A goal edit reads "Goals edited", so it stays an edit even with a new note.
  const goals = action(
    7,
    '2026-10-04T05:05:00.000Z',
    definition(
      'walk',
      { description: 'a', goals: [] },
      { description: 'b', goals: [{ id: 'g' }] },
    ),
  );
  assert.equal(historyPresentation(goals, state).summary, 'Goals edited');
  assert.equal(historyKind(goals), 'edits');
});

test('day counts follow the filter and cover each whole day', () => {
  const events = [
    action(
      2,
      '2026-10-03T05:00:00.000Z',
      definition('walk', {}, { name: 'Run' }),
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      entry(index + 3, '2026-10-04T05:00:00.000Z', 'walk', '2026-10-04'),
    ),
    action(
      7,
      '2026-10-04T06:00:00.000Z',
      definition('walk', {}, { name: 'Run' }),
    ),
  ];
  const [day] = days(events, undefined, 1);
  assert.equal(day.actions.length, 5);
  assert.deepEqual(day.counts, { entries: 4, edits: 1, notes: 0 });
  assert.equal(historyCountLabel(day.counts), '4 entries · 1 edit');
  assert.equal(
    historyCountLabel({ entries: 1, edits: 0, notes: 2 }),
    '1 entry · 2 notes',
  );
  const entriesOnly = days(events, {
    kind: 'entries',
    habitId: null,
  });
  assert.deepEqual(entriesOnly[0].counts, { entries: 4, edits: 0, notes: 0 });
});

test('neighbouring same-date entries within five minutes collapse without reordering', () => {
  // Newest first, as sections hold them.
  const actions = [
    entry(7, '2026-10-04T05:20:00.000Z', 'walk', '2026-10-04'),
    entry(6, '2026-10-04T05:09:00.000Z', 'read', '2026-10-04', 30),
    entry(5, '2026-10-04T05:04:00.000Z', 'walk', '2026-10-04'),
    entry(4, '2026-10-04T05:00:00.000Z', 'read', '2026-10-03', 10),
    action(
      3,
      '2026-10-04T04:59:00.000Z',
      definition('walk', {}, { name: 'Run' }),
    ),
    entry(2, '2026-10-04T04:58:00.000Z', 'walk', '2026-10-03'),
  ];
  const rows = historyRows(actions, new Set());
  assert.deepEqual(
    rows.map((row) =>
      row.type === 'burst'
        ? row.actions.map((action) => action.id)
        : row.action.id,
    ),
    // 11 minutes before e7 is too long; e4 is for another date; e3 is an edit.
    ['e7', ['e6', 'e5'], 'e4', 'e3', 'e2'],
  );
  assert.equal(rows[1].key, 'burst:e5');
  assert.equal(burstGapMs, 5 * 60 * 1000);
});

test('a burst keeps its key while newer entries join or are undone, and expands in place', () => {
  const older = [
    entry(3, '2026-10-04T05:01:00.000Z', 'read', '2026-10-04', 30),
    entry(2, '2026-10-04T05:00:00.000Z', 'walk', '2026-10-04'),
  ];
  const newer = [
    entry(4, '2026-10-04T05:02:00.000Z', 'walk', '2026-10-04', 0, 1),
    ...older,
  ];
  const [burst] = historyRows(newer, new Set());
  assert.equal(burst.key, historyRows(older, new Set())[0].key);
  const open = historyRows(newer, new Set([burst.key]));
  assert.deepEqual(
    open.map((row) => [row.key, row.nested]),
    [
      ['burst:e2', undefined],
      ['e4', 'middle'],
      ['e3', 'middle'],
      ['e2', 'last'],
    ],
  );
  assert.equal(open[0].expanded, true);
  // Undo down to one entry leaves an ordinary row.
  assert.equal(historyRows([older[1]], new Set([burst.key]))[0].type, 'action');
});

test('bursts tolerate a backwards clock without merging distant entries', () => {
  const rows = historyRows(
    [
      entry(3, '2026-10-04T04:58:00.000Z', 'read', '2026-10-04', 30),
      entry(2, '2026-10-04T05:00:00.000Z', 'walk', '2026-10-04'),
      entry(1, '2026-10-04T05:30:00.000Z', 'walk', '2026-10-04'),
    ],
    new Set(),
  );
  assert.deepEqual(
    rows.map((row) => row.type),
    ['burst', 'action'],
  );
});

test('burst labels show numeric values and strike unchecked or cleared entries', () => {
  const label = (event) => burstMemberLabel(event, state);
  const read = label(
    entry(2, '2026-10-04T05:00:00.000Z', 'read', '2026-10-04', 0),
  );
  assert.equal(read.value, '0 minutes');
  assert.equal(read.removed, false);
  assert.equal(read.spoken, 'Read 0 minutes');
  const cleared = label(
    entry(3, '2026-10-04T05:00:00.000Z', 'read', '2026-10-04', null, 30),
  );
  assert.equal(cleared.value, null);
  assert.equal(cleared.removed, true);
  const unchecked = label(
    entry(4, '2026-10-04T05:00:00.000Z', 'walk', '2026-10-04', 0, 1),
  );
  assert.equal(unchecked.removed, true);
  assert.equal(unchecked.spoken, 'Walk Unchecked');
  const checked = label(
    entry(5, '2026-10-04T05:00:00.000Z', 'walk', '2026-10-04'),
  );
  assert.equal(checked.removed, false);
  assert.equal(checked.value, null);
});

test('the habit filter lists only habits that appear in History, in current order', () => {
  const events = [
    entry(2, '2026-10-04T05:00:00.000Z', 'read', '2026-10-04', 30),
    action(3, '2026-10-04T05:01:00.000Z', {
      kind: 'order',
      before: ['walk', 'read'],
      after: ['read', 'walk'],
    }),
  ];
  assert.deepEqual(
    historyHabits(state, events).map((habit) => habit.id),
    ['read'],
  );
});

test('jumping picks the newest day on or before a date, else the oldest', () => {
  const events = [
    action(2, '2026-09-20T05:00:00.000Z'),
    action(3, '2026-10-01T05:00:00.000Z'),
    action(4, '2026-10-04T05:00:00.000Z'),
  ];
  const list = days(events);
  assert.deepEqual(
    list.map((day) => day.date),
    ['2026-10-04', '2026-10-01', '2026-09-20'],
  );
  assert.equal(historyDayIndex(list, '2026-10-10'), 0);
  assert.equal(historyDayIndex(list, '2026-10-04'), 0);
  assert.equal(historyDayIndex(list, '2026-10-03'), 1);
  assert.equal(historyDayIndex(list, '2026-09-25'), 2);
  assert.equal(historyDayIndex(list, '2026-01-01'), 2);
  assert.equal(historyDayIndex([], '2026-01-01'), -1);
});

test('a filtered jump index matches the filtered paged days', () => {
  const events = [
    action(2, '2026-09-20T05:00:00.000Z'),
    action(3, '2026-10-01T05:00:00.000Z', {
      kind: 'colour',
      habitId: 'walk',
      before: '#82E6BC',
      after: '#FFFFFF',
    }),
    action(4, '2026-10-04T05:00:00.000Z'),
  ];
  const filter = { kind: 'entries', habitId: null };
  const all = days(events, filter);
  const index = historyDayIndex(all, '2026-10-02');
  assert.equal(all[index].date, '2026-09-20');
  assert.equal(days(events, filter, index + 1)[index].key, all[index].key);
});

test('cached local days match localDateKey across daylight saving and half-hour zones', () => {
  const saved = process.env.TZ;
  try {
    for (const [zone, around] of [
      ['Australia/Melbourne', '2026-10-03T12:00:00.000Z'],
      ['Australia/Lord_Howe', '2026-10-03T12:00:00.000Z'],
      ['America/New_York', '2026-11-01T00:00:00.000Z'],
    ]) {
      process.env.TZ = zone;
      const start = Date.parse(around);
      // Every 7 minutes across two days, newest first in one run per day.
      const events = Array.from({ length: 412 }, (_, index) =>
        action(index + 2, new Date(start + index * 7 * 60_000).toISOString()),
      );
      const expected = events
        .map((event) => localDateKey(new Date(event.recordedAt)))
        .reverse();
      const actual = days(events).flatMap((day) =>
        day.actions.map(() => day.date),
      );
      assert.deepEqual(actual, expected, zone);
    }
  } finally {
    process.env.TZ = saved;
  }
});
