import { validGoalTimeline } from '../habitGoals.ts';
import {
  validEntryText,
  MAX_CATEGORIES,
  MAX_CATEGORY_LABEL,
  MAX_CATEGORY_SHORT_LABEL,
  type EntryValue,
} from '../entries.ts';
import { isTextScale } from '../textSize.ts';
import { validDescription } from '../description.ts';
import {
  LEGACY_NOTE_ID,
  LEGACY_NOTE_TITLE,
  MAX_NOTES,
  validNoteText,
  validNoteTitle,
} from '../notes.ts';
import {
  isCheckboxStyle,
  isColumnSpacing,
  isConnectorThickness,
  isNameColumnWidth,
  isWeekStart,
} from '../displayPreferences.ts';
import { isRowSpacing } from '../rowSpacing.ts';
import { isGridSize } from '../gridSizing.ts';
import { isThemeMode } from '../theme.ts';
import { isHabitIcon } from '../habitIcons.ts';
import { habitType, type Habit } from '../habits.ts';
import { isPreference, sameValue } from './changeUtils.ts';
import type { Change, HabitNote, StoredEvent } from './types.ts';

// Exact field/version validation stays independent of state transitions. Keep
// historical version gates and rejection messages unchanged during refactoring.
// The most dates one v22 fill may change (about ten years).
export const MAX_FILL_DATES = 3660;
/** v24: changes in one batch (a restore or combine of a large history). */
export const MAX_BATCH_CHANGES = 20000;
export function insist(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function object(value: unknown): asserts value is Record<string, unknown> {
  insist(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'Expected an object.',
  );
}
function keys(value: Record<string, unknown>, expected: string[]) {
  insist(
    Object.keys(value).length === expected.length &&
      expected.every((key) => Object.hasOwn(value, key)),
    'Unrecognized or missing fields.',
  );
}
function id(value: unknown): asserts value is string {
  insist(
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value),
    'Invalid identifier.',
  );
}
function colour(value: unknown): asserts value is string {
  insist(
    typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value),
    'Invalid colour.',
  );
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
function amount(value: unknown): asserts value is number | null {
  insist(
    value === null ||
      (typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= Number.MAX_SAFE_INTEGER),
    'Invalid daily value.',
  );
}
function validateNote(value: unknown): asserts value is HabitNote {
  object(value);
  keys(value, ['id', 'title', 'text']);
  id(value.id);
  insist(validNoteTitle(value.title), 'Invalid note title.');
  insist(validNoteText(value.text), 'Invalid note text.');
}
// A saved list is never empty: a habit without notes has no entry at all.
function validateNoteList(value: unknown): asserts value is HabitNote[] {
  insist(
    Array.isArray(value) && value.length > 0 && value.length <= MAX_NOTES,
    'Invalid note list.',
  );
  const ids = new Set<string>();
  for (const note of value) {
    validateNote(note);
    insist(!ids.has(note.id), 'Repeated note identifier.');
    ids.add(note.id);
  }
}
function validateHabit(
  value: unknown,
  version: number,
): asserts value is Habit {
  object(value);
  keys(value, [
    'id',
    'name',
    'color',
    ...[
      'unit',
      ...(version >= 3 ? ['type', 'archived'] : []),
      ...(version >= 4 ? ['icon'] : []),
      ...(version >= 5 ? ['startDate'] : []),
      ...(version >= 7 ? ['description'] : []),
      ...(version >= 10 ? ['categories'] : []),
      ...(version >= 11 ? ['goals'] : []),
    ].filter((key) => Object.hasOwn(value, key)),
  ]);
  id(value.id);
  if (Object.hasOwn(value, 'goals'))
    insist(
      validGoalTimeline(
        value.goals,
        value as Habit,
        version >= 13,
        version >= 14,
      ),
      'Invalid goal timeline or rule.',
    );
  colour(value.color);
  insist(
    typeof value.name === 'string' &&
      value.name.trim().length > 0 &&
      value.name.length <= 200,
    'Invalid habit name.',
  );
  if (Object.hasOwn(value, 'unit'))
    insist(
      typeof value.unit === 'string' &&
        value.unit.trim().length > 0 &&
        value.unit.length <= 80,
      'Invalid unit.',
    );
  if (Object.hasOwn(value, 'type'))
    insist(
      value.type === 'checkbox' ||
        value.type === 'number' ||
        (version >= 10 &&
          (value.type === 'categorical' || value.type === 'text')),
      'Invalid habit type.',
    );
  if (Object.hasOwn(value, 'description'))
    insist(validDescription(value.description), 'Invalid habit description.');
  if (Object.hasOwn(value, 'startDate'))
    insist(validDate(value.startDate), 'Invalid habit start date.');
  if (Object.hasOwn(value, 'icon'))
    insist(isHabitIcon(value.icon), 'Invalid habit icon.');
  if (Object.hasOwn(value, 'archived'))
    insist(typeof value.archived === 'boolean', 'Invalid archived state.');
  insist(
    !value.unit || habitType(value as Habit) === 'number',
    'Only numeric habits can have a unit.',
  );
  if (Object.hasOwn(value, 'categories')) {
    insist(
      value.type === 'categorical',
      'Only categorical habits have categories.',
    );
    insist(
      Array.isArray(value.categories) &&
        value.categories.length > 0 &&
        value.categories.length <= MAX_CATEGORIES,
      'Invalid categories.',
    );
    const ids = new Set<string>();
    for (const option of value.categories) {
      object(option);
      keys(option, [
        'id',
        'label',
        ...['shortLabel', 'archived'].filter((key) =>
          Object.hasOwn(option, key),
        ),
      ]);
      id(option.id);
      insist(!ids.has(option.id), 'Repeated category identifier.');
      ids.add(option.id);
      insist(
        typeof option.label === 'string' &&
          option.label.trim().length > 0 &&
          option.label.length <= MAX_CATEGORY_LABEL,
        'Invalid category label.',
      );
      if (Object.hasOwn(option, 'shortLabel'))
        insist(
          typeof option.shortLabel === 'string' &&
            option.shortLabel.trim().length > 0 &&
            option.shortLabel.length <= MAX_CATEGORY_SHORT_LABEL,
          'Invalid short category label.',
        );
      if (Object.hasOwn(option, 'archived'))
        insist(
          typeof option.archived === 'boolean',
          'Invalid archived category.',
        );
    }
    insist(
      value.categories.some((option) => !option.archived),
      'Keep at least one active category.',
    );
  }
  insist(
    value.type !== 'categorical' || Object.hasOwn(value, 'categories'),
    'Categorical habits need categories.',
  );
}
function dailyValue(value: unknown, version: number) {
  if (version < 10 || value === null || typeof value === 'number')
    return amount(value);
  if (typeof value === 'string')
    return insist(validEntryText(value), 'Invalid text entry.');
  insist(
    Array.isArray(value) && value.length > 0 && value.length <= MAX_CATEGORIES,
    'Invalid category selection.',
  );
  for (const item of value) id(item);
  insist(
    new Set(value).size === value.length &&
      value.every((item, index) => index === 0 || value[index - 1] < item),
    'Category selections must be unique and sorted.',
  );
}
export function entryFits(
  habit: Habit,
  value: EntryValue | null,
  version = 23,
) {
  if (value === null) return true;
  switch (habitType(habit)) {
    case 'checkbox':
      return value === 1 || (version >= 14 && value === 0);
    case 'number':
      return typeof value === 'number';
    case 'text':
      return typeof value === 'string';
    case 'categorical':
      return (
        Array.isArray(value) &&
        value.every((id) =>
          habit.categories?.some((option) => option.id === id),
        )
      );
  }
}
export function validateChange(
  value: unknown,
  version = 24,
): asserts value is Change {
  object(value);
  if (value.kind === 'batch') {
    insist(version >= 24, 'Batches require version 24.');
    keys(value, ['kind', 'label', 'changes']);
    insist(
      value.label === 'restore' || value.label === 'combine',
      'Invalid batch label.',
    );
    insist(
      Array.isArray(value.changes) &&
        value.changes.length > 0 &&
        value.changes.length <= MAX_BATCH_CHANGES,
      `A batch holds 1 to ${MAX_BATCH_CHANGES} changes.`,
    );
    for (const item of value.changes) {
      validateChange(item, version);
      insist(
        item.kind !== 'batch' && !isPreference(item),
        'A batch holds habit changes only.',
      );
    }
    return;
  }
  if (value.kind === 'entry') {
    keys(value, ['kind', 'habitId', 'date', 'before', 'after']);
    id(value.habitId);
    insist(validDate(value.date), 'Invalid calendar date.');
    dailyValue(value.before, version);
    dailyValue(value.after, version);
  } else if (value.kind === 'entries') {
    insist(version >= 22, 'Multi-day fills require version 22.');
    keys(value, ['kind', 'habitId', 'before', 'after']);
    id(value.habitId);
    object(value.before);
    object(value.after);
    const before = value.before,
      after = value.after;
    const dates = Object.keys(before);
    // One date is an ordinary entry change; the bound keeps one action small.
    insist(
      dates.length >= 2 && dates.length <= MAX_FILL_DATES,
      'A fill needs 2 to 3660 dates.',
    );
    insist(
      Object.keys(after).length === dates.length &&
        dates.every((date) => Object.hasOwn(after, date)),
      'A fill needs the same dates before and after.',
    );
    for (const date of dates) {
      insist(validDate(date), 'Invalid calendar date.');
      dailyValue(before[date], version);
      dailyValue(after[date], version);
      insist(
        !sameValue(before[date], after[date]),
        'Every filled date must change.',
      );
    }
  } else if (value.kind === 'note') {
    insist(version >= 23, 'Notes require version 23.');
    keys(value, ['kind', 'habitId', 'before', 'after']);
    id(value.habitId);
    insist(value.before !== null || value.after !== null, 'Missing note.');
    for (const side of [value.before, value.after]) {
      if (side === null) continue;
      object(side);
      const legacy = Object.hasOwn(side, 'legacy');
      keys(side, ['index', 'note', ...(legacy ? ['legacy'] : [])]);
      insist(
        Number.isSafeInteger(side.index) &&
          Number(side.index) >= 0 &&
          Number(side.index) < MAX_NOTES,
        'Invalid note position.',
      );
      validateNote(side.note);
      // The definition's v7 description, read as the first note (Info).
      if (legacy)
        insist(
          side.legacy === true &&
            side.index === 0 &&
            side.note.id === LEGACY_NOTE_ID &&
            side.note.title === LEGACY_NOTE_TITLE &&
            validDescription(side.note.text),
          'Invalid description note.',
        );
    }
    const before = value.before as { note: HabitNote; legacy?: true } | null,
      after = value.after as { note: HabitNote; legacy?: true } | null;
    if (before && after) {
      insist(before.note.id === after.note.id, 'Note identity cannot change.');
      insist(
        !(before.legacy && after.legacy),
        'A description note changes by leaving the definition.',
      );
    }
  } else if (value.kind === 'colour') {
    keys(value, ['kind', 'habitId', 'before', 'after']);
    id(value.habitId);
    colour(value.before);
    colour(value.after);
  } else if (value.kind === 'habit') {
    keys(value, ['kind', 'habitId', 'index', 'before', 'after']);
    id(value.habitId);
    insist(
      Number.isSafeInteger(value.index) && Number(value.index) >= 0,
      'Invalid habit position.',
    );
    insist(
      value.before !== null || value.after !== null,
      'Missing habit definition.',
    );
    for (const habit of [value.before, value.after])
      if (habit !== null) {
        validateHabit(habit, version);
        insist(habit.id === value.habitId, 'Habit identity cannot change.');
      }
  } else if (value.kind === 'deleteHabit') {
    insist(version >= 12, 'Habit deletion requires version 12.');
    keys(value, ['kind', 'habitId', 'index', 'before', 'after']);
    id(value.habitId);
    insist(
      Number.isSafeInteger(value.index) && Number(value.index) >= 0,
      'Invalid habit position.',
    );
    insist(
      (value.before === null) !== (value.after === null),
      'Deletion needs exactly one habit snapshot.',
    );
    const snapshot = value.before ?? value.after;
    object(snapshot);
    const notes = version >= 23 && Object.hasOwn(snapshot, 'notes');
    keys(snapshot, ['habit', 'entries', ...(notes ? ['notes'] : [])]);
    if (notes) validateNoteList(snapshot.notes);
    validateHabit(snapshot.habit, version);
    insist(
      snapshot.habit.id === value.habitId && snapshot.habit.archived === true,
      'Only archived habits can be deleted.',
    );
    object(snapshot.entries);
    for (const [date, entry] of Object.entries(snapshot.entries)) {
      insist(validDate(date), 'Invalid calendar date.');
      dailyValue(entry, version);
      insist(
        entry !== null &&
          entryFits(snapshot.habit, entry as EntryValue, version),
        'Invalid deleted habit entry.',
      );
    }
  } else if (value.kind === 'order') {
    keys(value, ['kind', 'before', 'after']);
    for (const order of [value.before, value.after]) {
      insist(
        Array.isArray(order) && order.length <= 1000,
        'Invalid habit order.',
      );
      order.forEach(id);
      insist(new Set(order).size === order.length, 'Repeated habit in order.');
    }
  } else if (
    value.kind === 'columnSpacing' ||
    value.kind === 'weekStart' ||
    value.kind === 'dateFading'
  ) {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 6, 'Display preferences require version 6.');
    const valid =
      value.kind === 'columnSpacing'
        ? isColumnSpacing
        : value.kind === 'weekStart'
          ? isWeekStart
          : (item: unknown) => typeof item === 'boolean';
    insist(
      valid(value.before) && valid(value.after),
      'Invalid display preference.',
    );
  } else if (value.kind === 'columnDensity') {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 17, 'Revised column spacing requires version 17.');
    insist(
      isColumnSpacing(value.before) && isColumnSpacing(value.after),
      'Invalid revised column spacing.',
    );
  } else if (value.kind === 'nameColumnWidth') {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 17, 'Name column width requires version 17.');
    insist(
      isNameColumnWidth(value.before) && isNameColumnWidth(value.after),
      'Invalid name column width.',
    );
  } else if (
    value.kind === 'gridNameWidth' ||
    value.kind === 'gridColumnWidth' ||
    value.kind === 'gridRowHeight'
  ) {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 18, 'Grid size sliders require version 18.');
    insist(
      (value.before === null || isGridSize(value.kind, value.before)) &&
        isGridSize(value.kind, value.after),
      'Invalid grid size.',
    );
  } else if (value.kind === 'themeMode') {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 19, 'Theme preferences require version 19.');
    insist(
      (value.before === null || isThemeMode(value.before)) &&
        isThemeMode(value.after),
      'Invalid theme.',
    );
  } else if (
    value.kind === 'darkBackground' ||
    value.kind === 'lightBackground'
  ) {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 19, 'Theme preferences require version 19.');
    // Only the stored shape is strict; display fits the colour to its range,
    // so a later range change can never make old events unreplayable.
    const hex = (background: unknown) =>
      typeof background === 'string' && /^#[0-9A-F]{6}$/.test(background);
    insist(
      (value.before === null || hex(value.before)) && hex(value.after),
      'Invalid background colour.',
    );
  } else if (
    value.kind === 'todayOutlines' ||
    value.kind === 'missedDays' ||
    value.kind === 'joinedCheckboxes' ||
    value.kind === 'streakNumbers' ||
    value.kind === 'roundCheckboxes'
  ) {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 20, 'Cell look preferences require version 20.');
    insist(
      (value.before === null || typeof value.before === 'boolean') &&
        typeof value.after === 'boolean',
      'Invalid cell look preference.',
    );
  } else if (value.kind === 'connectorThickness') {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 20, 'Cell look preferences require version 20.');
    insist(
      (value.before === null || isConnectorThickness(value.before)) &&
        isConnectorThickness(value.after),
      'Invalid connector thickness.',
    );
  } else if (value.kind === 'joinedEndsOnly') {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 21, 'Streak ends only requires version 21.');
    insist(
      (value.before === null || typeof value.before === 'boolean') &&
        typeof value.after === 'boolean',
      'Invalid cell look preference.',
    );
  } else if (value.kind === 'weekDividers' || value.kind === 'tapAnimations') {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 16, 'Grid appearance toggles require version 16.');
    insist(
      typeof value.before === 'boolean' && typeof value.after === 'boolean',
      'Invalid grid appearance toggle.',
    );
  } else if (value.kind === 'checkboxStyle') {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 15, 'Checkbox style requires version 15.');
    insist(
      isCheckboxStyle(value.before) && isCheckboxStyle(value.after),
      'Invalid checkbox style.',
    );
  } else if (value.kind === 'hideCompleted') {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 9, 'Completed visibility requires version 9.');
    insist(
      typeof value.before === 'boolean' && typeof value.after === 'boolean',
      'Invalid completed visibility.',
    );
  } else if (value.kind === 'textScale') {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 8, 'Text size requires version 8.');
    insist(
      isTextScale(value.before) && isTextScale(value.after),
      'Invalid text size.',
    );
  } else if (value.kind === 'rowSpacing') {
    keys(value, ['kind', 'before', 'after']);
    insist(version >= 5, 'Row spacing requires version 5.');
    insist(
      isRowSpacing(value.before) && isRowSpacing(value.after),
      'Invalid row spacing.',
    );
  } else if (value.kind === 'haptics') {
    keys(value, ['kind', 'before', 'after']);
    insist(
      typeof value.before === 'boolean' && typeof value.after === 'boolean',
      'Invalid preference.',
    );
  } else throw new Error('Unsupported change type.');
  insist(
    !sameValue(value.before, value.after),
    'A change must change a value.',
  );
}
export function validateEvent(value: unknown): asserts value is StoredEvent {
  object(value);
  const common = [
    'version',
    'id',
    'sequence',
    'recordedAt',
    'timeZone',
    'utcOffsetMinutes',
    'type',
  ];
  insist(
    value.version === 1 ||
      value.version === 2 ||
      value.version === 3 ||
      value.version === 4 ||
      value.version === 5 ||
      value.version === 6 ||
      value.version === 7 ||
      value.version === 8 ||
      value.version === 9 ||
      value.version === 10 ||
      value.version === 11 ||
      value.version === 12 ||
      value.version === 13 ||
      value.version === 14 ||
      value.version === 15 ||
      value.version === 16 ||
      value.version === 17 ||
      value.version === 18 ||
      value.version === 19 ||
      value.version === 20 ||
      value.version === 21 ||
      value.version === 22 ||
      value.version === 23 ||
      value.version === 24,
    'Unsupported event version.',
  );
  // From v24 every event names the device that wrote it.
  const device = value.version >= 24;
  if (device) id(value.device);
  else
    insist(!Object.hasOwn(value, 'device'), 'Device IDs require version 24.');
  id(value.id);
  insist(
    Number.isSafeInteger(value.sequence) && Number(value.sequence) > 0,
    'Invalid sequence.',
  );
  insist(
    typeof value.recordedAt === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.recordedAt) &&
      new Date(value.recordedAt).toISOString() === value.recordedAt,
    'Invalid edit timestamp.',
  );
  insist(
    typeof value.timeZone === 'string' &&
      value.timeZone.length > 0 &&
      value.timeZone.length <= 100,
    'Invalid time zone.',
  );
  insist(
    Number.isInteger(value.utcOffsetMinutes) &&
      Math.abs(Number(value.utcOffsetMinutes)) <= 840,
    'Invalid UTC offset.',
  );
  if (value.type === 'initialize') {
    const notes = value.version >= 23 && Object.hasOwn(value, 'notes');
    keys(value, [
      ...common,
      'habits',
      ...(notes ? ['notes'] : []),
      ...(device ? ['device'] : []),
    ]);
    insist(
      Array.isArray(value.habits) &&
        (value.habits.length > 0 || value.version >= 3) &&
        value.habits.length <= 1000,
      'Invalid initial habits.',
    );
    const ids = new Set<string>();
    for (const habit of value.habits) {
      validateHabit(habit, value.version);
      insist(!ids.has(habit.id), 'Duplicate habit identifier.');
      ids.add(habit.id);
      // From v23 new stores write notes, not definition descriptions.
      insist(
        value.version < 23 || !Object.hasOwn(habit, 'description'),
        'Notes are saved as notes from version 23.',
      );
    }
    if (notes) {
      object(value.notes);
      for (const [habitId, list] of Object.entries(value.notes)) {
        insist(ids.has(habitId), 'Notes for an unknown habit.');
        validateNoteList(list);
      }
    }
  } else if (
    value.type === 'change' ||
    value.type === 'undo' ||
    value.type === 'redo' ||
    (value.version !== 1 && value.type === 'preference')
  ) {
    const grouped = value.version !== 1 && value.type === 'change';
    keys(value, [
      ...common,
      'change',
      ...(value.type === 'undo' || value.type === 'redo' ? ['targetId'] : []),
      ...(grouped ? ['groupId'] : []),
      ...(device ? ['device'] : []),
    ]);
    validateChange(value.change, value.version);
    insist(
      value.version >= 3 ||
        (value.change.kind !== 'habit' && value.change.kind !== 'order'),
      'Habit management requires version 3.',
    );
    // From v23 notes are saved as note changes. Undo/Redo still invert older
    // description edits exactly, so only new habit actions are restricted.
    if (
      value.version >= 23 &&
      value.type === 'change' &&
      value.change.kind === 'habit' &&
      value.change.after
    )
      insist(
        value.change.before?.description === value.change.after.description,
        'Notes are saved as note changes from version 23.',
      );
    // Only Undo/Redo may put a note back into a definition's description.
    if (value.type === 'change' && value.change.kind === 'note')
      insist(
        !value.change.after?.legacy,
        'Notes are saved as note changes from version 23.',
      );
    if (value.type === 'undo' || value.type === 'redo') id(value.targetId);
    if (grouped) id(value.groupId);
    if (value.version !== 1)
      insist(
        value.type === 'preference'
          ? isPreference(value.change)
          : !isPreference(value.change),
        'Preferences cannot be habit actions.',
      );
  } else throw new Error('Unsupported event type.');
}
