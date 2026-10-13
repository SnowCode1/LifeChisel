// OKLab matrices: Björn Ottosson, https://bottosson.github.io/posts/oklab/
// Public UI uses familiar labels; stored colours remain portable sRGB hex.
export type Oklch = { l: number; c: number; h: number };
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const linear = (n: number) =>
  n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
const encoded = (n: number) =>
  n <= 0.0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - 0.055;

export function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(value))
    return (
      '#' +
      [...value]
        .map((c) => c + c)
        .join('')
        .toUpperCase()
    );
  return /^[0-9a-f]{6}$/i.test(value) ? '#' + value.toUpperCase() : null;
}

function channels(hex: string) {
  const valid = normalizeHex(hex);
  if (!valid) throw new Error('Expected a three- or six-digit RGB hex colour.');
  return [1, 3, 5].map((start) =>
    linear(parseInt(valid.slice(start, start + 2), 16) / 255),
  );
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = channels(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(a, bb);
  return {
    l: lightness,
    c,
    h: c < 0.00001 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

function toLinear({ l, c, h }: Oklch): number[] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const ll = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * ll - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * ll + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * ll - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function oklchToHex(color: Oklch): string {
  const safe = { l: clamp(color.l), c: Math.max(0, color.c), h: color.h };
  let rgb = toLinear(safe);
  // Reduce chroma to the sRGB boundary, preserving lightness/hue instead of
  // clipping individual channels (which can visibly shift a selected hue).
  const inGamut = (values: number[]) =>
    values.every((n) => n >= -0.000001 && n <= 1.000001);
  if (!inGamut(rgb)) {
    let low = 0,
      high = safe.c;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      if (inGamut(toLinear({ ...safe, c: mid }))) low = mid;
      else high = mid;
    }
    rgb = toLinear({ ...safe, c: low });
  }
  return (
    '#' +
    rgb
      .map((n) =>
        Math.round(clamp(encoded(n)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}

/** WCAG relative luminance, 0 for black and 1 for white. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/** The neutral grey with this WCAG luminance, exact for round trips. */
export function greyWithLuminance(value: number): string {
  const channel = Math.round(clamp(encoded(clamp(value))) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `#${channel}${channel}${channel}`;
}

export function contrastOnBlack(hex: string): number {
  return (luminance(hex) + 0.05) / 0.05;
}

// Marks drawn on a filled colour. White is the convention on saturated
// mid-tones (the deeper habit colours of light themes); pale fills, including
// every preset on black, keep black marks.
export function checkmarkColor(hex: string): string {
  return contrastRatio(hex, '#FFFFFF') >= 3 ? '#FFFFFF' : '#000000';
}

// Blend an opaque colour over a background in encoded sRGB, the way a
// translucent fill looks. Over black this is the original channel scaling.
export function mixColours(
  background: string,
  hex: string,
  opacity: number,
): string {
  const base = normalizeHex(background),
    top = normalizeHex(hex);
  if (!base || !top) throw new Error('Expected an RGB hex colour.');
  const amount = clamp(opacity);
  return (
    '#' +
    [1, 3, 5]
      .map((start) => {
        const from = parseInt(base.slice(start, start + 2), 16),
          to = parseInt(top.slice(start, start + 2), 16);
        return Math.round(from + (to - from) * amount)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
      .toUpperCase()
  );
}

// Resolve the existing empty-cell opacity against the grid's black background,
// so OKLCH muting starts from the colour the user already sees.
export function colorOnBlack(hex: string, opacity: number): string {
  return mixColours('#000000', hex, opacity);
}

// Darken towards a dark background by up to 30% of the lightness gap. The
// floor is measured from that background, so black keeps the original rule.
export function dimmedColor(
  hex: string,
  amount: number,
  minimumLightness = 0.38,
  backgroundLightness = 0,
): string {
  if (amount <= 0) return hex;
  const color = hexToOklch(hex);
  const base = clamp(backgroundLightness);
  const floor = base + minimumLightness * (1 - base);
  let lightness = Math.min(
    color.l,
    Math.max(floor, color.l - (color.l - base) * 0.3 * clamp(amount)),
  );
  const inGamut = (l: number) =>
    toLinear({ ...color, l }).every((n) => n >= -0.000001 && n <= 1.000001);
  // Darkening saturated colours can leave sRGB. Stop at the darkest available
  // lightness for the same chroma/hue instead of desaturating the selected colour.
  if (!inGamut(lightness)) {
    let low = lightness,
      high = color.l;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      if (inGamut(mid)) high = mid;
      else low = mid;
    }
    lightness = high;
  }
  return oklchToHex({ ...color, l: lightness });
}
