import type { EntryValue } from '@onpurpose/core/entries';
import type { EntriesChange, EntryChange } from '@onpurpose/core/storage/types';
import { fillStrokeAtMs, fillStrokeMs } from '@onpurpose/core/tapMotion';

// Pure planning for drag to fill in the grid: which day the pointer is over
// while a fill is drawn, and the wave a committed fill animates. Timing
// constants are in core tapMotion.ts; the grid draws the plan.

/** What a fill (or a single tap) applied. */
export type FillChange = EntryChange | EntriesChange;

/** Days-ago bounds of the run being drawn, inclusive. */
export type FillRun = { lo: number; hi: number };

/**
 * Whether a second press that moved (dx, dy) starts drawing a fill: only
 * past `slop` and mostly along the row. Null while still undecided.
 */
export function fillIntent(
  dx: number,
  dy: number,
  slop: number,
): 'fill' | 'none' | null {
  const across = Math.abs(dx),
    down = Math.abs(dy);
  if (Math.max(across, down) < slop) return null;
  return across >= down ? 'fill' : 'none';
}

/**
 * Days ago of the column under the pointer, on the start cell's row:
 * columns run oldest (left) to Today (right), all `width` wide. Clamped to
 * the loaded days, 0 (Today) to `oldestAgo`.
 */
export function fillAgoAt(
  x: number,
  startLeft: number,
  width: number,
  startAgo: number,
  oldestAgo: number,
): number {
  if (!(width > 0)) return startAgo;
  const ago = startAgo - Math.floor((x - startLeft) / width);
  return Math.max(0, Math.min(oldestAgo, ago));
}

/**
 * Pixels to scroll this frame while a fill is drawn near the left or right
 * edge of the days in view: faster the closer the pointer is to the edge.
 */
export function edgeScrollStep(
  x: number,
  left: number,
  right: number,
  zone = 40,
  fastest = 16,
): number {
  if (x < left + zone)
    return -Math.ceil(fastest * Math.min(1, (left + zone - x) / zone));
  if (x > right - zone)
    return Math.ceil(fastest * Math.min(1, (x - (right - zone)) / zone));
  return 0;
}

/** The earlier value of every date a change actually changed. */
export function changedBefore(
  change: FillChange,
): Record<string, EntryValue | null> {
  return change.kind === 'entry'
    ? { [change.date]: change.before }
    : { ...change.before };
}

/** A join between two neighbouring columns that grows or retracts. */
export type WaveSegment = {
  /** The column the bar's fixed end stays in. */
  anchor: number;
  /** The column its moving end reaches (growing) or leaves (retracting). */
  target: number;
  grow: boolean;
};

export type Wave = {
  segments: WaveSegment[];
  /** Boxes a moving bar touches, and when they bump. */
  bumps: Map<number, number>;
  /** Boxes a growing bar reaches (Streak ends only absorbs them). */
  arrivals: Set<number>;
};

/**
 * Plans a single tap's joins: each checked neighbour of the tapped column
 * grows its join into it (ticking) or takes it back (clearing), and the box
 * the bar reaches bumps when the bar touches it.
 */
export function planTap({
  col,
  checked,
  isChecked,
  columns,
  contactMs,
}: {
  col: number;
  checked: boolean;
  isChecked: (col: number) => boolean;
  columns: number;
  contactMs: number;
}): Wave {
  const wave: Wave = { segments: [], bumps: new Map(), arrivals: new Set() };
  for (const near of [col - 1, col + 1]) {
    if (near < 0 || near >= columns || !isChecked(near)) continue;
    wave.segments.push({ anchor: near, target: col, grow: checked });
    if (checked) {
      wave.arrivals.add(near).add(col);
      wave.bumps.set(col, contactMs);
    } else wave.bumps.set(near, contactMs);
  }
  return wave;
}

/** One bar half a fill's stroke draws (growing) or erases (retracting). */
export type StrokeHalf = {
  side: 'older' | 'newer';
  /** Where the half begins along the stroke, in cells (0, 0.5, 1, …). */
  start: number;
};

