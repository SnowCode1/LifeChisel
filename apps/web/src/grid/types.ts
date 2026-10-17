import type { EntryValue } from '@onpurpose/core/entries';
import type { Habit } from '@onpurpose/core/habits';
import type { FillChange } from './fillWave.ts';

/** How cells are drawn, from the saved cell-look preferences. */
export type CellLookStyle = {
  boxes: boolean;
  round: boolean;
  joined: boolean;
  /** Joined runs draw boxes only at their ends, one bar between. */
  endsOnly: boolean;
  streaks: boolean;
  missed: boolean;
  /** Joining bar height as a fraction of the checkbox. */
  connector: number;
  /** Tap animations (the saved preference; Reduce Motion still applies). */
  animate: boolean;
};

export type Day = {
  key: string;
  ago: number;
  weekday: string;
  number: number;
  label: string;
  shaded: boolean;
};

/**
 * A checkbox the reader just ticked or cleared in the grid, or a fill just
 * committed along a row (animated as one stroke in drag order).
 */
export type Pulse = {
  habitId: string;
  kind: 'tap' | 'checks' | 'values';
  /** The tapped date, or the fill's run in drag order. */
  dates: string[];
  /** The earlier value of every date the change actually changed. */
  before: Record<string, EntryValue | null>;
  /** The checkbox state the tap or fill produced (false for values). */
  checked: boolean;
  /** When a moving join touches the box it reaches, in ms (tapMotion). */
  contactMs: number;
  /** Half a box as a fraction of a column: where a bar touches a box. */
  reach: number;
  /** Restarts the animation on repeated taps. */
  n: number;
};

/** The run of a fill being drawn, highlighted until it completes. */
export type { FillChange, FillRun } from './fillWave.ts';

/** Everything the grid asks its owner to do. */
export type GridHandlers = {
  /** Returns whether the change was accepted. */
  toggle(habit: Habit, date: string): boolean;
  /** Records a value directly (Today tiles' usual totals); accepted or not. */
  saveValue(habit: Habit, date: string, value: EntryValue): boolean;
  /** `delayed`: a pointer click, which the grid opens after a short wait. */
  /** Closes the entry popover, if one is open. */
  closeEntry(): void;
  openEntry(
    habit: Habit,
    date: string,
    label: string,
    anchor: HTMLElement,
    delayed?: boolean,
  ): void;
  /**
   * Sets a run of checkbox days (in drag order) to the start day's current
   * state as one change; returns the change applied, or null.
   */
  /** `toggleStart`: the drag began without a first click on its cell. */
  fillChecks(
    habit: Habit,
    dates: string[],
    toggleStart: boolean,
  ): FillChange | null;
  /**
   * Opens the entry popover to fill a run of days with one value. `done`
   * receives the change applied, or null when the popover closes without
   * one.
   */
  openFill(
    habit: Habit,
    dates: string[],
    anchor: HTMLElement,
    done: (change: FillChange | null) => void,
  ): void;
  openMenu(habit: Habit, anchor: HTMLElement): void;
  /** Opens the habit's Notes/Statistics panel. */
  openHabit(habit: Habit): void;
  /** Saves the displayed rows in a new order. */
  reorder(ids: string[]): void;
  add(): void;
};
