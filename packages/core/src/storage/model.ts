import { entryLabel, sameEntry } from '../entries.ts';
import { fillSummary } from '../entryFill.ts';
import {
  displayDefaults,
  effectiveColumnSpacing,
} from '../displayPreferences.ts';
import { habitType, isNumericHabit, type Habit } from '../habits.ts';
import {
  LEGACY_NOTE_ID,
  LEGACY_NOTE_TITLE,
  MAX_NOTES,
  noteChangeSummary,
} from '../notes.ts';
import {
  inverse,
  isDevicePreference,
  isNoChange,
  isPreference,
  sameValue,
} from './changeUtils.ts';
import {
  entryFits,
  insist,
  validateChange,
  validateEvent,
} from './validation.ts';
import type {
  Change,
  DevicePreferenceKind,
  EventMeta,
  HabitChange,
  HabitNote,
  NoteChange,
  HistoryAction,
  PreferenceChange,
  Replay,
  StoredEvent,
  StoredState,
} from './types.ts';

// Preserve this public entry point for existing stores, exports and consumers.
// Runtime dependency direction: types -> utilities/validation -> replay.
export type * from './types.ts';
export {
  inverse,
  isDevicePreference,
  isNoChange,
  isPreference,
  sameValue,
} from './changeUtils.ts';
export { validDate, validateChange, validateEvent } from './validation.ts';

export const emptyReplay = (): Replay => ({
  state: { habits: [], values: {}, hapticsEnabled: true },
  undo: [],
  redo: [],
  lastGroup: null,
  legacyUndo: [],
  legacyRedo: [],
  hasV2: false,
  hasV3: false,
  hasV4: false,
  hasV5: false,
  hasV6: false,
  hasV7: false,
  hasV8: false,
  hasV9: false,
  hasV10: false,
  hasV11: false,
  hasV12: false,
  hasV13: false,
  hasV14: false,
  hasV15: false,
  hasV16: false,
  hasV17: false,
  hasV18: false,
  hasV19: false,
  hasV20: false,
  hasV21: false,
  hasV22: false,
  hasV23: false,
  hasV24: false,
});
export const GROUP_INACTIVITY_MS = 2 * 60 * 1000;

function sameChange(left: Change, right: Change): boolean {
  if (left.kind === 'batch' || right.kind === 'batch')
    return sameValue(left, right);
  if (left.kind === 'order')
    return (
      right.kind === 'order' &&
      sameValue(left.before, right.before) &&
      sameValue(left.after, right.after)
    );
  if (left.kind === 'habit' || left.kind === 'deleteHabit')
    return (
      right.kind === left.kind &&
      left.habitId === right.habitId &&
      left.index === right.index &&
      sameValue(left.before, right.before) &&
      sameValue(left.after, right.after)
    );
  return (
    left.kind === right.kind &&
    sameValue(left.before, right.before) &&
    sameValue(left.after, right.after) &&
    (isPreference(left) ||
      (!isPreference(right) && left.habitId === right.habitId)) &&
    (left.kind !== 'entry' ||
      (right.kind === 'entry' && left.date === right.date))
  );
}
/**
 * Apply one event. `localDevice` is the replaying device; without it every
 * event counts as this device's own, which is always true of local edits.
 */
