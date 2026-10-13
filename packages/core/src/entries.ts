import { habitType, type Habit } from './habits.ts';

export type EntryValue = number | string | string[];
export type EntryValues = Record<string, EntryValue>;
export const MAX_ENTRY_TEXT = 10000;
export const MAX_CATEGORIES = 40;
export const MAX_CATEGORY_LABEL = 60;
export const MAX_CATEGORY_SHORT_LABEL = 12;

export function sameEntry(left: unknown, right: unknown): boolean {
  return (
    left === right ||
    (Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((id, index) => id === right[index]))
  );
}
export function categorySelection(ids: readonly string[]): string[] | null {
  const selected = [...new Set(ids)].sort();
  return selected.length ? selected : null;
}
export function textEntry(text: string): string | null {
  return text.trim() ? text : null;
}
export function validEntryText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_ENTRY_TEXT
  );
}
export function entryLabel(
  habit: Habit,
  value: EntryValue | null | undefined,
  compact = false,
): string {
  if (value == null) return '—';
  if (Array.isArray(value)) {
    // Storage uses sorted IDs; display follows the configured option order.
    const ordered = habit.categories
      ? [
          ...habit.categories
            .filter((option) => value.includes(option.id))
            .map((option) => option.id),
          ...value.filter(
            (id) => !habit.categories!.some((option) => option.id === id),
          ),
        ]
      : value;
    return ordered
      .map((id) => {
        const option = habit.categories?.find((item) => item.id === id);
        return (compact && option?.shortLabel) || option?.label || id;
      })
      .join(compact ? ' · ' : ', ');
  }
  if (habitType(habit) === 'checkbox')
    return value === 1 ? 'Checked' : value === 0 ? 'Unchecked' : '—';
  return String(value);
}
// Bound native text measurement while retaining the full value in the editor.
export function cellEntryLabel(habit: Habit, value: EntryValue | undefined) {
  const label = entryLabel(habit, value, true).replace(/\s+/g, ' ').trim();
  const characters = Array.from(label);
  return characters.length > 32
    ? characters.slice(0, 31).join('') + '…'
    : label;
}
