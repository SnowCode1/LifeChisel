import { MAX_DESCRIPTION_LENGTH } from './description.ts';
import type { Habit } from './habits.ts';
import type {
  HabitNote,
  HistoryAction,
  NoteChange,
  NoteSlot,
  StoredState,
} from './storage/types.ts';

export type { HabitNote, NoteChange, NoteSlot } from './storage/types.ts';

// A habit's notes (v23): a short ordered list of named Markdown documents,
// saved as their own `note` changes so habit edits never copy them. Keep this
// module free of replay/model imports: storage validation depends on it.

/** The id of a habit's v7 description, which reads as its first note. */
export const LEGACY_NOTE_ID = 'description';
/** The title a v7 description reads under, and the first preset. */
export const LEGACY_NOTE_TITLE = 'Info';
export const MAX_NOTES = 8;
export const MAX_NOTE_TITLE = 40;
export const MAX_NOTE_TEXT = MAX_DESCRIPTION_LENGTH;

export type NotePreset = { title: string; hint: string };
// Suggested titles only: nothing about a preset is saved except its title.
export const notePresets: readonly NotePreset[] = [
  { title: 'Info', hint: 'Anything worth keeping about this habit.' },
  { title: 'Why', hint: 'The reason you do it, for the days it feels hard.' },
  { title: 'Rules', hint: 'What counts, what doesn’t, and any exceptions.' },
  { title: 'How', hint: 'The steps, routine or setup that make it easy.' },
  { title: 'Cues', hint: 'When and where it happens, and what reminds you.' },
  { title: 'Links', hint: 'Articles, videos, playlists and tools.' },
  { title: 'Ideas', hint: 'Variations and things to try next.' },
  {
    title: 'Obstacles',
    hint: 'What gets in the way, and your plan for when it does.',
  },
];
const genericHint = 'Write anything worth keeping about this habit.';

const titleKey = (title: string) => normalizeNoteTitle(title).toLowerCase();

/** The preset hint for a title (any case), else a general prompt. */
export function noteHint(title: string): string {
  const key = titleKey(title);
  return (
    notePresets.find((preset) => preset.title.toLowerCase() === key)?.hint ??
    genericHint
  );
}

/** Presets whose titles this habit does not use yet, in preset order. */
export function availablePresets(notes: readonly HabitNote[]): NotePreset[] {
  const used = new Set(notes.map((note) => titleKey(note.title)));
  return notePresets.filter((preset) => !used.has(preset.title.toLowerCase()));
}

export function normalizeNoteTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
/** Line endings become \n; whitespace-only text is an empty note. */
export function normalizeNoteText(value: string): string {
  return value.trim() ? value.replace(/\r\n?/g, '\n') : '';
}
export function validNoteTitle(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= MAX_NOTE_TITLE &&
    value === normalizeNoteTitle(value) &&
    ![...value].some((character) => character.charCodeAt(0) < 32)
  );
}
export function validNoteText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_NOTE_TEXT;
}

/**
 * Why a title cannot be used, or null. Titles are unique per habit (ignoring
 * case) so the switcher and History rows always name one note.
 */
export function noteTitleProblem(
  notes: readonly HabitNote[],
  title: string,
  ignoreId?: string,
): string | null {
  const normalized = normalizeNoteTitle(title);
  if (!normalized) return 'Give the note a name.';
  if (normalized.length > MAX_NOTE_TITLE)
    return `Use ${MAX_NOTE_TITLE} characters or fewer.`;
  const key = normalized.toLowerCase();
  if (
    notes.some(
      (note) => note.id !== ignoreId && note.title.toLowerCase() === key,
    )
  )
    return 'This habit already has a note with that name.';
  return null;
}

const legacyNote = (text: string): HabitNote => ({
  id: LEGACY_NOTE_ID,
  title: LEGACY_NOTE_TITLE,
  text,
});
const empty: readonly HabitNote[] = Object.freeze([]);
// Rendering asks for the same habit's notes often; the habit object and its
// stored array change identity whenever either changes.
const cache = new WeakMap<
  Habit,
  { stored: readonly HabitNote[] | undefined; notes: readonly HabitNote[] }
