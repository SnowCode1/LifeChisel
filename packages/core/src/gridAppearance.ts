import { checkmarkColor } from './colors.ts';
import { blackTheme, type Theme } from './theme.ts';

// `colour` is the habit's readable display colour on this background; the
// saved habit colour itself is never changed. Every date shares one tone: the
// distance fade for older and future dates was removed (12 October 2026).
// Colour means done (founder choice, 18 October 2026): empty boxes, missed-day
// crosses, blank values and not-done tiles are neutral grey, and the habit
// colour appears when something is done. Done days carry a clearer tint than
// before (16%, was 10%), so done and not done differ in brightness, not only
// in hue. Names keep their colour, so rows stay easy to find.
export function createGridPalette(saved: string, theme: Theme = blackTheme) {
  const colour = theme.colour(saved);
  return {
    colour,
    // Cell backgrounds travel with the palette so cells need no theme context.
    background: theme.background,
    todayBackground: theme.ink(0x09),
    pressed: `${colour}20`,
    checkmark: checkmarkColor(colour),
    completedBackground: theme.mix(colour, 0.16),
    // A ticked box whose goal is not met (an Unchecked goal, say).
    checkbox: theme.mix(colour, 170 / 255),
    // An unticked box's outline, and an unticked cross in Ticks & crosses.
    empty: theme.ink(0x5a),
    // A missed day's cross.
    missed: theme.ink(0x50),
    // A day with no value (the dash).
    number: theme.ink(0x5a),
    rule: `${colour}20`,
    // Today tiles: a done tile is tinted with a soft edge in the habit colour;
    // a tile not done yet keeps the grey surface with a neutral edge.
    tileDone: theme.mix(colour, 0.2),
    tileDoneEdge: theme.mix(colour, 0.35),
    tileEdge: theme.ink(0x1c),
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
