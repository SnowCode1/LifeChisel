import {
  FontWeight,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  TextAlign,
  TileMode,
  type SkCanvas,
  type SkParagraph,
} from '@shopify/react-native-skia';
import { GRID_FONT_FAMILIES } from './gridFont';
import { PixelRatio } from 'react-native';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import type { GridPalette } from '@onpurpose/core/gridAppearance';
import type { Theme } from '@onpurpose/core/theme';
import { civilFromDays, shadedWeekOf, weekdayOf } from './gridDates';
import { checkboxGeometry, columnX } from './gridGeometry';
import type { CanvasCell } from './useGridModel';

// Drawing shared by the grid and the Settings preview, so the preview always
// shows exactly what the grid draws. Every function here is a worklet; the
// grid calls them on the UI thread, the preview on the JS thread.

export const tick = Skia.Path.MakeFromSVGString('M4 12 L9 17 L20 6')!;
export const cross = Skia.Path.MakeFromSVGString('M6 6 L18 18 M18 6 L6 18')!;
export const pixelRatio = PixelRatio.get();
export const hairline = 1 / pixelRatio;

export function fill(colour: string) {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(colour));
  return paint;
}
export function stroke(colour: string, width = 1) {
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
    fontFamilies: GRID_FONT_FAMILIES,
    fontStyle: { weight },
  });
  builder.addText(text);
  const paragraph = builder.build();
  paragraph.layout(Math.max(1, width));
  return paragraph;
}

/**
 * The offset rounded to a physical pixel. Columns are whole pixels, so every
 * cell edge then lands on a pixel boundary; at fractional offsets neighbouring
 * cells each anti-alias the shared pixel and leave a faint seam while scrolling.
 */
export function pixelOffset(offset: number) {
  'worklet';
  return Math.round(offset * pixelRatio) / pixelRatio;
}

export type CellShape = {
  fill: ReturnType<typeof Skia.RRectXY>;
  outline: ReturnType<typeof Skia.RRectXY>;
  stroke: number;
  size: number;
  box: number;
};
/** Per-row checkbox shapes centred on the cell (rows may differ in height). */
export function cellShapes(
  rows: readonly { id: string; height: number }[],
  fontScale: number,
  column: number,
  round: boolean,
) {
  const result: Record<string, CellShape> = {};
  for (const row of rows) {
    const g = checkboxGeometry(fontScale, row.height, column);
    // Round checkboxes are full circles.
    if (round) g.radius = g.box / 2;
    const inner = Math.max(0, g.radius - g.stroke / 2);
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
        inner,
        inner,
      ),
      stroke: g.stroke,
      size: g.size,
      box: g.box,
    };
  }
  return result;
}

export function gridPaints(
  palettes: Record<string, GridPalette>,
  theme: Theme,
) {
  const habit: Record<string, Record<string, ReturnType<typeof fill>>> = {};
  for (const [id, p] of Object.entries(palettes))
    habit[id] = {
      colour: fill(p.colour),
      colourLine: stroke(p.colour),
      box: stroke(p.checkbox),
      empty: stroke(p.empty),
      boxFill: fill(p.checkbox),
      mark: stroke(p.checkmark),
      met: fill(p.completedBackground),
      pressed: fill(p.pressed),
      rule: stroke(p.rule, hairline),
      dash: stroke(`${p.colour}40`, 2),
      missed: stroke(p.missed, 1.8),
    };
  return {
    habit,
    background: fill(theme.background),
    today: fill(theme.ink(0x09)),
    pill: fill(theme.ink(0x19)),
    shade: fill(theme.ink(0x0c)),
    streak: fill(theme.ink(0x8a)),
  };
}
export type GridPaints = ReturnType<typeof gridPaints>;
export type HabitPaints = GridPaints['habit'][string];

export function headingLabels(theme: Theme, fontScale: number, column: number) {
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
}
export type HeadingLabels = ReturnType<typeof headingLabels>;

/** Date headings: Today pill, alternate week shading, weekday and date. */
export function drawHeadings(
  canvas: SkCanvas,
  paints: GridPaints,
  labels: HeadingLabels,
  first: number,
  last: number,
  width: number,
  height: number,
  shift: number,
  column: number,
  todayOrdinal: number,
  weekDividers: boolean,
  weekStart: WeekStart,
) {
  'worklet';
  for (let day = first; day <= last; day++) {
    const x = columnX(day, width, shift, column);
    const epoch = todayOrdinal - day;
    if (day === 0)
      canvas.drawRRect(
        Skia.RRectXY(Skia.XYWHRect(x, 0, column, height + 8), 8, 8),
        paints.pill,
      );
    else if (weekDividers && shadedWeekOf(epoch, weekStart))
      canvas.drawRect(Skia.XYWHRect(x, 0, column, height), paints.shade);
    const label =
      day === 0 ? labels.todayLabel : labels.weekdays[weekdayOf(epoch)];
    label.paint(canvas, x, 8);
    labels.numbers[civilFromDays(epoch)[2]].paint(canvas, x, labels.numberTop);
  }
}

/**
 * Future-pull feedback: a line on the divider under the headings that grows
 * left from the right edge with the pull. `colour` is resolved on JS.
 */
export function drawPullStreak(
  canvas: SkCanvas,
  paints: GridPaints,
  colour: string,
  width: number,
  height: number,
  distance: number,
  opacity: number,
  fullDistance: number,
) {
  'worklet';
  const alpha = opacity * Math.min(1, distance / 16);
  if (alpha <= 0) return;
  const length = width * Math.min(1, distance / fullDistance);
  paints.streak.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: width - length, y: 0 },
      { x: width, y: 0 },
      [Skia.Color('transparent'), Skia.Color(colour)],
      null,
      TileMode.Clamp,
    ),
  );
  paints.streak.setAlphaf(alpha);
  canvas.drawRect(
    Skia.XYWHRect(width - length, height - 1, length, 1),
    paints.streak,
  );
}

