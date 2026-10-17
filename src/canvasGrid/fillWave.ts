import {
  FADE_MS,
  FILL_STROKE_CURVE,
  MET_FADE_MS,
  fillStrokeAtMs,
  fillStrokeMs,
} from '@onpurpose/core/tapMotion';

/**
 * A committed fill animating along one row as one stroke (core tapMotion):
 * a single eased position travels from the start cell's centre through the
 * run in drag order. Ticking, the bar grows behind it and each changed box
 * fills (keeping its old look until then) and bumps as the bar touches it;
 * a checked day just beyond the run is joined too. Clearing, the bar is
 * erased ahead of it and each box empties, with a press, as it passes; a
 * checked day beyond takes its join back and bumps. Every run cell's fill
 * highlight fades as the stroke reaches it. (The grid also keeps boxes
 * whose streak number changes on their old number until then.)
 */
export type FillWave = {
  id: string;
  /** Run days in drag order, then the day beyond when the stroke reaches it. */
  days: number[];
  /** Number of run cells; `days` may hold one more (the day beyond). */
  run: number;
  /** Cells the stroke travels, and how long it takes. */
  length: number;
  ms: number;
  /** 1: bars grow (ticking); -1: bars are erased (clearing); 0: none. */
  joins: number;
  /** Per segment k (days[k] to days[k + 1]): whether the stroke moves it. */
  pairs: boolean[];
  /** Per run cell: when the stroke reaches it, and its background fade. */
  at: number[];
  fades: number[];
  /** Per `days` index: when its box bumps or presses (-1: never). */
  bumps: number[];
  presses: number[];
  /** Erased bars take the met colour. */
  metBars: boolean;
  /** Half a box as a fraction of a column. */
  reach: number;
  duration: number;
};

export function planFillWave({
  id,
  days,
  changed,
  met,
  wasChecked,
  checkbox,
  ticking,
  beyondChecked,
  joined,
  motion,
  metBars,
  box,
  column,
}: {
  id: string;
  /** Run days in drag order. */
  days: number[];
  changed: boolean[];
  /** Whether each run cell's goal is met after the fill. */
  met: boolean[];
  /** Whether each run cell was checked before the fill. */
  wasChecked: boolean[];
  checkbox: boolean;
  /** Checkbox fills: whether the run was ticked (else cleared). */
  ticking: boolean;
  /** Whether the day just beyond the run's end is checked. */
  beyondChecked: boolean;
  /** Joined checkboxes are drawn. */
  joined: boolean;
  /** Motion allowed (Tap animations on and no Reduce Motion). */
  motion: boolean;
  metBars: boolean;
  box: number;
  column: number;
}): FillWave {
  const run = days.length;
  const step = run > 1 ? Math.sign(days[run - 1] - days[run - 2]) : 0;
  const stroking = checkbox && motion && run > 1;
  const extend =
    stroking && step !== 0 && beyondChecked && (ticking || wasChecked[run - 1]);
  const all = extend ? [...days, days[run - 1] + step] : [...days];
  const length = Math.max(0, run - 1) + (extend ? 1 : 0);
  const reach = column > 0 ? box / 2 / column : 0;
  const time = (position: number) => fillStrokeAtMs(length, position);
  // Ticking fills a box as the bar touches it; clearing empties it as the
  // stroke passes its centre; values change as it enters their cell.
  const at = days.map((_, k) =>
    k === 0 ? 0 : time(checkbox ? (ticking ? k - reach : k) : k - 0.5),
  );
  const fades = met.map((value) => (value ? MET_FADE_MS : FADE_MS));
  const bumps = all.map(() => -1);
  const presses = all.map(() => -1);
  const was = (k: number) => (k === run ? beyondChecked : wasChecked[k]);
  const pairs: boolean[] = [];
  if (stroking) {
    for (let k = 0; k < length; k++)
      // Ticking grows the joins that were not there; clearing erases those
      // that were.
      pairs.push(ticking !== (was(k) && was(k + 1)));
    for (let k = 1; k < run; k++)
      if (changed[k]) {
        if (ticking) bumps[k] = at[k];
        else presses[k] = at[k];
      }
    if (extend) bumps[run] = time(run - reach);
  } else if (checkbox && motion)
    days.forEach((_, k) => {
      if (changed[k]) presses[k] = at[k];
    });
  let duration = 0;
  days.forEach((_, k) => {
    duration = Math.max(duration, at[k] + fades[k], at[k] + 180);
  });
  for (const t of bumps) if (t >= 0) duration = Math.max(duration, t + 230);
  duration = Math.max(duration, fillStrokeMs(length));
  return {
    id,
    days: all,
    run,
    length,
    ms: fillStrokeMs(length),
    joins: stroking ? (ticking ? 1 : -1) : 0,
    pairs,
    at,
    fades,
    bumps,
    presses,
    metBars,
    reach,
    duration: Math.ceil(duration),
  };
}

