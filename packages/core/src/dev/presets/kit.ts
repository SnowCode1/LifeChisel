import type { EntryValue } from '../../entries.ts';
import type { HabitGoal } from '../../habitGoals.ts';
import type { GoalCycle, GoalPeriod } from '../../goalTiming.ts';
import type { Habit } from '../../habits.ts';

// Shared vocabulary for the fictional marketing presets. Each preset lists its
// habits with a usual logging time and a pure per-day value, so a preset reads
// as a description of someone's routine rather than as event plumbing.

/** A deterministic number in [0, 1) for any combination of parts. */
export function chance(...parts: (string | number)[]): number {
  let value = 2166136261;
  for (const character of parts.join(':'))
    value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  // A final avalanche step spreads nearby keys (consecutive dates) apart.
  value = Math.imul(value ^ (value >>> 15), 2246822507);
  value = Math.imul(value ^ (value >>> 13), 3266489909);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export type SampleDay = {
  /** Days before today; 0 is today. */
  ago: number;
  /** Local date key. */
  date: string;
  /** 0 Sunday … 6 Saturday, as saved goal weekdays. */
  weekday: number;
  weekend: boolean;
  /** Whole weeks since the Monday on or before the first sample day. */
  week: number;
  /** 0 on the first sample day, rising to 1 today. */
  progress: number;
  /** A deterministic number in [0, 1) for this habit, date and salt. */
  chance: (salt?: string) => number;
};

/** One dated goal; the builder supplies its id, start and anchors. */
export type SampleGoal = {
  rule: HabitGoal['rule'];
  weekdays?: number[];
  defaultChecked?: boolean;
  period?: Omit<GoalPeriod, 'anchor'>;
  cycle?: Omit<GoalCycle, 'anchor'>;
  /** Days before today this version starts; omitted means the first day. */
  fromAgo?: number;
};

export type SampleHabit = Omit<
  Habit,
  'startDate' | 'goals' | 'archived' | 'type'
> & {
  type: NonNullable<Habit['type']>;
  goals?: SampleGoal[];
  /** Notes after the Info note (the description), in order. */
  notes?: { title: string; text: string }[];
  /** Usual local logging time in hours, and its spread in minutes. */
  at: [hours: number, spread: number];
  /** The day's saved value, or null to leave it blank. */
  value: (day: SampleDay) => EntryValue | null;
};

export type SamplePreset = {
  id: string;
  name: string;
  /** Who this is and what it shows off, for the development picker. */
  summary: string;
  habits: SampleHabit[];
};

export const pick = <T>(items: readonly T[], roll: number): T =>
  items[Math.min(items.length - 1, Math.floor(roll * items.length))];
export const step = (value: number, size: number) =>
  Math.round(Math.round(value / size) * size * 100) / 100;
export const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));
/** A checked box when the roll beats the rate, otherwise blank. */
export const tick = (roll: number, rate: number) => (roll < rate ? 1 : null);
/**
 * Text from a list of more than nine lines: neighbouring days step 5–9
 * places apart, so a line never repeats on consecutive days.
 */
export const line = (items: readonly string[], day: SampleDay) =>
  items[(day.ago * 7 + Math.floor(day.chance('line') * 3)) % items.length];
