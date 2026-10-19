// Rebasing (docs/SYNC.md): replay this device's unsent edits on top of the
// account's newer events. Each edit is re-checked against the current value:
// unchanged there, it applies as before; already made there, it is dropped;
// changed differently, the later edit wins and a conflict is recorded.
// Confirmed events are never altered; pending ones are renumbered and may be
// rewritten or dropped.
import { sameEntry, type EntryValue } from '../entries.ts';
import { habitNotes, MAX_NOTES } from '../notes.ts';
import type { Habit } from '../habits.ts';
import {
  applyChange,
  applyEvent,
  canCoalesce,
  describeChange,
  inverse,
  isPreference,
  preferenceBefore,
  replayEvents,
  sameValue,
  type BatchItem,
  type Change,
  type EventMeta,
  type HabitChange,
  type NoteSlot,
  type PreferenceChange,
  type StoredEvent,
  type StoredState,
} from '../storage/model.ts';
import type { SyncConflict } from './conflicts.ts';

export type RebaseInput = {
  /** Confirmed events then the newly pulled ones, numbered from 1. */
  base: StoredEvent[];
  /** How many of `base` were already confirmed before this pull. */
  confirmed: number;
  /** Arrival time of each pulled event at the mailbox, by event ID. */
  receivedAt: Record<string, string>;
  /** This device's unsent events, in order. */
  pending: StoredEvent[];
  localDevice: string;
  now: Date;
  newId: () => string;
};
export type RebaseResult = {
  events: StoredEvent[];
  conflicts: SyncConflict[];
  /** True when a pending edit was rewritten or dropped (not just moved). */
  changed: boolean;
};

const CLOCK_SLACK_MS = 5 * 60 * 1000;

// Device clocks can be wrong. A time later than the moment the edit could
// have reached the server is clearly wrong, so that moment is used instead.
function effectiveTime(recordedAt: string, latest: string): string {
  return Date.parse(recordedAt) > Date.parse(latest) + CLOCK_SLACK_MS
    ? latest
    : recordedAt;
}

// The values a change touches, so the guess can ask "which edit was later?".
function fieldKeys(change: Change): string[] {
  if (isPreference(change)) return [`p:${change.kind}`];
  switch (change.kind) {
    case 'entry':
      return [`e:${change.habitId}:${change.date}`];
    case 'entries':
      return Object.keys(change.after).map((d) => `e:${change.habitId}:${d}`);
    case 'colour':
      return [`c:${change.habitId}`];
    case 'habit': {
      if (!change.before || !change.after) return [`h:${change.habitId}`];
      const keys = new Set([
        ...Object.keys(change.before),
        ...Object.keys(change.after),
      ]);
      return [...keys]
        .filter(
          (key) =>
            !sameValue(
              (change.before as Record<string, unknown>)[key],
              (change.after as Record<string, unknown>)[key],
            ),
        )
        .map((key) => `h:${change.habitId}:${key}`);
    }
    case 'deleteHabit':
      return [`h:${change.habitId}`];
    case 'order':
      return ['o'];
    case 'note':
      return [change.before?.note.id, change.after?.note.id]
        .filter((id): id is string => !!id)
        .map((id) => `n:${change.habitId}:${id}`);
    case 'batch':
      return change.changes.flatMap(fieldKeys);
  }
  return [];
}

type Context = {
  remote: Map<string, string>;
  localTime: string;
  now: string;
  newId: () => string;
  conflicts: SyncConflict[];
};

function habitName(state: StoredState, habitId: string): string {
  return state.habits.find((habit) => habit.id === habitId)?.name ?? 'Habit';
}

// True when this device's edit is the later one. With no newer remote edit
// on record, the difference came from this device's own dropped edits.
function localWins(context: Context, key: string): boolean {
  const remote = context.remote.get(key);
  return remote === undefined || context.localTime > remote;
}

type ConflictFields = Pick<SyncConflict, 'kind' | 'habitId' | 'kept'> &
  Partial<
    Pick<
      SyncConflict,
      | 'date'
      | 'field'
      | 'noteId'
      | 'noteTitle'
      | 'thisValue'
      | 'otherValue'
      | 'summary'
    >
  > & { key?: string };

function conflict(
  context: Context,
  state: StoredState,
  fields: ConflictFields,
) {
  const { key, ...rest } = fields;
  context.conflicts.push({
    id: context.newId(),
    createdAt: context.now,
    habitName: rest.habitId ? habitName(state, rest.habitId) : 'Habit',
    thisAt: context.localTime,
    otherAt: key ? (context.remote.get(key) ?? null) : null,
    ...rest,
  });
}