export type Stroke = {
  /** Cells the stroke travels: the run's steps, plus one into a day beyond. */
  length: number;
  ms: number;
  /** true: the bar grows (ticking); false: it is erased (clearing). */
  grow: boolean;
  /** 1 when the stroke moves towards newer columns, -1 towards older. */
  direction: 1 | -1;
  /** When the stroke reaches each column: its fade and new content start. */
  at: Map<number, number>;
  /** Boxes that bump as the bar touches them, and when. */
  bumps: Map<number, number>;
  /** The bar halves the stroke moves, by column. */
  halves: Map<number, StrokeHalf[]>;
  /**
   * When the fill itself changed the start cell, its join with a checked
   * day behind the run moves as a tap's would.
   */
  segments: WaveSegment[];
};

/**
 * Plans a committed fill as one stroke along its run (core tapMotion): a
 * single eased position from the start cell's centre (0) through each run
 * cell in drag order. Ticking, the bar grows behind it and each changed box
 * fills and bumps as the bar touches it (`reach` is half a box, in columns);
 * a ticked day just beyond the run is joined too. Clearing, the bar is
 * erased in front of it and each box empties as it passes; a ticked day
 * beyond takes back its join and bumps. `checked` is null for number, text
 * and category fills, which only fade as the stroke passes.
 */
export function planStroke({
  cols,
  checked,
  changed,
  wasChecked,
  isChecked,
  columns,
  reach,
  contactMs,
}: {
  cols: number[];
  checked: boolean | null;
  changed: (col: number) => boolean;
  wasChecked: (col: number) => boolean;
  isChecked: (col: number) => boolean;
  columns: number;
  reach: number;
  /** A tap's join contact time (joinContactMs) for the start cell's join. */
  contactMs: number;
}): Stroke {
  const n = cols.length;
  const direction: 1 | -1 = n > 1 && cols[1] < cols[0] ? -1 : 1;
  const beyond = cols[n - 1] + direction;
  const inside = beyond >= 0 && beyond < columns;
  const extends_ =
    checked === true
      ? inside && isChecked(beyond)
      : checked === false
        ? inside && isChecked(beyond) && wasChecked(cols[n - 1])
        : false;
  const length = Math.max(0, n - 1) + (extends_ ? 1 : 0);
  const stroke: Stroke = {
    length,
    ms: fillStrokeMs(length),
    grow: checked !== false,
    direction,
    at: new Map(),
    bumps: new Map(),
    halves: new Map(),
    segments: [],
  };
  const time = (position: number) => fillStrokeAtMs(length, position);
  cols.forEach((col, k) => {
    // Ticking fills a box as the bar touches it; clearing empties it as the
    // stroke passes its centre; values change as it enters their cell.
    const position =
      checked === true ? k - reach : checked === false ? k : k - 0.5;
    stroke.at.set(col, k === 0 ? 0 : time(position));
    if (checked === true && k > 0 && changed(col))
      stroke.bumps.set(col, time(position));
  });
  if (checked === null) return stroke;
  if (extends_) stroke.bumps.set(beyond, time(n - reach));
  // A press-and-drag (no first click) changes the start cell too: its join
  // with a checked day behind it grows into it or retracts, as a tap's.
  const behind = cols[0] - direction;
  if (
    behind >= 0 &&
    behind < columns &&
    changed(cols[0]) &&
    isChecked(behind)
  ) {
    stroke.segments.push({ anchor: behind, target: cols[0], grow: checked });
    stroke.bumps.set(checked ? cols[0] : behind, contactMs);
  }
  const colAt = (k: number) => (k === n ? beyond : cols[k]);
  const half = (col: number, item: StrokeHalf) =>
    stroke.halves.set(col, [...(stroke.halves.get(col) ?? []), item]);
  const forward = direction > 0 ? 'newer' : 'older';
  const backward = direction > 0 ? 'older' : 'newer';
  for (let k = 0; k < length; k++) {
    const a = colAt(k),
      b = colAt(k + 1);
    const joined = wasChecked(a) && wasChecked(b);
    // Ticking grows only joins that were not there; clearing erases those
    // that were.
    if (checked ? joined : !joined) continue;
    half(a, { side: forward, start: k });
    half(b, { side: backward, start: k + 0.5 });
  }
  return stroke;
}