/** How cells are drawn; primitives so worklets capture them cheaply. */
export type CellStyle = {
  boxes: boolean;
  missedMarks: boolean;
  joined: boolean;
  /** Joining bar height as a fraction of the checkbox. */
  connector: number;
  /** Joined runs draw boxes only at their ends (implies `joined`). */
  endsOnly: boolean;
};

/**
 * With Streak ends only, a checked box between two checked neighbours is not
 * drawn, so one bar runs from a streak's first box to its last.
 */
export function isHiddenMiddle(
  style: CellStyle,
  cell: CanvasCell | undefined,
  olderChecked: boolean,
  newerChecked: boolean,
) {
  'worklet';
  return style.endsOnly && cell?.c === true && olderChecked && newerChecked;
}

/** The colour a checked box (and its half of a join) is filled with. */
export function boxColour(p: HabitPaints, cell: CanvasCell | undefined) {
  'worklet';
  return cell?.m ? p.colour : p.boxFill;
}

/**
 * A cell's background (pressed > goal met > Today > plain), bottom rule and
 * its own halves of joins to checked neighbours (older days to the left).
 * Halves owned by a running join animation are skipped. `fade` is 1 except
 * after a tap, when the background fades in over the pressed shade.
 */
export function drawCellBase(
  canvas: SkCanvas,
  paints: GridPaints,
  p: HabitPaints,
  shape: CellShape,
  style: CellStyle,
  cell: CanvasCell | undefined,
  olderChecked: boolean,
  newerChecked: boolean,
  day: number,
  x: number,
  top: number,
  column: number,
  height: number,
  pressed: boolean,
  skipLeft: boolean,
  skipRight: boolean,
  fade: number,
) {
  'worklet';
  if (pressed || fade < 1)
    canvas.drawRect(Skia.XYWHRect(x, top, column, height), p.pressed);
  if (!pressed) {
    // A fading cell draws even the plain background, to cover the shade.
    const background = cell?.m
      ? p.met
      : day === 0
        ? paints.today
        : fade < 1
          ? paints.background
          : null;
    if (background) {
      const alpha = background.getAlphaf();
      if (fade < 1) background.setAlphaf(alpha * fade);
      canvas.drawRect(Skia.XYWHRect(x, top, column, height), background);
      if (fade < 1) background.setAlphaf(alpha);
    }
  }
  canvas.drawLine(
    x,
    top + height - hairline / 2,
    x + column,
    top + height - hairline / 2,
    p.rule,
  );
  if (!style.joined || !cell?.c) return;
  // Each cell draws only the part of a join inside itself, so neighbouring
  // backgrounds never cover it. The bar is thinner than the boxes.
  const bar = shape.box * style.connector;
  const barTop = top + (height - hairline) / 2 - bar / 2;
  if (olderChecked && !skipLeft)
    canvas.drawRect(
      Skia.XYWHRect(x, barTop, column / 2, bar),
      boxColour(p, cell),
    );
  if (newerChecked && !skipRight)
    canvas.drawRect(
      Skia.XYWHRect(x + column / 2, barTop, column / 2, bar),
      boxColour(p, cell),
    );
}

/**
 * A cell's mark: a dash for unprepared days, the missed-day cross, text and
 * number paragraphs, or the checkbox (box or tick/cross style) with its tick
 * or streak number. `scale` carries the tap pulse and join bump.
 */
export function drawCellMark(
  canvas: SkCanvas,
  p: HabitPaints,
  shape: CellShape,
  style: CellStyle,
  cell: CanvasCell | undefined,
  day: number,
  x: number,
  top: number,
  column: number,
  height: number,
  scale: number,
) {
  'worklet';
  const middleX = x + column / 2;
  const middleY = top + (height - hairline) / 2;
  if (!cell) {
    canvas.drawLine(middleX - 5, middleY, middleX + 5, middleY, p.dash);
    return;
  }
  // Empty markers are unchecked boxes and unrecorded "—" labels.
  const empty = cell.k === 0 ? !cell.c : !cell.r;
  if (style.missedMarks && empty && day > 0 && !cell.m) {
    if (cell.s === 2) return; // An unscheduled day stays blank.
    if (cell.s === 1) {
      // Missed: smaller than a checkbox, with the same line weight.
      const crossSize = shape.size * 0.75;
      canvas.save();
      canvas.translate(middleX - crossSize / 2, middleY - crossSize / 2);
      canvas.scale(crossSize / 24, crossSize / 24);
      p.missed.setStrokeWidth((1.8 * shape.size) / crossSize);
      canvas.drawPath(cross, p.missed);
      canvas.restore();
      return;
    }
  }
  if (cell.p) {
    cell.p.paint(
      canvas,
      x + 4,
      top + (height - hairline - cell.p.getHeight()) / 2,
    );
    return;
  }
  canvas.save();
  canvas.translate(middleX, middleY);
  if (scale !== 1) canvas.scale(scale, scale);
  // Colour means done: the habit colour when met, its dim tone for a tick
  // whose goal is not met, and neutral grey for an empty box or a cross.
  const line = cell.m ? p.colourLine : cell.c ? p.box : p.empty;
  if (style.boxes) {
    if (cell.c) canvas.drawRRect(shape.fill, boxColour(p, cell));
    else {
      line.setStrokeWidth(shape.stroke);
      canvas.drawRRect(shape.outline, line);
    }
    if (cell.q)
      // Streak numbers replace the tick with the streak position.
      canvas.drawText(
        cell.q.text,
        cell.q.x,
        cell.q.y,
        cell.q.paint,
        cell.q.font,
      );
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
