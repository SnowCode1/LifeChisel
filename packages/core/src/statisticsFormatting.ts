export const formatStatistic = (value: number | null) =>
  value === null
    ? '—'
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
export const statisticDateLabel = (key: string, withYear = false) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' as const } : {}),
  });
const at = (key: string) => new Date(`${key}T12:00:00`);
/** "Thu 9 Oct" (with the year when it differs from `today`). */
export const statisticDayLabel = (key: string, today: string) =>
  at(key).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(key.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
  });
/** "6–12 Oct" style spans; whole months read as "October 2026". */
export function statisticSpanLabel(from: string, to: string, today: string) {
  if (from === to) return statisticDayLabel(from, today);
  const year = from.slice(0, 4) !== today.slice(0, 4);
  return `${statisticDateLabel(from, year)} – ${statisticDateLabel(to, year || to.slice(0, 4) !== today.slice(0, 4))}`;
}
export const statisticMonthLabel = (key: string) =>
  at(key).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
export function statisticTickLabel(
  key: string,
  kind: 'week' | 'month' | 'year',
) {
  return kind === 'year'
    ? key.slice(0, 4)
    : kind === 'month'
      ? at(key).toLocaleDateString(undefined, { month: 'short' })
      : statisticDateLabel(key);
}