>();

/**
 * The notes a habit shows, in order: a v7 description first (as Info), then
 * the notes saved with v23 changes.
 */
export function habitNotes(
  state: Pick<StoredState, 'notes'>,
  habit: Habit,
): readonly HabitNote[] {
  const stored = state.notes?.[habit.id];
  const cached = cache.get(habit);
  if (cached && cached.stored === stored) return cached.notes;
  const notes =
    habit.description === undefined
      ? (stored ?? empty)
      : [legacyNote(habit.description), ...(stored ?? [])];
  cache.set(habit, { stored, notes });
  return notes;
}

export function noteDraftKey(habitId: string, noteId: string): string {
  // The v7 description keeps the draft key it always had.
  return noteId === LEGACY_NOTE_ID
    ? `habit-${habitId}`
    : `habit-${habitId}-note-${noteId}`;
}

let counter = 0;
export function newNoteId(): string {
  counter = (counter + 1) % 1296;
  return `n${Date.now().toString(36)}${counter.toString(36)}${Math.floor(
    Math.random() * 46656,
  ).toString(36)}`;
}

type Owner = Pick<StoredState, 'habits' | 'notes'>;
function context(state: Owner, habitId: string) {
  const habit = state.habits.find((item) => item.id === habitId);
  return habit ? { habit, notes: habitNotes(state, habit) } : null;
}
function slot(habit: Habit, index: number, note: HabitNote): NoteSlot {
  return habit.description !== undefined && index === 0
    ? { index, note, legacy: true }
    : { index, note };
}
function change(
  habitId: string,
  before: NoteSlot | null,
  after: NoteSlot | null,
): NoteChange {
  return { kind: 'note', habitId, before, after };
}

/** A new note at the end, or null at the limit or with an unusable title. */
export function addNote(
  state: Owner,
  habitId: string,
  title: string,
  text = '',
  id = newNoteId(),
): NoteChange | null {
  const found = context(state, habitId);
  if (!found || found.notes.length >= MAX_NOTES) return null;
  if (found.notes.some((note) => note.id === id)) return null;
  if (noteTitleProblem(found.notes, title)) return null;
  return change(habitId, null, {
    index: found.notes.length,
    note: {
      id,
      title: normalizeNoteTitle(title),
      text: normalizeNoteText(text),
    },
  });
}

/** Retitle and/or rewrite one note in place; null when nothing changes. */
export function updateNote(
  state: Owner,
  habitId: string,
  noteId: string,
  update: { title?: string; text?: string },
): NoteChange | null {
  const found = context(state, habitId);
  if (!found) return null;
  const index = found.notes.findIndex((note) => note.id === noteId);
  if (index < 0) return null;
  const before = found.notes[index]!;
  const title =
    update.title === undefined
      ? before.title
      : normalizeNoteTitle(update.title);
  if (title !== before.title && noteTitleProblem(found.notes, title, noteId))
    return null;
  const text =
    update.text === undefined ? before.text : normalizeNoteText(update.text);
  if (title === before.title && text === before.text) return null;
  // Editing the v7 description moves it out of the definition, in place.
  return change(habitId, slot(found.habit, index, before), {
    index,
    note: { id: noteId, title, text },
  });
}

/** Swap a note with its neighbour (-1 earlier, +1 later). */
export function moveNote(
  state: Owner,
  habitId: string,
  noteId: string,
  direction: -1 | 1,
): NoteChange | null {
  const found = context(state, habitId);
  if (!found) return null;
  const from = found.notes.findIndex((note) => note.id === noteId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= found.notes.length) return null;
  // A v7 description must stay first while it lives in the definition, so
  // moving the second note up moves the description down instead.
  if (found.habit.description !== undefined && to === 0) {
    const first = found.notes[0]!;
    return change(habitId, slot(found.habit, 0, first), {
      index: 1,
      note: first,
    });
  }
  const note = found.notes[from]!;
  return change(habitId, slot(found.habit, from, note), { index: to, note });
}

/**
 * Move a note to another position (a drag). Usually one change; two while a
 * v7 description is first and another note goes above it: the description
 * leaves the definition in place, then the note moves. Empty when nothing
 * would change.
 */
