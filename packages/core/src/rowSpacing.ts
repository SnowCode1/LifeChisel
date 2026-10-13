import { autoRowHeight } from './gridSizing.ts';

export const rowSpacingOptions = [
  { value: 'compact', label: 'Compact', height: 44 },
  { value: 'standard', label: 'Standard', height: 52 },
  { value: 'roomy', label: 'Roomy', height: 64 },
] as const;
export type RowSpacing = (typeof rowSpacingOptions)[number]['value'];
export function isRowSpacing(value: unknown): value is RowSpacing {
  return rowSpacingOptions.some((option) => option.value === value);
}
// Rows grow with larger text so wrapped names and values stay readable.
export function gridRowHeight(
  height: number | 'auto',
  fontScale: number,
  screenLongSide: number,
) {
  const base = height === 'auto' ? autoRowHeight(screenLongSide) : height;
  return Math.max(base, Math.ceil((base - 4) * fontScale));
}
