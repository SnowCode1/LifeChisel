import { calendarDay, localDateKey } from '../calendar.ts';
import { categorySelection, type EntryValue } from '../entries.ts';
import { allWeekdays, type HabitGoal } from '../habitGoals.ts';
import { ordinal, weekAnchor } from '../goalTiming.ts';
import type { Habit } from '../habits.ts';
import type { HabitNote, StoredEvent } from '../storage/model.ts';
import { eventMeta } from '../storage/newEvents.ts';
import { athlete } from './presets/athlete.ts';
import { everyday } from './presets/everyday.ts';
import { health } from './presets/health.ts';
import { chance, type SampleHabit } from './presets/kit.ts';
import { learner } from './presets/learner.ts';
import { wellbeing } from './presets/wellbeing.ts';

// Fictional people for marketing screenshots and demos. Each preset is its
// own complete, isolated history; none of it reaches real data or backups.
export const samplePresets = [everyday, athlete, health, learner, wellbeing];
export type SamplePresetInfo = { id: string; name: string; summary: string };
export const samplePresetList: SamplePresetInfo[] = samplePresets.map(
  ({ id, name, summary }) => ({ id, name, summary }),
);
export const isSamplePreset = (id: unknown): id is string =>
  samplePresets.some((preset) => preset.id === id);

export const PRESET_DAYS = 180;
// Today looks like an evening in progress: habits usually logged before
// this hour are filled in, later ones are still open to tap.
const TODAY_CUTOFF = 20;

function definition(habit: SampleHabit, start: string, today: string): Habit {
  const {
    at: _at,
    value: _value,
    goals,
    description: _description,
    notes: _notes,
    ...fields
  } = habit;
  const anchor = weekAnchor(start, 'monday');
  return {
    ...fields,
    startDate: start,
    ...(goals && {
      goals: goals.map(
        (
          { fromAgo, period, cycle, weekdays, rule, ...goal },
          index,
        ): HabitGoal => ({
          ...goal,
          // Saved rules list category ids in sorted order, like entries.
          rule:
            rule.kind === 'categories'
              ? {
                  ...rule,
                  ids: [...rule.ids].sort(),
                  exclude: [...rule.exclude].sort(),
                }
              : rule,
          id: `${habit.id}-goal-${index + 1}`,
          from:
            fromAgo === undefined
              ? start
              : localDateKey(calendarDay(today, fromAgo)),
          weekdays: weekdays ?? allWeekdays,
          ...(period && { period: { ...period, anchor } }),
          ...(cycle && { cycle: { ...cycle, anchor } }),
        }),
      ),
    }),
  };
}

// A preset's description is its Info note; any other notes follow it.
function presetNotes(habit: SampleHabit): HabitNote[] {
  return [
    ...(habit.description
      ? [{ id: 'info', title: 'Info', text: habit.description }]
      : []),
    ...(habit.notes ?? []).map((note, index) => ({
      id: `note-${index + 1}`,
      ...note,
    })),
  ];
}

/** A deterministic event log for one preset, ending on `today`. */
export function createPresetEvents(id: string, today: string): StoredEvent[] {
  const preset = samplePresets.find((item) => item.id === id);
  if (!preset) throw new Error('Unknown sample preset.');
  const first = calendarDay(today, PRESET_DAYS - 1);
  const start = localDateKey(first);
  const monday = ordinal(weekAnchor(start, 'monday'));
  first.setHours(5, 0, 0, 0);
  const events: StoredEvent[] = [
    {
      ...eventMeta(1, `sample_${id}_1`, first),
      type: 'initialize',
      habits: preset.habits.map((habit) => definition(habit, start, today)),
      notes: Object.fromEntries(
        preset.habits
          .map((habit) => [habit.id, presetNotes(habit)] as const)
          .filter(([, notes]) => notes.length),
      ),
    },
  ];
  for (let ago = PRESET_DAYS - 1; ago >= 0; ago--) {
    const date = calendarDay(today, ago);
    const key = localDateKey(date);
    const weekday = date.getDay();
    const weekend = weekday === 0 || weekday === 6;
    const entries: { minute: number; habitId: string; value: EntryValue }[] =
      [];
    for (const habit of preset.habits) {
      const [hours, spread] = habit.at;
      if (ago === 0 && hours >= TODAY_CUTOFF) continue;
      const value = habit.value({
        ago,
        date: key,
        weekday,
        weekend,
        week: Math.floor((ordinal(key) - monday) / 7),
        progress: (PRESET_DAYS - 1 - ago) / (PRESET_DAYS - 1),
        chance: (salt = '') => chance(id, habit.id, key, salt),
      });
      if (value === null) continue;
      // Morning routines start an hour later at weekends.
      const offset = (chance(habit.id, key, 'time') * 2 - 1) * spread;
      const minute = Math.round(
        hours * 60 + offset + (weekend && hours < 10 ? 60 : 0),
      );
      entries.push({
        minute: Math.min(23 * 60 + 55, Math.max(5 * 60 + 30, minute)),
        habitId: habit.id,
        value: Array.isArray(value) ? categorySelection(value)! : value,
      });
    }
    // Keep each day's edits in time order so History reads naturally.
    entries.sort((left, right) => left.minute - right.minute);
    for (const { minute, habitId, value } of entries) {
      date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
      const metadata = eventMeta(
        events.length + 1,
        `sample_${id}_${events.length + 1}`,
        date,
      );
      events.push({
        ...metadata,
        type: 'change',
        groupId: metadata.id,
        change: {
          kind: 'entry',
          habitId,
          date: key,
          before: null,
          after: value,
        },
      });
    }
  }
  return events;
}
