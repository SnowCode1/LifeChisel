import {
  Canvas,
  Picture,
  Skia,
  TileMode,
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
import { checkboxChecked } from '@onpurpose/core/habitGoals';
import { habitType, type Habit } from '@onpurpose/core/habits';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import type { Theme } from '@onpurpose/core/theme';
import {
  boxColour,
  cellShapes,
  drawCellBase,
  drawCellMark,
  isHiddenMiddle,
  drawHeadings,
  gridPaints,
  hairline,
  headingLabels,
  pixelOffset,
  type CellStyle,
} from './cellPainter';
import { columnX, dayAtX, visibleDayRange } from './gridGeometry';
import {
  GridAccessibilityLayer,
  HeadingAccessibility,
} from './GridAccessibilityLayer';
import { useGridModel } from './useGridModel';

type Row = { id: string; top: number; height: number };
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
const JOINT_DURATION = 220;
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
  onNavigate: (day: number) => void;
};

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
        const distance = streakDistance.value;
        const alpha = streakOpacity.value * Math.min(1, distance / 16);
        if (alpha > 0) {
          const length = width * Math.min(1, distance / FUTURE_PULL_DISTANCE);
          const colour = Skia.Color(streakColour);
          paints.streak.setShader(
            Skia.Shader.MakeLinearGradient(
              { x: width - length, y: 0 },
              { x: width, y: 0 },
              [Skia.Color('transparent'), colour],
              null,
              TileMode.Clamp,
            ),
          );
          paints.streak.setAlphaf(alpha);
          canvas.drawRect(
            Skia.XYWHRect(width - length, headerHeight - 1, length, 1),
            paints.streak,
          );
        }
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
            for (let day = first; day <= last; day++) {
              const x = columnX(day, width, shift, column);
              const cell = cells[day]?.[row.id];
              const olderChecked = cells[day + 1]?.[row.id]?.c === true;
              const newerChecked = cells[day - 1]?.[row.id]?.c === true;
              // Halves of a join being animated are drawn by the animation.
              const skipLeft =
                moving &&
                ((day === j.day && j.left) || (day === j.day - 1 && j.right));
              const skipRight =
                moving &&
                ((day === j.day && j.right) || (day === j.day + 1 && j.left));
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
                press !== null && press.id === row.id && press.day === day,
                skipLeft,
                skipRight,
              );
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
              if (isHiddenMiddle(style, cell, olderChecked, newerChecked))
                // Boxes a growing join turns into a streak's middle shrink
                // into the bar as it reaches them; other middles stay hidden.
                scale *=
                  moving && j.joining && Math.abs(day - j.day) <= 1
                    ? 1 - jt
                    : 0;
              if (scale > 0)
                drawCellMark(
                  canvas,
                  p,
                  shape,
                  style,
                  cell,
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
    const habit = displayed.find((row) => row.id === id);
    if (!habit || disabled) return;
    const date = timingDate(todayOrdinal - day);
    const key = `${id}:${date}`;
    const before = store.getSnapshot().replay.state.values[key];
    onCellPress(habit, entryDay(date));
    const values = store.getSnapshot().replay.state.values;
    const after = values[key];
    const checked = checkboxChecked(habit, after, date);
    if (
      habitType(habit) === 'checkbox' &&
      tapAnimations &&
      !reducedMotion &&
      checkboxChecked(habit, before, date) !== checked
    ) {
      if (joinedRuns && checkboxStyle === 'boxes') {
        const checkedOn = (neighbour: number) => {
          const other = timingDate(todayOrdinal - neighbour);
          return checkboxChecked(habit, values[`${id}:${other}`], other);
        };
        const left = checkedOn(day + 1);
        const right = checkedOn(day - 1);
        if (left || right) {
          joint.set({ id, day, left, right, joining: checked });
          // The bar nudges the box it reaches the moment it touches that box:
          // the tapped box when joining, the neighbours when retracting. Both
          // happen at the same eased progress, when the bar end is half a box
          // from that box's centre.
          const box = shapes[id]?.box ?? 0;
          const contact = Math.min(1, Math.max(0, 1 - box / 2 / column));
          // Inverse of Easing.out(Easing.cubic): 1 - (1 - t)^3.
          const contactAt = 1 - Math.cbrt(1 - contact);
          bump.set({
            id,
            days: checked
              ? [day]
              : [...(left ? [day + 1] : []), ...(right ? [day - 1] : [])],
          });
          bumpScale.set(
            withDelay(
              JOINT_DURATION * contactAt,
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
              { duration: JOINT_DURATION, easing: Easing.out(Easing.cubic) },
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
      )
        runOnJS(activate)(start.id, start.day);
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
    <GestureDetector gesture={Gesture.Race(pan(), tap)}>
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
