/**
 * Timing of the grid's checkbox tap animations, shared by both apps so the
 * phone canvas and the browser grid move alike. Each app draws its own.
 *
 * A join grows from the neighbour's centre to the tapped box's centre with
 * ease-out cubic, 1 - (1 - t)^3: it starts at once and settles into the box.
 * In CSS that is exactly cubic-bezier(1/3, 1, 2/3, 1). A broken join retracts
 * into the neighbour with CSS ease-in-out, RETRACT_CURVE, used as the same
 * bezier on the phone.
 */
export const JOIN_MS = 220;
export const RETRACT_MS = 180;
/** CSS `ease-in-out`: cubic-bezier(0.42, 0, 0.58, 1). */
export const RETRACT_CURVE = [0.42, 0, 0.58, 1] as const;

/**
 * After a tap the cell's background fades (ease-out quad) from what was
 * shown to its new one: slower when the tap met the goal, quicker otherwise.
 */
export const MET_FADE_MS = 180;
export const FADE_MS = 120;

/**
 * Drag to fill: a second press on the cell just tapped, within
 * FILL_DOUBLE_TAP_MS of the first tap's release (iOS's double-tap time), or
 * with a mouse FILL_DOUBLE_CLICK_MS (the usual desktop double-click time),
 * that then moves FILL_SLOP_PX along the row draws a fill across that row. Number, text and
 * category cells open their dialog VALUE_OPEN_DELAY_MS after a tap so the
 * second press can land; the dialog animates in.
 */
export const FILL_DOUBLE_TAP_MS = 350;
export const FILL_DOUBLE_CLICK_MS = 500;
export const FILL_SLOP_PX = 6;
export const VALUE_OPEN_DELAY_MS = 250;

/**
 * A committed fill animates as one stroke along its run, in drag order: a
 * single eased position (CSS ease-in-out) that travels from the start cell's
 * centre to the last cell's (or on into a checked day just beyond it). Every
 * cell, box and bar half follows that one position, so the motion runs
 * through the cells without restarting in each. Longer runs take longer,
 * up to about three quarters of a second.
 */
export const FILL_STROKE_CURVE = [0.42, 0, 0.58, 1] as const;
export function fillStrokeMs(length: number): number {
  return length > 0 ? Math.round(Math.min(720, 160 + 100 * length)) : 0;
}
/**
 * Ms after the commit at which the stroke reaches `position`, in cells from
 * the start cell's centre (0) to the stroke's end (`length`).
 */
export function fillStrokeAtMs(length: number, position: number): number {
  if (!(length > 0)) return 0;
  const progress = Math.min(1, Math.max(0, position / length));
  return fillStrokeMs(length) * bezierTimeAt(FILL_STROKE_CURVE, progress);
}

/**
 * Milliseconds after the tap at which a moving bar end first touches the box
 * it reaches (the tapped box when joining, the neighbour when retracting):
 * when it is half a box from that box's centre. That box bumps then.
 */
export function joinContactMs(
  box: number,
  column: number,
  joining: boolean,
): number {
  if (!(column > 0)) return 0;
  // Eased progress at contact, the same for both directions.
  const contact = Math.min(1, Math.max(0, 1 - box / 2 / column));
  return joining
    ? JOIN_MS * (1 - Math.cbrt(1 - contact))
    : RETRACT_MS * bezierTimeAt(RETRACT_CURVE, contact);
}

/**
 * The time (0–1) at which a CSS cubic-bezier easing reaches `progress`, for
 * curves whose progress only rises (y1 and y2 within 0–1).
 */
function bezierTimeAt(
  [x1, y1, x2, y2]: readonly [number, number, number, number],
  progress: number,
): number {
  const at = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;
    if (at(y1, y2, middle) < progress) low = middle;
    else high = middle;
  }
  return at(x1, x2, (low + high) / 2);
}
