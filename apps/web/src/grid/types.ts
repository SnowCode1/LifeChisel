import type { Habit } from '@onpurpose/core/habits';

/** How cells are drawn, from the saved cell-look preferences. */
export type CellLookStyle = {
  boxes: boolean;
  round: boolean;
  joined: boolean;
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

/** A checkbox the reader just ticked or cleared in the grid. */
export type Pulse = {
  habitId: string;
  date: string;
  /** The state the tap produced. */
  checked: boolean;
  /** Restarts the animation on repeated taps. */
  n: number;
};

/** Everything the grid asks its owner to do. */
export type GridHandlers = {
  /** Returns whether the change was accepted. */
  toggle(habit: Habit, date: string): boolean;
  openEntry(
    habit: Habit,
    date: string,
    label: string,
    anchor: HTMLElement,
  ): void;
  openMenu(habit: Habit, anchor: HTMLElement): void;
  /** Opens the habit's Notes/Statistics panel. */
  openHabit(habit: Habit): void;
  /** Saves the displayed rows in a new order. */
  reorder(ids: string[]): void;
  add(): void;
};
