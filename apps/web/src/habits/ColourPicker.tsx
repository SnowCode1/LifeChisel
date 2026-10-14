import { useState } from 'react';
import {
  checkmarkColor,
  hexToOklch,
  normalizeHex,
  oklchToHex,
  type Oklch,
} from '@onpurpose/core/colors';
import { habitColors } from '@onpurpose/core/habits';
import { MIN_CONTRAST, type Theme } from '@onpurpose/core/theme';

// Presets or a custom OKLCH colour, as on the phone. The habit keeps the exact
// colour chosen; the preview shows it adjusted where it would be hard to read.
export function ColourPicker({
  colour,
  theme,
  onChange,
}: {
  colour: string;
  theme: Theme;
  onChange: (colour: string | null) => void;
}) {
  const [tab, setTab] = useState<'presets' | 'custom'>(() =>
    habitColors.some((preset) => preset.value === colour)
      ? 'presets'
      : 'custom',
  );
  const [draft, setDraft] = useState(() => hexToOklch(colour));
  const [hex, setHex] = useState(colour);
  const valid = normalizeHex(hex);
  const chosen = valid ?? oklchToHex(draft);
  const preview = theme.colour(chosen);
  const adjusted = theme.contrast(chosen) < MIN_CONTRAST;
  const choose = (value: string) => {
    setHex(value);
    setDraft(hexToOklch(value));
    onChange(value);
  };
  const adjust = (key: keyof Oklch, value: number) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    const nextHex = oklchToHex(next);
    setHex(nextHex);
    onChange(nextHex);
  };
  const slider = (
    key: keyof Oklch,
    label: string,
    max: number,
    step: number,
    stops: string[],
  ) => (
    <label className="slider">
      <span className="field-label">{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={draft[key]}
        onChange={(event) => adjust(key, Number(event.target.value))}
        style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }}
      />
    </label>
  );
  return (
    <div className="colour-picker">
      <div className="segmented" role="tablist" aria-label="Colour source">
        {(['presets', 'custom'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {value === 'presets' ? 'Presets' : 'Custom'}
          </button>
        ))}
      </div>
      <div className="colour-preview" aria-hidden="true">
        <span className="preview-box" style={{ backgroundColor: preview }}>
          <span style={{ color: checkmarkColor(preview) }}>✓</span>
        </span>
        <span className="preview-number" style={{ color: preview }}>
          30
        </span>
        {adjusted && (
          <span className="hint">Shown lighter here so it stays readable.</span>
        )}
      </div>
      {tab === 'presets' ? (
        <div className="swatches" role="radiogroup" aria-label="Preset colours">
          {habitColors.map((preset) => (
            <button
              key={preset.value}
              type="button"
              role="radio"
              aria-checked={valid === preset.value}
              aria-label={preset.name}
              title={preset.name}
              className="swatch"
              onClick={() => choose(preset.value)}
              style={{ backgroundColor: theme.colour(preset.value) }}
            />
          ))}
        </div>
      ) : (
        <div className="sliders">
          {slider(
            'h',
            'Hue',
            360,
            1,
            Array.from({ length: 36 }, (_, i) =>
              oklchToHex({ l: 0.78, c: 0.16, h: i * 10 }),
            ),
          )}
          {slider(
            'c',
            'Colourfulness',
            0.32,
            0.002,
            Array.from({ length: 24 }, (_, i) =>
              oklchToHex({ ...draft, c: (i / 23) * 0.32 }),
            ),
          )}
          {slider(
            'l',
            'Lightness',
            1,
            0.005,
            Array.from({ length: 24 }, (_, i) =>
              oklchToHex({ ...draft, l: i / 23 }),
            ),
          )}
        </div>
      )}
      <label className="hex-field">
        <span className="field-label">Hex</span>
        <input
          value={hex}
          maxLength={7}
          spellCheck={false}
          aria-invalid={!valid}
          onChange={(event) => {
            setHex(event.target.value);
            const normalized = normalizeHex(event.target.value);
            if (normalized) setDraft(hexToOklch(normalized));
            onChange(normalized);
          }}
        />
      </label>
    </div>
  );
}
