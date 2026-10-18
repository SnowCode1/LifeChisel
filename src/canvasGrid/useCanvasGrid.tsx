import {
  Canvas,
  Picture,
  Skia,
  createPicture,
} from '@shopify/react-native-skia';
import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  type PanGesture,
} from 'react-native-gesture-handler';
import {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { entryDay, type EntryDay } from '@onpurpose/core/calendar';
import type {
  CellLook,
  CheckboxStyle,
  WeekStart,
} from '@onpurpose/core/displayPreferences';
import { ordinal, timingDate } from '@onpurpose/core/goalTiming';
import type { GridPalette } from '@onpurpose/core/gridAppearance';
import { FUTURE_PULL_DISTANCE } from '../gridNavigation';
import { cellState, checkedStreak } from '@onpurpose/core/cellAccessibility';
import { sameEntry, type EntryValues } from '@onpurpose/core/entries';
import { checkboxChecked } from '@onpurpose/core/habitGoals';
import { habitType, type Habit } from '@onpurpose/core/habits';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import {
  FADE_MS,
  FILL_DOUBLE_TAP_MS,
  FILL_SLOP_PX,
  JOIN_MS,
  MET_FADE_MS,
  RETRACT_CURVE,
  RETRACT_MS,
  VALUE_OPEN_DELAY_MS,
  joinContactMs,
} from '@onpurpose/core/tapMotion';
import type { Theme } from '@onpurpose/core/theme';
import {
  boxColour,
  cellShapes,
  drawCellBase,
  drawCellMark,
  isHiddenMiddle,
  drawHeadings,
  drawPullStreak,
  gridPaints,
  hairline,
  headingLabels,
  pixelOffset,
  type CellStyle,
} from './cellPainter';
import {
  planFillWave,
  strokeAt,
  waveFade,
  wavePassed,
  waveScale,
  waveSegment,
  type FillWave,
} from './fillWave';
import { columnX, dayAtX, visibleDayRange } from './gridGeometry';
import { feedback } from '../haptics';
import {
  GridAccessibilityLayer,
  HeadingAccessibility,
} from './GridAccessibilityLayer';
import {
  streakLabel,
  useGridModel,
  type CanvasCell,
  type LabelCache,
} from './useGridModel';

type Row = { id: string; top: number; height: number };
/** The UI thread's clock, for double-tap timing. */
function now(): number {
  'worklet';
  return Date.now();
}
type Pointer = { id: string; day: number } | null;
/**
 * A tap that made or broke joins between checked boxes: the tapped day and
 * which neighbours (left is older) it joins. The animation draws those joints
 * itself, so a breaking join can retract after the cell data has changed.
 */
type Joint = {
  id: string;
  day: number;
  left: boolean;
  right: boolean;
  joining: boolean;
} | null;
/** Boxes a finished join reaches: the tapped one, or neighbours on a break. */
type Bump = { id: string; days: number[] } | null;

export type CanvasGridProps = {
  store: ChangeStore;
  /** Every active habit (the model keeps hidden rows ready). */
  habits: Habit[];
  /** Displayed rows in order. */
  rows: Habit[];
  tops: Record<string, number>;
  heights: Record<string, number>;
  baseHeight: number;
  gridHeight: number;
  headerHeight: number;
  palettes: Record<string, GridPalette>;
  theme: Theme;
  today: string;
  fontScale: number;
  column: number;
  width: number;
  visibleDays: number;
  rightmostDay: number;
  unlockedFuture: number;
  checkboxStyle: CheckboxStyle;
  cellLook: CellLook;
  weekDividers: boolean;
  weekStart: WeekStart;
  tapAnimations: boolean;
  offset: SharedValue<number>;
  pull: SharedValue<number>;
  pan: () => PanGesture;
  /** UI-thread check: a touch now would only stop fast momentum. */
  flinging: () => boolean;
  rowTops: SharedValue<Record<string, number>>;
  dragY: SharedValue<number>;
  bodyTop: SharedValue<number>;
  scrollOffset: SharedValue<number>;
  dragId: string | null;
  disabled: boolean;
  onCellPress: (habit: Habit, day: EntryDay) => void;
  /**
   * A drawn fill across one row (dates in drag order). Call `finish` once,
   * with whether anything was saved, when it is applied or cancelled; the
   * run stays highlighted until then (value types wait for their dialog).
   */
  onFill: (
    habit: Habit,
    dates: string[],
    finish: (saved: boolean) => void,
  ) => void;
  /** A fill is being drawn; vertical scrolling pauses meanwhile. */
  onFillActive: (active: boolean) => void;
  onNavigate: (day: number) => void;
};
/** The run being drawn: `from` is where the drag started. */
type FillRun = { id: string; from: number; to: number } | null;

// The date area: a fixed heading canvas and a body canvas in the vertical
// scroll view, both drawn on the UI thread from one shared horizontal offset.
export function useCanvasGrid(props: CanvasGridProps): {
  header: ReactNode;
  body: ReactNode;
} {
  const {
    store,
    habits,
    rows: displayed,
    tops,
    heights,
    baseHeight,
    gridHeight,
    headerHeight,
    palettes,
    theme,
    today,
    fontScale,
    column,
    width,
    checkboxStyle,
    cellLook,
    weekDividers,
    weekStart,
    tapAnimations,
    offset,
    pull,
    pan,
    flinging,
    rowTops,
    dragY,
    bodyTop,
    scrollOffset,
    dragId,
    disabled,
    onCellPress,
    onFill,
    onFillActive,
  } = props;
  const reducedMotion = useReducedMotion();
  const todayOrdinal = ordinal(today);
  // Cell look preferences; primitives so the worklets capture them.
  const boxes = checkboxStyle === 'boxes';
  const joinedRuns = boxes && cellLook.joinedCheckboxes;
  const style: CellStyle = useMemo(
    () => ({
      boxes,
      missedMarks: cellLook.missedDays,
      joined: joinedRuns,
      connector: cellLook.connectorThickness / 100,
      endsOnly: joinedRuns && cellLook.joinedEndsOnly,
    }),
    [
      boxes,
      cellLook.missedDays,
      joinedRuns,
      cellLook.connectorThickness,
      cellLook.joinedEndsOnly,
    ],
  );
  const model = useGridModel({
    store,
    habits,
    palettes,
    today,
    fontScale,
    column,
    heights,
    baseHeight,
    offset,
    streaks: boxes && cellLook.streakNumbers,
  });

  const rows = useMemo<Row[]>(
    () =>
      displayed.map((habit) => ({
        id: habit.id,
        top: tops[habit.id] ?? 0,
        height: heights[habit.id] ?? baseHeight,
      })),
    [displayed, tops, heights, baseHeight],
  );
  const roundBoxes = boxes && cellLook.roundCheckboxes;
  const shapes = useMemo(
    () => cellShapes(rows, fontScale, column, roundBoxes),
    [rows, fontScale, column, roundBoxes],
  );
  const paints = useMemo(() => gridPaints(palettes, theme), [palettes, theme]);
  const labels = useMemo(
    () => headingLabels(theme, fontScale, column),
    [theme, fontScale, column],
  );

  // Future-pull streak: grows with the pull, fades for 180 ms after release.
  const streakDistance = useSharedValue(0);
  const streakOpacity = useSharedValue(0);
  useAnimatedReaction(
    () => pull.value,
    (distance) => {
      if (distance > 0) {
        streakDistance.set(distance);
        streakOpacity.set(1);
      } else streakOpacity.set(withTiming(0, { duration: 180 }));
    },
  );

  // Theme functions live on the JS thread; resolve colours before drawing.
  const streakColour = theme.ink(0x8a);
  const headerPicture = useDerivedValue(() =>
    createPicture(
      (canvas) => {
        if (width <= 0 || column <= 0) return;
        canvas.drawRect(
          Skia.XYWHRect(0, 0, width, headerHeight),
          paints.background,
        );
        const shift = pixelOffset(offset.value);
        const [first, last] = visibleDayRange(width, shift, column);
        drawHeadings(
          canvas,
          paints,
          labels,
          first,
          last,
          width,
          headerHeight,
          shift,
          column,
          todayOrdinal,
          weekDividers,
          weekStart,
        );
        drawPullStreak(
          canvas,
          paints,
          streakColour,
          width,
          headerHeight,
          streakDistance.value,
          streakOpacity.value,
          FUTURE_PULL_DISTANCE,
        );
      },
      { width, height: headerHeight },
    ),
  );

  const pressed = useSharedValue<Pointer>(null);
  const pulse = useSharedValue<Pointer>(null);
  const pulseScale = useSharedValue(1);
  const joint = useSharedValue<Joint>(null);
  const jointProgress = useSharedValue(1);
  const bump = useSharedValue<Bump>(null);
  const bumpScale = useSharedValue(1);
  // The released cell keeps its pressed shade until the tap is applied.
  const fade = useSharedValue<Pointer>(null);
  const fadeProgress = useSharedValue(1);
  // Drag to fill: the last accepted tap (a second press on it arms a fill),
  // the armed press, the highlighted run and the wave after it is applied.
  const lastTap = useSharedValue<{
    id: string;
    day: number;
    at: number;
  } | null>(null);
  const armed = useSharedValue<{
    id: string;
    day: number;
    x: number;
    y: number;
  } | null>(null);
  const fillRun = useSharedValue<FillRun>(null);
  const wave = useSharedValue<FillWave | null>(null);
  const waveTime = useSharedValue(0);
  // Boxes the stroke has not reached keep their look from before the fill.
  const holds = useSharedValue<
    { day: number; until: number; cell: CanvasCell }[] | null
  >(null);
  const bodyPicture = useDerivedValue(() =>
    createPicture(
      (canvas) => {
        if (width <= 0 || column <= 0) return;
        canvas.drawRect(
          Skia.XYWHRect(0, 0, width, gridHeight),
          paints.background,
        );
        const shift = pixelOffset(offset.value);
        const [first, last] = visibleDayRange(width, shift, column);
        const cells = model.value;
        const animated = rowTops.value;
        const press = pressed.value;
        const hit = pulse.value;
        const j = joint.value;
        const jt = jointProgress.value;
        const knock = bump.value;
        const fading = fade.value;
        const ft = fadeProgress.value;
        const run = fillRun.value;
        const w = wave.value;
        const wt = waveTime.value;
        const held = holds.value;
        for (let pass = 0; pass < 2; pass++)
          for (const row of rows) {
            // The dragged row is drawn last, above its neighbours.
            if ((row.id === dragId) !== (pass === 1)) continue;
            const top =
              row.id === dragId
                ? dragY.value - bodyTop.value + scrollOffset.value
                : (animated[row.id] ?? row.top);
            const p = paints.habit[row.id];
            const shape = shapes[row.id];
            if (!p || !shape) continue;
            const moving = j !== null && j.id === row.id;
            const drawing = run !== null && run.id === row.id;
            const waving = w !== null && w.id === row.id;
            for (let day = first; day <= last; day++) {
              const x = columnX(day, width, shift, column);
              const cell = cells[day]?.[row.id];
              const olderChecked = cells[day + 1]?.[row.id]?.c === true;
              const newerChecked = cells[day - 1]?.[row.id]?.c === true;
              // This cell's place in a fill's stroke, the stroke's position,
              // and its segments that touch this cell (drawn below by the
              // stroke, not as static joins): segIn ends here, segOut starts.
              const k = waving ? w.days.indexOf(day) : -1;
              const stroking = waving && w.joins !== 0 && k >= 0;
              const at = stroking ? strokeAt(w, wt) : 0;
              const segIn = stroking && k >= 1 && w.pairs[k - 1] ? k - 1 : -1;
              const segOut =
                stroking && k < w.pairs.length && w.pairs[k] ? k : -1;
              // Halves of a join being animated are drawn by the animation.
              const growing = stroking && w.joins > 0;
              const skipLeft =
                (moving &&
                  ((day === j.day && j.left) ||
                    (day === j.day - 1 && j.right))) ||
                (growing &&
                  ((segIn >= 0 && w.days[segIn] === day + 1) ||
                    (segOut >= 0 && w.days[segOut + 1] === day + 1)));
              const skipRight =
                (moving &&
                  ((day === j.day && j.right) ||
                    (day === j.day + 1 && j.left))) ||
                (growing &&
                  ((segIn >= 0 && w.days[segIn] === day - 1) ||
                    (segOut >= 0 && w.days[segOut + 1] === day - 1)));
              // A box the stroke has not reached yet keeps its old look.
              let shown = cell;
              if (waving && held !== null)
                for (const item of held)
                  if (item.day === day && wt < item.until) shown = item.cell;
              const inRun = drawing && (day - run.from) * (day - run.to) <= 0;
              drawCellBase(
                canvas,
                paints,
                p,
                shape,
                style,
                cell,
                olderChecked,
                newerChecked,
                day,
                x,
                top,
                column,
                row.height,
                inRun ||
                  (press !== null && press.id === row.id && press.day === day),
                skipLeft,
                skipRight,
                k >= 0 && k < w!.run
                  ? waveFade(w!, k, wt)
                  : fading !== null &&
                      fading.id === row.id &&
                      fading.day === day
                    ? ft
                    : 1,
              );
              if (stroking && (segIn >= 0 || segOut >= 0)) {
                // The stroke's bars, clipped to this cell.
                const bar = shape.box * style.connector;
                const barTop = top + (row.height - hairline) / 2 - bar / 2;
                for (const g of [segIn, segOut]) {
                  if (g < 0) continue;
                  const [a, b] = waveSegment(w, g, at);
                  if (b <= a) continue;
                  const fromX =
                    columnX(w.days[g], width, shift, column) + column / 2;
                  const toX =
                    columnX(w.days[g + 1], width, shift, column) + column / 2;
                  const p1 = fromX + (toX - fromX) * a;
                  const p2 = fromX + (toX - fromX) * b;
                  const start = Math.max(x, Math.min(p1, p2));
                  const end = Math.min(x + column, Math.max(p1, p2));
                  if (end > start)
                    canvas.drawRect(
                      Skia.XYWHRect(start, barTop, end - start, bar),
                      // Growing bars take the colour of the box they reach;
                      // a bar erased into the checked day beyond takes its
                      // colour, and those between cleared boxes their
                      // former colour.
                      growing || g + 1 === w.run
                        ? boxColour(p, cells[w.days[g + 1]]?.[row.id])
                        : w.metBars
                          ? p.colour
                          : p.boxFill,
                    );
                }
              }
              if (joinedRuns && moving && Math.abs(day - j.day) <= 1) {
                // Joins grow out of the neighbour into the tapped box, and
                // retract back into the neighbour when broken.
                const bar = shape.box * style.connector;
                const barTop = top + (row.height - hairline) / 2 - bar / 2;
                const length = column * (j.joining ? jt : 1 - jt);
                if (j.left) {
                  const from = columnX(j.day + 1, width, shift, column);
                  const start = Math.max(x, from + column / 2);
                  const end = Math.min(x + column, from + column / 2 + length);
                  if (end > start)
                    canvas.drawRect(
                      Skia.XYWHRect(start, barTop, end - start, bar),
                      boxColour(p, cells[j.day + 1]?.[row.id]),
                    );
                }
                if (j.right) {
                  const from = columnX(j.day - 1, width, shift, column);
                  const start = Math.max(x, from + column / 2 - length);
                  const end = Math.min(x + column, from + column / 2);
                  if (end > start)
                    canvas.drawRect(
                      Skia.XYWHRect(start, barTop, end - start, bar),
                      boxColour(p, cells[j.day - 1]?.[row.id]),
                    );
                }
              }
              let scale = 1;
              if (hit !== null && hit.id === row.id && hit.day === day)
                scale *= pulseScale.value;
              if (
                knock !== null &&
                knock.id === row.id &&
                knock.days.includes(day)
              )
                scale *= bumpScale.value;
              if (k >= 0) scale *= waveScale(w!, k, wt);
              if (
                shown === cell &&
                isHiddenMiddle(style, cell, olderChecked, newerChecked)
              )
                // Boxes a growing join or stroke turns into a streak's middle
                // shrink into the bar as it passes; other middles stay hidden.
                scale *=
                  moving && j.joining && Math.abs(day - j.day) <= 1
                    ? 1 - jt
                    : growing && k >= 1
                      ? 1 - wavePassed(w!, k, at)
                      : 0;
              if (scale > 0)
                drawCellMark(
                  canvas,
                  p,
                  shape,
                  style,
                  shown,
                  day,
                  x,
                  top,
                  column,
                  row.height,
                  scale,
                );
            }
          }
      },
      { width, height: gridHeight },
    ),
  );

  function hitTest(x: number, y: number): Pointer {
    'worklet';
    const day = dayAtX(x, width, offset.value, column);
    const animated = rowTops.value;
    for (const row of rows) {
      const top = animated[row.id] ?? row.top;
      if (y >= top && y < top + row.height) return { id: row.id, day };
    }
    return null;
  }
  function activate(id: string, day: number) {
    // Only a grid tap holds the pressed shade; screen readers activate too.
    const held = fade.value;
    const fromPress = held !== null && held.id === id && held.day === day;
    const habit = displayed.find((row) => row.id === id);
    if (!habit || disabled) {
      if (fromPress) fade.set(null);
      return;
    }
    const date = timingDate(todayOrdinal - day);
    const key = `${id}:${date}`;
    const before = store.getSnapshot().replay.state.values[key];
    onCellPress(habit, entryDay(date));
    const values = store.getSnapshot().replay.state.values;
    const after = values[key];
    const checked = checkboxChecked(habit, after, date);
    const flipped =
      habitType(habit) === 'checkbox' &&
      tapAnimations &&
      checkboxChecked(habit, before, date) !== checked;
    if (fromPress) {
      // A cross-fade is not motion, so Reduce Motion keeps it.
      if (flipped)
        fadeProgress.set(
          withTiming(
            1,
            {
              duration: cellState(habit, after, date).met
                ? MET_FADE_MS
                : FADE_MS,
              easing: Easing.out(Easing.quad),
            },
            (done) => {
              'worklet';
              if (done) fade.set(null);
            },
          ),
        );
      else fade.set(null);
    }
    if (flipped && !reducedMotion) {
      if (joinedRuns && checkboxStyle === 'boxes') {
        const checkedOn = (neighbour: number) => {
          const other = timingDate(todayOrdinal - neighbour);
          return checkboxChecked(habit, values[`${id}:${other}`], other);
        };
        const left = checkedOn(day + 1);
        const right = checkedOn(day - 1);
        if (left || right) {
          joint.set({ id, day, left, right, joining: checked });
          // A join grows with ease-out and retracts with ease-in-out (tapMotion).
          // The bar nudges the box it reaches the moment it touches that box:
          // the tapped box when joining, the neighbours when retracting.
          const duration = checked ? JOIN_MS : RETRACT_MS;
          bump.set({
            id,
            days: checked
              ? [day]
              : [...(left ? [day + 1] : []), ...(right ? [day - 1] : [])],
          });
          bumpScale.set(
            withDelay(
              joinContactMs(shapes[id]?.box ?? 0, column, checked),
              withSequence(
                withTiming(1.07, {
                  duration: 70,
                  easing: Easing.out(Easing.quad),
                }),
                withTiming(1, {
                  duration: 160,
                  easing: Easing.out(Easing.cubic),
                }),
              ),
            ),
          );
          jointProgress.set(0);
          jointProgress.set(
            withTiming(
              1,
              {
                duration,
                easing: checked
                  ? Easing.out(Easing.cubic)
                  : Easing.bezier(...RETRACT_CURVE),
              },
              (done) => {
                'worklet';
                if (done) joint.set(null);
              },
            ),
          );
        }
      }
      pulse.set({ id, day });
      pulseScale.set(
        withSequence(
          withTiming(0.94, { duration: 45, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 135, easing: Easing.out(Easing.cubic) }),
        ),
      );
    }
  }
  // Number, text and category cells open their dialog shortly after a tap,
  // so a second press can start drawing a fill instead; checkboxes toggle at
  // once. Screen readers activate directly, without the delay. The delay is
  // a UI-thread animation, cancelled when a second press arms a fill.
  const checkboxRows = useMemo(
    () =>
      displayed
        .filter((habit) => habitType(habit) === 'checkbox')
        .map((habit) => habit.id),
    [displayed],
  );
  const opening = useSharedValue(0);
  function openLater(id: string, day: number) {
    'worklet';
    cancelAnimation(opening);
    opening.set(0);
    opening.set(
      withDelay(
        VALUE_OPEN_DELAY_MS,
        withTiming(1, { duration: 0 }, (done) => {
          'worklet';
          if (done) runOnJS(activate)(id, day);
        }),
      ),
    );
  }

  function endFill() {
    onFillActive(false);
  }
  function commitFill(id: string, from: number, to: number) {
    onFillActive(false);
    const habit = displayed.find((row) => row.id === id);
    if (!habit || disabled) return fillRun.set(null);
    const step = to >= from ? 1 : -1;
    const days: number[] = [];
    for (let day = from; ; day += step) {
      days.push(day);
      if (day === to) break;
    }
    const dates = days.map((day) => timingDate(todayOrdinal - day));
    const key = (date: string) => `${id}:${date}`;
    const before = store.getSnapshot().replay.state.values;
    let finished = false;
    onFill(habit, dates, (saved) => {
      if (finished) return;
      finished = true;
      if (!tapAnimations) return fillRun.set(null);
      // The highlight drains along the run; what changed also moves.
      const after = store.getSnapshot().replay.state.values;
      const checkbox = habitType(habit) === 'checkbox';
      const beyondDate = timingDate(todayOrdinal - (to + step));
      const changed = dates.map(
        (date) =>
          !sameEntry(before[key(date)] ?? null, after[key(date)] ?? null),
      );
      const plan = planFillWave({
        id,
        days,
        changed,
        met: dates.map((date) => cellState(habit, after[key(date)], date).met),
        wasChecked: dates.map((date) =>
          checkboxChecked(habit, before[key(date)], date),
        ),
        checkbox,
        ticking:
          checkbox && checkboxChecked(habit, after[key(dates[0])], dates[0]),
        beyondChecked:
          checkbox &&
          checkboxChecked(habit, after[key(beyondDate)], beyondDate),
        joined: joinedRuns,
        motion: saved && !reducedMotion,
        metBars:
          dates.length > 1 &&
          cellState(habit, before[key(dates[1])], dates[1]).met,
        box: shapes[id]?.box ?? 0,
        column,
      });
      holds.set(
        checkbox && plan.joins !== 0
          ? heldLooks(habit, days, dates, changed, plan, before, after)
          : null,
      );
      wave.set(plan);
      fillRun.set(null);
      waveTime.set(0);
      waveTime.set(
        withTiming(
          plan.duration,
          { duration: plan.duration, easing: Easing.linear },
          (done) => {
            'worklet';
            if (done) {
              wave.set(null);
              holds.set(null);
            }
          },
        ),
      );
    });
  }
  // The looks boxes keep until the stroke reaches them: changed run cells as
  // they were, and checked boxes whose streak number the fill changes (in
  // the run, the day beyond, or further on until the stroke ends).
  function heldLooks(
    habit: Habit,
    days: number[],
    dates: string[],
    changed: boolean[],
    plan: FillWave,
    before: EntryValues,
    after: EntryValues,
  ) {
    const id = habit.id;
    const now = model.value;
    const labels: LabelCache = new Map();
    const box = shapes[id]?.box ?? 0;
    const colour = palettes[id]?.checkmark ?? '#000000';
    const streaks = boxes && cellLook.streakNumbers;
    const memoBefore = new Map<string, number>();
    const memoAfter = new Map<string, number>();
    const streakOf = (
      day: number,
      values: EntryValues,
      memo: typeof memoBefore,
    ) => (streaks ? checkedStreak(habit, day, values, todayOrdinal, memo) : 0);
    const list: { day: number; until: number; cell: CanvasCell }[] = [];
    days.forEach((day, k) => {
      const cell = now[day]?.[id];
      if (!cell || !changed[k] || plan.at[k] <= 0) return;
      const earlier = cellState(habit, before[`${id}:${dates[k]}`], dates[k]);
      const number = earlier.checked ? streakOf(day, before, memoBefore) : 0;
      list.push({
        day,
        until: plan.at[k],
        cell: {
          ...cell,
          c: earlier.checked,
          m: earlier.met,
          r: earlier.recorded,
          q: number > 0 ? streakLabel(labels, colour, box, number) : null,
        },
      });
    });
    if (!streaks) return list;
    // Streak numbers count back, so only days after the run's oldest day
    // can change; look through the prepared days near it.
    const oldest = Math.max(...days);
    for (let day = oldest; day >= Math.min(...days) - 62; day--) {
      const cell = now[day]?.[id];
      const k = plan.days.indexOf(day);
      if (!cell?.c || (k >= 0 && k < plan.run && changed[k])) continue;
      const was = streakOf(day, before, memoBefore);
      const is = streakOf(day, after, memoAfter);
      if (!was || was === is) continue;
      list.push({
        day,
        until:
          k >= 0 && k < plan.run
            ? plan.at[k]
            : k >= 0 && plan.bumps[k] >= 0
              ? plan.bumps[k]
              : plan.ms,
        cell: { ...cell, q: streakLabel(labels, colour, box, was) },
      });
    }
    return list;
  }

  // Drag to fill: a second press on the cell just tapped that then moves
  // along the row draws a run there (never down a column). It wins the race
  // with scrolling by activating after fewer points.
  const fill = Gesture.Pan()
    .enabled(!disabled)
    .manualActivation(true)
    .onTouchesDown((event, manager) => {
      const touch = event.allTouches[0];
      const last = lastTap.value;
      const hit =
        touch && event.numberOfTouches === 1 && !flinging()
          ? hitTest(touch.x, touch.y)
          : null;
      if (
        !hit ||
        !last ||
        hit.id !== last.id ||
        hit.day !== last.day ||
        now() - last.at > FILL_DOUBLE_TAP_MS ||
        fillRun.value !== null
      ) {
        manager.fail();
        return;
      }
      armed.set({ id: hit.id, day: hit.day, x: touch.x, y: touch.y });
      cancelAnimation(opening);
    })
    .onTouchesMove((event, manager) => {
      const press = armed.value;
      const touch = event.allTouches[0];
      if (!press || !touch) {
        manager.fail();
        return;
      }
      const dx = Math.abs(touch.x - press.x);
      const dy = Math.abs(touch.y - press.y);
      if (dx >= FILL_SLOP_PX && dx >= dy) manager.activate();
      else if (dy >= 12) manager.fail();
    })
    .onStart(() => {
      const press = armed.value;
      if (!press) return;
      lastTap.set(null);
      // The run's highlight replaces the start cell's held pressed shade.
      const held = fade.value;
      if (held !== null && held.id === press.id && held.day === press.day)
        fade.set(null);
      fillRun.set({ id: press.id, from: press.day, to: press.day });
      runOnJS(onFillActive)(true);
    })
    .onUpdate((event) => {
      const current = fillRun.value;
      if (!current) return;
      // Only the row's visible days: the end follows the finger's column.
      const [newest, oldest] = visibleDayRange(width, offset.value, column);
      const day = Math.min(
        oldest,
        Math.max(newest, dayAtX(event.x, width, offset.value, column)),
      );
      if (day === current.to) return;
      fillRun.set({ id: current.id, from: current.from, to: day });
      runOnJS(feedback)('selection');
    })
    .onEnd((_event, success) => {
      const current = fillRun.value;
      if (success && current)
        runOnJS(commitFill)(current.id, current.from, current.to);
      else {
        fillRun.set(null);
        runOnJS(endFill)();
      }
    })
    .onFinalize(() => {
      armed.set(null);
    });

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .maxDistance(12)
    .maxDuration(60_000)
    .onBegin((event) => {
      // As in native lists, a touch on fast momentum only stops it.
      pressed.set(flinging() ? null : hitTest(event.x, event.y));
    })
    .onEnd((event, success) => {
      const start = pressed.value;
      const end = hitTest(event.x, event.y);
      if (
        success &&
        start &&
        end &&
        start.id === end.id &&
        start.day === end.day
      ) {
        if (tapAnimations) {
          fade.set(start);
          fadeProgress.set(0);
        }
        lastTap.set({ id: start.id, day: start.day, at: now() });
        if (checkboxRows.includes(start.id))
          runOnJS(activate)(start.id, start.day);
        else openLater(start.id, start.day);
      }
    })
    .onFinalize(() => {
      pressed.set(null);
    });

  const header = (
    <GestureDetector gesture={pan()}>
      <View style={{ width, height: headerHeight }}>
        <Canvas
          style={{ width, height: headerHeight }}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Picture picture={headerPicture} />
        </Canvas>
        <HeadingAccessibility {...props} />
      </View>
    </GestureDetector>
  );
  const body = (
    <GestureDetector gesture={Gesture.Race(fill, pan(), tap)}>
      <View style={{ width, height: gridHeight }}>
        <Canvas
          style={{ width, height: gridHeight }}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Picture picture={bodyPicture} />
        </Canvas>
        <GridAccessibilityLayer {...props} onActivate={activate} />
      </View>
    </GestureDetector>
  );
  return { header, body };
}
