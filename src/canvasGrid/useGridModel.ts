import {
  FontWeight,
  Skia,
  TextAlign,
  type SkFont,
  type SkPaint,
  type SkParagraph,
  type SkRect,
} from '@shopify/react-native-skia';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { GRID_FONT_FAMILIES, gridFont } from './gridFont';
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import type { EntryValue } from '@onpurpose/core/entries';
import { ordinal, timingDate } from '@onpurpose/core/goalTiming';
import {
  GRID_ENTRY_FONT_SIZE,
  GRID_ENTRY_LINE_HEIGHT,
  gridEntryTextLines,
} from '@onpurpose/core/gridEntryText';
import type { GridPalette } from '@onpurpose/core/gridAppearance';
import type { Habit } from '@onpurpose/core/habits';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import { cellState, checkedStreak } from '@onpurpose/core/cellAccessibility';
import { checkboxGeometry } from './gridGeometry';

/**
 * One drawn cell on the UI thread: kind, checked, met, recorded, schedule
 * (0 none, 1 due, 2 off; see `CellState.schedule`), prepared text, and the
 * streak position drawn in place of the tick (every checked day, from 1).
 */
export type CanvasCell = {
  k: 0 | 1 | 2;
  c: boolean;
  m: boolean;
  r: boolean;
  s: 0 | 1 | 2;
  p: SkParagraph | null;
  q: StreakLabel | null;
};
/** Grid text by key: paragraphs, and streak labels under `streak|` keys. */
export type LabelCache = Map<string, SkParagraph | StreakLabel>;
/** A streak number, drawn with `font` from the origin x, y (its baseline
 * start, relative to the box's centre) so its digits sit centred. */
export type StreakLabel = {
  text: string;
  font: SkFont;
  paint: SkPaint;
  x: number;
  y: number;
};
export type CanvasDays = Record<string, Record<string, CanvasCell>>;

// Days are prepared on the JS thread in 30-day chunks around the visible
// position and handed to the UI thread; a day not prepared yet draws dashes.
const CHUNK = 30;
const AHEAD = 2;
const KEEP = 8;

type Context = {
  palettes: Record<string, GridPalette>;
  fontScale: number;
  column: number;
  heights: Record<string, number>;
  baseHeight: number;
  paragraphs: LabelCache;
  /** Number checked boxes by streak position (development look). */
  streaks: boolean;
};

function paragraph(
  context: Context,
  text: string,
  colour: string,
  size: number,
  lines: number,
  lineHeight?: number,
) {
  const key = `${colour}|${size}|${lines}|${lineHeight ?? 0}|${text}`;
  let result = context.paragraphs.get(key) as SkParagraph | undefined;
  if (!result) {
    const builder = Skia.ParagraphBuilder.Make({
      maxLines: lines,
      ellipsis: '…',
      textAlign: TextAlign.Center,
    });
    builder.pushStyle({
      color: Skia.Color(colour),
      fontSize: size,
      fontFamilies: GRID_FONT_FAMILIES,
      fontStyle: { weight: FontWeight.Medium },
      ...(lineHeight ? { heightMultiplier: lineHeight / size } : {}),
    });
    builder.addText(text);
    result = builder.build();
    result.layout(Math.max(1, context.column - 8));
    context.paragraphs.set(key, result);
  }
  return result;
}

// Numbers shrink to fit, down to 65%, like adjustsFontSizeToFit did.
function numberParagraph(context: Context, text: string, colour: string) {
  const size = 18 * context.fontScale;
  const full = paragraph(context, text, colour, size, 1);
  const available = Math.max(1, context.column - 8);
  if (full.getMaxIntrinsicWidth() <= available) return full;
  const fitted = Math.max(
    size * 0.65,
    Math.floor((size * available * 2) / full.getMaxIntrinsicWidth()) / 2,
  );
  return paragraph(context, text, colour, fitted, 1);
}

