// Horizontal canvas coordinates. `offset` 0 shows Today at the right edge;
// positive offsets show older days, negative ones unlocked future days. Day
// `d` (days ago; negative is the future) occupies [x, x + column).
export function columnX(
  day: number,
  width: number,
  offset: number,
  column: number,
): number {
  'worklet';
  return width - (day + 1) * column + offset;
}

/** The day under a canvas x, or the nearest column for x outside it. */
export function dayAtX(
  x: number,
  width: number,
  offset: number,
  column: number,
): number {
  'worklet';
  return Math.floor((width + offset - x) / column);
}

/** First (newest) and last (oldest) day intersecting the visible width. */
export function visibleDayRange(
  width: number,
  offset: number,
  column: number,
): [number, number] {
  'worklet';
  if (column <= 0) return [0, -1];
  return [
    Math.floor(offset / column),
    Math.ceil((width + offset) / column) - 1,
  ];
}

/** The newest fully aligned day, as reported to React after settling. */
export function rightmostDayAt(offset: number, column: number): number {
  'worklet';
  return column > 0 ? Math.round(offset / column) : 0;
}

export function snapOffset(
  offset: number,
  column: number,
  minimum: number,
  maximum: number,
): number {
  'worklet';
  if (column <= 0) return offset;
  return Math.min(
    maximum,
    Math.max(minimum, Math.round(offset / column) * column),
  );
}

/**
 * iOS-style resistance: the displayed distance beyond an edge for a finger
 * distance `over`, approaching `dimension` but never reaching it.
 */
export function rubberBand(over: number, dimension: number): number {
  'worklet';
  if (over <= 0 || dimension <= 0) return 0;
  return (1 - 1 / ((over * 0.55) / dimension + 1)) * dimension;
}

/** Checkbox sizes shared by both checkbox styles (from the native renderer). */
export function checkboxGeometry(
  fontScale: number,
  rowHeight: number,
  column: number,
) {
  'worklet';
  const size = Math.max(
    0,
    Math.min(28 * fontScale, rowHeight - 16, column - 16),
  );
  const box = size * (22 / 28);
  const stroke = Math.max(1.25, box * (1.5 / 22));
  return { size, box, stroke, radius: Math.max(0, box * (6 / 22)) };
}

/** Date heading height: 8 pt padding, an 11 pt weekday, 3 pt gap, 19 pt number. */
export function headingHeight(fontScale: number): number {
  return Math.max(56, Math.ceil(19 + 36 * fontScale));
}
