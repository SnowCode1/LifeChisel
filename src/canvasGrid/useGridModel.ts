import {
  FontWeight,
  Skia,
  TextAlign,
  type SkParagraph,
} from '@shopify/react-native-skia';
import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import type { EntryValue } from '../entries';
import { ordinal, timingDate } from '../goalTiming';
import {
  GRID_ENTRY_FONT_SIZE,
  GRID_ENTRY_LINE_HEIGHT,
  gridEntryTextLines,
} from '../gridEntryText';
import type { GridPalette } from '../gridAppearance';
import type { Habit } from '../habits';
import type { ChangeStore } from '../storage/store';
import { cellState } from './cellAccessibility';

/** One drawn cell on the UI thread: kind, checked, met, prepared text. */
export type CanvasCell = {
  k: 0 | 1 | 2;
  c: boolean;
  m: boolean;
  p: SkParagraph | null;
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
  paragraphs: Map<string, SkParagraph>;
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
  let result = context.paragraphs.get(key);
  if (!result) {
    const builder = Skia.ParagraphBuilder.Make({
      maxLines: lines,
      ellipsis: '…',
      textAlign: TextAlign.Center,
    });
    builder.pushStyle({
      color: Skia.Color(colour),
      fontSize: size,
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

function buildCell(
  context: Context,
  habit: Habit,
  value: EntryValue | undefined,
  date: string,
): CanvasCell {
  const state = cellState(habit, value, date);
  if (state.kind === 'checkbox')
    return { k: 0, c: state.checked, m: state.met, p: null };
  const palette = context.palettes[habit.id];
  const colour = state.recorded ? palette.colour : palette.number;
  if (state.kind === 'number')
    return {
      k: 1,
      c: false,
      m: state.met,
      p: numberParagraph(context, state.label, colour),
    };
  return {
    k: 2,
    c: false,
    m: state.met,
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
    for (const day of days_) {
      const date = timingDate(todayOrdinal - day);
      const previous = state.current.built.get(day);
      const seen: Record<string, EntryValue | undefined> = {};
      let changed = rebuild || !previous;
      for (const habit of rows) {
        const value = values[`${habit.id}:${date}`];
        seen[habit.id] = value;
        if (!previous || previous[habit.id] !== value) changed = true;
      }
      state.current.built.set(day, seen);
      if (!changed) continue;
      const cells: Record<string, CanvasCell> = {};
      for (const habit of rows)
        cells[habit.id] = buildCell(context, habit, seen[habit.id], date);
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
  }, [habits, palettes, fontScale, column, heights, baseHeight, today]);

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
