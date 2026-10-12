// iOS rubber-banding already resists this distance; only a direct drag released
// beyond the threshold unlocks dates. Momentum reaching the edge never does.
export const FUTURE_PULL_DISTANCE = 64;
export const FUTURE_BATCH = 30;

export function shouldRevealFuture(offset: number): boolean {
  'worklet';
  return offset <= -FUTURE_PULL_DISTANCE;
}

// Android lists stop at their newest date instead of rubber-banding, so a pull
// there is recognised separately. It decides within a few points, before the
// list's own touch slop, and follows the finger at two-thirds speed: about 96
// points of travel reach the threshold.
export const EDGE_PULL_SLOP = 6;

export function edgePullDistance(travel: number): number {
  'worklet';
  return (Math.max(0, travel) * 2) / 3;
}

export function edgePullDecision(
  dx: number,
  dy: number,
): 'activate' | 'fail' | 'wait' {
  'worklet';
  const vertical = Math.abs(dy);
  if (dx > EDGE_PULL_SLOP || (vertical > EDGE_PULL_SLOP && vertical > -dx))
    return 'fail';
  return -dx >= EDGE_PULL_SLOP && -dx > vertical * 1.5 ? 'activate' : 'wait';
}

// Continue the released pull by its own distance, not by the viewport width.
// The old newest date stays nearby even when landscape shows many columns.
export function futureRevealDay(
  offset: number,
  columnWidth: number,
  futureCount: number,
): number {
  const distance = Math.max(1, Math.round(-offset / columnWidth));
  return -futureCount - Math.min(FUTURE_BATCH, distance);
}

export function settledDay(
  offset: number,
  columnWidth: number,
  pastCount: number,
  futureCount: number,
  visibleDays: number,
): number {
  'worklet';
  if (columnWidth <= 0) return 0;
  const index = Math.max(
    0,
    Math.min(
      pastCount + futureCount - visibleDays,
      Math.round(offset / columnWidth),
    ),
  );
  return index - futureCount;
}
