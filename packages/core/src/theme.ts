// App colours derived from one background colour. Pure: no React Native
// imports, so storage, tests and pure colour modules can use it.
//
// Every interface colour was originally chosen against pure black. A theme keeps
// each one's *relative* contrast against the active background instead:
//   ink(0x99)     the grey that does the job #999999 did on black
//   tint(hex)     a tinted surface that was designed on black (e.g. banners)
//   colour(hex)   a habit or accent colour, adjusted only when needed to stay
//                 readable (hue and colourfulness are kept; lightness moves)
// On pure black every helper returns the original value exactly.
import {
  contrastRatio,
  dimmedColor,
  greyWithLuminance,
  hexToOklch,
  luminance,
  mixColours,
  normalizeHex,
  oklchToHex,
} from './colors.ts';

export type ThemeMode = 'system' | 'dark' | 'light';
export type ThemeScheme = 'dark' | 'light';
export const themeModeOptions = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
] as const;
export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'dark' || value === 'light';
}
export const defaultBackgrounds = {
  dark: '#000000',
  light: '#F6F3EC',
} as const;

// OKLCH lightness ranges that keep text, habit colours and controls readable.
// Saved colours are never rejected for these limits (old events must replay);
// display clamps them with fitBackground instead.
export const backgroundLimits = {
  dark: { min: 0, max: 0.34 },
  light: { min: 0.86, max: 1 },
  chroma: 0.12,
} as const;
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));

/** A background inside its scheme's readable range (exact when already inside). */
export function fitBackground(scheme: ThemeScheme, hex: string): string {
  const valid = normalizeHex(hex) ?? defaultBackgrounds[scheme];
  const colour = hexToOklch(valid);
  const { min, max } = backgroundLimits[scheme];
  // Allow rounding slack so a fitted colour stays fitted when read back.
  if (
    colour.l >= min - 0.004 &&
    colour.l <= max + 0.004 &&
    colour.c <= backgroundLimits.chroma + 0.004
  )
    return valid;
  return oklchToHex({
    l: clamp(colour.l, min, max),
    c: Math.min(colour.c, backgroundLimits.chroma),
    h: colour.h,
  });
}

/** System follows the phone; an unknown system appearance keeps dark. */
export function resolveScheme(
  mode: ThemeMode,
  system: string | null | undefined,
): ThemeScheme {
  if (mode !== 'system') return mode;
  return system === 'light' ? 'light' : 'dark';
}

export type Theme = {
  scheme: ThemeScheme;
  background: string;
  /** Status bar text: light text on dark backgrounds. */
  statusBar: 'light' | 'dark';
  /** Interface grey by its original black-theme level (0 = background, 255 = full contrast). */
  ink: (level: number) => string;
  /** Translucent full-contrast ink (#RRGGBBAA) for overlays drawn above other colours. */
  overlay: (alpha: number) => string;
  /** A tinted surface designed on black, mapped to this background. */
  tint: (hex: string) => string;
  /** A habit/accent colour that stays readable (at least 4.5:1) on this background. */
  colour: (hex: string) => string;
  /** An opaque colour blended over the background, like a translucent fill. */
  mix: (hex: string, opacity: number) => string;
  /** Mute a colour towards the background (distant dates); the floor keeps it visible. */
  fade: (hex: string, amount: number, minimumLightness?: number) => string;
  /** WCAG contrast ratio against the background. */
  contrast: (hex: string) => number;
  /** Dimming backdrop behind dialogs; lighter on light backgrounds. */
  scrim: (alpha: number) => string;
  accent: string;
  accentText: string;
  link: string;
  danger: string;
};

export const MIN_CONTRAST = 4.5;
const hex2 = (alpha: number) =>
  Math.round(clamp(alpha, 0, 255))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

// Position of a luminance between black and white on a log contrast scale,
// mapped onto the scale from the background to the opposite pole. Black and
// white backgrounds keep every original contrast ratio exactly.
function mappedLuminance(
  source: number,
  background: number,
  scheme: ThemeScheme,
): number {
  const position = Math.log((source + 0.05) / 0.05) / Math.log(21);
  const pole = scheme === 'dark' ? 1.05 : 0.05;
  return clamp((background + 0.05) ** (1 - position) * pole ** position - 0.05);
}
function withLuminance(target: number, chroma: number, hue: number): string {
  if (chroma < 0.002) return greyWithLuminance(target);
  let low = 0,
    high = 1;
  for (let i = 0; i < 22; i++) {
    const mid = (low + high) / 2;
    if (luminance(oklchToHex({ l: mid, c: chroma, h: hue })) < target)
      low = mid;
    else high = mid;
  }
  return oklchToHex({ l: (low + high) / 2, c: chroma, h: hue });
}