// Where a number's weight sits across, in text units from the pen: the
// centroid of its ink, found by drawing it once off screen at four times its
// size. Cached per text and size (colour does not move the weight).
const centres = new Map<string, number>();
function inkCentreX(font: SkFont, size: number, text: string, ink: SkRect) {
  const key = `${size}|${text}`;
  const known = centres.get(key);
  if (known !== undefined) return known;
  const middle = ink.x + ink.width / 2;
  const scale = 4,
    pad = 2;
  const width = Math.ceil(ink.width * scale) + pad * 2;
  const height = Math.ceil(ink.height * scale) + pad * 2;
  const surface = Skia.Surface.Make(width, height);
  if (!surface) return middle;
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#000000'));
  paint.setAntiAlias(true);
  const canvas = surface.getCanvas();
  canvas.translate(pad, pad);
  canvas.scale(scale, scale);
  canvas.drawText(text, -ink.x, -ink.y, paint, font);
  surface.flush();
  const pixels = surface.makeImageSnapshot().readPixels();
  let sum = 0,
    mass = 0;
  if (pixels)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const alpha = Number(pixels[(y * width + x) * 4 + 3]);
        sum += alpha * (x + 0.5);
        mass += alpha;
      }
  const centre = mass > 0 ? ink.x + (sum / mass - pad) / scale : middle;
  centres.set(key, centre);
  return centre;
}

/**
 * A streak position inside a checked box: bold, centred and shrunk to fit.
 * The digits are drawn with the same font that measured them. Vertically
 * their ink (cap height to baseline) is centred, so every number sits on one
 * line; a font's line box would sit digits high in a face with a tall ascent.
 * Across, the ink's weight is centred (optical centring): a 1 is a stem with
 * a flag to the left, so centring its outline or its advance leaves the stem,
 * and so the digit, looking right of centre. Measured on the iPhone capture
 * of 18 October 2026: outlines were within 0.5 px of centre, yet a 1's
 * weight sat about 3 px (1 pt) right. Drawn text is unkerned, as measured.
 */
export function streakLabel(
  cache: LabelCache,
  colour: string,
  box: number,
  streak: number,
): StreakLabel {
  const text = String(streak);
  const size = box * (text.length > 2 ? 0.48 : 0.6);
  const key = `streak|${colour}|${box}|${text}`;
  let result = cache.get(key) as StreakLabel | undefined;
  if (!result) {
    const font = gridFont(size, FontWeight.Bold) ?? Skia.Font(undefined, size);
    const paint = Skia.Paint();
    paint.setColor(Skia.Color(colour));
    paint.setAntiAlias(true);
    // Ink bounds are relative to the pen's start on the baseline (top
    // negative), so this origin puts the ink's centre on the box's centre.
    const ink = font.measureText(text);
    result = {
      text,
      font,
      paint,
      x: -inkCentreX(font, size, text, ink),
      y: -(ink.y + ink.height / 2),
    };
    cache.set(key, result);
  }
  return result;
}
function streakParagraph(context: Context, habit: Habit, streak: number) {
  const height = context.heights[habit.id] ?? context.baseHeight;
  const { box } = checkboxGeometry(context.fontScale, height, context.column);
  return streakLabel(
    context.paragraphs,
    context.palettes[habit.id].checkmark,
    box,
    streak,
  );
}

function buildCell(
  context: Context,
  habit: Habit,
  value: EntryValue | undefined,
  date: string,
  streak: number,
): CanvasCell {
  const state = cellState(habit, value, date);
  const r = state.recorded;
  const s = state.schedule === 'due' ? 1 : state.schedule === 'off' ? 2 : 0;
  if (state.kind === 'checkbox')
    return {
      k: 0,
      c: state.checked,
      m: state.met,
      r,
      s,
      p: null,
      q:
        context.streaks && state.checked && streak > 0
          ? streakParagraph(context, habit, streak)
          : null,
    };
  const palette = context.palettes[habit.id];
  const colour = state.recorded ? palette.colour : palette.number;
  if (state.kind === 'number')
    return {
      k: 1,
      c: false,
      m: state.met,
      r,
      s,
      p: numberParagraph(context, state.label, colour),
      q: null,
    };
  return {
    k: 2,
    c: false,
    m: state.met,
    r,
    s,
    p: paragraph(
      context,
      state.label,
      colour,
      GRID_ENTRY_FONT_SIZE * context.fontScale,
      gridEntryTextLines(
        context.heights[habit.id] ?? context.baseHeight,
        context.fontScale,
      ),
      GRID_ENTRY_LINE_HEIGHT * context.fontScale,
    ),
    q: null,
  };
}

