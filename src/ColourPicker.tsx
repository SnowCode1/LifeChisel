import { TextInput, Text } from './Typography';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import {
  checkmarkColor,
  hexToOklch,
  normalizeHex,
  oklchToHex,
  type Oklch,
} from '@onpurpose/core/colors';
import { habitColors } from '@onpurpose/core/habits';
import { feedback } from './haptics';
import { MIN_CONTRAST } from '@onpurpose/core/theme';
import { themedStyles, useTheme } from './ThemeContext';

export function ColourPicker({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string | null) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const [tab, setTab] = useState<'presets' | 'custom'>('presets');
  const [draft, setDraft] = useState(() => hexToOklch(color));
  const [hex, setHex] = useState(color);
  const validHex = normalizeHex(hex);
  const chosen = validHex ?? oklchToHex(draft);
  // The habit's saved colour stays exactly as chosen; this background shows it
  // adjusted when it would otherwise be hard to read.
  const preview = theme.colour(chosen);
  const adjusted = theme.contrast(chosen) < MIN_CONTRAST;

  function selectPreset(value: string) {
    if (value !== validHex) feedback('selection');
    setHex(value);
    setDraft(hexToOklch(value));
    onChange(value);
  }
  function adjust(key: keyof Oklch, value: number) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    const nextHex = oklchToHex(next);
    setHex(nextHex);
    onChange(nextHex);
  }
  function editHex(value: string) {
    setHex(value);
    const normalized = normalizeHex(value);
    if (normalized) setDraft(hexToOklch(normalized));
    onChange(normalized);
  }

  return (
    <View>
      <View style={styles.tabs}>
        {(['presets', 'custom'] as const).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === option }}
            onPress={() => {
              if (tab !== option) feedback('selection');
              Keyboard.dismiss();
              setTab(option);
            }}
            style={[styles.tab, tab === option && styles.activeTab]}
          >
            <Text
              style={[styles.tabText, tab === option && styles.activeTabText]}
            >
              {option === 'presets' ? 'Presets' : 'Custom'}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === 'presets' && (
        <View style={styles.swatches}>
          {habitColors.map(({ name, value: presetHex }) => {
            const shown = theme.colour(presetHex);
            return (
              <Pressable
                key={presetHex}
                accessibilityRole="radio"
                accessibilityLabel={name}
                accessibilityState={{ selected: validHex === presetHex }}
                onPress={() => selectPreset(presetHex)}
                style={({ pressed }) => [
                  styles.swatchTarget,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <View
                  style={[
                    styles.swatchRing,
                    {
                      borderColor:
                        validHex === presetHex
                          ? theme.ink(0xff)
                          : 'transparent',
                    },
                  ]}
                >
                  <View style={[styles.swatch, { backgroundColor: shown }]}>
                    {validHex === presetHex && (
                      <Text
                        allowFontScaling={false}
                        style={[styles.check, { color: checkmarkColor(shown) }]}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      {tab === 'custom' && (
        <View style={styles.custom}>
          <View style={styles.preview}>
            <Text style={[styles.previewName, { color: preview }]}>
              Your habit
            </Text>
            <View style={[styles.previewCheck, { backgroundColor: preview }]}>
              <Text style={{ color: checkmarkColor(preview) }}>✓</Text>
            </View>
            <Text style={[styles.previewNumber, { color: preview }]}>30</Text>
          </View>
          <ColourSlider
            label="Hue"
            value={draft.h}
            max={360}
            step={1}
            onChange={(v) => adjust('h', v)}
            colors={Array.from({ length: 36 }, (_, i) =>
              oklchToHex({ l: 0.78, c: 0.16, h: i * 10 }),
            )}
          />
          <ColourSlider
            label="Colourfulness"
            value={draft.c}
            max={0.32}
            step={0.002}
            onChange={(v) => adjust('c', v)}
            colors={Array.from({ length: 24 }, (_, i) =>
              oklchToHex({ ...draft, c: (i / 23) * 0.32 }),
            )}
          />
          <ColourSlider
            label="Lightness"
            value={draft.l}
            max={1}
            step={0.005}
            onChange={(v) => adjust('l', v)}
            colors={Array.from({ length: 24 }, (_, i) =>
              oklchToHex({ ...draft, l: i / 23 }),
            )}
          />
          <View style={styles.hexRow}>
            <Text style={styles.secondary}>Hex</Text>
            <TextInput
              accessibilityLabel="Hex colour"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              value={hex}
              onChangeText={editHex}
              placeholder="#82E6BC"
              placeholderTextColor={theme.ink(0x77)}
              style={styles.hexInput}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.help}>
            {!validHex
              ? 'Enter 3 or 6 hex digits, such as #82E6BC.'
              : adjusted
                ? 'Shown adjusted on this background so it stays readable. Done applies your colour.'
                : 'Done applies your colour. Close discards changes.'}
          </Text>
        </View>
      )}
    </View>
  );
}

export function ColourSlider({
  label,
  value,
  min = 0,
  max,
  step,
  onChange,
  onComplete,
  colors,
  disabled = false,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onComplete?: (value: number) => void;
  colors: string[];
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.sliderRow}>
      <Text style={styles.secondary}>{label}</Text>
      <View style={styles.sliderControl}>
        <LinearGradient
          pointerEvents="none"
          colors={colors as [string, string, ...string[]]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.gradient}
        />
        <Slider
          accessibilityLabel={label}
          accessibilityValue={{
            text:
              label === 'Hue'
                ? `${Math.round(value)} degrees`
                : `${Math.round(((value - min) / (max - min)) * 100)} percent`,
          }}
          style={styles.slider}
          minimumValue={min}
          maximumValue={max}
          step={step}
          value={Math.max(min, Math.min(value, max))}
          disabled={disabled}
          onValueChange={onChange}
          onSlidingComplete={onComplete}
          tapToSeek
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor="#FFFFFF"
        />
      </View>
    </View>
  );
}

const useStyles = themedStyles((t) => ({
  tabs: {
    flexDirection: 'row',
    backgroundColor: t.background,
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
    marginTop: 16,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 9,
  },
  activeTab: { backgroundColor: t.ink(0x29) },
  tabText: { color: t.ink(0x99), fontSize: 13, fontWeight: '500' },
  activeTabText: { color: t.ink(0xff) },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 2 },
  swatchTarget: {
    width: '16.666666%',
    minWidth: 44,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchRing: {
    width: 38,
    height: 38,
    borderWidth: 1.5,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: { fontSize: 18, fontWeight: '700' },
  secondary: { color: t.ink(0xaa), fontSize: 12 },
  custom: { paddingTop: 0 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    padding: 12,
    borderRadius: 12,
    backgroundColor: t.background,
    borderWidth: 1,
    borderColor: t.ink(0x33),
    marginBottom: 12,
  },
  previewName: { flex: 1, fontSize: 15, fontWeight: '500' },
  previewCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewNumber: { fontSize: 18, fontVariant: ['tabular-nums'] },
  sliderRow: { marginBottom: 2 },
  sliderControl: { height: 44, justifyContent: 'center' },
  gradient: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 12,
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
  },
  slider: { width: '100%', height: 44 },
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
  help: { color: t.ink(0xaa), fontSize: 12, lineHeight: 18, marginTop: 10 },
}));