function buildTheme(scheme: ThemeScheme, background: string): Theme {
  const base = hexToOklch(background);
  const baseLuminance = luminance(background);
  const black = background === '#000000';
  const neutral = base.c < 0.002;
  const inks: string[] = [];
  const tints = new Map<string, string>();
  const colours = new Map<string, string>();
  const fades = new Map<string, string>();

  function ink(level: number): string {
    const index = Math.round(clamp(level, 0, 255));
    const cached = inks[index];
    if (cached) return cached;
    const grey = `#${hex2(index)}${hex2(index)}${hex2(index)}`;
    let result: string;
    if (black) result = grey;
    else if (index === 0) result = background;
    else {
      const source = luminance(grey);
      const position = Math.log((source + 0.05) / 0.05) / Math.log(21);
      // Surfaces near the background carry its hue; text tends to neutral.
      result = withLuminance(
        mappedLuminance(source, baseLuminance, scheme),
        neutral ? 0 : base.c * (1 - position),
        base.h,
      );
    }
    inks[index] = result;
    return result;
  }
  function tint(hex: string): string {
    const valid = normalizeHex(hex);
    if (!valid) throw new Error('Expected an RGB hex colour.');
    if (black) return valid;
    const cached = tints.get(valid);
    if (cached) return cached;
    const source = hexToOklch(valid);
    const result = withLuminance(
      mappedLuminance(luminance(valid), baseLuminance, scheme),
      source.c,
      source.h,
    );
    tints.set(valid, result);
    return result;
  }
  function colour(hex: string): string {
    const valid = normalizeHex(hex);
    if (!valid) throw new Error('Expected an RGB hex colour.');
    const cached = colours.get(valid);
    if (cached) return cached;
    let result = valid;
    if (contrastRatio(valid, background) < MIN_CONTRAST) {
      // Move lightness away from the background until the colour is readable.
      const source = hexToOklch(valid);
      const passes = (l: number) =>
        contrastRatio(oklchToHex({ ...source, l }), background) >= MIN_CONTRAST;
      let low = source.l,
        high = scheme === 'dark' ? 1 : 0;
      if (passes(high)) {
        for (let i = 0; i < 22; i++) {
          const mid = (low + high) / 2;
          if (passes(mid)) high = mid;
          else low = mid;
        }
      }
      result = oklchToHex({ ...source, l: high });
    }
    colours.set(valid, result);
    return result;
  }
  function fade(hex: string, amount: number, minimumLightness = 0.38) {
    if (amount <= 0) return hex;
    const key = `${hex}|${amount}|${minimumLightness}`;
    const cached = fades.get(key);
    if (cached) return cached;
    let result: string;
    if (scheme === 'dark')
      result = dimmedColor(hex, amount, minimumLightness, base.l);
    else {
      // Light backgrounds: blend towards the background, reducing the log
      // contrast by up to 40% (less for a higher floor, as dates use).
      const strength = (0.4 * (1 - minimumLightness)) / (1 - 0.38);
      const start = contrastRatio(hex, background);
      const target = start ** (1 - strength * clamp(amount));
      let low = 0,
        high = 1;
      for (let i = 0; i < 18; i++) {
        const mid = (low + high) / 2;
        if (
          contrastRatio(mixColours(background, hex, mid), background) >= target
        )
          high = mid;
        else low = mid;
      }
      result = mixColours(background, hex, high);
    }
    fades.set(key, result);
    return result;
  }
  return {
    scheme,
    background,
    statusBar: scheme === 'dark' ? 'light' : 'dark',
    ink,
    overlay: (alpha) => `${ink(255)}${hex2(alpha)}`,
    tint,
    colour,
    mix: (hex, opacity) => mixColours(background, hex, opacity),
    fade,
    contrast: (hex) => contrastRatio(hex, background),
    scrim: (alpha) => `#000000${hex2(scheme === 'dark' ? alpha : alpha * 0.6)}`,
    accent: colour('#74BBA5'),
    accentText: colour('#9BDBBE'),
    link: colour('#B7DCCF'),
    danger: colour('#D99090'),
  };
}

// Stable identities let style caches key on the theme object. Drafts in the
// background picker create several themes, so keep only recent ones.
const themes = new Map<string, Theme>();
export function createTheme(scheme: ThemeScheme, background: string): Theme {
  const fitted = fitBackground(scheme, background);
  const key = `${scheme}|${fitted}`;
  const cached = themes.get(key);
  if (cached) {
    themes.delete(key);
    themes.set(key, cached);
    return cached;
  }
  const theme = buildTheme(scheme, fitted);
  themes.set(key, theme);
  if (themes.size > 12) themes.delete(themes.keys().next().value!);
  return theme;
}
export const blackTheme = createTheme('dark', defaultBackgrounds.dark);

export function themeFor(
  mode: ThemeMode,
  system: string | null | undefined,
  darkBackground: string,
  lightBackground: string,
): Theme {
  const scheme = resolveScheme(mode, system);
  return createTheme(
    scheme,
    scheme === 'dark' ? darkBackground : lightBackground,
  );
}

// Background presets for each scheme, all inside backgroundLimits. Each
// default comes first.
export const backgroundPresets: Record<
  ThemeScheme,
  readonly { name: string; value: string }[]
> = {
  dark: [
    { name: 'Black', value: '#000000' },
    { name: 'Graphite', value: '#0D0D0D' },
    { name: 'Midnight', value: '#030A1D' },
    { name: 'Forest', value: '#01110A' },
    { name: 'Plum', value: '#110718' },
    { name: 'Espresso', value: '#130C07' },
  ],
  light: [
    { name: 'Paper', value: '#F6F3EC' },
    { name: 'White', value: '#FFFFFF' },
    { name: 'Mist', value: '#EDF1F5' },
    { name: 'Sage', value: '#EDF3EC' },
    { name: 'Blush', value: '#F8EEF1' },
    { name: 'Sand', value: '#F1ECE2' },
  ],
};
/** A preset's name, or the (fitted) hex for a custom background. */
export function backgroundName(scheme: ThemeScheme, saved: string): string {
  const fitted = fitBackground(scheme, saved);
  return (
    backgroundPresets[scheme].find((preset) => preset.value === fitted)?.name ??
    fitted
  );
}
