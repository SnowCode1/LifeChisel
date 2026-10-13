import type { Theme } from '@onpurpose/core/theme';
import { highlightPalette } from '@onpurpose/core/richText/highlights';

// Interface greys that editor.css reads as `var(--ink-XX, #original)`. The
// native screen sends this palette into the DOM editor, so the web view needs
// no theme logic of its own; fallbacks keep the original black theme.
export const editorInkLevels = [
  0x00, 0x08, 0x15, 0x17, 0x20, 0x25, 0x30, 0x33, 0x50, 0x5d, 0x66, 0xaa, 0xbb,
  0xbd, 0xc5, 0xdd, 0xee,
] as const;
export const inkVariable = (level: number) =>
  `--ink-${level.toString(16).padStart(2, '0')}`;

export function editorPalette(theme: Theme): Record<string, string> {
  const palette: Record<string, string> = {
    '--scrim': theme.scrim(0x77),
    '--warning': theme.colour('#DFAE82'),
  };
  for (const level of editorInkLevels)
    palette[inkVariable(level)] = theme.ink(level);
  for (const [id, colour] of Object.entries(highlightPalette(theme.scheme))) {
    palette[`--highlight-${id}-bg`] = colour.background;
    palette[`--highlight-${id}-text`] = colour.text;
  }
  return palette;
}