function dropped(
  context: Context,
  state: StoredState,
  change: Change,
  summary: string,
) {
  const habitId = 'habitId' in change ? change.habitId : null;
  conflict(context, state, {
    kind: 'dropped',
    habitId,
    kept: 'other',
    summary: `${summary} (${describeChange(change, state)})`,
  });
}

// The entry change for the dates still to apply: none, one or a fill.
function entriesOf(
  habitId: string,
  before: Record<string, EntryValue | null>,
  after: Record<string, EntryValue | null>,
): HabitChange | null {
  const dates = Object.keys(after);
  if (dates.length === 0) return null;
  if (dates.length === 1)
    return {
      kind: 'entry',
      habitId,
      date: dates[0]!,
      before: before[dates[0]!]!,
      after: after[dates[0]!]!,
    };
  return { kind: 'entries', habitId, before, after };
}

function rebaseEntries(
  state: StoredState,
  context: Context,
  habitId: string,
  wanted: Record<
    string,
    { before: EntryValue | null; after: EntryValue | null }
  >,
): HabitChange | null {
  const before: Record<string, EntryValue | null> = {};
  const after: Record<string, EntryValue | null> = {};
  for (const [date, change] of Object.entries(wanted)) {
    const current = state.values[`${habitId}:${date}`] ?? null;
    if (sameEntry(current, change.after)) continue;
    const key = `e:${habitId}:${date}`;
    if (!sameEntry(current, change.before)) {
      const wins = localWins(context, key);
      conflict(context, state, {
        kind: 'entry',
        habitId,
        date,
        key,
        kept: wins ? 'this' : 'other',
        thisValue: change.after,
        otherValue: current,
      });
      if (!wins) continue;
    }
    before[date] = current;
    after[date] = change.after;
  }
  return entriesOf(habitId, before, after);
}

function rebaseDefinition(
  state: StoredState,
  context: Context,
  change: Extract<Change, { kind: 'habit' }>,
): HabitChange | null {
  const index = state.habits.findIndex((h) => h.id === change.habitId);
  const current = state.habits[index] ?? null;
  if (change.before === null) {
    if (current) return null;
    return { ...change, index: Math.min(change.index, state.habits.length) };
  }
  if (!current) {
    dropped(context, state, change, 'Its habit was deleted on another device');
    return null;
  }
  if (change.after === null) {
    if (sameValue(current, change.before)) return { ...change, index };
    dropped(context, state, change, 'It changed on another device');
    return null;
  }
  // Three-way merge, field by field.
  const before = change.before as Record<string, unknown>;
  const after = change.after as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...current };
  for (const field of new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ])) {
    if (sameValue(before[field], after[field])) continue;
    const value = merged[field];
    if (sameValue(value, after[field])) continue;
    let apply = sameValue(value, before[field]);
    if (!apply) {
      const key = `h:${change.habitId}:${field}`;
      apply = localWins(context, key);
      conflict(context, state, {
        kind: field === 'color' ? 'colour' : 'definition',
        habitId: change.habitId,
        field,
        key,
        kept: apply ? 'this' : 'other',
        thisValue: after[field],
        otherValue: value,
      });
    }
    if (apply) {
      if (after[field] === undefined) delete merged[field];
      else merged[field] = after[field];
    }
  }
  if (sameValue(merged, current)) return null;
  return {
    kind: 'habit',
    habitId: change.habitId,
    index,
    before: current,
    after: merged as Habit,
  };
}

