import { localDateKey, calendarDay } from '../calendar.ts';
import { replayEvents, type StoredEvent } from '../storage/model.ts';
import { allWeekdays, type HabitGoal } from '../habitGoals.ts';
import { weekAnchor } from '../goalTiming.ts';

// Separate synthetic append-only changes: never update real preset definitions.
export function withSampleTiming(
  events: StoredEvent[],
  today: string,
): StoredEvent[] {
  const result = [...events],
    { replay } = replayEvents(events);
  const from = weekAnchor(localDateKey(calendarDay(today, 42)), 'monday');
  for (const before of replay.state.habits) {
    let goal: HabitGoal;
    if (before.id === 'walk')
      goal = {
        id: 'sample-walk-cycle',
        from,
        rule: { kind: 'checked' },
        weekdays: allWeekdays,
        cycle: { unit: 'days', on: 5, off: 2, anchor: from },
      };
    else if (before.id === 'meditate')
      goal = {
        id: 'sample-meditate-cycle',
        from,
        rule: { kind: 'checked' },
        weekdays: allWeekdays,
        cycle: { unit: 'weeks', on: 3, off: 1, anchor: from },
      };
    else if (before.id === 'sample-workout')
      goal = {
        id: 'sample-workout-period',
        from,
        rule: {
          kind: 'categories',
          match: 'any',
          ids: ['run', 'strength'],
          exclude: [],
        },
        weekdays: allWeekdays,
        period: {
          unit: 'week',
          days: 7,
          anchor: from,
          operator: 'between',
          target: 2,
          upper: 4,
        },
        cycle: { unit: 'weeks', on: 1, off: 1, anchor: from },
      };
    else continue;
    const id = `sample_timing_${result.length + 1}`;
    result.push({
      version: 13,
      id,
      sequence: result.length + 1,
      recordedAt: `${today}T11:00:00.000Z`,
      timeZone: 'UTC',
      utcOffsetMinutes: 0,
      type: 'change',
      groupId: id,
      change: {
        kind: 'habit',
        habitId: before.id,
        index: replay.state.habits.indexOf(before),
        before,
        after: { ...before, goals: [...(before.goals ?? []), goal] },
      },
    });
  }
  return result;
}
