import {
  Canvas,
  FontWeight,
  Picture,
  Skia,
  TextAlign,
  createPicture,
  type SkParagraph,
} from '@shopify/react-native-skia';
import { GRID_FONT_FAMILIES } from './gridFont';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  type PanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import type { GridPalette } from '@onpurpose/core/gridAppearance';
import type { Habit } from '@onpurpose/core/habits';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import type { Theme } from '@onpurpose/core/theme';
import {
  weekCellLabel,
  weekColumnStart,
  weekHeading,
  weekSummary,
  type WeekDot,
} from '@onpurpose/core/weekSummary';
import { FUTURE_PULL_DISTANCE } from '../gridNavigation';
import {
  drawPullStreak,
  fill,
  gridPaints,
  hairline,
  headingLabels,
  pixelOffset,
} from './cellPainter';
import { civilFromDays } from './gridDates';
import { columnX, dayAtX, visibleDayRange } from './gridGeometry';
import { useScreenReader } from './GridAccessibilityLayer';

// Weeks mode: the same frame, scrolling and rows as the day grid, but every
// column is a calendar week (0 = this week, larger is older). Each cell draws
// the week's number above seven day dots, from core `weekSummary`.

/** The narrowest week column: seven readable dots and a short total. */
export const WEEK_COLUMN_WIDTH = 52;

const DOT: Record<WeekDot, number> = {
  done: 0,
  missed: 1,
  empty: 2,
  off: 3,
  none: 4,
};
/** One week cell on the UI thread: dot codes, prepared number, goal met. */
type WeekCell = { d: number[]; l: SkParagraph | null; m: boolean };
type WeekCells = Record<string, Record<string, WeekCell>>;
type Row = { id: string; top: number; height: number };
type Pointer = { id: string; week: number } | null;

// Weeks are prepared on JS in chunks around the visible position, like the
// day model; a week not prepared yet draws empty.
const CHUNK = 12;
const KEEP = 4;

export type WeekGridProps = {
  store: ChangeStore;
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
  weekStart: WeekStart;
  weekDividers: boolean;
  missedMarks: boolean;
  offset: SharedValue<number>;
  pull: SharedValue<number>;
  pan: () => PanGesture;
  flinging: () => boolean;
  rowTops: SharedValue<Record<string, number>>;
  dragY: SharedValue<number>;
  bodyTop: SharedValue<number>;
  scrollOffset: SharedValue<number>;
  dragId: string | null;
  disabled: boolean;
  /** A week cell was tapped: show that week in the day grid. */
  onWeekPress: (weeksAgo: number) => void;
  onNavigate: (weeksAgo: number) => void;
};

function numberParagraph(
  cache: Map<string, SkParagraph>,
  text: string,
  colour: string,
  size: number,
  column: number,
) {
  const key = `${colour}|${size}|${column}|${text}`;
  let result = cache.get(key);
  if (!result) {
    const builder = Skia.ParagraphBuilder.Make({
      maxLines: 1,
      textAlign: TextAlign.Center,
    });
    builder.pushStyle({
      color: Skia.Color(colour),
      fontSize: text.length > 4 ? size * 0.82 : size,
      fontFamilies: GRID_FONT_FAMILIES,
      fontStyle: { weight: FontWeight.SemiBold },
    });
    builder.addText(text);
    result = builder.build();
    result.layout(Math.max(1, column - 4));
    cache.set(key, result);
  }
  return result;
}

