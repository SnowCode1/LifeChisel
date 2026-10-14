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
};

export type Day = {
  key: string;
  ago: number;
  weekday: string;
  number: number;
  label: string;
  shaded: boolean;
};

/** Everything the grid asks its owner to do. */
export type GridHandlers = {
  toggle(habit: Habit, date: string): void;
  openEntry(
    habit: Habit,
    date: string,
    label: string,
    anchor: HTMLElement,
  ): void;
  openMenu(habit: Habit, anchor: HTMLElement): void;
  /** Saves the displayed rows in a new order. */
  reorder(ids: string[]): void;
  add(): void;
};
