import type { Outcome } from './statsSeries';
import { blackTheme, type Theme } from './theme';

// One colour language for every chart and the calendar: full habit colour for
// success, the same hue faded for a scheduled miss, neutral grey off-schedule.
// `colour` is the habit's readable display colour (theme.colour).
export const MISSED_OPACITY = 0.32;
export const OFF_LEVEL = 0x3c;

export function outcomeFill(
  colour: string,
  outcome: Outcome,
  theme: Theme = blackTheme,
) {
  switch (outcome) {
    case 'met':
    case 'track':
      return colour;
    case 'missed':
    case 'open':
      return theme.mix(colour, MISSED_OPACITY);
    case 'off':
      return theme.ink(OFF_LEVEL);
    default:
      return null;
  }
}

/** Stepped brightness for combined periods: brighter means more days met. */
export function levelFill(
  colour: string,
  ratio: number,
  theme: Theme = blackTheme,
) {
  return theme.mix(
    colour,
    ratio >= 1 ? 1 : ratio >= 0.5 ? 0.72 : ratio > 0 ? 0.5 : MISSED_OPACITY,
  );
}
