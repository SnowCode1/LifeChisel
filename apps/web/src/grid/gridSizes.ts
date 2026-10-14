import { useEffect } from 'react';
import { gridEntryTextLines } from '@onpurpose/core/gridEntryText';
import type { GridSizeKind, GridSizing } from '@onpurpose/core/gridSizing';

/**
 * Grid sizes are the shared saved preferences (points on the phone, CSS
 * pixels here). Automatic keeps the web's own sizes from styles.css,
 * including the narrower ones at phone width.
 */
export const automaticSizes: Record<GridSizeKind, number> = {
  gridNameWidth: 225,
  gridColumnWidth: 46,
  gridRowHeight: 56,
};
export type WebGridSizes = Record<GridSizeKind, number | null>;

export function webGridSizes(sizing: GridSizing): WebGridSizes {
  return {
    gridNameWidth:
      sizing.nameWidth !== 'auto'
        ? sizing.nameWidth
        : sizing.nameFactor !== 1
          ? Math.round(automaticSizes.gridNameWidth * sizing.nameFactor)
          : null,
    gridColumnWidth: sizing.columnWidth === 'auto' ? null : sizing.columnWidth,
    gridRowHeight: sizing.rowHeight === 'auto' ? null : sizing.rowHeight,
  };
}

/** Writes the sizes as the grid's CSS variables (null: automatic). */
export function applyGridSizes(sizes: WebGridSizes) {
  const style = document.documentElement.style;
  const set = (name: string, value: number | null) =>
    value === null
      ? style.removeProperty(name)
      : style.setProperty(name, `${value}px`);
  const column = sizes.gridColumnWidth;
  const row = sizes.gridRowHeight;
  set('--name-width', sizes.gridNameWidth);
  set('--column', column);
  set('--row', row);
  // The checkbox follows the smaller of the row and the column.
  set(
    '--box',
    column === null && row === null
      ? null
      : Math.max(
          16,
          Math.min(
            26,
            (row ?? automaticSizes.gridRowHeight) - 22,
            (column ?? automaticSizes.gridColumnWidth) - 18,
          ),
        ),
  );
  // Text and category cells show one to three lines, as on the phone, and
  // short rows drop the line under each name. Automatic rows keep the
  // stylesheet's values.
  if (row === null) {
    style.removeProperty('--text-lines');
    style.removeProperty('--summary');
  } else {
    style.setProperty('--text-lines', String(gridEntryTextLines(row, 1)));
    style.setProperty('--summary', row < 50 ? 'none' : 'block');
  }
}

export function useGridSizes(sizing: GridSizing) {
  const { nameWidth, nameFactor, columnWidth, rowHeight } = sizing;
  useEffect(() => {
    applyGridSizes(
      webGridSizes({ nameWidth, nameFactor, columnWidth, rowHeight }),
    );
  }, [nameWidth, nameFactor, columnWidth, rowHeight]);
}
