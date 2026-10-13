import emojiRegex from 'emoji-regex';
import { habitIconCatalog } from './habitIconCatalog.ts';
import { tablerIconCatalog } from './tablerIconCatalog.ts';
export type HabitIcon =
  | `phosphor:${(typeof habitIconCatalog)[number]['id']}`
  | `tabler:${(typeof tablerIconCatalog)[number]['id']}`
  | `emoji:${string}`;
const labels = new Map<string, string>([
  ...habitIconCatalog.map(
    (icon) => [`phosphor:${icon.id}`, icon.label] as const,
  ),
  ...tablerIconCatalog.map(
    (icon) => [`tabler:${icon.id}`, icon.label] as const,
  ),
]);
export function isSingleEmoji(value: string): boolean {
  if (!value || value.length > 64) return false;
  const match = emojiRegex().exec(value);
  return match?.index === 0 && match[0] === value;
}
export function isHabitIcon(value: unknown): value is HabitIcon {
  if (typeof value !== 'string') return false;
  return (
    labels.has(value) ||
    (value.startsWith('emoji:') && isSingleEmoji(value.slice(6)))
  );
}
export function habitIconLabel(icon?: HabitIcon): string {
  if (!icon) return 'None';
  if (icon.startsWith('emoji:')) return icon.slice(6);
  return labels.get(icon) ?? 'Icon';
}
export function habitIconPackLabel(icon?: HabitIcon): string {
  if (icon?.startsWith('phosphor:')) return 'Phosphor';
  if (icon?.startsWith('tabler:')) return 'Tabler';
  return icon ? 'Emoji' : 'None';
}
