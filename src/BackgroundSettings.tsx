import { useState, type ReactNode } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Text, TextInput } from './Typography';
import { ColourSlider } from './ColourPicker';
import {
  checkmarkColor,
  hexToOklch,
  normalizeHex,
  oklchToHex,
  type Oklch,
} from '@onpurpose/core/colors';
import { feedback } from './haptics';
import {
  backgroundLimits,
  backgroundName,
  backgroundPresets,
  createTheme,
  defaultBackgrounds,
  fitBackground,
  type ThemeMode,
  type ThemeScheme,
} from '@onpurpose/core/theme';
import { ThemeProvider, themedStyles, useTheme } from './ThemeContext';

export type ThemePreference =
  | { kind: 'themeMode'; value: ThemeMode }
  | { kind: 'darkBackground' | 'lightBackground'; value: string };

function usageNote(scheme: ThemeScheme, mode: ThemeMode, inUse: boolean) {
  if (mode === scheme) return 'In use now.';
  if (mode === 'system')
    return inUse
      ? `In use now, while your phone is in ${scheme} mode.`
      : `Used when your phone switches to ${scheme} mode.`;
  return `Used when Theme is ${scheme === 'dark' ? 'Dark' : 'Light'}, or System while your phone is in ${scheme} mode.`;
}

