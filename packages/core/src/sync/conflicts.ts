// Sync conflicts (docs/SYNC.md): when two devices changed the same value
// before syncing, the later edit is kept straight away and the case is
// listed for the person to review. Switching to the other value is an
// ordinary, undoable edit. Conflicts stay on the device that found them.
import { entryLabel, sameEntry, type EntryValue } from '../entries.ts';
import { updateNote } from '../notes.ts';
import { habitType, type Habit } from '../habits.ts';
import type { Change, StoredState } from '../storage/model.ts';
import type { StoredConflict } from '../storage/repository.ts';

export type ConflictKind =
  /** One day's value of one habit. */
  | 'entry'
  | 'colour'
  /** One field of a habit's definition (name, goals, icon…). */
  | 'definition'
  /** One note's text or title. */
  | 'note'
  /** This device deleted an archived habit that changed elsewhere; kept. */
  | 'deleteKept'
  /** A change that no longer applies at all (its habit is gone, say). */
  | 'dropped';

export type SyncConflict = StoredConflict & {
  kind: ConflictKind;
  habitId: string | null;
  habitName: string;
  date?: string;
  field?: string;
  noteId?: string;
  noteTitle?: string;
  /** Which value was kept: this device's edit or the other device's. */
  kept: 'this' | 'other';
  thisValue?: unknown;
  otherValue?: unknown;
  /** When each side's edit was made (the other side may be unknown). */
  thisAt: string;
  otherAt: string | null;
  /** For 'dropped': what this device had tried to do. */
  summary?: string;
};

/** The value that was not kept, which the person may switch to. */
export function alternativeValue(conflict: SyncConflict): unknown {
  return conflict.kept === 'this' ? conflict.otherValue : conflict.thisValue;
}

/**
 * The change that replaces the kept value with the other one, from the
 * current state; null when that is no longer possible or already true.
 * For 'deleteKept', the caller deletes through the store instead.
 */
export function conflictAlternative(
  state: StoredState,
  conflict: SyncConflict,
): Change | null {
  const index = state.habits.findIndex((h) => h.id === conflict.habitId);
  const habit = state.habits[index];
  if (!habit) return null;
  const value = alternativeValue(conflict);
  if (conflict.kind === 'entry' && conflict.date) {
    const current = state.values[`${habit.id}:${conflict.date}`] ?? null;
    const after = (value ?? null) as EntryValue | null;
    if (sameEntry(current, after)) return null;
    return {
      kind: 'entry',
      habitId: habit.id,
      date: conflict.date,
      before: current,
      after,
    };
  }
  if (conflict.kind === 'colour') {
    if (typeof value !== 'string' || value === habit.color) return null;
    return {
      kind: 'colour',
      habitId: habit.id,
      before: habit.color,
      after: value,
    };
  }
  if (conflict.kind === 'definition' && conflict.field) {
    const field = conflict.field as keyof Habit;
    if (field === 'id' || field === 'description') return null;
    const next = { ...habit } as Record<string, unknown>;
    if (value === undefined) delete next[field];
    else next[field] = value;
    if (JSON.stringify(next) === JSON.stringify(habit)) return null;
    return {
      kind: 'habit',
      habitId: habit.id,
      index,
      before: habit,
      after: next as Habit,
    };
  }
  if (conflict.kind === 'note' && conflict.noteId) {
    const other = value as { title: string; text: string } | undefined;
    if (!other) return null;
    return updateNote(state, habit.id, conflict.noteId, other);
  }
  return null;
}

const fieldNames: Record<string, string> = {
  name: 'name',
  color: 'colour',
  icon: 'icon',
  unit: 'unit',
  goals: 'goal',
  startDate: 'start date',
  archived: 'archive state',
  categories: 'categories',
  type: 'kind',
};

function short(text: string, limit = 60) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat || 'empty';
}

function valueLabel(
  conflict: SyncConflict,
  habit: Habit | undefined,
  value: unknown,
): string {
  if (conflict.kind === 'entry') {
    if (value === null || value === undefined) return 'blank';
    if (!habit) return String(value);
    const label = entryLabel(habit, value as EntryValue);
    const unit =
      habitType(habit) === 'number' && habit.unit ? ` ${habit.unit}` : '';
    return short(label + unit);
  }
  if (conflict.kind === 'note') {
    const note = value as { title: string; text: string } | undefined;
    return note ? `“${short(note.text)}”` : 'removed';
  }
  if (conflict.field === 'name' && typeof value === 'string')
    return `“${value}”`;
  if (conflict.field === 'archived') return value ? 'archived' : 'shown';
  if (conflict.kind === 'colour' && typeof value === 'string') return value;
  return value === undefined ? 'none' : 'a different one';
}

/** Plain wording for a conflict (shared by both apps' History views). */
export function conflictText(
  conflict: SyncConflict,
  state: StoredState,
  formatDate: (date: string) => string = (date) => date,
): { title: string; detail: string; canSwitch: boolean; switchLabel: string } {
  const habit = state.habits.find((item) => item.id === conflict.habitId);
  const name = habit?.name ?? conflict.habitName;
  if (conflict.kind === 'dropped')
    return {
      title: name,
      detail: `An edit from this device could not be applied: ${conflict.summary ?? 'it no longer fits'}.`,
      canSwitch: false,
      switchLabel: '',
    };
  if (conflict.kind === 'deleteKept')
    return {
      title: name,
      detail:
        'This device deleted it, but it changed on another device, so it was kept.',
      canSwitch: !!habit?.archived,
      switchLabel: 'Delete it',
    };
  const subject =
    conflict.kind === 'entry' && conflict.date
      ? `${name} · ${formatDate(conflict.date)}`
      : conflict.kind === 'note'
        ? `${name} · ${conflict.noteTitle ?? 'note'}`
        : `${name} · ${fieldNames[conflict.field ?? ''] ?? (conflict.kind === 'colour' ? 'colour' : 'details')}`;
  const mine = valueLabel(conflict, habit, conflict.thisValue);
  const theirs = valueLabel(conflict, habit, conflict.otherValue);
  const detail =
    conflict.kept === 'this'
      ? `Kept this device’s ${mine}; another device had ${theirs}.`
      : `Kept another device’s ${theirs}; this device had ${mine}.`;
  return {
    title: subject,
    detail,
    canSwitch: !!habit && conflictAlternative(state, conflict) !== null,
    switchLabel: `Use ${conflict.kept === 'this' ? theirs : mine}`,
  };
}
