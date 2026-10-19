// Changes that bring one state towards another (docs/SYNC.md), saved as one
// undoable batch: restoring a backup as changes, and combining this device's
// data into the account's on first sync. Every change is checked against the
// state it will apply to; anything that no longer fits is skipped and counted.
import { sameEntry, type EntryValue } from '../entries.ts';
import { habitType, type Habit } from '../habits.ts';
import {
  LEGACY_NOTE_ID,
  LEGACY_NOTE_TITLE,
  MAX_NOTES,
  habitNotes,
  newNoteId,
} from '../notes.ts';
import { MAX_FILL_DATES } from '../storage/validation.ts';
import {
  applyChange,
  sameValue,
  type BatchItem,
  type HabitNote,
  type StoredEvent,
  type StoredState,
} from '../storage/model.ts';

export type RestoreMode =
  /** Add habits, days and notes the current data lacks; change nothing else. */
  | 'missing'
  /** Make habits, days, notes and order match; extra habits are archived. */
  | 'match';
export type Plan = { changes: BatchItem[]; skipped: number };

/** True when a log holds habit actions, not just its first event and settings. */
export function hasHabitActions(events: readonly StoredEvent[]): boolean {
  return events.some(
    (event) =>
      event.type === 'change' || event.type === 'undo' || event.type === 'redo',
  );
}

class Builder {
  state: StoredState;
  changes: BatchItem[] = [];
  skipped = 0;
  constructor(state: StoredState) {
    this.state = state;
  }
  add(change: BatchItem | null) {
    if (!change) return;
    try {
      this.state = applyChange(this.state, change);
      this.changes.push(change);
    } catch {
      this.skipped++;
    }
  }
  plan(): Plan {
    return { changes: this.changes, skipped: this.skipped };
  }
}

function entriesFor(state: StoredState, habitId: string) {
  const prefix = `${habitId}:`;
  const entries = new Map<string, EntryValue>();
  for (const [key, value] of Object.entries(state.values))
    if (key.startsWith(prefix)) entries.set(key.slice(prefix.length), value);
  return entries;
}

// Set several days of one habit, as entry or fill changes of bounded size.
function setDays(
  builder: Builder,
  habitId: string,
  days: [string, EntryValue | null][],
) {
  const pending = days.filter(
    ([date, value]) =>
      !sameEntry(builder.state.values[`${habitId}:${date}`] ?? null, value),
  );
  for (let start = 0; start < pending.length; start += MAX_FILL_DATES) {
    const chunk = pending.slice(start, start + MAX_FILL_DATES);
    const before = Object.fromEntries(
      chunk.map(([date]) => [
        date,
        builder.state.values[`${habitId}:${date}`] ?? null,
      ]),
    );
    const after = Object.fromEntries(chunk);
    if (chunk.length === 1) {
      const [date, value] = chunk[0]!;
      builder.add({
        kind: 'entry',
        habitId,
        date,
        before: before[date]!,
        after: value,
      });
    } else builder.add({ kind: 'entries', habitId, before, after });
  }
}

// A habit's notes as shown, with a v7 description as its Info note.
function notesOf(state: StoredState, habit: Habit): HabitNote[] {
  return [...habitNotes(state, habit)];
}

function definitionWithout(habit: Habit): Habit {
  const { description: _description, ...rest } = habit;
  return rest;
}

// Create a habit at the end with its notes and days. From v24 (as from v23)
// a new definition carries no description; it becomes the Info note.
function createHabit(
  builder: Builder,
  habit: Habit,
  notes: HabitNote[],
  days: Map<string, EntryValue>,
) {
  builder.add({
    kind: 'habit',
    habitId: habit.id,
    index: builder.state.habits.length,
    before: null,
    after: definitionWithout(habit),
  });
  if (!builder.state.habits.some((item) => item.id === habit.id)) return;
  notes.slice(0, MAX_NOTES).forEach((note, index) =>
    builder.add({
      kind: 'note',
      habitId: habit.id,
      before: null,
      after: { index, note: { ...note } },
    }),
  );
  setDays(builder, habit.id, [...days]);
}

function addMissingNotes(
  builder: Builder,
  habitId: string,
  wanted: HabitNote[],
) {
  for (const note of wanted) {
    const habit = builder.state.habits.find((item) => item.id === habitId);
    if (!habit) return;
    const current = notesOf(builder.state, habit);
    if (current.length >= MAX_NOTES) return;
    if (
      current.some(
        (item) => item.title === note.title && item.text === note.text,
      )
    )
      continue;
    const id =
      note.id === LEGACY_NOTE_ID || current.some((item) => item.id === note.id)
        ? newNoteId()
        : note.id;
    builder.add({
      kind: 'note',
      habitId,
      before: null,
      after: { index: current.length, note: { ...note, id } },
    });
  }
}