function useWeekModel({
  store,
  rows,
  palettes,
  today,
  weekStart,
  fontScale,
  column,
  offset,
}: Pick<
  WeekGridProps,
  | 'store'
  | 'rows'
  | 'palettes'
  | 'today'
  | 'weekStart'
  | 'fontScale'
  | 'column'
  | 'offset'
>) {
  const model = useSharedValue<WeekCells>({});
  const state = useRef({
    built: new Set<number>(),
    values: null as unknown,
    paragraphs: new Map<string, SkParagraph>(),
  });
  const inputs = useRef({
    rows,
    palettes,
    today,
    weekStart,
    fontScale,
    column,
  });
  useLayoutEffect(() => {
    inputs.current = { rows, palettes, today, weekStart, fontScale, column };
  });
  const prepare = (chunks: number[], reset: boolean) => {
    const { rows, palettes, today, weekStart, fontScale, column } =
      inputs.current;
    const values = store.getSnapshot().replay.state.values;
    state.current.values = values;
    const next: WeekCells = reset ? {} : { ...model.get() };
    for (const chunk of chunks) {
      state.current.built.add(chunk);
      for (let week = chunk * CHUNK; week < (chunk + 1) * CHUNK; week++) {
        const first = weekColumnStart(today, weekStart, week);
        const cells: Record<string, WeekCell> = {};
        for (const habit of rows) {
          const summary = weekSummary(habit, values, today, first);
          cells[habit.id] = {
            d: summary.dots.map((dot) => DOT[dot]),
            l: summary.label
              ? numberParagraph(
                  state.current.paragraphs,
                  summary.label,
                  palettes[habit.id]?.colour ?? '#888888',
                  15 * fontScale,
                  column,
                )
              : null,
            m: summary.met,
          };
        }
        next[week] = cells;
      }
    }
    model.set(next);
  };
  const ensure = (chunk: number) => {
    const wanted = [chunk - 1, chunk, chunk + 1];
    const missing = wanted.filter((item) => !state.current.built.has(item));
    for (const built of [...state.current.built])
      if (Math.abs(built - chunk) > KEEP) state.current.built.delete(built);
    if (missing.length) prepare(missing, false);
  };
  // New rows, colours, dates or sizes rebuild every prepared week.
  useLayoutEffect(() => {
    const chunks = state.current.built.size
      ? [...state.current.built]
      : [-1, 0, 1];
    state.current.built.clear();
    state.current.paragraphs.clear();
    prepare(chunks, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, palettes, today, weekStart, fontScale, column]);
  useEffect(
    () =>
      store.subscribe(() => {
        if (store.getSnapshot().replay.state.values === state.current.values)
          return;
        prepare([...state.current.built], false);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store],
  );
  useAnimatedReaction(
    () =>
      column > 0 ? Math.floor(Math.round(offset.value / column) / CHUNK) : 0,
    (chunk, previous) => {
      if (chunk !== previous) runOnJS(ensure)(chunk);
    },
  );
  return model;
}

export function useWeekGrid(props: WeekGridProps): {
  header: ReactNode;
  body: ReactNode;
} {
  const {
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
    weekStart,
    weekDividers,
    missedMarks,
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
    onWeekPress,
  } = props;
  const model = useWeekModel(props);
  const rows = useMemo<Row[]>(
    () =>
      displayed.map((habit) => ({
        id: habit.id,
        top: tops[habit.id] ?? 0,
        height: heights[habit.id] ?? baseHeight,
      })),
    [displayed, tops, heights, baseHeight],
  );
  const paints = useMemo(() => {
    const base = gridPaints(palettes, theme);
    const missed: Record<string, ReturnType<typeof fill>> = {};
    for (const [id, p] of Object.entries(palettes)) missed[id] = fill(p.missed);
    return {
      ...base,
      missed,
      empty: fill(theme.ink(0x3a)),
      off: fill(theme.ink(0x26)),
    };
  }, [palettes, theme]);
  const labels = useMemo(() => {
    const format = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      timeZone: 'UTC',
    });
    const month = (colour: string) =>
      Array.from({ length: 12 }, (_, index) => {
        const builder = Skia.ParagraphBuilder.Make({
          maxLines: 1,
          textAlign: TextAlign.Center,
        });
        builder.pushStyle({
          color: Skia.Color(colour),
          fontSize: 11 * fontScale,
          fontFamilies: GRID_FONT_FAMILIES,
          fontStyle: { weight: FontWeight.Medium },
        });
        builder.addText(format.format(new Date(Date.UTC(2026, index, 15))));
        const paragraph = builder.build();
        paragraph.layout(Math.max(1, column));
        return paragraph;
      });
    const days = headingLabels(theme, fontScale, column);
    return {
      months: month(theme.ink(0x97)),
      current: month(theme.ink(0xff)),
      numbers: days.numbers,
      numberTop: days.numberTop,
    };
  }, [theme, fontScale, column]);
  const thisWeek = weekColumnStart(today, weekStart, 0);

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
        for (let week = first; week <= last; week++) {
          const x = columnX(week, width, shift, column);
          const [, month, day] = civilFromDays(thisWeek - week * 7);
          if (week === 0)
            canvas.drawRRect(
              Skia.RRectXY(Skia.XYWHRect(x, 0, column, headerHeight + 8), 8, 8),
              paints.pill,
            );
          // Alternate months are faintly shaded, grouping their weeks.
          else if (weekDividers && month % 2 === 0)
            canvas.drawRect(
              Skia.XYWHRect(x, 0, column, headerHeight),
              paints.shade,
            );
          (week === 0 ? labels.current : labels.months)[month - 1].paint(
            canvas,
            x,
            8,
          );
          labels.numbers[day].paint(canvas, x, labels.numberTop);
        }
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
        const dot = Math.min(6 * fontScale, (column - 10) / 10);
        const gap = dot / 2;
        const dotsWidth = dot * 7 + gap * 6;
        for (let pass = 0; pass < 2; pass++)
          for (const row of rows) {
            if ((row.id === dragId) !== (pass === 1)) continue;
            const top =
              row.id === dragId
                ? dragY.value - bodyTop.value + scrollOffset.value
                : (animated[row.id] ?? row.top);
            const p = paints.habit[row.id];
            if (!p) continue;
            for (let week = first; week <= last; week++) {
              const x = columnX(week, width, shift, column);
              const cell = cells[week]?.[row.id];
              const background =
                press !== null && press.id === row.id && press.week === week
                  ? p.pressed
                  : cell?.m
                    ? p.met
                    : week === 0
                      ? paints.today
                      : null;
              if (background)
                canvas.drawRect(
                  Skia.XYWHRect(x, top, column, row.height),
                  background,
                );
              canvas.drawLine(
                x,
                top + row.height - hairline / 2,
                x + column,
                top + row.height - hairline / 2,
                p.rule,
              );
              if (!cell) continue;
              const label = cell.l;
              const labelHeight = label ? label.getHeight() : 0;
              const block = labelHeight + (label ? 4 : 0) + dot;
              const blockTop = top + (row.height - block) / 2;
              if (label) label.paint(canvas, x + 2, blockTop);
              const dotY = blockTop + block - dot / 2;
              let dotX = x + (column - dotsWidth) / 2 + dot / 2;
              for (let i = 0; i < 7; i++, dotX += dot + gap) {
                const code = cell.d[i];
                if (code === 4) continue;
                const paint =
                  code === 0
                    ? p.colour
                    : code === 1 && missedMarks
                      ? paints.missed[row.id]
                      : code === 3
                        ? paints.off
                        : paints.empty;
                canvas.drawCircle(
                  dotX,
                  dotY,
                  code === 3 ? dot / 4 : dot / 2,
                  paint,
                );
              }
            }
          }
      },
      { width, height: gridHeight },
    ),
  );

  function hitTest(x: number, y: number): Pointer {
    'worklet';
    const week = dayAtX(x, width, offset.value, column);
    const animated = rowTops.value;
    for (const row of rows) {
      const top = animated[row.id] ?? row.top;
      if (y >= top && y < top + row.height) return { id: row.id, week };
    }
    return null;
  }
  const tap = Gesture.Tap()
    .enabled(!disabled)
    .maxDistance(12)
    .onBegin((event) => {
      pressed.set(flinging() ? null : hitTest(event.x, event.y));
    })
    .onEnd((event, success) => {
      const start = pressed.value;
      const end = hitTest(event.x, event.y);
      if (success && start && end && start.week === end.week)
        runOnJS(onWeekPress)(start.week);
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
        <WeekHeadingAccessibility {...props} />
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
        <WeekAccessibilityLayer {...props} />
      </View>
    </GestureDetector>
  );
  return { header, body };
}

