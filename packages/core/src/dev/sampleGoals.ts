import { localDateKey, calendarDay } from '../calendar.ts';
import { replayEvents, type StoredEvent } from '../storage/model.ts';
import { allWeekdays, type HabitGoal } from '../habitGoals.ts';

// Fictional goals stay in the isolated sample log, never real preset migrations.
export function withSampleGoals(
  events: StoredEvent[],
  today: string,
): StoredEvent[] {
  const result = [...events],
    { replay } = replayEvents(events);
  const ago = (days: number) => localDateKey(calendarDay(today, days));
  const goal = (
    id: string,
    from: string,
    rule: HabitGoal['rule'],
    weekdays = allWeekdays,
  ): HabitGoal => ({ id, from, rule, weekdays });
  const goals: Record<string, HabitGoal[]> = {
    read: [
      goal('sample-read-first', ago(179), {
        kind: 'number',
        operator: 'atLeast',
        target: 15,
      }),
      goal('sample-read-raised', ago(14), {
        kind: 'number',
        operator: 'atLeast',
        target: 30,
      }),
    ],
    water: [
      goal('sample-water-goal', ago(179), {
        kind: 'number',
        operator: 'atLeast',
        target: 8,
      }),
    ],
    'sample-workout': [
      goal(
        'sample-workout-goal',
        ago(59),
        {
          kind: 'categories',
          match: 'any',
          ids: ['run', 'strength'],
          exclude: [],
        },
        [1, 3, 5],
      ),
    ],
    'sample-highlight': [
      goal('sample-highlight-goal', ago(59), { kind: 'recorded' }),
    ],
  };
  for (const before of replay.state.habits) {
    if (!goals[before.id]) continue;
    const id = `sample_goal_${result.length + 1}`;
    result.push({
      version: 11,
      id,
      sequence: result.length + 1,
      recordedAt: `${today}T10:00:00.000Z`,
      timeZone: 'UTC',
      utcOffsetMinutes: 0,
      type: 'change',
      groupId: id,
      change: {
        kind: 'habit',
        habitId: before.id,
        index: replay.state.habits.indexOf(before),
        before,
        after: { ...before, goals: goals[before.id] },
      },
    });
  }
  return result;
}
