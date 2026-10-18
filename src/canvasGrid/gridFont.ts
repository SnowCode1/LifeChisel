import {
  FontWeight,
  Skia,
  type SkFont,
  type SkTypeface,
} from '@shopify/react-native-skia';
import { Platform } from 'react-native';

/**
 * The grid draws its text with Skia, which does not use React Native's font
 * system, so it names the platform's system face to match the rest of the
 * app (founder decision, 18 October 2026: the apps use the system font, and
 * Instrument Sans is the brand voice on the landing page). Left unnamed,
 * Skia's paragraphs ask for "sans-serif", which Skia's Apple font manager
 * does not know, so the grid was drawn in its default, Helvetica.
 * ".AppleSystemUIFont" is CoreText's name for San Francisco; Android
 * resolves "sans-serif" to Roboto. Skia's FontMgr.matchFamilyStyle passes
 * both names through unchanged, so a font for measuring gets the same face.
 */
export const GRID_FONT_FAMILY =
  Platform.OS === 'ios' ? '.AppleSystemUIFont' : 'sans-serif';
export const GRID_FONT_FAMILIES = [GRID_FONT_FAMILY];
// Digits stay proportional: each cell centres its own number, so equal-width
// (tabular) digits would line nothing up, and they leave a narrow 1 looking
// off-centre in its wide advance.

const faces = new Map<FontWeight, SkTypeface | null>();
/** A font in the grid's face, for measuring text the grid draws. */
export function gridFont(size: number, weight: FontWeight): SkFont | null {
  let face = faces.get(weight);
  if (face === undefined) {
    face =
      Skia.FontMgr.System().matchFamilyStyle(GRID_FONT_FAMILY, { weight }) ??
      null;
    faces.set(weight, face);
  }
  return face ? Skia.Font(face, size) : null;
}