function rebaseNote(
  state: StoredState,
  context: Context,
  change: Extract<Change, { kind: 'note' }>,
): HabitChange | null {
  const habit = state.habits.find((h) => h.id === change.habitId);
  if (!habit) {
    dropped(context, state, change, 'Its habit was deleted on another device');
    return null;
  }
  const notes = habitNotes(state, habit);
  const slot = (index: number, note: NoteSlot['note']): NoteSlot =>
    habit.description !== undefined && index === 0
      ? { index, note, legacy: true }
      : { index, note };
  if (!change.before) {
    const note = change.after!.note;
    if (notes.some((item) => item.id === note.id)) return null;
    if (notes.length >= MAX_NOTES) {
      dropped(context, state, change, 'The habit already has eight notes');
      return null;
    }
    return {
      ...change,
      after: { index: Math.min(change.after!.index, notes.length), note },
    };
  }
  const position = notes.findIndex(
    (note) => note.id === change.before!.note.id,
  );
  const current = notes[position];
  if (!current) {
    if (!change.after) return null;
    dropped(context, state, change, 'The note was removed on another device');
    return null;
  }
  if (!change.after) {
    if (sameValue(current, change.before.note))
      return { ...change, before: slot(position, current) };
    dropped(context, state, change, 'The note changed on another device');
    return null;
  }
  const key = `n:${change.habitId}:${current.id}`;
  const merged = { ...current };
  let disagreed = false;
  for (const field of ['title', 'text'] as const) {
    const wanted = change.after.note[field];
    if (wanted === change.before.note[field] || current[field] === wanted)
      continue;
    if (current[field] === change.before.note[field]) merged[field] = wanted;
    else disagreed = true;
  }
  if (disagreed) {
    const wins = localWins(context, key);
    conflict(context, state, {
      kind: 'note',
      habitId: change.habitId,
      noteId: current.id,
      noteTitle: current.title,
      key,
      kept: wins ? 'this' : 'other',
      thisValue: {
        title: change.after.note.title,
        text: change.after.note.text,
      },
      otherValue: { title: current.title, text: current.text },
    });
    if (wins) {
      merged.title = change.after.note.title;
      merged.text = change.after.note.text;
    }
  }
  const moved = change.after.index !== change.before.index;
  const index = moved
    ? Math.min(change.after.index, notes.length - 1)
    : position;
  const before = slot(position, current);
  if (!before.legacy && index === position && sameValue(merged, current))
    return null;
  return { ...change, before, after: { index, note: merged } };
}

function rebaseOrder(
  state: StoredState,
  change: Extract<Change, { kind: 'order' }>,
): HabitChange | null {
  // Keep this device's relative order for the habits it moved; habits added
  // elsewhere keep their places.
  const current = state.habits.map((habit) => habit.id);
  const moved = new Set(change.after.filter((id) => current.includes(id)));
  const ordered = change.after.filter((id) => moved.has(id));
  let next = 0;
  const after = current.map((id) => (moved.has(id) ? ordered[next++]! : id));
  if (sameValue(after, current)) return null;
  return { kind: 'order', before: current, after };
}

function rebaseChange(
  state: StoredState,
  context: Context,
  change: HabitChange,
): HabitChange | null {
  switch (change.kind) {
    case 'entry':
      if (!state.habits.some((h) => h.id === change.habitId)) {
        dropped(
          context,
          state,
          change,
          'Its habit was deleted on another device',
        );
        return null;
      }
      return rebaseEntries(state, context, change.habitId, {
        [change.date]: { before: change.before, after: change.after },
      });
    case 'entries':
      if (!state.habits.some((h) => h.id === change.habitId)) {
        dropped(
          context,
          state,
          change,
          'Its habit was deleted on another device',
        );
        return null;
      }
      return rebaseEntries(
        state,
        context,
        change.habitId,
        Object.fromEntries(
          Object.keys(change.after).map((date) => [
            date,
            { before: change.before[date]!, after: change.after[date]! },
          ]),
        ),
      );
    case 'colour': {
      const habit = state.habits.find((h) => h.id === change.habitId);
      if (!habit) {
        dropped(
          context,
          state,
          change,
          'Its habit was deleted on another device',
        );
        return null;
      }
      if (habit.color === change.after) return null;
      if (habit.color !== change.before) {
        const key = `c:${change.habitId}`;
        const wins = localWins(context, key);
        conflict(context, state, {
          kind: 'colour',
          habitId: change.habitId,
          key,
          kept: wins ? 'this' : 'other',
          thisValue: change.after,
          otherValue: habit.color,
        });
        if (!wins) return null;
      }
      return { ...change, before: habit.color };
    }
    case 'habit':
      return rebaseDefinition(state, context, change);
    case 'deleteHabit': {
      const index = state.habits.findIndex((h) => h.id === change.habitId);
      if (change.before) {
        if (index < 0) return null;
        const prefix = `${change.habitId}:`;
        const entries = Object.fromEntries(
          Object.entries(state.values)
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, value]) => [key.slice(prefix.length), value]),
        );
        if (
          sameValue(state.habits[index], change.before.habit) &&
          sameValue(entries, change.before.entries) &&
          sameValue(state.notes?.[change.habitId], change.before.notes)
        )
          return { ...change, index };
        conflict(context, state, {
          kind: 'deleteKept',
          habitId: change.habitId,
          kept: 'other',
        });
        return null;
      }
      if (index >= 0) return null;
      return { ...change, index: Math.min(change.index, state.habits.length) };
    }
    case 'order':
      return rebaseOrder(state, change);
    case 'note':
      return rebaseNote(state, context, change);
    case 'batch': {
      let working = state;
      const items: BatchItem[] = [];
      for (const item of change.changes) {
        const next = rebaseChange(working, context, item) as BatchItem | null;
        if (!next) continue;
        try {
          working = applyChange(working, next);
          items.push(next);
        } catch {
          dropped(context, working, item, 'It no longer applies');
        }
      }
      return items.length ? { ...change, changes: items } : null;
    }
  }
}

