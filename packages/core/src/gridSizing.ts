import type { RowSpacing } from './rowSpacing.ts';
import type { ColumnSpacing, NameColumnWidth } from './displayPreferences.ts';

// Grid geometry preferences (v18). Each is a size in points at 100% text, or
// 'auto', which adapts to the screen so a narrower phone is not made sparser.
export type GridSize = number | 'auto';
export type GridSizeKind =
  'gridNameWidth' | 'gridColumnWidth' | 'gridRowHeight';
export const gridSizeRanges = {
  gridNameWidth: { min: 96, max: 240, step: 4 },
  gridColumnWidth: { min: 40, max: 80, step: 2 },
  gridRowHeight: { min: 40, max: 80, step: 2 },
} as const satisfies Record<
  GridSizeKind,
  { min: number; max: number; step: number }
>;
export function isGridSize(kind: GridSizeKind, value: unknown) {
  if (value === 'auto') return true;
  const { min, max, step } = gridSizeRanges[kind];
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max &&
    (value - min) % step === 0
  );
}
export function snapGridSize(kind: GridSizeKind, value: number) {
  const { min, max, step } = gridSizeRanges[kind];
  return Math.min(
    max,
    Math.max(min, min + Math.round((value - min) / step) * step),
  );
}

// Automatic sizes. Name width is 40% of the grid between 120 and 200 points;
// days are at least 48 points; rows are 6% of the screen's longer side between
// 44 and 56. A 402-point iPhone keeps its earlier 146/48/52 geometry, and a
// 360-point Android phone fits four days with 48-point rows.
export const AUTO_COLUMN_WIDTH = 48;
export function autoNameWidth(gridWidth: number, scale: number) {
  return Math.max(120 * scale, Math.min(gridWidth * 0.4, 200 * scale));
}
export function autoRowHeight(screenLongSide: number) {
  return Math.min(
    56,
    Math.max(44, Math.round((screenLongSide * 0.06) / 2) * 2),
  );
}

// What the grid should draw. Without a v18 choice, earlier Compact/Roomy and
// Narrow/Wide choices still apply; their Standard always meant automatic.
export type GridSizing = {
  nameWidth: GridSize;
  nameFactor: number;
  columnWidth: GridSize;
  rowHeight: GridSize;
};
const legacySize = { compact: 44, standard: 'auto', roomy: 64 } as const;
export function gridSizing(
  state: {
    gridNameWidth?: GridSize;
    gridColumnWidth?: GridSize;
    gridRowHeight?: GridSize;
    nameColumnWidth?: NameColumnWidth;
    rowSpacing?: RowSpacing;
  },
  legacyColumns: ColumnSpacing,
): GridSizing {
  return {
    nameWidth: state.gridNameWidth ?? 'auto',
    nameFactor:
      state.gridNameWidth !== undefined
        ? 1
        : state.nameColumnWidth === 'narrow'
          ? 0.8
          : state.nameColumnWidth === 'wide'
            ? 1.2
            : 1,
    columnWidth: state.gridColumnWidth ?? legacySize[legacyColumns],
    rowHeight:
      state.gridRowHeight ?? legacySize[state.rowSpacing ?? 'standard'],
  };
}