function useFollowOffset(props: WeekGridProps) {
  const settled = props.rightmostDay * props.column;
  const offset = props.offset;
  return useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value - settled }],
  }));
}

function visibleWeeks(props: WeekGridProps) {
  return Array.from(
    { length: Math.max(0, props.visibleDays) },
    (_, index) => props.rightmostDay + index,
  );
}

// As in the day grid, the picture is one image to screen readers: every
// visible week cell also exists as an invisible native button.
function WeekAccessibilityLayer(props: WeekGridProps) {
  const {
    store,
    rows,
    tops,
    heights,
    baseHeight,
    column,
    width,
    rightmostDay,
    today,
    weekStart,
    disabled,
    onWeekPress,
  } = props;
  const screenReader = useScreenReader();
  const values = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().replay.state.values,
  );
  const follow = useFollowOffset(props);
  return (
    <Animated.View
      pointerEvents={screenReader ? 'box-none' : 'none'}
      style={[StyleSheet.absoluteFill, follow]}
    >
      {visibleWeeks(props).map((week) => {
        const first = weekColumnStart(today, weekStart, week);
        const left = columnX(week, width, rightmostDay * column, column);
        return rows.map((habit) => {
          const activate = () => {
            if (!disabled) onWeekPress(week);
          };
          return (
            <View
              key={`${habit.id}:${week}`}
              accessible
              testID={`week-${habit.id}-${week}`}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              accessibilityLabel={weekCellLabel(
                habit,
                weekSummary(habit, values, today, first),
                first,
              )}
              accessibilityHint="Shows this week's days"
              onAccessibilityTap={activate}
              accessibilityActions={[{ name: 'activate' }]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'activate') activate();
              }}
              style={{
                position: 'absolute',
                left,
                top: tops[habit.id] ?? 0,
                width: column,
                height: heights[habit.id] ?? baseHeight,
              }}
            />
          );
        });
      })}
    </Animated.View>
  );
}

