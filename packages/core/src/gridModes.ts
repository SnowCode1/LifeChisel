import type { IconName } from './iconNames.ts';

/**
 * How the home screen shows the habits. Each device remembers its own mode
 * (it is a view, not a saved preference): it never enters the change log,
 * History or backups.
 *
 * - grid: names beside day columns (the original home grid).
 * - compact: icons instead of names, so about a week of days fits a phone.
 * - today: one tile per habit for Today, without date or name axes.
 * - weeks: names beside week columns; each cell sums its seven days.
 */
export type GridMode = 'grid' | 'compact' | 'today' | 'weeks';

export const gridModes: readonly {
  mode: GridMode;
  label: string;
  icon: IconName;
  description: string;
}[] = [
  {
    mode: 'grid',
    label: 'Grid',
    icon: 'modeGrid',
    description: 'Names beside days',
  },
  {
    mode: 'compact',
    label: 'Compact',
    icon: 'modeCompact',
    description: 'Icons beside a week of days',
  },
  {
    mode: 'today',
    label: 'Today',
    icon: 'modeToday',
    description: 'One tile per habit',
  },
  {
    mode: 'weeks',
    label: 'Weeks',
    icon: 'modeWeeks',
    description: 'One column per week',
  },
];

export const defaultGridMode: GridMode = 'grid';

export function isGridMode(value: unknown): value is GridMode {
  return gridModes.some((option) => option.mode === value);
}

/** A remembered mode, or the default for anything unreadable. */
export function readGridMode(value: unknown): GridMode {
  return isGridMode(value) ? value : defaultGridMode;
}

export function gridModeLabel(mode: GridMode) {
  return gridModes.find((option) => option.mode === mode)!.label;
}

/** The key each device stores its mode under. */
export const GRID_MODE_KEY = 'onpurpose.gridMode';

/**
 * Compact mode keeps a week of day columns when each can stay at least
 * `minimum` wide; otherwise it fits as many as that allows. Wider screens
 * keep every column the normal size allows.
 */
export const COMPACT_DAYS = 7;
export function compactVisibleDays(
  available: number,
  normalColumn: number,
  minimum: number,
) {
  const normal = Math.floor(available / normalColumn);
  const week =
    available / COMPACT_DAYS >= minimum
      ? COMPACT_DAYS
      : Math.floor(available / minimum);
  return Math.max(1, normal, week);
}

/**
 * The letter standing in for a habit without an icon where only icons show
 * (Compact mode): its name's first character, upper-cased.
 */
export function habitInitial(name: string) {
  return (Array.from(name.trim())[0] ?? '?').toLocaleUpperCase();
}
