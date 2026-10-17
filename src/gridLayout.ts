import {
  AUTO_COLUMN_WIDTH,
  autoNameWidth,
  type GridSizing,
} from '@onpurpose/core/gridSizing';
import { compactVisibleDays } from '@onpurpose/core/gridModes';
// Fill the available space with whole days while keeping names and touch
// targets readable. Larger system text gets more space, rather than clipping.
// With a pixel ratio, day columns are whole physical pixels wide and the name
// column takes the remainder: every column then measures identically, so
// FlashList's estimates for undrawn columns match the scroll arithmetic.
export function gridLayout(
  width: number,
  fontScale: number,
  sizing: Pick<GridSizing, 'nameWidth' | 'nameFactor' | 'columnWidth'> = {
    nameWidth: 'auto',
    nameFactor: 1,
    columnWidth: 'auto',
  },
  pixelRatio?: number,
) {
  const scale = Math.max(1, fontScale);
  const minimumDayWidth =
    (sizing.columnWidth === 'auto' ? AUTO_COLUMN_WIDTH : sizing.columnWidth) *
    scale;
  const preferredName =
    sizing.nameWidth === 'auto'
      ? autoNameWidth(width, scale) * sizing.nameFactor
      : sizing.nameWidth * scale;
  const nameWidth = Math.max(
    0,
    Math.min(Math.round(preferredName), width - minimumDayWidth),
  );
  const availableWidth = Math.max(0, width - nameWidth);
  const visibleDays = Math.max(1, Math.floor(availableWidth / minimumDayWidth));
  if (!pixelRatio)
    return {
      nameWidth,
      dateWidth: availableWidth,
      visibleDays,
      columnWidth: availableWidth / visibleDays,
    };
  const columnWidth =
    Math.floor((availableWidth * pixelRatio) / visibleDays) / pixelRatio;
  const dateWidth = columnWidth * visibleDays;
  return {
    nameWidth: width - dateWidth,
    dateWidth,
    visibleDays,
    columnWidth,
  };
}

/** Compact mode's icon column, before font scaling. */
export const COMPACT_NAME_WIDTH = 48;
/** The narrowest compact day column, before font scaling. */
const COMPACT_MINIMUM_DAY = 36;

// Compact mode: icons instead of names, so the freed width holds about a
// week of days (`compactVisibleDays`), still in whole physical pixels.
export function compactGridLayout(
  width: number,
  fontScale: number,
  columnWidth: GridSizing['columnWidth'],
  pixelRatio: number,
) {
  const scale = Math.max(1, fontScale);
  const name = Math.min(Math.round(COMPACT_NAME_WIDTH * scale), width);
  const available = Math.max(0, width - name);
  const normal =
    (columnWidth === 'auto' ? AUTO_COLUMN_WIDTH : columnWidth) * scale;
  const visibleDays = compactVisibleDays(
    available,
    normal,
    COMPACT_MINIMUM_DAY * scale,
  );
  const column =
    Math.floor((available * pixelRatio) / visibleDays) / pixelRatio;
  const dateWidth = column * visibleDays;
  return {
    nameWidth: width - dateWidth,
    dateWidth,
    visibleDays,
    columnWidth: column,
  };
}
