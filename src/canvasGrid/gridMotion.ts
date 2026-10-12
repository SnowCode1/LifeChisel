// Momentum for the canvas grid, as closed-form curves of time so every frame
// is exact at any refresh rate. A release decides where it will stop before it
// moves: the natural iOS deceleration is projected, rounded to a column, and
// the curve is retuned to arrive there, so flings never land between columns
// and correct themselves afterwards. Offsets and positions are in points;
// velocities in points per millisecond; times in milliseconds.

/** Per-millisecond velocity retention: UIScrollView.DecelerationRate.fast. */
export const DECELERATION = 0.99;
/** Above this speed (points per ms) a touch only stops the scroll. */
export const TAP_STOP_SPEED = 0.15;
/** Critically damped spring rate (per ms): about a 0.3 s settle. */
const SPRING = 0.021;
/** Closer than this, a curve has visibly arrived and finishes exactly. */
const REST = 0.1;
/** Within this and nearly still, the column is decided and React can know. */
const SETTLED = 2;
/** Fastest release honoured, so one flick cannot cross months at once. */
const MAX_SPEED = 10;
/** Furthest a fling may overshoot an edge before springing back. */
const BOUNCE_LIMIT = 80;
// A retuned deceleration stays within this factor of the natural one.
const RETUNE = 2;

export type Fling = {
  start: number;
  /** Exponential approach to `approach` with time constant `tau`; 0 skips. */
  approach: number;
  tau: number;
  /** When the spring takes over; Infinity for an approach that just ends. */
  springAt: number;
  /** The column the spring settles on, its start displacement and velocity. */
  rest: number;
  springFrom: number;
  springVelocity: number;
};

function timeConstant(deceleration: number): number {
  'worklet';
  return -1 / Math.log(deceleration);
}

function spring(
  start: number,
  rest: number,
  velocity: number,
  allowOvershoot: boolean,
): Fling {
  'worklet';
  const from = start - rest;
  // A critically damped spring crosses its rest once only when it already
  // moves toward it faster than SPRING·distance; cap that to land cleanly.
  let v = velocity;
  if (!allowOvershoot && v * from < 0)
    v = Math.sign(v) * Math.min(Math.abs(v), SPRING * Math.abs(from));
  return {
    start,
    approach: start,
    tau: 0,
    springAt: 0,
    rest,
    springFrom: from,
    springVelocity: v,
  };
}

/**
 * Plans the motion after a release at `start` with `velocity` (points per
 * second, as gesture events report it), ending exactly on a column inside
 * [minimum, maximum]. Both limits must be whole columns.
 */
export function planFling(
  start: number,
  velocity: number,
  column: number,
  minimum: number,
  maximum: number,
  deceleration?: number,
): Fling {
  'worklet';
  const v0 = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, velocity / 1000));
  if (column <= 0) return spring(start, start, 0, false);
  // Released beyond an edge (the rubber band): spring back onto it.
  if (start < minimum) return spring(start, minimum, v0, false);
  if (start > maximum) return spring(start, maximum, v0, false);

  // Not a default parameter: worklets do not capture those identifiers.
  const tau = timeConstant(deceleration ?? DECELERATION);
  const projected = start + v0 * tau;

  // Heading past an edge: decelerate naturally until it, then bounce.
  const edge =
    projected < minimum ? minimum : projected > maximum ? maximum : null;
  if (edge !== null) {
    const travelled = edge - start;
    const hitAt = -tau * Math.log(1 - travelled / (v0 * tau));
    const limit = BOUNCE_LIMIT * SPRING * Math.E;
    const hitVelocity = Math.max(-limit, Math.min(limit, v0 - travelled / tau));
    return {
      start,
      approach: projected,
      tau,
      springAt: hitAt,
      rest: edge,
      springFrom: 0,
      springVelocity: hitVelocity,
    };
  }

  // Retune the deceleration to finish on the column nearest the projection,
  // or the nearest neighbour when that one would reverse or feel unnatural.
  const nearest = Math.round(projected / column) * column;
  let best: number | null = null;
  let bestScore = Infinity;
  for (const candidate of [nearest - column, nearest, nearest + column]) {
    if (candidate < minimum || candidate > maximum) continue;
    const distance = candidate - start;
    if (distance * v0 <= 0) continue;
    const ratio = distance / (v0 * tau);
    if (ratio < 1 / RETUNE || ratio > RETUNE) continue;
    const score = Math.abs(candidate - projected);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (best !== null)
    return {
      start,
      approach: best,
      tau: (best - start) / v0,
      springAt: Infinity,
      rest: best,
      springFrom: 0,
      springVelocity: 0,
    };

  // Too slow to reach a column naturally: settle on the nearest one.
  const rest = Math.min(maximum, Math.max(minimum, nearest));
  return spring(start, rest, v0, false);
}

/**
 * Position `elapsed` ms into a fling, whether it has arrived, and whether it
 * has visibly settled (the remaining creep is under a pixel per frame).
 */
export function flingAt(
  fling: Fling,
  elapsed: number,
): [number, boolean, boolean] {
  'worklet';
  const t = Math.max(0, elapsed);
  if (fling.tau > 0 && t < fling.springAt) {
    const remaining = (fling.approach - fling.start) * Math.exp(-t / fling.tau);
    const final = fling.springAt === Infinity;
    if (final && Math.abs(remaining) <= REST)
      return [fling.approach, true, true];
    return [
      fling.approach - remaining,
      false,
      final && Math.abs(remaining) <= SETTLED,
    ];
  }
  const s = t - (fling.tau > 0 ? fling.springAt : 0);
  const e0 = fling.springFrom;
  const v = fling.springVelocity;
  const envelope = Math.exp(-SPRING * s);
  const displacement = (e0 + (v + SPRING * e0) * s) * envelope;
  const speed = (v - SPRING * (v + SPRING * e0) * s) * envelope;
  if (
    (Math.abs(displacement) <= REST && Math.abs(speed) <= REST / 16) ||
    s > 4000
  )
    return [fling.rest, true, true];
  return [
    fling.rest + displacement,
    false,
    Math.abs(displacement) <= SETTLED && Math.abs(speed) <= SETTLED * SPRING,
  ];
}

/** Velocity of the visible content per unit of finger travel past an edge. */
export function rubberBandSlope(over: number, dimension: number): number {
  'worklet';
  if (over <= 0 || dimension <= 0) return 1;
  const k = (over * 0.55) / dimension + 1;
  return 0.55 / (k * k);
}