export function applyEvent(
  previous: Replay,
  event: StoredEvent,
  localDevice?: string,
): Replay {
  return reduceEvent(previous, event, false, localDevice);
}
function sameField(left: Change, right: Change) {
  if (
    left.kind === 'deleteHabit' ||
    left.kind === 'habit' ||
    left.kind === 'order' ||
    left.kind === 'entries' ||
    left.kind === 'note' ||
    left.kind === 'batch' ||
    right.kind === 'batch' ||
    right.kind === 'deleteHabit' ||
    right.kind === 'habit' ||
    right.kind === 'order' ||
    right.kind === 'entries' ||
    right.kind === 'note'
  )
    return false;
  return (
    left.kind === right.kind &&
    (isPreference(left) ||
      (!isPreference(right) && left.habitId === right.habitId)) &&
    (left.kind !== 'entry' ||
      (right.kind === 'entry' && left.date === right.date))
  );
}
function editDay(meta: EventMeta): string {
  return new Date(Date.parse(meta.recordedAt) + meta.utcOffsetMinutes * 60000)
    .toISOString()
    .slice(0, 10);
}
export function canCoalesce(
  group: HistoryAction | null,
  meta: EventMeta,
  change: HabitChange,
): boolean {
  if (
    !group ||
    change.kind === 'habit' ||
    change.kind === 'deleteHabit' ||
    change.kind === 'order' ||
    change.kind === 'entries' ||
    change.kind === 'note' ||
    change.kind === 'batch'
  )
    return false;
  const elapsed = Date.parse(meta.recordedAt) - Date.parse(group.recordedAt);
  return (
    group.change.kind !== 'batch' &&
    sameField(group.change, change) &&
    sameValue(group.change.after, change.before) &&
    elapsed >= 0 &&
    elapsed < GROUP_INACTIVITY_MS &&
    group.timeZone === meta.timeZone &&
    group.utcOffsetMinutes === meta.utcOffsetMinutes &&
    editDay(group) === editDay(meta)
  );
}
function actionFrom(event: EventMeta, change: HabitChange): HistoryAction {
  return {
    ...event,
    type: 'change',
    change,
    firstRecordedAt: event.recordedAt,
    firstSequence: event.sequence,
    editCount: 1,
    lastChangedSequence: event.sequence,
  };
}
// Replay owns its fresh state; live reductions preserve previous snapshots.
function reduceEvent(
  previous: Replay,
  event: StoredEvent,
  mutable: boolean,
  localDevice?: string,
): Replay {
  validateEvent(event);
  if (event.type === 'initialize') {
    insist(
      event.sequence === 1 &&
        !previous.hasV2 &&
        previous.state.habits.length === 0,
      'Initialization must be first and unique.',
    );
    return {
      ...emptyReplay(),
      state: {
        habits: event.habits.map((habit) => ({ ...habit })),
        values: {},
        hapticsEnabled: true,
        ...(event.notes && Object.keys(event.notes).length
          ? {
              notes: Object.fromEntries(
                Object.entries(event.notes).map(([id, notes]) => [
                  id,
                  notes.map((note) => ({ ...note })),
                ]),
              ),
            }
          : {}),
      },
      hasV2: event.version !== 1,
      hasV3: event.version >= 3,
      hasV4: event.version >= 4,
      hasV5: event.version >= 5,
      hasV6: event.version >= 6,
      hasV7: event.version >= 7,
      hasV8: event.version >= 8,
      hasV9: event.version >= 9,
      hasV10: event.version >= 10,
      hasV11: event.version >= 11,
      hasV12: event.version >= 12,
      hasV13: event.version >= 13,
      hasV14: event.version >= 14,
      hasV15: event.version >= 15,
      hasV16: event.version >= 16,
      hasV17: event.version >= 17,
      hasV18: event.version >= 18,
      hasV19: event.version >= 19,
      hasV20: event.version >= 20,
      hasV21: event.version >= 21,
      hasV22: event.version >= 22,
      hasV23: event.version >= 23,
      hasV24: event.version >= 24,
    };
  }
  insist(
    previous.hasV2 || previous.state.habits.length > 0,
    'Missing initialization.',
  );
  insist(
    !previous.hasV2 || event.version !== 1,
    'Legacy events cannot follow version-2 events.',
  );
  insist(
    !previous.hasV3 || event.version >= 3,
    'Older events cannot follow version-3 events.',
  );
  insist(
    !previous.hasV4 || event.version >= 4,
    'Older events cannot follow version-4 events.',
  );
  insist(
    !previous.hasV5 || event.version >= 5,
    'Older events cannot follow version-5 events.',
  );
  insist(
    !previous.hasV6 || event.version >= 6,
    'Older events cannot follow version-6 events.',
  );
  insist(
    !previous.hasV7 || event.version >= 7,
    'Older events cannot follow version-7 events.',
  );
  insist(
    !previous.hasV8 || event.version >= 8,
    'Older events cannot follow version-8 events.',
  );
  insist(
    !previous.hasV9 || event.version >= 9,
    'Older events cannot follow version-9 events.',
  );
  insist(
    !previous.hasV10 || event.version >= 10,
    'Older events cannot follow version-10 events.',
  );
  insist(
    !previous.hasV11 || event.version >= 11,
    'Older events cannot follow version-11 events.',
  );
  insist(
    !previous.hasV24 || event.version >= 24,
    'Older events cannot follow version-24 events.',
  );
  insist(
    !previous.hasV23 || event.version >= 23,
    'Older events cannot follow version-23 events.',
  );
  insist(
    !previous.hasV22 || event.version >= 22,
    'Older events cannot follow version-22 events.',
  );
  insist(
    !previous.hasV21 || event.version >= 21,
    'Older events cannot follow version-21 events.',
  );
  insist(
    !previous.hasV20 || event.version >= 20,
    'Older events cannot follow version-20 events.',
  );
  insist(
    !previous.hasV19 || event.version >= 19,
    'Older events cannot follow version-19 events.',
  );
  insist(
    !previous.hasV18 || event.version >= 18,
    'Older events cannot follow version-18 events.',
  );
  insist(
    !previous.hasV17 || event.version >= 17,
    'Older events cannot follow version-17 events.',
  );
  insist(
    !previous.hasV16 || event.version >= 16,
    'Older events cannot follow version-16 events.',
  );
  insist(
    !previous.hasV15 || event.version >= 15,
    'Older events cannot follow version-15 events.',
  );
  insist(
    !previous.hasV14 || event.version >= 14,
    'Older events cannot follow version-14 events.',
  );
  insist(
    !previous.hasV13 || event.version >= 13,
    'Older events cannot follow version-13 events.',
  );
  insist(
    !previous.hasV12 || event.version >= 12,
    'Older events cannot follow version-12 events.',
  );
  const undo = mutable ? previous.undo : [...previous.undo];
  const redo = mutable ? previous.redo : [...previous.redo];
  let legacyUndo = mutable ? previous.legacyUndo : [...previous.legacyUndo];
  let legacyRedo = mutable ? previous.legacyRedo : [...previous.legacyRedo];
  let lastGroup = previous.lastGroup;
  if (event.version === 1) {
    // Interpret historical v1 undo exactly as written, including old preferences.
    if (event.type === 'undo') {
      const target = legacyUndo.at(-1);
      insist(
        target &&
          target.id === event.targetId &&
          sameChange(event.change, inverse(target.change)),
        'Invalid legacy undo target or inverse.',
      );
      legacyUndo.pop();
      legacyRedo.push(event);
      if (!isPreference(event.change)) {
        const action = undo.at(-1);
        insist(
          action && action.id === event.targetId,
          'Invalid habit undo target.',
        );
        undo.pop();
        redo.push({ action, undoId: event.id });
      }
    } else if (event.type === 'redo') {
      const target = legacyRedo.at(-1);
      insist(
        target &&
          target.id === event.targetId &&
          sameChange(event.change, inverse(target.change)),
        'Invalid legacy redo target or inverse.',
      );
      legacyRedo.pop();
      legacyUndo.push(event);
      if (!isPreference(event.change)) {
        const targetAction = redo.at(-1);
        insist(
          targetAction && targetAction.undoId === event.targetId,
          'Invalid habit redo target.',
        );
        redo.pop();
        // v1 used the redo event ID as the next undo target. Keep that identity.
        undo.push({
          ...targetAction.action,
          id: event.id,
          lastChangedSequence: event.sequence,
        });
      }
    } else {
      legacyUndo.push(event);
      legacyRedo.length = 0;
      // Old preference edits also abandoned the redo branch. Respect that
      // recorded v1 behaviour; only new v2 preferences preserve habit redo.
      redo.length = 0;
      if (!isPreference(event.change)) {
        undo.push(actionFrom(event, event.change));
      }
    }
    lastGroup = null;
  } else {
    legacyUndo = [];
    legacyRedo = [];
    if (event.type === 'change') {
      let action: HistoryAction;
      if (event.groupId === event.id) action = actionFrom(event, event.change);
      else {
        insist(
          lastGroup &&
            lastGroup.id === event.groupId &&
            canCoalesce(lastGroup, event, event.change),
          'Invalid edit group or inactivity window.',
        );
        if (!isNoChange(lastGroup.change)) {
          insist(
            undo.at(-1)?.id === lastGroup.id,
            'Group is no longer the latest action.',
          );
          undo.pop();
        }
        action = {
          ...lastGroup,
          recordedAt: event.recordedAt,
          sequence: event.sequence,
          change: {
            ...event.change,
            before: (lastGroup.change as { before: unknown }).before,
          } as HabitChange,
          editCount: lastGroup.editCount + 1,
          lastChangedSequence: event.sequence,
        };
      }
      if (!isNoChange(action.change)) undo.push(action);
      redo.length = 0;
      lastGroup =
        action.change.kind === 'habit' ||
        action.change.kind === 'deleteHabit' ||
        action.change.kind === 'order' ||
        action.change.kind === 'entries' ||
        action.change.kind === 'note' ||
        action.change.kind === 'batch'
          ? null
          : action;
    } else if (event.type === 'undo') {
      const target = undo.at(-1);
      insist(
        target &&
          target.id === event.targetId &&
          sameChange(event.change, inverse(target.change)),
        'Invalid grouped undo target or inverse.',
      );
      undo.pop();
      redo.push({ action: target, undoId: event.id });
      lastGroup = null;
    } else if (event.type === 'redo') {
      const target = redo.at(-1);
      insist(
        target &&
          target.undoId === event.targetId &&
          sameChange(event.change, target.action.change),
        'Invalid grouped redo target or change.',
      );
      redo.pop();
      undo.push({ ...target.action, lastChangedSequence: event.sequence });
      lastGroup = null;
    }
    // Preferences only update saved state. They leave habit undo/redo/groups intact.
  }
  // v24: another device's device-scoped preferences apply here only until
  // this device makes its own choice (see reduceDevicePreference).
  const foreign =
    event.version >= 24 &&
    localDevice !== undefined &&
    event.device !== localDevice;
  return {
    state: reduceChange(
      previous.state,
      event.change,
      mutable,
      event.version,
      foreign,
    ),
    undo,
    redo,
    lastGroup,
    legacyUndo,
    legacyRedo,
    hasV2: previous.hasV2 || event.version !== 1,
    hasV3: previous.hasV3 || event.version >= 3,
    hasV4: previous.hasV4 || event.version >= 4,
    hasV5: previous.hasV5 || event.version >= 5,
    hasV6: previous.hasV6 || event.version >= 6,
    hasV7: previous.hasV7 || event.version >= 7,
    hasV8: previous.hasV8 || event.version >= 8,
    hasV9: previous.hasV9 || event.version >= 9,
    hasV10: previous.hasV10 || event.version >= 10,
    hasV11: previous.hasV11 || event.version >= 11,
    hasV12: previous.hasV12 || event.version >= 12,
    hasV13: previous.hasV13 || event.version >= 13,
    hasV14: previous.hasV14 || event.version >= 14,
    hasV15: previous.hasV15 || event.version >= 15,
    hasV16: previous.hasV16 || event.version >= 16,
    hasV17: previous.hasV17 || event.version >= 17,
    hasV18: previous.hasV18 || event.version >= 18,
    hasV19: previous.hasV19 || event.version >= 19,
    hasV20: previous.hasV20 || event.version >= 20,
    hasV21: previous.hasV21 || event.version >= 21,
    hasV22: previous.hasV22 || event.version >= 22,
    hasV23: previous.hasV23 || event.version >= 23,
    hasV24: previous.hasV24 || event.version >= 24,
  };
}
const firstThemeDefaults = {
  themeMode: 'system',
  darkBackground: '#000000',
  lightBackground: '#FFFFFF',
} as const;
export function applyChange(state: StoredState, change: Change): StoredState {
  return reduceChange(state, change, false);
}
// v24 device-scoped preferences. This device's own events (and every event
// before v24) check their before-value and replace any inherited value.
// Another device's choice applies only while this device has none of its
// own, and is then marked inherited; haptics has a default, so it never
// inherits. Validation of foreign events is shape-only: their before-value
// describes the other device's view, not this one's.
function reduceDevicePreference(
  state: StoredState,
  change: Extract<Change, { kind: DevicePreferenceKind }>,
  mutable: boolean,
  version: number,
): StoredState {
  const kind = change.kind;
  const inherited = state.inheritedPreferences ?? [];
  if (
    kind === 'haptics' ||
    (state[kind] !== undefined && !inherited.includes(kind))
  )
    return state;
  const next = reduceChange(
    { ...state, [kind]: undefined, inheritedPreferences: undefined },
    { ...change, before: initialPreference(state, change) } as Change,
    mutable,
    version,
  );
  return withInherited(next, [...inherited.filter((k) => k !== kind), kind]);
}
// The before-value a first choice on this device would carry.
function initialPreference(
  state: StoredState,
  change: Extract<Change, { kind: DevicePreferenceKind }>,
): unknown {
  return preferenceBefore(
    { ...state, [change.kind]: undefined } as StoredState,
    change.kind,
  );
}
/**
 * The before-value a preference change made now must carry: the saved value,
 * or the absent-field default its precondition expects (see reduceChange).
 */
