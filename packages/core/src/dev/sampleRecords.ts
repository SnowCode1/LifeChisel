import { calendarDay, localDateKey } from '../calendar.ts';
import type { Habit } from '../habits.ts';
import type { EntryValue } from '../entries.ts';
import type { StoredEvent, EventMeta } from '../storage/model.ts';

// Additive fictional records in the isolated sample store only. The existing
// twelve-habit/v7 sample fixture remains unchanged for compatibility tests.
export function withSampleRecords(
  events: StoredEvent[],
  today: string,
): StoredEvent[] {
  const seed = events[0];
  if (seed?.type !== 'initialize') throw new Error('Missing sample seed.');
  const result = [...events];
  const start = localDateKey(calendarDay(today, 59));
  const habits: Habit[] = [
    {
      id: 'sample-workout',
      name: 'Workout',
      type: 'categorical',
      color: '#9CD978',
      icon: 'tabler:barbell',
      startDate: start,
      categories: [
        { id: 'run', label: 'Run' },
        { id: 'strength', label: 'Strength training', shortLabel: 'STR' },
        { id: 'stretch', label: 'Stretch' },
        { id: 'rest', label: 'Rest' },
      ],
    },
    {
      id: 'sample-highlight',
      name: 'Daily highlight',
      type: 'text',
      color: '#ED8DC3',
      icon: 'phosphor:pencil-simple',
      startDate: start,
    },
  ];
  const meta = (): EventMeta => ({
    version: 10,
    id: `sample_record_${result.length + 1}`,
    sequence: result.length + 1,
    recordedAt: `${today}T09:30:00.000Z`,
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
  });
  for (const habit of habits)
    result.push({
      ...meta(),
      type: 'change',
      groupId: `sample_record_${result.length + 1}`,
      change: {
        kind: 'habit',
        habitId: habit.id,
        index: seed.habits.length + habits.indexOf(habit),
        before: null,
        after: habit,
      },
    });
  const highlights = [
    'Coffee outside',
    'A walk by the river',
    'Finished a chapter',
    'A quiet afternoon with a friend',
    'Made something new for dinner',
    'Small progress on a difficult task',
  ];
  for (let ago = 59; ago >= 0; ago--) {
    if (ago % 9 === 0 && ago !== 0) continue;
    const date = localDateKey(calendarDay(today, ago));
    const entries: EntryValue[] = [
      ago % 4 === 0
        ? ['run', 'stretch']
        : ago % 4 === 1
          ? ['strength', 'stretch']
          : ago % 4 === 2
            ? ['rest']
            : ['run'],
      highlights[ago % highlights.length],
    ];
    for (let index = 0; index < habits.length; index++) {
      const metadata = meta();
      result.push({
        ...metadata,
        type: 'change',
        groupId: metadata.id,
        change: {
          kind: 'entry',
          habitId: habits[index].id,
          date,
          before: null,
          after: entries[index],
        },
      });
    }
  }
  return result;
}
