import { commonHabitIcons } from './commonHabitIcons.ts';
import { commonTablerIcons } from './commonTablerIcons.ts';
import { habitIconCatalog } from './habitIconCatalog.ts';
import { tablerIconCatalog } from './tablerIconCatalog.ts';
import type { HabitIcon } from './habitIcons.ts';

export type IconPackFilter = 'all' | 'phosphor' | 'tabler';
export type IconChoice = {
  id: string;
  value: HabitIcon;
  pack: Exclude<IconPackFilter, 'all'>;
  label: string;
  tags: string;
};
function fromCatalog(
  pack: Exclude<IconPackFilter, 'all'>,
  catalog: readonly { id: string; label: string; tags: string }[],
): IconChoice[] {
  return catalog.map((icon) => ({
    ...icon,
    pack,
    value: `${pack}:${icon.id}` as HabitIcon,
  }));
}
const all = [
  fromCatalog('phosphor', habitIconCatalog),
  fromCatalog('tabler', tablerIconCatalog),
].flat();
export const packIconCount = all.length;
const byValue = new Map(all.map((icon) => [icon.value, icon]));
const common = [
  ...commonHabitIcons
    .slice(0, 7)
    .map((icon) => byValue.get(`phosphor:${icon.id}`)!),
  ...commonTablerIcons.map((icon) => byValue.get(`tabler:${icon.id}`)!),
  ...commonHabitIcons
    .slice(7)
    .map((icon) => byValue.get(`phosphor:${icon.id}`)!),
];
const commonValues = new Set(common.map((icon) => icon.value));
function normalize(value: string) {
  return value.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}
const searchable = all.map((icon) => ({
  icon,
  text: normalize(`${icon.id} ${icon.label} ${icon.tags}`),
  name: normalize(icon.id),
  label: normalize(icon.label),
}));
// A query searches BOTH packs and ALL icons; browse filters resume when cleared.
export function searchHabitIcons(
  query: string,
  showAll = false,
  pack: IconPackFilter = 'all',
): readonly IconChoice[] {
  const normalized = normalize(query);
  if (!normalized)
    return (showAll ? all : common).filter(
      (icon) => pack === 'all' || icon.pack === pack,
    );
  const words = normalized.split(' ');
  const rank = ({ icon, name, label }: (typeof searchable)[number]) =>
    name === normalized || label === normalized
      ? 0
      : commonValues.has(icon.value)
        ? 1
        : 2;
  return searchable
    .filter(({ text }) => words.every((word) => text.includes(word)))
    .sort((a, b) => rank(a) - rank(b))
    .map(({ icon }) => icon);
}
