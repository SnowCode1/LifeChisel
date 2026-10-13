// The size fields of a text style, without depending on a UI framework.
type SizedText = { fontSize?: number; lineHeight?: number };

export const TEXT_SCALE_MIN = 0.85;
export const TEXT_SCALE_MAX = 1.5;
export const TEXT_SCALE_STEP = 0.05;
export function isTextScale(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= TEXT_SCALE_MIN &&
    value <= TEXT_SCALE_MAX &&
    Math.abs(value * 20 - Math.round(value * 20)) < 0.000001
  );
}
export const roundTextScale = (value: number) =>
  Math.round(Math.max(TEXT_SCALE_MIN, Math.min(TEXT_SCALE_MAX, value)) * 20) /
  20;
export const combinedTextScale = (system: number, app: number) => system * app;
export function textSizeStyle(
  style: SizedText | undefined,
  scale: number,
  nested = false,
): SizedText {
  return {
    ...(typeof style?.fontSize === 'number'
      ? { fontSize: style.fontSize * scale }
      : !nested
        ? { fontSize: 14 * scale }
        : {}),
    ...(typeof style?.lineHeight === 'number'
      ? { lineHeight: style.lineHeight * scale }
      : {}),
  };
}