/** The stroke's position at `t`: 0 at the start cell, `length` at its end. */
export function strokeAt(wave: FillWave, t: number): number {
  'worklet';
  if (wave.ms <= 0) return wave.length;
  return wave.length * cssBezier(t / wave.ms);
}

/** The fill highlight's fade into run cell k's background: 0 → 1. */
export function waveFade(wave: FillWave, k: number, t: number): number {
  'worklet';
  if (k < 0 || k >= wave.run) return 1;
  const local = t - wave.at[k];
  if (local <= 0) return 0;
  const f = Math.min(1, local / wave.fades[k]);
  return 1 - (1 - f) * (1 - f);
}

/** Box k's scale: its press as the stroke empties it, or its bump. */
export function waveScale(wave: FillWave, k: number, t: number): number {
  'worklet';
  if (k < 0 || k >= wave.days.length) return 1;
  let scale = 1;
  if (wave.presses[k] >= 0) scale *= pressAt(t - wave.presses[k]);
  if (wave.bumps[k] >= 0) scale *= bumpAt(t - wave.bumps[k]);
  return scale;
}

/**
 * Segment k's bar (days[k] to days[k + 1]) at stroke position `s`, as a
 * span from days[k]'s centre (0) to days[k + 1]'s (1); [0, 0] when gone.
 */
export function waveSegment(
  wave: FillWave,
  k: number,
  s: number,
): [number, number] {
  'worklet';
  const p = clamp01(s - k);
  return wave.joins > 0 ? [0, p] : [p, 1];
}

/** How far the stroke has passed over box k (Streak ends only): 0 → 1. */
export function wavePassed(wave: FillWave, k: number, s: number): number {
  'worklet';
  return wave.reach > 0
    ? clamp01((s - (k - wave.reach)) / (2 * wave.reach))
    : s >= k
      ? 1
      : 0;
}

/** The tap press, 1 → 0.94 → 1 over 45 + 135 ms. */
function pressAt(t: number): number {
  'worklet';
  if (t <= 0 || t >= 180) return 1;
  if (t < 45) {
    const f = t / 45;
    return 1 - 0.06 * (1 - (1 - f) * (1 - f));
  }
  const f = (t - 45) / 135;
  return 0.94 + 0.06 * (1 - (1 - f) * (1 - f) * (1 - f));
}

/** The join bump, 1 → 1.07 → 1 over 70 + 160 ms. */
function bumpAt(t: number): number {
  'worklet';
  if (t <= 0 || t >= 230) return 1;
  if (t < 70) {
    const f = t / 70;
    return 1 + 0.07 * (1 - (1 - f) * (1 - f));
  }
  const f = (t - 70) / 160;
  return 1.07 - 0.07 * (1 - (1 - f) * (1 - f) * (1 - f));
}

function clamp01(value: number): number {
  'worklet';
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

/** FILL_STROKE_CURVE's progress at time `x` (0–1), as browsers evaluate it. */
function cssBezier(x: number): number {
  'worklet';
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const x1 = FILL_STROKE_CURVE[0];
  const y1 = FILL_STROKE_CURVE[1];
  const x2 = FILL_STROKE_CURVE[2];
  const y2 = FILL_STROKE_CURVE[3];
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step++) {
    const s = (low + high) / 2;
    const at =
      3 * x1 * s * (1 - s) * (1 - s) + 3 * x2 * s * s * (1 - s) + s * s * s;
    if (at < x) low = s;
    else high = s;
  }
  const s = (low + high) / 2;
  return 3 * y1 * s * (1 - s) * (1 - s) + 3 * y2 * s * s * (1 - s) + s * s * s;
}
