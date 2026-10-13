export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Calendar arithmetic at local noon avoids assuming every day is 24 hours.
export function calendarDay(today: string, daysAgo: number): Date {
  if (!Number.isInteger(daysAgo)) {
    throw new Error('A calendar offset must be an integer.');
  }
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

export function millisecondsUntilTomorrow(now: Date): number {
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 100);
  return tomorrow.getTime() - now.getTime();
}

export type GridDay = {
  key: string;
  daysAgo: number;
  label: string;
  number: number;
  fullLabel: string;
};

export type EntryDay = Pick<GridDay, 'key' | 'fullLabel'>;

export function entryDay(key: string): EntryDay {
  return {
    key,
    fullLabel: calendarDay(key, 0).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  };
}

// Each grid owns its cache; discard it on local rollover/unmount. Existing date
// objects survive range expansion, so memoized visible columns remain untouched.
export function createGridDayCache(today: string) {
  const cache = new Map<number, GridDay>();
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  const full = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return (count: number, futureCount = 0, origin = 0): GridDay[] => {
    const result = Array.from({ length: count + futureCount }, (_, index) => {
      const daysAgo = index - futureCount + origin;
      let day = cache.get(daysAgo);
      if (day) cache.delete(daysAgo);
      if (!day) {
        const date = calendarDay(today, daysAgo);
        day = {
          key: localDateKey(date),
          daysAgo,
          label: daysAgo === 0 ? 'Today' : weekday.format(date),
          number: date.getDate(),
          fullLabel: full.format(date),
        };
      }
      cache.set(daysAgo, day);
      return day;
    });
    // Retain the entire loaded window and a small overlap, not lifetime browsing.
    const limit = Math.max(512, count + futureCount);
    while (cache.size > limit) cache.delete(cache.keys().next().value!);
    return result;
  };
}
export function makeGridDays(
  today: string,
  count: number,
  futureCount = 0,
): GridDay[] {
  return createGridDayCache(today)(count, futureCount);
}