// One background per scheme: presets, three sliders and hex entry. Sliders
// preview while dragging and save once on release, like the grid sizes.
// Colours outside the scheme's readable range are moved to its nearest edge.
export function BackgroundSettings({
  scheme,
  saved,
  mode,
  editable,
  onChange,
  preview,
}: {
  scheme: ThemeScheme;
  saved: string;
  mode: ThemeMode;
  editable: boolean;
  onChange: (value: string) => void;
  /** Drawn inside the draft theme, so it shows the result before saving. */
  preview: ReactNode;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const fitted = fitBackground(scheme, saved);
  const limits = backgroundLimits[scheme];
  // Slider positions persist separately: a grey has no hue of its own, but
  // the hue slider should stay where it was left.
  const [sliders, setSliders] = useState<Oklch>(() => hexToOklch(fitted));
  const [dragging, setDragging] = useState(false);
  const [hex, setHex] = useState(fitted);
  const typed = normalizeHex(hex);
  const draft = dragging
    ? fitBackground(scheme, oklchToHex(sliders))
    : typed
      ? fitBackground(scheme, typed)
      : fitted;
  const draftTheme = createTheme(scheme, draft);
  const inUse = theme.scheme === scheme && theme.background === fitted;

  function save(value: string) {
    const next = fitBackground(scheme, value);
    setHex(next);
    if (next !== fitted) onChange(next);
  }
  function choosePreset(value: string) {
    if (value !== fitted) feedback('selection');
    setSliders(hexToOklch(value));
    save(value);
  }
  function slide(key: keyof Oklch, value: number) {
    setDragging(true);
    setSliders((previous) => ({ ...previous, [key]: value }));
  }
  function release(key: keyof Oklch, value: number) {
    const next = { ...sliders, [key]: value };
    setDragging(false);
    setSliders(next);
    save(oklchToHex(next));
  }
  function submitHex() {
    Keyboard.dismiss();
    if (!typed) return;
    setSliders(hexToOklch(fitBackground(scheme, typed)));
    save(typed);
  }
  const middle = (limits.min + limits.max) / 2;
  return (
    <View style={{ gap: 16 }}>
      <View
        style={[styles.preview, { backgroundColor: draftTheme.background }]}
      >
        <ThemeProvider theme={draftTheme}>{preview}</ThemeProvider>
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.note}>
        {usageNote(scheme, mode, inUse)}
      </Text>
      <View style={styles.group}>
        <View style={styles.swatches}>
          {backgroundPresets[scheme].map((preset) => {
            const selected = preset.value === fitted;
            return (
              <Pressable
                key={preset.value}
                accessibilityRole="radio"
                accessibilityLabel={preset.name}
                accessibilityState={{ selected, disabled: !editable }}
                disabled={!editable}
                onPress={() => choosePreset(preset.value)}
                style={({ pressed }) => [
                  styles.swatchTarget,
                  { opacity: !editable ? 0.4 : pressed ? 0.6 : 1 },
                ]}
              >
                <View
                  style={[
                    styles.swatchRing,
                    {
                      borderColor: selected ? theme.ink(0xff) : 'transparent',
                    },
                  ]}
                >
                  <View
                    style={[styles.swatch, { backgroundColor: preset.value }]}
                  >
                    {selected && (
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.check,
                          { color: checkmarkColor(preset.value) },
                        ]}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                </View>
                <Text numberOfLines={1} style={styles.swatchLabel}>
                  {preset.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.custom}>
          <ColourSlider
            label="Hue"
            value={sliders.h}
            max={360}
            step={1}
            disabled={!editable}
            onChange={(value) => slide('h', value)}
            onComplete={(value) => release('h', value)}
            colors={Array.from({ length: 36 }, (_, i) =>
              oklchToHex({ l: middle, c: 0.08, h: i * 10 }),
            )}
          />
          <ColourSlider
            label="Colourfulness"
            value={sliders.c}
            max={backgroundLimits.chroma}
            step={0.002}
            disabled={!editable}
            onChange={(value) => slide('c', value)}
            onComplete={(value) => release('c', value)}
            colors={Array.from({ length: 12 }, (_, i) =>
              oklchToHex({
                ...sliders,
                l: Math.min(limits.max, Math.max(limits.min, sliders.l)),
                c: (i / 11) * backgroundLimits.chroma,
              }),
            )}
          />
          <ColourSlider
            label="Lightness"
            value={sliders.l}
            min={limits.min}
            max={limits.max}
            step={0.005}
            disabled={!editable}
            onChange={(value) => slide('l', value)}
            onComplete={(value) => release('l', value)}
            colors={Array.from({ length: 12 }, (_, i) =>
              oklchToHex({
                ...sliders,
                l: limits.min + (i / 11) * (limits.max - limits.min),
              }),
            )}
          />
          <View style={styles.hexRow}>
            <Text style={styles.secondary}>Hex</Text>
            <TextInput
              accessibilityLabel={`${scheme === 'dark' ? 'Dark' : 'Light'} background hex colour`}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={editable}
              maxLength={7}
              value={dragging ? draft : hex}
              onChangeText={setHex}
              onSubmitEditing={submitHex}
              onBlur={submitHex}
              placeholder={defaultBackgrounds[scheme]}
              placeholderTextColor={theme.ink(0x77)}
              style={styles.hexInput}
              returnKeyType="done"
            />
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.secondary}>
            {!typed
              ? 'Enter 3 or 6 hex digits.'
              : fitBackground(scheme, typed) !== typed
                ? `Adjusted to ${fitBackground(scheme, typed)} so text and habit colours stay readable.`
                : 'Text, controls and habit colours adjust to this background.'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: !editable || fitted === defaultBackgrounds[scheme],
          }}
          disabled={!editable || fitted === defaultBackgrounds[scheme]}
          onPress={() => choosePreset(defaultBackgrounds[scheme])}
          style={({ pressed }) => [
            styles.reset,
            {
              opacity:
                !editable || fitted === defaultBackgrounds[scheme]
                  ? 0.35
                  : pressed
                    ? 0.6
                    : 1,
            },
          ]}
        >
          <Text style={styles.resetText}>
            Reset to{' '}
            {backgroundName(scheme, defaultBackgrounds[scheme]).toLowerCase()}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = themedStyles((t) => ({
  preview: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: t.ink(0x33),
  },
  note: { color: t.ink(0x92), fontSize: 13, lineHeight: 19 },
  group: { backgroundColor: t.ink(0x11), borderRadius: 14, overflow: 'hidden' },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  swatchTarget: {
    width: '33.333333%',
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  swatchRing: {
    width: 42,
    height: 42,
    borderWidth: 1.5,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: t.ink(0x44),
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: { fontSize: 18, fontWeight: '700' },
  swatchLabel: { color: t.ink(0xaa), fontSize: 12 },
  custom: { paddingHorizontal: 16, paddingVertical: 8, gap: 2 },
  secondary: { color: t.ink(0xaa), fontSize: 12, lineHeight: 18 },
  hexRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  hexInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: t.ink(0x44),
    color: t.ink(0xff),
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  reset: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderTopWidth: 0.5,
    borderTopColor: t.ink(0x24),
  },
  resetText: { color: t.ink(0xbb), fontSize: 15 },
}));