function WeekHeadingAccessibility(props: WeekGridProps) {
  const {
    column,
    width,
    headerHeight,
    rightmostDay,
    visibleDays: count,
    unlockedFuture,
    today,
    weekStart,
    onNavigate,
  } = props;
  const screenReader = useScreenReader();
  const follow = useFollowOffset(props);
  const weeks = visibleWeeks(props);
  const label = (week: number) =>
    weekHeading(weekColumnStart(today, weekStart, week)).label;
  return (
    <View
      pointerEvents={screenReader ? 'box-none' : 'none'}
      style={StyleSheet.absoluteFill}
    >
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Weeks"
        accessibilityHint="Swipe up for later weeks, down for earlier weeks"
        accessibilityValue={
          weeks.length
            ? { text: `${label(weeks.at(-1)!)} to ${label(weeks[0])}` }
            : undefined
        }
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment')
            onNavigate(Math.max(-unlockedFuture, rightmostDay - count));
          else if (event.nativeEvent.actionName === 'decrement')
            onNavigate(rightmostDay + count);
        }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, follow]}
      >
        {weeks.map((week) => (
          <View
            key={week}
            accessible
            accessibilityRole="header"
            accessibilityLabel={label(week)}
            style={{
              position: 'absolute',
              left: columnX(week, width, rightmostDay * column, column),
              top: 0,
              width: column,
              height: headerHeight,
            }}
          />
        ))}
      </Animated.View>
    </View>
  );
}
