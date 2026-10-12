// A drag past the Today/future boundary must be released at least this far
// (displayed, after resistance) to unlock dates. Momentum reaching it never does.
export const FUTURE_PULL_DISTANCE = 64;
export const FUTURE_BATCH = 30;

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
