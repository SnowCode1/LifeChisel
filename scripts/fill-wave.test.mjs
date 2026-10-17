import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planFillWave,
  strokeAt,
  waveFade,
  waveScale,
  waveSegment,
} from '../src/canvasGrid/fillWave.ts';
import {
  fillStrokeAtMs,
  fillStrokeMs,
} from '../packages/core/src/tapMotion.ts';

const base = {
  id: 'walk',
  checkbox: true,
  joined: true,
  motion: true,
  metBars: true,
  box: 26,
  column: 52,
};

test('ticking runs one stroke: bars grow behind it, boxes fill as it reaches them', () => {
  // Dragged from day 5 towards Today; the start was ticked by the first
  // tap, and day 1 just beyond the end was already ticked.
  const wave = planFillWave({
    ...base,
    days: [5, 4, 3, 2],
    changed: [false, true, true, true],
    met: [true, true, true, true],
    wasChecked: [true, false, false, false],
    ticking: true,
    beyondChecked: true,
  });
  assert.deepEqual(wave.days, [5, 4, 3, 2, 1]);
  assert.equal(wave.length, 4);
  assert.equal(wave.ms, fillStrokeMs(4));
  assert.equal(wave.joins, 1);
  assert.deepEqual(wave.pairs, [true, true, true, true]);
  // Box 1 fills (and bumps) when the bar touches it, a quarter cell early.
  assert.equal(wave.at[1], fillStrokeAtMs(4, 0.75));
  assert.equal(wave.bumps[1], wave.at[1]);
  assert.ok(wave.at[1] < wave.at[2] && wave.at[2] < wave.at[3]);
  assert.ok(wave.bumps[4] > wave.at[3]);
  // The stroke runs from the start's centre to the day beyond's.
  assert.equal(strokeAt(wave, 0), 0);
  assert.equal(strokeAt(wave, wave.ms), 4);
  const mid = strokeAt(wave, wave.ms / 2);
  assert.ok(Math.abs(mid - 2) < 1e-6);
  // Segment 2 (days 3 → 2) starts as the stroke leaves day 3 and is whole
  // once the stroke reaches day 2.
  assert.deepEqual(waveSegment(wave, 2, 2), [0, 0]);
  assert.deepEqual(waveSegment(wave, 2, 2.5), [0, 0.5]);
  assert.deepEqual(waveSegment(wave, 2, 3), [0, 1]);
  // The highlight stays until the stroke reaches each cell.
  assert.equal(waveFade(wave, 3, wave.at[3]), 0);
  assert.equal(waveFade(wave, 3, wave.duration), 1);
  assert.ok(waveScale(wave, 4, wave.bumps[4] + 40) > 1);
  assert.ok(wave.duration >= wave.bumps[4] + 230);
});

test('clearing erases only joins that were there, pressing each box it empties', () => {
  const wave = planFillWave({
    ...base,
    days: [1, 2, 3],
    changed: [false, true, true],
    met: [false, false, false],
    wasChecked: [false, true, true],
    ticking: false,
    beyondChecked: true,
  });
  assert.equal(wave.joins, -1);
  assert.deepEqual(wave.days, [1, 2, 3, 4]);
  // The first tap already let go of 1–2; 2–3 and 3–4 are erased.
  assert.deepEqual(wave.pairs, [false, true, true]);
  assert.deepEqual(waveSegment(wave, 1, 1.25), [0.25, 1]);
  assert.ok(waveScale(wave, 1, wave.presses[1] + 30) < 1);
  assert.ok(waveScale(wave, 3, wave.bumps[3] + 40) > 1);
});

test('value fills and Reduce Motion only fade as the stroke passes', () => {
  const value = planFillWave({
    ...base,
    checkbox: false,
    days: [3, 2, 1],
    changed: [true, true, true],
    met: [true, false, true],
    wasChecked: [false, false, false],
    ticking: false,
    beyondChecked: false,
  });
  assert.equal(value.joins, 0);
  assert.deepEqual(value.pairs, []);
  assert.equal(value.at[1], fillStrokeAtMs(2, 0.5));
  assert.equal(waveScale(value, 1, 10), 1);
  const still = planFillWave({
    ...base,
    motion: false,
    days: [2, 1],
    changed: [false, true],
    met: [true, true],
    wasChecked: [true, false],
    ticking: true,
    beyondChecked: true,
  });
  assert.equal(still.joins, 0);
  assert.deepEqual(still.days, [2, 1]);
  assert.equal(waveFade(still, 1, still.duration), 1);
});
