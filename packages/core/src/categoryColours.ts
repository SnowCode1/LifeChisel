import { hexToOklch, oklchToHex } from './colors.ts';
import type { Habit } from './habits.ts';
import { blackTheme, type Theme } from './theme.ts';

// Golden-angle hue steps keep any number of categories well separated, and a
// category keeps its colour when later options are added.
const GOLDEN_ANGLE = 137.508;

/**
 * Automatic category colours derived from the habit colour in OKLCH: the same
 * readable lightness and chroma on black, with hues stepped from the habit's
 * own hue in saved category order (archived options keep their slot). Other
 * backgrounds adjust each colour's lightness to stay readable.
 */
export function categoryColours(
  habit: Habit,
  theme: Theme = blackTheme,
): Map<string, string> {
  const base = hexToOklch(habit.color),
    lightness = Math.min(0.86, Math.max(0.72, base.l)),
    chroma = Math.min(0.16, Math.max(0.1, base.c)),
    colours = new Map<string, string>();
  habit.categories?.forEach((category, index) =>
    colours.set(
      category.id,
      theme.colour(
        oklchToHex({
          l: lightness,
          c: chroma,
          h: (base.h + index * GOLDEN_ANGLE) % 360,
        }),
      ),
    ),
  );
  return colours;
}
