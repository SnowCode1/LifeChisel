// Event and replay shapes only. Keep runtime validation/reduction out of this
// module so validators, adapters and replay can depend on one type boundary.
import type { Habit } from '../habits.ts';
import type { EntryValue, EntryValues } from '../entries.ts';
import type { RowSpacing } from '../rowSpacing.ts';
import type {
  CheckboxStyle,
  ColumnSpacing,
  NameColumnWidth,
  WeekStart,
} from '../displayPreferences.ts';
import type { GridSize } from '../gridSizing.ts';
import type { ThemeMode } from '../theme.ts';

export type StoredState = {
  habits: Habit[];
  values: EntryValues;
  hapticsEnabled: boolean;
  rowSpacing?: RowSpacing;
  columnSpacing?: ColumnSpacing;
  columnDensity?: ColumnSpacing;
  nameColumnWidth?: NameColumnWidth;
  gridNameWidth?: GridSize;
  gridColumnWidth?: GridSize;
  gridRowHeight?: GridSize;
  weekStart?: WeekStart;
  dateFading?: boolean;
  checkboxStyle?: CheckboxStyle;
  weekDividers?: boolean;
  tapAnimations?: boolean;
  textScale?: number;
  hideCompleted?: boolean;
  themeMode?: ThemeMode;
  darkBackground?: string;
  lightBackground?: string;
  // Retired 12 October 2026 (no longer drawn); kept so saved changes replay.
  todayOutlines?: boolean;
  missedDays?: boolean;
  joinedCheckboxes?: boolean;
  streakNumbers?: boolean;
  roundCheckboxes?: boolean;
  connectorThickness?: number;
  joinedEndsOnly?: boolean;
};
export type DeletedHabit = {
  habit: Habit;
  entries: Record<string, EntryValue>;
};
/** One saved value for one habit and date. */
export type EntryChange = {
  kind: 'entry';
  habitId: string;
  date: string;
  before: EntryValue | null;
  after: EntryValue | null;
};
/** One fill across several days of one habit (v22): one undoable action. */
export type EntriesChange = {
  kind: 'entries';
  habitId: string;
  /** Saved values before, by date key (null: absent). Same dates as `after`. */
  before: Record<string, EntryValue | null>;
  after: Record<string, EntryValue | null>;
};
export type Change =
  | EntryChange
  | EntriesChange
  | { kind: 'colour'; habitId: string; before: string; after: string }
  | {
      kind: 'habit';
      habitId: string;
      index: number;
      before: Habit | null;
      after: Habit | null;
    }
  | {
      kind: 'deleteHabit';
      habitId: string;
      index: number;
      before: DeletedHabit | null;
      after: DeletedHabit | null;
    }
  | { kind: 'order'; before: string[]; after: string[] }
  | { kind: 'haptics'; before: boolean; after: boolean }
  | { kind: 'rowSpacing'; before: RowSpacing; after: RowSpacing }
  | { kind: 'columnSpacing'; before: ColumnSpacing; after: ColumnSpacing }
  | { kind: 'columnDensity'; before: ColumnSpacing; after: ColumnSpacing }
  | { kind: 'nameColumnWidth'; before: NameColumnWidth; after: NameColumnWidth }
  // v18: before is null until the first numeric/automatic choice is saved.
  | { kind: 'gridNameWidth'; before: GridSize | null; after: GridSize }
  | { kind: 'gridColumnWidth'; before: GridSize | null; after: GridSize }
  | { kind: 'gridRowHeight'; before: GridSize | null; after: GridSize }
  | { kind: 'weekStart'; before: WeekStart; after: WeekStart }
  | { kind: 'weekDividers'; before: boolean; after: boolean }
  | { kind: 'tapAnimations'; before: boolean; after: boolean }
  | { kind: 'checkboxStyle'; before: CheckboxStyle; after: CheckboxStyle }
  | { kind: 'dateFading'; before: boolean; after: boolean }
  | { kind: 'textScale'; before: number; after: number }
  | { kind: 'hideCompleted'; before: boolean; after: boolean }
  // v19: appearance; backgrounds are normalized #RRGGBB.
  // before is null until the first choice, so defaults can change freely.
  | { kind: 'themeMode'; before: ThemeMode | null; after: ThemeMode }
  | { kind: 'darkBackground'; before: string | null; after: string }
  | { kind: 'lightBackground'; before: string | null; after: string }
  // v20: cell look; before is null until the first choice.
  | { kind: 'todayOutlines'; before: boolean | null; after: boolean }
  | { kind: 'missedDays'; before: boolean | null; after: boolean }
  | { kind: 'joinedCheckboxes'; before: boolean | null; after: boolean }
  | { kind: 'streakNumbers'; before: boolean | null; after: boolean }
  | { kind: 'roundCheckboxes'; before: boolean | null; after: boolean }
  | { kind: 'connectorThickness'; before: number | null; after: number }
  // v21: joined runs show only their end boxes.
  | { kind: 'joinedEndsOnly'; before: boolean | null; after: boolean };
