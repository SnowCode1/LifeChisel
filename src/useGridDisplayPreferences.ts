import { useState } from 'react';
import type { CheckboxStyle, WeekStart } from './displayPreferences.ts';
import type { GridSize } from './gridSizing.ts';
import type { Theme } from './theme.ts';

export type GridDisplayPreferences = {
  // Themes are cached by background, so an unchanged theme keeps its identity.
  theme: Theme;
  nameWidth: GridSize;
  nameFactor: number;
  columnWidth: GridSize;
  rowHeight: GridSize;
  checkboxStyle: CheckboxStyle;
  weekDividers: boolean;
  tapAnimations: boolean;
  weekStart: WeekStart;
  textScale: number;
  hideCompleted: boolean;
};

export function useGridDisplayPreferences(
  current: GridDisplayPreferences,
  deferred: boolean,
) {
  const [displayed, setDisplayed] = useState(current);
  // Hold presentation geometry only. Settings and persistence always receive
  // current values; keep the mounted grid and its scroll/reorder state intact.
  if (
    !deferred &&
    Object.keys(current).some(
      (key) =>
        displayed[key as keyof GridDisplayPreferences] !==
        current[key as keyof GridDisplayPreferences],
    )
  )
    setDisplayed(current);
  // Completion filtering is prepared while Settings is still covering the grid.
  return deferred
    ? { ...displayed, hideCompleted: current.hideCompleted }
    : current;
}
