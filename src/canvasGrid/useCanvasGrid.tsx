import {
  Canvas,
  FontWeight,
  PaintStyle,
  Picture,
  Skia,
  StrokeCap,
  StrokeJoin,
  TextAlign,
  TileMode,
  createPicture,
  type SkParagraph,
} from '@shopify/react-native-skia';
import { useMemo, type ReactNode } from 'react';
import { PixelRatio, View } from 'react-native';
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
import { entryDay, type EntryDay } from '../calendar';
import type { CellLook, CheckboxStyle, WeekStart } from '../displayPreferences';
import { ordinal, timingDate } from '../goalTiming';
import type { GridPalette } from '../gridAppearance';
import { FUTURE_PULL_DISTANCE } from '../gridNavigation';
import { checkboxChecked } from '../habitGoals';
import { habitType, type Habit } from '../habits';
import type { ChangeStore } from '../storage/store';
import type { Theme } from '../theme';
import { civilFromDays, shadedWeekOf, weekdayOf } from './gridDates';
import {
  checkboxGeometry,
  columnX,
  dayAtX,
  visibleDayRange,
} from './gridGeometry';
import {
  GridAccessibilityLayer,
  HeadingAccessibility,
} from './GridAccessibilityLayer';
import { useGridModel, type CanvasCell } from './useGridModel';

const tick = Skia.Path.MakeFromSVGString('M4 12 L9 17 L20 6')!;
const cross = Skia.Path.MakeFromSVGString('M6 6 L18 18 M18 6 L6 18')!;
const pixelRatio = PixelRatio.get();
const hairline = 1 / pixelRatio;
/**
 * The offset rounded to a physical pixel. Columns are whole pixels, so every
 * cell edge then lands on a pixel boundary; at fractional offsets neighbouring
 * cells each anti-alias the shared pixel and leave a faint seam while scrolling.
 */
function pixelOffset(offset: number) {
  'worklet';
  return Math.round(offset * pixelRatio) / pixelRatio;
}