export type PreferenceChange = Extract<
  Change,
  {
    kind:
      | 'haptics'
      | 'rowSpacing'
      | 'columnSpacing'
      | 'columnDensity'
      | 'nameColumnWidth'
      | 'gridNameWidth'
      | 'gridColumnWidth'
      | 'gridRowHeight'
      | 'weekStart'
      | 'weekDividers'
      | 'tapAnimations'
      | 'checkboxStyle'
      | 'dateFading'
      | 'textScale'
      | 'hideCompleted'
      | 'themeMode'
      | 'darkBackground'
      | 'lightBackground'
      | 'todayOutlines'
      | 'missedDays'
      | 'joinedCheckboxes'
      | 'streakNumbers'
      | 'roundCheckboxes'
      | 'connectorThickness'
      | 'joinedEndsOnly';
  }
>;
export type HabitChange = Exclude<Change, PreferenceChange>;
export type EventMeta = {
  version:
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15
    | 16
    | 17
    | 18
    | 19
    | 20
    | 21
    | 22;
  id: string;
  sequence: number;
  recordedAt: string;
  timeZone: string;
  utcOffsetMinutes: number;
};
export type LegacyChangeEvent = EventMeta & { version: 1 } & (
    | { type: 'change'; change: Change }
    | { type: 'undo' | 'redo'; targetId: string; change: Change }
  );
export type CurrentChangeEvent = EventMeta & {
  version:
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15
    | 16
    | 17
    | 18
    | 19
    | 20
    | 21
    | 22;
} & (
    | { type: 'change'; groupId: string; change: HabitChange }
    | { type: 'undo' | 'redo'; targetId: string; change: HabitChange }
    | { type: 'preference'; change: PreferenceChange }
  );
export type ChangeEvent = LegacyChangeEvent | CurrentChangeEvent;
export type StoredEvent =
  (EventMeta & { type: 'initialize'; habits: Habit[] }) | ChangeEvent;
export type HistoryAction = EventMeta & {
  type: 'change';
  change: HabitChange;
  firstRecordedAt: string;
  firstSequence: number;
  editCount: number;
  lastChangedSequence: number;
};
export type RedoAction = { action: HistoryAction; undoId: string };
export type Replay = {
  state: StoredState;
  undo: HistoryAction[];
  redo: RedoAction[];
  lastGroup: HistoryAction | null;
  legacyUndo: LegacyChangeEvent[];
  legacyRedo: LegacyChangeEvent[];
  hasV2: boolean;
  hasV3: boolean;
  hasV4: boolean;
  hasV5: boolean;
  hasV6: boolean;
  hasV7: boolean;
  hasV8: boolean;
  hasV9: boolean;
  hasV10: boolean;
  hasV11: boolean;
  hasV12: boolean;
  hasV13: boolean;
  hasV14: boolean;
  hasV15: boolean;
  hasV16: boolean;
  hasV17: boolean;
  hasV18: boolean;
  hasV19: boolean;
  hasV20: boolean;
  hasV21: boolean;
  hasV22: boolean;
};
