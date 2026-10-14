// Readable cell text stays at this size (before app/system scaling). Native
// autosizing does not reliably enforce minimumFontScale on our iOS renderer.
export const GRID_ENTRY_FONT_SIZE = 12;
export const GRID_ENTRY_LINE_HEIGHT = 14;

export function gridEntryTextLines(height: number, fontScale: number) {
  // Reserve vertical breathing room; Roomy rows can show a third line without
  // reducing the font. Width-based wrapping and truncation remain native.
  return Math.max(
    1,
    Math.min(
      3,
      Math.floor((height - 12) / (GRID_ENTRY_LINE_HEIGHT * fontScale)),
    ),
  );
}