function rebasePreference(
  state: StoredState,
  context: Context,
  change: PreferenceChange,
): PreferenceChange | null {
  const current = preferenceBefore(state, change.kind);
  if (sameValue(current, change.after)) return null;
  if (
    !sameValue(current, change.before) &&
    !localWins(context, `p:${change.kind}`)
  )
    return null;
  return { ...change, before: current } as PreferenceChange;
}

function meta(
  event: StoredEvent,
  sequence: number,
): EventMeta & { version: 24 } {
  return {
    version: 24,
    id: event.id,
    sequence,
    recordedAt: event.recordedAt,
    timeZone: event.timeZone,
    utcOffsetMinutes: event.utcOffsetMinutes,
    ...(event.device ? { device: event.device } : {}),
  };
}

export function rebase(input: RebaseInput): RebaseResult {
  const now = input.now.toISOString();
  // The latest remote edit time for every value the pulled events touched.
  const remote = new Map<string, string>();
  for (const event of input.base.slice(input.confirmed)) {
    if (event.type === 'initialize') continue;
    const time = effectiveTime(
      event.recordedAt,
      input.receivedAt[event.id] ?? now,
    );
    for (const key of fieldKeys(event.change))
      if ((remote.get(key) ?? '') < time) remote.set(key, time);
  }
  const seen = new Set(input.base.map((event) => event.id));
  let replay = replayEvents(input.base, {
    localDevice: input.localDevice,
  }).replay;
  const events = [...input.base];
  const conflicts: SyncConflict[] = [];
  let changed = false;

  for (const pending of input.pending) {
    // Pushed before but unconfirmed (its reply was lost): already in place.
    if (seen.has(pending.id)) continue;
    if (pending.type === 'initialize' || pending.version < 24)
      throw new Error('Only edits made since sync was set up can be rebased.');
    const context: Context = {
      remote,
      localTime: effectiveTime(pending.recordedAt, now),
      now,
      newId: input.newId,
      conflicts,
    };
    const state = replay.state;
    const sequence = events.length + 1;
    let next: StoredEvent | null = null;
    if (pending.type === 'preference') {
      const change = rebasePreference(state, context, pending.change);
      if (change)
        next = { ...meta(pending, sequence), type: 'preference', change };
    } else if (
      pending.type === 'undo' &&
      replay.undo.at(-1)?.id === pending.targetId
    ) {
      // Still the newest action: undo it, with the inverse it has now.
      const target = replay.undo.at(-1)!;
      next = {
        ...meta(pending, sequence),
        type: 'undo',
        targetId: target.id,
        change: inverse(target.change) as HabitChange,
      };
    } else if (
      pending.type === 'redo' &&
      replay.redo.at(-1)?.undoId === pending.targetId
    ) {
      next = {
        ...meta(pending, sequence),
        type: 'redo',
        targetId: pending.targetId,
        change: replay.redo.at(-1)!.action.change,
      };
    } else {
      // Ordinary edits, and Undo/Redo whose target is no longer the newest
      // action, become ordinary edits checked value by value.
      const change = rebaseChange(
        state,
        context,
        pending.change as HabitChange,
      );
      if (change) {
        const eventMeta = meta(pending, sequence);
        const continues =
          pending.type === 'change' &&
          'groupId' in pending &&
          pending.groupId !== pending.id &&
          replay.lastGroup?.id === pending.groupId &&
          canCoalesce(replay.lastGroup, eventMeta, change);
        next = {
          ...eventMeta,
          type: 'change',
          groupId: continues ? pending.groupId : pending.id,
          change,
        };
      }
    }
    if (next) {
      try {
        replay = applyEvent(replay, next, input.localDevice);
      } catch {
        dropped(context, state, pending.change, 'It no longer applies');
        next = null;
      }
    }
    if (!next) {
      changed = true;
      continue;
    }
    if (!sameValue({ ...next, sequence: 0 }, { ...pending, sequence: 0 }))
      changed = true;
    events.push(next);
  }
  return { events, conflicts, changed };
}