function fill(colour: string) {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(colour));
  return paint;
}
function stroke(colour: string, width = 1) {
  const paint = fill(colour);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
  return paint;
}
function heading(
  text: string,
  colour: string,
  size: number,
  weight: FontWeight,
  width: number,
) {
  const builder = Skia.ParagraphBuilder.Make({
    maxLines: 1,
    textAlign: TextAlign.Center,
  });
  builder.pushStyle({
    color: Skia.Color(colour),
    fontSize: size,
    fontStyle: { weight },
  });
  builder.addText(text);
  const paragraph = builder.build();
  paragraph.layout(Math.max(1, width));
  return paragraph;
}

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
  const todayOutlines = cellLook.todayOutlines;
  const missedMarks = cellLook.missedDays;
  const joinedRuns = boxes && cellLook.joinedCheckboxes;
  const roundBoxes = boxes && cellLook.roundCheckboxes;
  const connectorThickness = cellLook.connectorThickness / 100;
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
  // Per-row checkbox shapes, centred on the cell (rows may differ in height).
  const shapes = useMemo(() => {
    const result: Record<
      string,
      {
        fill: ReturnType<typeof Skia.RRectXY>;
        outline: ReturnType<typeof Skia.RRectXY>;
        stroke: number;
        size: number;
        box: number;
      }
    > = {};
    for (const row of rows) {
      const g = checkboxGeometry(fontScale, row.height, column);
      // Round boxes (development look) are full circles.
      if (roundBoxes) g.radius = g.box / 2;
      result[row.id] = {
        fill: Skia.RRectXY(
          Skia.XYWHRect(-g.box / 2, -g.box / 2, g.box, g.box),
          g.radius,
          g.radius,
        ),
        outline: Skia.RRectXY(
          Skia.XYWHRect(
            -g.box / 2 + g.stroke / 2,
            -g.box / 2 + g.stroke / 2,
            Math.max(0, g.box - g.stroke),
            Math.max(0, g.box - g.stroke),
          ),
          Math.max(0, g.radius - g.stroke / 2),
          Math.max(0, g.radius - g.stroke / 2),
        ),
        stroke: g.stroke,
        size: g.size,
        box: g.box,
      };
    }
    return result;
  }, [rows, fontScale, column, roundBoxes]);
  const paints = useMemo(() => {
    const habitPaints: Record<
      string,
      Record<string, ReturnType<typeof fill>>
    > = {};
    for (const [id, p] of Object.entries(palettes))
      habitPaints[id] = {
        colour: fill(p.colour),
        colourLine: stroke(p.colour),
        box: stroke(p.checkbox),
        boxFill: fill(p.checkbox),
        mark: stroke(p.checkmark),
        met: fill(p.completedBackground),
        pressed: fill(p.pressed),
        rule: stroke(p.rule, hairline),
        dash: stroke(`${p.colour}40`, 2),
        missed: stroke(`${p.colour}66`, 1.8),
      };
    return {
      habit: habitPaints,
      background: fill(theme.background),
      today: fill(theme.ink(0x09)),
      pill: fill(theme.ink(0x19)),
      shade: fill(theme.ink(0x0c)),
      streak: fill(theme.ink(0x8a)),
    };
  }, [palettes, theme]);
  const labels = useMemo(() => {
    const format = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      timeZone: 'UTC',
    });
    // 4 October 2026 was a Sunday: weekday names in the device locale.
    const weekdays = Array.from({ length: 7 }, (_, index) =>
      heading(
        format.format(new Date(Date.UTC(2026, 9, 4 + index, 12))),
        theme.ink(0x97),
        11 * fontScale,
        FontWeight.Medium,
        column,
      ),
    );
    const todayLabel = heading(
      'Today',
      theme.ink(0xff),
      11 * fontScale,
      FontWeight.Medium,
      column,
    );
    const numbers: SkParagraph[] = [];
    for (let day = 0; day <= 31; day++)
      numbers.push(
        heading(
          String(day),
          theme.ink(0xe8),
          19 * fontScale,
          FontWeight.SemiBold,
          column,
        ),
      );
    return {
      weekdays,
      todayLabel,
      numbers,
      numberTop: 8 + todayLabel.getHeight() + 3,
    };
  }, [theme, fontScale, column]);

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
        for (let day = first; day <= last; day++) {
          const x = columnX(day, width, shift, column);
          const epoch = todayOrdinal - day;
          if (day === 0)
            canvas.drawRRect(
              Skia.RRectXY(Skia.XYWHRect(x, 0, column, headerHeight + 8), 8, 8),
              paints.pill,
            );
          else if (weekDividers && shadedWeekOf(epoch, weekStart))
            canvas.drawRect(
              Skia.XYWHRect(x, 0, column, headerHeight),
              paints.shade,
            );
          const label =
            day === 0 ? labels.todayLabel : labels.weekdays[weekdayOf(epoch)];
          label.paint(canvas, x, 8);
          labels.numbers[civilFromDays(epoch)[2]].paint(
            canvas,
            x,
            labels.numberTop,
          );
        }
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
            const middleY = top + (row.height - hairline) / 2;
            for (let day = first; day <= last; day++) {
              const x = columnX(day, width, shift, column);
              const cell = cells[day]?.[row.id];
              const isPressed =
                press !== null && press.id === row.id && press.day === day;
              if (isPressed)
                canvas.drawRect(
                  Skia.XYWHRect(x, top, column, row.height),
                  p.pressed,
                );
              else if (cell?.m)
                canvas.drawRect(
                  Skia.XYWHRect(x, top, column, row.height),
                  p.met,
                );
              else if (day === 0)
                canvas.drawRect(
                  Skia.XYWHRect(x, top, column, row.height),
                  paints.today,
                );
              canvas.drawLine(
                x,
                top + row.height - hairline / 2,
                x + column,
                top + row.height - hairline / 2,
                p.rule,
              );
              const middleX = x + column / 2;
              if (joinedRuns && checkboxStyle === 'boxes') {
                // Consecutive checked boxes are joined by a bar thinner than
                // the boxes. Each cell draws only the part inside itself, so
                // neighbouring backgrounds never cover it; older days sit to
                // the left.
                const bar = shape.box * connectorThickness;
                const barTop = middleY - bar / 2;
                const barFill = (target: CanvasCell | undefined) =>
                  target?.m ? p.colour : p.boxFill;
                const moving = j !== null && j.id === row.id;
                // Halves of a joint being animated are drawn by the animation.
                const ownLeft =
                  moving &&
                  ((day === j.day && j.left) || (day === j.day - 1 && j.right));
                const ownRight =
                  moving &&
                  ((day === j.day && j.right) || (day === j.day + 1 && j.left));
                if (cell?.c) {
                  if (!ownLeft && cells[day + 1]?.[row.id]?.c)
                    canvas.drawRect(
                      Skia.XYWHRect(x, barTop, column / 2, bar),
                      barFill(cell),
                    );
                  if (!ownRight && cells[day - 1]?.[row.id]?.c)
                    canvas.drawRect(
                      Skia.XYWHRect(middleX, barTop, column / 2, bar),
                      barFill(cell),
                    );
                }
                if (moving && Math.abs(day - j.day) <= 1) {
                  // Joins grow out of the neighbour into the tapped box, and
                  // retract back into the neighbour when broken.
                  const length = column * (j.joining ? jt : 1 - jt);
                  if (j.left) {
                    const from = columnX(j.day + 1, width, shift, column);
                    const start = Math.max(x, from + column / 2);
                    const end = Math.min(
                      x + column,
                      from + column / 2 + length,
                    );
                    if (end > start)
                      canvas.drawRect(
                        Skia.XYWHRect(start, barTop, end - start, bar),
                        barFill(cells[j.day + 1]?.[row.id]),
                      );
                  }
                  if (j.right) {
                    const from = columnX(j.day - 1, width, shift, column);
                    const start = Math.max(x, from + column / 2 - length);
                    const end = Math.min(x + column, from + column / 2);
                    if (end > start)
                      canvas.drawRect(
                        Skia.XYWHRect(start, barTop, end - start, bar),
                        barFill(cells[j.day - 1]?.[row.id]),
                      );
                  }
                }
              }
              if (!cell) {
                canvas.drawLine(
                  middleX - 5,
                  middleY,
                  middleX + 5,
                  middleY,
                  p.dash,
                );
                continue;
              }
              // Empty markers are unchecked boxes and unrecorded "—" labels.
              const empty = cell.k === 0 ? !cell.c : !cell.r;
              const missed =
                missedMarks && empty && day > 0 && cell.s === 1 && !cell.m;
              if (
                empty &&
                !missed &&
                ((todayOutlines && day !== 0) ||
                  (missedMarks && day > 0 && cell.s === 2))
              )
                continue;
              if (missed) {
                // Smaller than a checkbox, with the same line weight.
                const crossSize = shape.size * 0.75;
                canvas.save();
                canvas.translate(
                  middleX - crossSize / 2,
                  middleY - crossSize / 2,
                );
                canvas.scale(crossSize / 24, crossSize / 24);
                p.missed.setStrokeWidth((1.8 * shape.size) / crossSize);
                canvas.drawPath(cross, p.missed);
                canvas.restore();
                continue;
              }
              if (cell.p) {
                cell.p.paint(
                  canvas,
                  x + 4,
                  top + (row.height - hairline - cell.p.getHeight()) / 2,
                );
                continue;
              }
              canvas.save();
              canvas.translate(middleX, middleY);
              if (hit !== null && hit.id === row.id && hit.day === day)
                canvas.scale(pulseScale.value, pulseScale.value);
              if (
                knock !== null &&
                knock.id === row.id &&
                knock.days.includes(day)
              )
                canvas.scale(bumpScale.value, bumpScale.value);
              const line = cell.m ? p.colourLine : p.box;
              if (checkboxStyle === 'boxes') {
                if (cell.c)
                  canvas.drawRRect(shape.fill, cell.m ? p.colour : p.boxFill);
                else {
                  line.setStrokeWidth(shape.stroke);
                  canvas.drawRRect(shape.outline, line);
                }
                if (cell.q)
                  // Streak numbers replace the tick with the streak position.
                  cell.q.paint(canvas, -shape.box / 2, -cell.q.getHeight() / 2);
                else if (cell.c) {
                  const glyph = shape.box * 0.85;
                  canvas.translate(-glyph / 2, -glyph / 2);
                  canvas.scale(glyph / 24, glyph / 24);
                  p.mark.setStrokeWidth(2.5);
                  canvas.drawPath(tick, p.mark);
                }
              } else {
                canvas.translate(-shape.size / 2, -shape.size / 2);
                canvas.scale(shape.size / 24, shape.size / 24);
                line.setStrokeWidth(cell.c ? 2.3 : 1.8);
                canvas.drawPath(cell.c ? tick : cross, line);
              }
              canvas.restore();
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