export function useGridModel({
  store,
  habits,
  palettes,
  today,
  fontScale,
  column,
  heights,
  baseHeight,
  offset,
  streaks,
}: {
  store: ChangeStore;
  habits: Habit[];
  palettes: Record<string, GridPalette>;
  today: string;
  fontScale: number;
  column: number;
  heights: Record<string, number>;
  baseHeight: number;
  offset: SharedValue<number>;
  streaks: boolean;
}): SharedValue<CanvasDays> {
  const days = useSharedValue<CanvasDays>({});
  const state = useRef({
    chunk: 0,
    built: new Map<number, Record<string, EntryValue | undefined>>(),
    values: undefined as unknown,
  });
  const latest = useRef({
    store,
    habits,
    today,
    context: null as null | Context,
  });
  useLayoutEffect(() => {
    latest.current.store = store;
    latest.current.habits = habits;
    latest.current.today = today;
  });

  function prepare(days_: number[], rebuild: boolean) {
    const {
      store: current,
      habits: rows,
      today: day0,
      context,
    } = latest.current;
    if (!context) return;
    const values = current.getSnapshot().replay.state.values;
    state.current.values = values;
    const updates: CanvasDays = {};
    const todayOrdinal = ordinal(day0);
    // An edit can lengthen or break the streak of every newer prepared day,
    // so with streak numbers those days are rebuilt too.
    const requested = new Set(days_);
    const forced = new Set<number>();
    if (context.streaks && !rebuild) {
      let oldestChange = -Infinity;
      for (const day of days_) {
        const previous = state.current.built.get(day);
        if (!previous) continue;
        const date = timingDate(todayOrdinal - day);
        for (const habit of rows)
          if (previous[habit.id] !== values[`${habit.id}:${date}`])
            oldestChange = Math.max(oldestChange, day);
      }
      if (oldestChange > -Infinity)
        for (const day of state.current.built.keys())
          if (day < oldestChange) {
            requested.add(day);
            forced.add(day);
          }
    }
    const memo = new Map<string, number>();
    // Oldest first, so each day's streak builds on the one before it.
    for (const day of [...requested].sort((a, b) => b - a)) {
      const date = timingDate(todayOrdinal - day);
      const previous = state.current.built.get(day);
      const seen: Record<string, EntryValue | undefined> = {};
      let changed = rebuild || !previous || forced.has(day);
      for (const habit of rows) {
        const value = values[`${habit.id}:${date}`];
        seen[habit.id] = value;
        if (!previous || previous[habit.id] !== value) changed = true;
      }
      state.current.built.set(day, seen);
      if (!changed) continue;
      const cells: Record<string, CanvasCell> = {};
      for (const habit of rows)
        cells[habit.id] = buildCell(
          context,
          habit,
          seen[habit.id],
          date,
          context.streaks
            ? checkedStreak(habit, day, values, todayOrdinal, memo)
            : 0,
        );
      updates[day] = cells;
    }
    const removed: number[] = [];
    const centre = state.current.chunk * CHUNK;
    for (const day of state.current.built.keys())
      if (Math.abs(day - centre) > KEEP * CHUNK) removed.push(day);
    for (const day of removed) state.current.built.delete(day);
    if (!Object.keys(updates).length && !removed.length) return;
    days.modify((value) => {
      'worklet';
      for (const day in updates) value[day] = updates[day];
      for (const day of removed) delete value[day];
      return value;
    }, true);
  }

  function windowDays(chunk: number) {
    const result: number[] = [];
    for (
      let day = (chunk - AHEAD) * CHUNK;
      day < (chunk + AHEAD + 1) * CHUNK;
      day++
    )
      result.push(day);
    return result;
  }

  function ensure(chunk: number) {
    state.current.chunk = chunk;
    const wanted = windowDays(chunk).filter(
      (day) => !state.current.built.has(day),
    );
    if (wanted.length) prepare(wanted, false);
  }

  // A new font scale, column width, theme, row height or habit list rebuilds
  // every prepared day; paragraphs depend on all of them.
  useEffect(() => {
    if (column <= 0) return;
    latest.current.context = {
      palettes,
      fontScale,
      column,
      heights,
      baseHeight,
      paragraphs: new Map(),
      streaks,
    };
    const prepared = [...state.current.built.keys()];
    state.current.built.clear();
    days.set({});
    prepare(
      [...new Set([...prepared, ...windowDays(state.current.chunk)])],
      true,
    );
    // prepare/windowDays read refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    habits,
    palettes,
    fontScale,
    column,
    heights,
    baseHeight,
    today,
    streaks,
  ]);

  // Entry edits, Undo/Redo and restores: re-check prepared days whose saved
  // values changed. Save acknowledgements keep the same values object.
  useEffect(
    () =>
      store.subscribe(() => {
        const values = store.getSnapshot().replay.state.values;
        if (values === state.current.values) return;
        prepare([...state.current.built.keys()], false);
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
  return days;
}
