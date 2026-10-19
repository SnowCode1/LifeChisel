import type {
  BatchItem,
  Change,
  DevicePreferenceKind,
  PreferenceChange,
} from './types.ts';

// Classification, structural equality and inversion are shared by validation,
// replay and optimistic writes. They do not depend on the replay implementation.
export function isPreference(change: Change): change is PreferenceChange {
  return (
    change.kind === 'haptics' ||
    change.kind === 'rowSpacing' ||
    change.kind === 'columnSpacing' ||
    change.kind === 'columnDensity' ||
    change.kind === 'nameColumnWidth' ||
    change.kind === 'gridNameWidth' ||
    change.kind === 'gridColumnWidth' ||
    change.kind === 'gridRowHeight' ||
    change.kind === 'weekStart' ||
    change.kind === 'weekDividers' ||
    change.kind === 'tapAnimations' ||
    change.kind === 'checkboxStyle' ||
    change.kind === 'dateFading' ||
    change.kind === 'textScale' ||
    change.kind === 'hideCompleted' ||
    change.kind === 'themeMode' ||
    change.kind === 'darkBackground' ||
    change.kind === 'lightBackground' ||
    change.kind === 'todayOutlines' ||
    change.kind === 'missedDays' ||
    change.kind === 'joinedCheckboxes' ||
    change.kind === 'streakNumbers' ||
    change.kind === 'roundCheckboxes' ||
    change.kind === 'connectorThickness' ||
    change.kind === 'joinedEndsOnly' ||
    change.kind === 'statsLayout'
  );
}
export function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object')
    return false;
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every(
      (key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]),
    )
  );
}
export function inverse(change: Change): Change {
  if (change.kind === 'batch')
    return {
      ...change,
      changes: change.changes
        .map((item) => inverse(item) as BatchItem)
        .reverse(),
    };
  return { ...change, before: change.after, after: change.before } as Change;
}
/** True when applying the change would leave every value as it was. */
export function isNoChange(change: Change): boolean {
  return change.kind === 'batch'
    ? change.changes.length === 0
    : sameValue(change.before, change.after);
}
const devicePreferences = new Set<string>([
  'haptics',
  'tapAnimations',
  'textScale',
  'rowSpacing',
  'columnSpacing',
  'columnDensity',
  'nameColumnWidth',
  'gridNameWidth',
  'gridColumnWidth',
  'gridRowHeight',
] satisfies DevicePreferenceKind[]);
/** v24: preferences each device keeps for itself (see DevicePreferenceKind). */
export function isDevicePreference(
  change: Change,
): change is Extract<PreferenceChange, { kind: DevicePreferenceKind }> {
  return devicePreferences.has(change.kind);
}