export function preferenceBefore(
  state: StoredState,
  kind: PreferenceChange['kind'],
): unknown {
  if (kind === 'haptics') return state.hapticsEnabled;
  if (kind === 'columnSpacing') return state.columnSpacing ?? 'compact';
  if (kind === 'columnDensity') return effectiveColumnSpacing(state);
  if (kind === 'rowSpacing') return state.rowSpacing ?? 'standard';
  if (
    kind === 'nameColumnWidth' ||
    kind === 'weekStart' ||
    kind === 'weekDividers' ||
    kind === 'tapAnimations' ||
    kind === 'checkboxStyle' ||
    kind === 'dateFading' ||
    kind === 'textScale' ||
    kind === 'hideCompleted'
  )
    return state[kind] ?? displayDefaults[kind];
  return state[kind] ?? null;
}
function withInherited(
  state: StoredState,
  inherited: DevicePreferenceKind[],
): StoredState {
  const { inheritedPreferences: _previous, ...rest } = state;
  const record = rest as Record<string, unknown>;
  for (const key of Object.keys(record))
    if (record[key] === undefined) delete record[key];
  return inherited.length ? { ...rest, inheritedPreferences: inherited } : rest;
}
function reduceChange(
  state: StoredState,
  change: Change,
  mutable: boolean,
  version = 24,
  foreign = false,
): StoredState {
  validateChange(change, version);
  if (change.kind === 'batch') {
    let next = state;
    for (const item of change.changes)
      next = reduceChange(next, item, false, version);
    return next;
  }
  if (isDevicePreference(change)) {
    if (foreign) return reduceDevicePreference(state, change, mutable, version);
    if (state.inheritedPreferences?.includes(change.kind)) {
      const next = reduceChange(
        { ...state, inheritedPreferences: undefined },
        change,
        false,
        version,
      );
      return withInherited(
        next,
        state.inheritedPreferences.filter((kind) => kind !== change.kind),
      );
    }
  }
  let next: StoredState;
  if (
    change.kind === 'columnSpacing' ||
    change.kind === 'columnDensity' ||
    change.kind === 'nameColumnWidth' ||
    change.kind === 'weekStart' ||
    change.kind === 'weekDividers' ||
    change.kind === 'tapAnimations' ||
    change.kind === 'checkboxStyle' ||
    change.kind === 'dateFading' ||
    change.kind === 'textScale' ||
    change.kind === 'hideCompleted'
  ) {
    insist(
      (change.kind === 'columnSpacing'
        ? (state.columnSpacing ?? 'compact')
        : change.kind === 'columnDensity'
          ? effectiveColumnSpacing(state)
          : (state[change.kind] ?? displayDefaults[change.kind])) ===
        change.before,
      'Preference precondition failed.',
    );
    next = { ...state, [change.kind]: change.after };
  } else if (
    change.kind === 'themeMode' ||
    change.kind === 'darkBackground' ||
    change.kind === 'lightBackground'
  ) {
    // Like grid sizes, `before` is null until the first choice. Development
    // builds on 10 October 2026 briefly wrote that era's defaults instead;
    // accept those so logs from that day still replay.
    const stored = state[change.kind];
    insist(
      stored === undefined
        ? change.before === null ||
            change.before === firstThemeDefaults[change.kind]
        : stored === change.before,
      'Preference precondition failed.',
    );
    next = { ...state, [change.kind]: change.after };
  } else if (
    change.kind === 'todayOutlines' ||
    change.kind === 'missedDays' ||
    change.kind === 'joinedCheckboxes' ||
    change.kind === 'streakNumbers' ||
    change.kind === 'roundCheckboxes' ||
    change.kind === 'connectorThickness' ||
    change.kind === 'joinedEndsOnly'
  ) {
    // `before` is null until the first choice, so defaults stay display rules.
    const stored = state[change.kind];
    insist(
      stored === undefined ? change.before === null : stored === change.before,
      'Preference precondition failed.',
    );
    next = { ...state, [change.kind]: change.after };
  } else if (
    change.kind === 'gridNameWidth' ||
    change.kind === 'gridColumnWidth' ||
    change.kind === 'gridRowHeight'
  ) {
    insist(
      (state[change.kind] ?? null) === change.before,
      'Preference precondition failed.',
    );
    next = { ...state, [change.kind]: change.after };
  } else if (change.kind === 'rowSpacing') {
    insist(
      (state.rowSpacing ?? 'standard') === change.before,
      'Preference precondition failed.',
    );
    if (mutable) {
      state.rowSpacing = change.after;
      next = state;
    } else next = { ...state, rowSpacing: change.after };
  } else if (change.kind === 'haptics') {
    insist(
      state.hapticsEnabled === change.before,
      'Preference precondition failed.',
    );
    if (mutable) {
      state.hapticsEnabled = change.after;
      next = state;
    } else next = { ...state, hapticsEnabled: change.after };
  } else if (change.kind === 'order') {
    const current = state.habits.map((habit) => habit.id);
    insist(
      sameValue(current, change.before) &&
        change.after.length === current.length &&
        change.after.every((id) => current.includes(id)),
      'Order precondition failed.',
    );
    const byId = new Map(state.habits.map((habit) => [habit.id, habit]));
    next = { ...state, habits: change.after.map((id) => byId.get(id)!) };
  } else if (change.kind === 'deleteHabit') {
    const prefix = `${change.habitId}:`;
    const entries = Object.fromEntries(
      Object.entries(state.values)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key.slice(prefix.length), value]),
    );
    const habits = [...state.habits];
    const values = { ...state.values };
    const stored = state.notes?.[change.habitId];
    let notes = state.notes;
    if (change.before) {
      insist(
        sameValue(habits[change.index], change.before.habit) &&
          sameValue(entries, change.before.entries) &&
          sameValue(stored, change.before.notes),
        'Deleted habit precondition failed.',
      );
      habits.splice(change.index, 1);
      for (const date of Object.keys(entries))
        delete values[`${prefix}${date}`];
      if (stored) notes = withNotes(state.notes, change.habitId, []);
    } else {
      insist(
        change.index <= habits.length &&
          habits.length < 1000 &&
          !habits.some((habit) => habit.id === change.habitId) &&
          !Object.keys(entries).length &&
          !stored,
        'Deleted habit restore precondition failed.',
      );
      habits.splice(change.index, 0, { ...change.after!.habit });
      for (const [date, entry] of Object.entries(change.after!.entries))
        values[`${prefix}${date}`] = entry;
      if (change.after!.notes)
        notes = withNotes(
          state.notes,
          change.habitId,
          change.after!.notes.map((note) => ({ ...note })),
        );
    }
    next = withStateNotes({ ...state, habits, values }, notes);
  } else if (change.kind === 'habit') {
    const current = state.habits[change.index] ?? null;
    const stored = state.notes?.[change.habitId];
    if (change.before === null) {
      insist(
        change.index <= state.habits.length &&
          !state.habits.some((habit) => habit.id === change.habitId) &&
          state.habits.length < 1000 &&
          !stored,
        'Habit already exists or position is invalid.',
      );
    } else
      insist(sameValue(current, change.before), 'Habit precondition failed.');
    if (change.after === null)
      insist(
        !Object.keys(state.values).some((key) =>
          key.startsWith(`${change.habitId}:`),
        ) && !stored,
        'Cannot remove a habit with entries.',
      );
    // A description reads as the first note, so it cannot appear beside a
    // saved note that took its place (Undo reaches that note first).
    if (
      change.after?.description !== undefined &&
      change.before?.description === undefined
    )
      insist(
        !stored?.some((note) => note.id === LEGACY_NOTE_ID) &&
          (stored?.length ?? 0) < MAX_NOTES,
        'Habit precondition failed.',
      );
    if (
      change.before &&
      change.after &&
      habitType(change.before) !== habitType(change.after)
    )
      insist(
        !Object.keys(state.values).some((key) =>
          key.startsWith(`${change.habitId}:`),
        ),
        'Cannot change type while entries exist.',
      );
    if (change.after) {
      const prefix = `${change.habitId}:`;
      insist(
        Object.entries(state.values).every(
          ([key, value]) =>
            !key.startsWith(prefix) || entryFits(change.after!, value, version),
        ),
        'Cannot remove categories referenced by entries; archive them instead.',
      );
    }
    const habits = [...state.habits];
    habits.splice(
      change.index,
      change.before === null ? 0 : 1,
      ...(change.after ? [{ ...change.after }] : []),
    );
    next = { ...state, habits };
  } else {
    const habit = state.habits.find((habit) => habit.id === change.habitId);
    insist(habit, 'Unknown habit.');
    if (change.kind === 'colour') {
      insist(habit.color === change.before, 'Colour precondition failed.');
      if (mutable) {
        habit.color = change.after;
        next = state;
      } else
        next = {
          ...state,
          habits: state.habits.map((habit) =>
            habit.id === change.habitId
              ? { ...habit, color: change.after }
              : habit,
          ),
        };
    } else if (change.kind === 'note') {
      next = reduceNote(state, habit, change);
    } else if (change.kind === 'entries') {
      // Every date must still hold its recorded before-value, as for one entry.
      const dates = Object.keys(change.before);
      for (const date of dates) {
        insist(
          sameEntry(
            state.values[`${change.habitId}:${date}`] ?? null,
            change.before[date],
          ),
          'Daily value precondition failed.',
        );
        insist(
          entryFits(habit, change.before[date], version) &&
            entryFits(habit, change.after[date], version),
          'Daily value does not match habit type or categories.',
        );
      }
      const values = mutable ? state.values : { ...state.values };
      for (const date of dates) {
        const key = `${change.habitId}:${date}`;
        const after = change.after[date];
        if (after === null) delete values[key];
        else values[key] = after;
      }
      next = mutable ? state : { ...state, values };
    } else {
      const key = `${change.habitId}:${change.date}`;
      insist(
        sameEntry(state.values[key] ?? null, change.before),
        'Daily value precondition failed.',
      );
      insist(
        [change.before, change.after].every((value) =>
          entryFits(habit, value, version),
        ),
        'Daily value does not match habit type or categories.',
      );
      const values = mutable ? state.values : { ...state.values };
      if (change.after === null) delete values[key];
      else values[key] = change.after;
      next = mutable ? state : { ...state, values };
    }
  }
  return next;
}
function withNotes(
  notes: StoredState['notes'],
  habitId: string,
  list: HabitNote[],
): StoredState['notes'] {
  const next = { ...notes };
  if (list.length) next[habitId] = list;
  else delete next[habitId];
  return Object.keys(next).length ? next : undefined;
}
function withStateNotes(
  state: StoredState,
  notes: StoredState['notes'],
): StoredState {
  if (notes === state.notes) return state;
  const { notes: _notes, ...rest } = state;
  return notes ? { ...rest, notes } : rest;
}
// Notes apply to the list as shown: a v7 description first (the `legacy`
// slot), then saved notes. The description must stay first while it lives in
// the definition; any other slot moves the note into the saved list.
function reduceNote(
  state: StoredState,
  habit: Habit,
  change: NoteChange,
): StoredState {
  type Item = { note: HabitNote; legacy: boolean };
  const items: Item[] = [
    ...(habit.description !== undefined
      ? [
          {
            note: {
              id: LEGACY_NOTE_ID,
              title: LEGACY_NOTE_TITLE,
              text: habit.description,
            },
            legacy: true,
          },
        ]
      : []),
    ...(state.notes?.[habit.id] ?? []).map((note) => ({
      note,
      legacy: false,
    })),
  ];
  if (change.before) {
    const current = items[change.before.index];
    insist(
      current &&
        current.legacy === !!change.before.legacy &&
        sameValue(current.note, change.before.note),
      'Note precondition failed.',
    );
    items.splice(change.before.index, 1);
  }
  if (change.after) {
    const { index, note } = change.after;
    insist(
      index <= items.length &&
        items.length < MAX_NOTES &&
        !items.some((item) => item.note.id === note.id),
      'Note position or identity is invalid.',
    );
    items.splice(index, 0, {
      note: { ...note },
      legacy: !!change.after.legacy,
    });
  }
  insist(
    items.every((item, index) => !item.legacy || index === 0),
    'A description note must stay first.',
  );
  const description = items[0]?.legacy ? items[0].note.text : undefined;
  const stored = items.filter((item) => !item.legacy).map((item) => item.note);
  let habits = state.habits;
  if (description !== habit.description) {
    const { description: _description, ...definition } = habit;
    const updated: Habit =
      description === undefined ? definition : { ...definition, description };
    habits = state.habits.map((item) => (item === habit ? updated : item));
  }
  return withStateNotes(
    habits === state.habits ? state : { ...state, habits },
    withNotes(state.notes, habit.id, stored),
  );
}
export function replayEvents(
  input: unknown,
  options: { localDevice?: string } = {},
): {
  events: StoredEvent[];
  replay: Replay;
} {
  insist(Array.isArray(input) && input.length > 0, 'Invalid change log size.');
  const ids = new Set<string>();
  let replay = emptyReplay();
  const events: StoredEvent[] = [];
  for (const candidate of input) {
    validateEvent(candidate);
    insist(
      candidate.sequence === events.length + 1,
      'Missing or reordered change.',
    );
    insist(!ids.has(candidate.id), 'Duplicate change identifier.');
    ids.add(candidate.id);
    replay = reduceEvent(replay, candidate, true, options.localDevice);
    events.push(candidate);
  }
  return { events, replay };
}
const cellLookNames = {
  todayOutlines: 'Outlines only on Today',
  missedDays: 'Missed day crosses',
  joinedCheckboxes: 'Joined checkboxes',
  streakNumbers: 'Streak numbers',
  roundCheckboxes: 'Round checkboxes',
  joinedEndsOnly: 'Streak ends only',
} as const;
export function describeChange(change: Change, state: StoredState): string {
  if (change.kind === 'batch')
    return change.label === 'restore'
      ? 'Restored from a backup'
      : 'Combined with another device';
  if (change.kind === 'connectorThickness')
    return `Connector thickness · ${change.after}%`;
  if (
    change.kind === 'todayOutlines' ||
    change.kind === 'missedDays' ||
    change.kind === 'joinedCheckboxes' ||
    change.kind === 'streakNumbers' ||
    change.kind === 'roundCheckboxes' ||
    change.kind === 'joinedEndsOnly'
  )
    return `${cellLookNames[change.kind]} ${change.after ? 'on' : 'off'}`;
  if (change.kind === 'themeMode') return `Theme · ${change.after}`;
  if (change.kind === 'darkBackground')
    return `Dark background · ${change.after}`;
  if (change.kind === 'lightBackground')
    return `Light background · ${change.after}`;
  if (
    change.kind === 'gridNameWidth' ||
    change.kind === 'gridColumnWidth' ||
    change.kind === 'gridRowHeight'
  )
    return `${
      change.kind === 'gridNameWidth'
        ? 'Name column width'
        : change.kind === 'gridColumnWidth'
          ? 'Day column width'
          : 'Row height'
    } · ${change.after === 'auto' ? 'automatic' : change.after}`;
  if (change.kind === 'nameColumnWidth') return 'Name column width';
  if (change.kind === 'columnDensity')
    return `Column spacing · ${change.after}`;
  if (change.kind === 'columnSpacing')
    return `Column spacing · ${change.after}`;
  if (change.kind === 'weekDividers')
    return `Week dividers ${change.after ? 'on' : 'off'}`;
  if (change.kind === 'tapAnimations')
    return `Tap animations ${change.after ? 'on' : 'off'}`;
  if (change.kind === 'checkboxStyle')
    return `Checkbox style · ${change.after === 'boxes' ? 'Checkboxes' : 'Ticks & crosses'}`;
  if (change.kind === 'weekStart') return `Week starts on ${change.after}`;
  if (change.kind === 'hideCompleted')
    return `Hide completed today ${change.after ? 'on' : 'off'}`;
  if (change.kind === 'textScale')
    return `Text size · ${Math.round(change.after * 100)}%`;
  if (change.kind === 'dateFading')
    return `Date fading ${change.after ? 'on' : 'off'}`;
  if (change.kind === 'rowSpacing') return `Row spacing · ${change.after}`;
  if (change.kind === 'order') return 'Habit order changed';
  if (change.kind === 'deleteHabit')
    return `${(change.before ?? change.after)!.habit.name} · ${change.after ? 'Deletion undone' : 'Deleted'}`;
  if (change.kind === 'habit')
    return `${change.after?.name ?? change.before?.name} · Habit changed`;
  if (change.kind === 'haptics')
    return `Haptics ${change.after ? 'on' : 'off'}`;
  const habit = state.habits.find((habit) => habit.id === change.habitId);
  const name = habit?.name ?? 'Habit';
  if (change.kind === 'colour') return `${name} · Colour changed`;
  if (change.kind === 'note') return `${name} · ${noteChangeSummary(change)}`;
  if (change.kind === 'entries')
    return `${name} · ${fillSummary(habit, change).summary}`;
  const value =
    change.after === null
      ? 'Cleared'
      : habit && isNumericHabit(habit)
        ? `${change.after}${habit.unit ? ` ${habit.unit}` : ''}`
        : habit
          ? entryLabel(habit, change.after)
          : String(change.after);
  return `${name} · ${value}`;
}