function matchNotes(builder: Builder, habitId: string, wanted: HabitNote[]) {
  const ids = new Set(wanted.map((note) => note.id));
  const habit = () => builder.state.habits.find((item) => item.id === habitId)!;
  // Remove notes the target lacks (newest first keeps indexes valid).
  const current = notesOf(builder.state, habit());
  for (let index = current.length - 1; index >= 0; index--) {
    const note = current[index]!;
    if (ids.has(note.id)) continue;
    const legacy = habit().description !== undefined && index === 0;
    builder.add({
      kind: 'note',
      habitId,
      before: { index, note, ...(legacy ? { legacy: true } : {}) },
      after: null,
    });
  }
  wanted.slice(0, MAX_NOTES).forEach((note, index) => {
    const now = notesOf(builder.state, habit());
    const position = now.findIndex((item) => item.id === note.id);
    if (position < 0) {
      builder.add({
        kind: 'note',
        habitId,
        before: null,
        after: { index: Math.min(index, now.length), note: { ...note } },
      });
      return;
    }
    const existing = now[position]!;
    if (sameValue(existing, note) && position === index) return;
    const legacy = habit().description !== undefined && position === 0;
    builder.add({
      kind: 'note',
      habitId,
      before: {
        index: position,
        note: existing,
        ...(legacy ? { legacy: true } : {}),
      },
      after: { index: Math.min(index, now.length - 1), note: { ...note } },
    });
  });
}

function setDefinition(builder: Builder, target: Habit) {
  const index = builder.state.habits.findIndex((item) => item.id === target.id);
  const current = builder.state.habits[index];
  if (!current) return;
  // The description stays as it is; notes carry the text.
  const after = definitionWithout(target);
  const next =
    current.description === undefined
      ? after
      : { ...after, description: current.description };
  if (sameValue(next, current)) return;
  builder.add({
    kind: 'habit',
    habitId: target.id,
    index,
    before: current,
    after: next,
  });
}

/** Changes from `current` towards a backup's `target` state. */
export function restorePlan(
  current: StoredState,
  target: StoredState,
  mode: RestoreMode,
): Plan {
  const builder = new Builder(current);
  for (const habit of target.habits) {
    const exists = builder.state.habits.some((item) => item.id === habit.id);
    const days = entriesFor(target, habit.id);
    const notes = notesOf(target, habit);
    if (!exists) {
      createHabit(builder, habit, notes, days);
      continue;
    }
    if (mode === 'missing') {
      setDays(
        builder,
        habit.id,
        [...days].filter(
          ([date]) => builder.state.values[`${habit.id}:${date}`] === undefined,
        ),
      );
      addMissingNotes(builder, habit.id, notes);
      continue;
    }
    // Match: clear differing days first, so the definition can change, then
    // set the backup's days and notes.
    const now = entriesFor(builder.state, habit.id);
    setDays(
      builder,
      habit.id,
      [...now]
        .filter(([date, value]) => !sameEntry(days.get(date) ?? null, value))
        .map(([date]) => [date, null]),
    );
    setDefinition(builder, habit);
    setDays(builder, habit.id, [...days]);
    matchNotes(builder, habit.id, notes);
  }
  if (mode === 'match') {
    const kept = new Set(target.habits.map((habit) => habit.id));
    for (const habit of [...builder.state.habits])
      if (!kept.has(habit.id) && !habit.archived) {
        const index = builder.state.habits.findIndex((h) => h.id === habit.id);
        builder.add({
          kind: 'habit',
          habitId: habit.id,
          index,
          before: habit,
          after: { ...habit, archived: true },
        });
      }
    const ids = builder.state.habits.map((habit) => habit.id);
    const order = [
      ...target.habits
        .map((habit) => habit.id)
        .filter((id) => ids.includes(id)),
      ...ids.filter((id) => !kept.has(id)),
    ];
    if (!sameValue(order, ids))
      builder.add({ kind: 'order', before: ids, after: order });
  }
  return builder.plan();
}

/**
 * For combining: which cloud habit each of this device's habits is the same
 * as. The same ID always matches; otherwise the same name and kind is the
 * suggestion, for the person to confirm.
 */
export function suggestMatches(
  cloud: StoredState,
  local: StoredState,
): Record<string, string | null> {
  const name = (habit: Habit) => habit.name.trim().toLocaleLowerCase();
  const taken = new Set<string>();
  const matches: Record<string, string | null> = {};
  for (const habit of local.habits)
    if (cloud.habits.some((item) => item.id === habit.id)) {
      matches[habit.id] = habit.id;
      taken.add(habit.id);
    }
  for (const habit of local.habits) {
    if (matches[habit.id]) continue;
    const same = cloud.habits.find(
      (item) =>
        !taken.has(item.id) &&
        name(item) === name(habit) &&
        habitType(item) === habitType(habit),
    );
    matches[habit.id] = same?.id ?? null;
    if (same) taken.add(same.id);
  }
  return matches;
}

/**
 * This device's data added to the account's: matched habits gain the days
 * the cloud lacks and notes it does not have; others are created.
 */
export function combinePlan(
  cloud: StoredState,
  local: StoredState,
  matches: Record<string, string | null>,
  newId: () => string,
): Plan {
  const builder = new Builder(cloud);
  for (const habit of local.habits) {
    const days = entriesFor(local, habit.id);
    const notes = notesOf(local, habit);
    const target = matches[habit.id];
    if (target && builder.state.habits.some((item) => item.id === target)) {
      setDays(
        builder,
        target,
        [...days].filter(
          ([date]) => builder.state.values[`${target}:${date}`] === undefined,
        ),
      );
      addMissingNotes(builder, target, notes);
      continue;
    }
    // Kept separate: a fresh ID if the cloud already uses this one.
    const id = builder.state.habits.some((item) => item.id === habit.id)
      ? newId()
      : habit.id;
    createHabit(
      builder,
      { ...habit, id },
      notes.map((note) =>
        note.id === LEGACY_NOTE_ID && note.title === LEGACY_NOTE_TITLE
          ? { ...note, id: newNoteId() }
          : note,
      ),
      days,
    );
  }
  return builder.plan();
}