export function moveNoteTo(
  state: Owner,
  habitId: string,
  noteId: string,
  to: number,
): NoteChange[] {
  const found = context(state, habitId);
  if (!found) return [];
  const from = found.notes.findIndex((note) => note.id === noteId);
  if (from < 0 || to < 0 || to >= found.notes.length || from === to) return [];
  const note = found.notes[from]!;
  if (found.habit.description !== undefined && to === 0) {
    const first = found.notes[0]!;
    return [
      change(habitId, slot(found.habit, 0, first), { index: 0, note: first }),
      change(habitId, { index: from, note }, { index: 0, note }),
    ];
  }
  return [change(habitId, slot(found.habit, from, note), { index: to, note })];
}

export function removeNote(
  state: Owner,
  habitId: string,
  noteId: string,
): NoteChange | null {
  const found = context(state, habitId);
  if (!found) return null;
  const index = found.notes.findIndex((note) => note.id === noteId);
  if (index < 0) return null;
  return change(habitId, slot(found.habit, index, found.notes[index]!), null);
}

/**
 * Restore a version's text onto the current note, or bring a removed note
 * back at the end under its old title (a new title if that one is taken).
 */
export function restoreNote(
  state: Owner,
  habitId: string,
  version: { id: string; title: string; text: string },
): NoteChange | null {
  const found = context(state, habitId);
  if (!found) return null;
  if (found.notes.some((note) => note.id === version.id))
    return updateNote(state, habitId, version.id, { text: version.text });
  if (!normalizeNoteText(version.text)) return null;
  let title = version.title;
  for (let copy = 2; noteTitleProblem(found.notes, title); copy++)
    title = `${version.title.slice(0, MAX_NOTE_TITLE - 4)} ${copy}`;
  return addNote(state, habitId, title, version.text, version.id);
}

export type NoteVersion = {
  action: HistoryAction;
  noteId: string;
  title: string;
  before: string;
  after: string;
};
const definitionNoteText = (habit: Habit | null) => habit?.description ?? '';

/**
 * What one History action did to a note's text, or null when it did not
 * change any note's text (renames and moves keep the same words).
 */
export function noteVersion(action: HistoryAction): NoteVersion | null {
  const change = action.change;
  if (change.kind === 'note') {
    const before = change.before?.note.text ?? '',
      after = change.after?.note.text ?? '';
    if (before === after) return null;
    const note = (change.after ?? change.before)!.note;
    return { action, noteId: note.id, title: note.title, before, after };
  }
  // Older description edits, including text written when a habit was made.
  if (
    change.kind === 'habit' &&
    change.after &&
    change.before?.description !== change.after.description
  )
    return {
      action,
      noteId: LEGACY_NOTE_ID,
      title: LEGACY_NOTE_TITLE,
      before: definitionNoteText(change.before),
      after: definitionNoteText(change.after),
    };
  return null;
}

/**
 * One note's active text versions, newest by sequence first. Repeated text
 * stays: an older Before may still hold words worth restoring.
 */
export function noteVersions(
  actions: readonly HistoryAction[],
  habitId: string,
  noteId: string,
): NoteVersion[] {
  const versions: NoteVersion[] = [];
  for (let index = actions.length - 1; index >= 0; index--) {
    const action = actions[index]!;
    if (!('habitId' in action.change) || action.change.habitId !== habitId)
      continue;
    const version = noteVersion(action);
    if (version && version.noteId === noteId) versions.push(version);
  }
  return versions;
}

/** A History summary such as "Rules note edited". */
export function noteChangeSummary(change: NoteChange): string {
  const { before, after } = change;
  if (!before) return `${after!.note.title} note added`;
  if (!after) return `${before.note.title} note removed`;
  if (before.note.title !== after.note.title)
    return before.note.text === after.note.text
      ? `${before.note.title} note renamed ${after.note.title}`
      : `${after.note.title} note renamed and edited`;
  if (before.note.text !== after.note.text)
    return after.note.text
      ? `${after.note.title} note edited`
      : `${after.note.title} note cleared`;
  return `${after.note.title} note moved`;
}
