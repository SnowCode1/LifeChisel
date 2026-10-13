import type { Habit } from './habits.ts';

export function moveHabit(
  ids: string[],
  id: string,
  destination: number,
): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return ids;
  const result = [...ids];
  result.splice(from, 1);
  result.splice(Math.max(0, Math.min(result.length, destination)), 0, id);
  return result;
}
// Archived habits retain their slots while the visible rows are rearranged.
export function fullHabitOrder(habits: Habit[], visible: string[]): string[] {
  const active = habits
    .filter((habit) => !habit.archived)
    .map((habit) => habit.id);
  if (
    visible.length !== active.length ||
    new Set(visible).size !== active.length ||
    visible.some((id) => !active.includes(id))
  )
    throw new Error('Invalid visible habit order.');
  let index = 0;
  return habits.map((habit) => (habit.archived ? habit.id : visible[index++]));
}
// Reordering a filtered grid fills only displayed slots; hidden/archived rows
// keep their saved places. The persisted result is still a full permutation.
export function displayedHabitOrder(
  habits: Habit[],
  displayed: string[],
): string[] {
  const ids = new Set(displayed);
  if (
    ids.size !== displayed.length ||
    displayed.some((id) => !habits.some((h) => h.id === id && !h.archived))
  )
    throw new Error('Invalid displayed habit order.');
  let index = 0;
  return habits.map((habit) =>
    ids.has(habit.id) ? displayed[index++] : habit.id,
  );
}
export function dragDestination(
  ids: string[],
  heights: Record<string, number>,
  fallback: number,
  centre: number,
): number {
  let top = 0,
    nearest = 0,
    distance = Infinity;
  ids.forEach((id, index) => {
    const height = heights[id] ?? fallback;
    const candidate = Math.abs(centre - (top + height / 2));
    if (candidate < distance) {
      nearest = index;
      distance = candidate;
    }
    top += height;
  });
  return nearest;
}

// Shared by preview rendering and the final drop, including wrapped/taller names.
export function habitRowPositions(
  ids: string[],
  heights: Record<string, number>,
  fallback: number,
): { tops: Record<string, number>; total: number } {
  const tops: Record<string, number> = {};
  let total = 0;
  for (const id of ids) {
    tops[id] = total;
    total += heights[id] ?? fallback;
  }
  return { tops, total };
}
