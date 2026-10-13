import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeHex,
  hexToOklch,
  oklchToHex,
  contrastOnBlack,
  checkmarkColor,
} from '../packages/core/src/colors.ts';
import { habitColors } from '../packages/core/src/habits.ts';

test('hex input accepts shorthand and mixed case but rejects malformed/alpha values', () => {
  assert.equal(normalizeHex(' #a3f '), '#AA33FF');
  assert.equal(normalizeHex('82e6bc'), '#82E6BC');
  for (const bad of ['', '#12', '#GGGGGG', '#FFFFFFFF', 'red', '#12345'])
    assert.equal(normalizeHex(bad), null);
});

test('sRGB colours round-trip through OKLCH within one channel step', () => {
  for (const hex of [
    '#000000',
    '#FFFFFF',
    '#FF0000',
    '#00FF00',
    '#0000FF',
    '#808080',
    '#010203',
    ...habitColors.map((c) => c.value),
  ]) {
    const result = oklchToHex(hexToOklch(hex));
    for (const start of [1, 3, 5])
      assert.ok(
        Math.abs(
          parseInt(result.slice(start, start + 2), 16) -
            parseInt(hex.slice(start, start + 2), 16),
        ) <= 1,
        `${hex} -> ${result}`,
      );
  }
});

test('OKLab reference red and neutral coordinates are correct', () => {
  const red = hexToOklch('#FF0000');
  assert.ok(Math.abs(red.l - 0.627955) < 0.00001);
  assert.ok(Math.abs(red.c - 0.257683) < 0.00001);
  assert.ok(Math.abs(red.h - 29.2339) < 0.001);
  assert.equal(hexToOklch('#808080').h, 0);
  assert.equal(oklchToHex({ l: 0, c: 0, h: 0 }), '#000000');
  assert.equal(oklchToHex({ l: 1, c: 0, h: 0 }), '#FFFFFF');
});

test('out-of-gamut colours reduce chroma while retaining lightness and hue', () => {
  for (const h of [0, 60, 120, 180, 240, 300]) {
    const result = hexToOklch(oklchToHex({ l: 0.75, c: 0.4, h }));
    assert.ok(result.c < 0.4);
    assert.ok(Math.abs(result.l - 0.75) < 0.003);
    const hueError = Math.abs(result.h - h);
    assert.ok(Math.min(hueError, 360 - hueError) < 2);
  }
});

test('presets remain readable on black and checkmarks adapt to dark custom colours', () => {
  assert.equal(habitColors.length, 24);
  for (const color of habitColors)
    assert.ok(contrastOnBlack(color.value) >= 4.5, color.name);
  assert.equal(contrastOnBlack('#000000'), 1);
  assert.equal(contrastOnBlack('#FFFFFF'), 21);
  assert.equal(checkmarkColor('#000000'), '#FFFFFF');
  assert.equal(checkmarkColor('#FFFFFF'), '#000000');
});
