import { checkmarkColor } from './colors.ts';
import { blackTheme, type Theme } from './theme.ts';

// `colour` is the habit's readable display colour on this background; the
// saved habit colour itself is never changed. Every date shares one tone: the
// distance fade for older and future dates was removed (12 October 2026).
export function createGridPalette(saved: string, theme: Theme = blackTheme) {
  const colour = theme.colour(saved);
  return {
    colour,
    // Cell backgrounds travel with the palette so cells need no theme context.
    background: theme.background,
    todayBackground: theme.ink(0x09),
    pressed: `${colour}20`,
    checkmark: checkmarkColor(colour),
    completedBackground: theme.mix(colour, 0.1),
    checkbox: theme.mix(colour, 170 / 255),
    number: theme.mix(colour, 0.65),
    rule: `${colour}20`,
  };
}
export type GridPalette = ReturnType<typeof createGridPalette>;
export type DateTone = { label: string; number: string };
const dateToneCache = new WeakMap<Theme, DateTone>();
export function dateTone(theme: Theme = blackTheme): DateTone {
  let tone = dateToneCache.get(theme);
  if (!tone) {
    tone = { label: theme.ink(0x97), number: theme.ink(0xe8) };
    dateToneCache.set(theme, tone);
  }
  return tone;
}
