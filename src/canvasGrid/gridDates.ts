import type { WeekStart } from '@onpurpose/core/displayPreferences';

// Calendar parts for a UTC epoch day (as `goalTiming.ordinal` counts them),
// using integer arithmetic only so the canvas can call these on the UI thread
// every frame without allocating Date objects.

/** [year, month 1–12, day 1–31] for an epoch day (Hinnant's civil_from_days). */
export function civilFromDays(epochDay: number): [number, number, number] {
  'worklet';
  const z = epochDay + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (month <= 2 ? 1 : 0), month, day];
}

/** The saved `YYYY-MM-DD` key for an epoch day. */
export function dateKeyOf(epochDay: number): string {
  'worklet';
  const [year, month, day] = civilFromDays(epochDay);
  return `${year}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(epochDay: number): number {
  'worklet';
  return (((epochDay + 4) % 7) + 7) % 7;
}

/** Alternating calendar weeks, matching `isShadedWeek`. */
export function shadedWeekOf(epochDay: number, start: WeekStart): boolean {
  'worklet';
  const week = Math.floor((epochDay - (start === 'monday' ? 4 : 3)) / 7);
  return ((week % 2) + 2) % 2 === 0;
}
