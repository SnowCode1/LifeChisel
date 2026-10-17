import { Canvas, Picture, createPicture } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import {
  cellShapes,
  drawCellBase,
  drawCellMark,
  isHiddenMiddle,
  drawHeadings,
  gridPaints,
  headingLabels,
  type CellStyle,
} from './canvasGrid/cellPainter';
import { headingHeight } from './canvasGrid/gridGeometry';
import { streakLabel, type CanvasCell } from './canvasGrid/useGridModel';
import type {
  CellLook,
  CheckboxStyle,
  WeekStart,
} from '@onpurpose/core/displayPreferences';
import { ordinal } from '@onpurpose/core/goalTiming';
import { createGridPalette } from '@onpurpose/core/gridAppearance';
import { useLocalToday } from './useLocalToday';
import { Text, useAppWindowDimensions } from './Typography';
import { gridLayout } from './gridLayout';
import { gridRowHeight } from '@onpurpose/core/rowSpacing';
import { screenLongSide } from './screenSize';
import { HabitSymbol } from './HabitSymbol';
import { demoHabits, type Habit } from '@onpurpose/core/habits';
import {
  AUTO_COLUMN_WIDTH,
  autoNameWidth,
  autoRowHeight,
  gridSizeRanges,
  snapGridSize,
  type GridSize,
  type GridSizeKind,
  type GridSizing,
} from '@onpurpose/core/gridSizing';
import { themedStyles, useTheme } from './ThemeContext';

const labels: Record<GridSizeKind, string> = {
  gridNameWidth: 'Name column',
  gridColumnWidth: 'Day columns',
  gridRowHeight: 'Rows',
};
// Sample days for the preview, newest (Today) first: c checked, x missed (a
// scheduled day left unchecked), f off (unscheduled) and - open (Today,
// unchecked). Together they show streaks, joins, missed crosses and blank
// off days.
const samples = ['-cccccxc', 'ccxccfcc', 'cxfccccx'];
type SizeDrafts = Partial<Record<GridSizeKind, number>>;
/** How the preview draws cells: the saved or drafted appearance. */
export type PreviewAppearance = {
  checkboxStyle: CheckboxStyle;
  cellLook: CellLook;
  weekDividers: boolean;
  weekStart: WeekStart;
};

// Stepped sliders for the three grid sizes. Drafts (held by the caller, which
// shows them in the preview) update while dragging; a size is saved once when
// the slider is released. Reset returns a size to automatic.
export function GridSizeSettings({
  sizing,
  gridWidth,
  drafts,
  onDrafts,
  editable,
  onChange,
}: {
  sizing: GridSizing;
  gridWidth: number;
  drafts: SizeDrafts;
  onDrafts: (update: (previous: SizeDrafts) => SizeDrafts) => void;
  editable: boolean;
  onChange: (kind: GridSizeKind, value: GridSize) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const window = useAppWindowDimensions();
  const width = gridWidth || Math.max(0, window.width - 36);
  const longSide = screenLongSide();
  const automatic: Record<GridSizeKind, number> = {
    // The real automatic width, which need not sit on a slider step.
    gridNameWidth: Math.round(autoNameWidth(width, 1) * sizing.nameFactor),
    gridColumnWidth: AUTO_COLUMN_WIDTH,
    gridRowHeight: autoRowHeight(longSide),
  };
  const saved: Record<GridSizeKind, GridSize> = {
    gridNameWidth: sizing.nameWidth,
    gridColumnWidth: sizing.columnWidth,
    gridRowHeight: sizing.rowHeight,
  };
  // A legacy Narrow/Wide name choice is automatic-based but not "automatic".
  const isAuto = (kind: GridSizeKind) =>
    saved[kind] === 'auto' &&
    (kind !== 'gridNameWidth' || sizing.nameFactor === 1);
  const setDrafts = onDrafts;
  const committed = (kind: GridSizeKind) => {
    const current = saved[kind];
    return current === 'auto' ? automatic[kind] : current;
  };
  return (
    <View>
      {(Object.keys(labels) as GridSizeKind[]).map((kind) => {
        const range = gridSizeRanges[kind];
        const current = drafts[kind] ?? committed(kind);
        const auto = drafts[kind] === undefined && isAuto(kind);
        return (
          <View key={kind} style={styles.control}>
            <View style={styles.heading}>
              <Text style={styles.label}>{labels[kind]}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Reset ${labels[kind].toLowerCase()} to automatic`}
                disabled={!editable || auto}
                accessibilityState={{ disabled: !editable || auto }}
                onPress={() => {
                  setDrafts(({ [kind]: _, ...rest }) => rest);
                  onChange(kind, 'auto');
                }}
                style={[
                  styles.reset,
                  { opacity: editable && !auto ? 1 : 0.35 },
                ]}
              >
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
            </View>
            <View style={styles.sliderRow}>
              <Slider
                style={styles.slider}
                minimumValue={range.min}
                maximumValue={range.max}
                step={range.step}
                // The saved value, not the draft, so dragging does not jitter.
                value={committed(kind)}
                disabled={!editable}
                minimumTrackTintColor={theme.accent}
                maximumTrackTintColor={theme.ink(0x30)}
                thumbTintColor={theme.ink(0xee)}
                accessibilityLabel={`${labels[kind]} size`}
                accessibilityValue={{
                  text: `${current} points${auto ? ', automatic' : ''}`,
                }}
                onValueChange={(next) =>
                  setDrafts((previous) => ({
                    ...previous,
                    [kind]: snapGridSize(kind, next),
                  }))
                }
                onSlidingComplete={(next) => {
                  setDrafts(({ [kind]: _, ...rest }) => rest);
                  onChange(kind, snapGridSize(kind, next));
                }}
              />
              <Text style={styles.value}>
                {auto ? `Auto · ${current}` : current}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// The grid preview in the current theme (the background picker draws it in
// its draft theme): saved sizes, or slider drafts while dragging, and the
// cell appearance, drawn by the same painter as the grid itself.
export function GridLivePreview({
  sizing,
  drafts = {},
  gridWidth,
  habits,
  appearance,
  caption = false,
}: {
  sizing: GridSizing;
  drafts?: SizeDrafts;
  gridWidth: number;
  habits: readonly Habit[];
  appearance: PreviewAppearance;
  caption?: boolean;
}) {
  const window = useAppWindowDimensions();
  const width = gridWidth || Math.max(0, window.width - 36);
  const preview = (kind: GridSizeKind, saved: GridSize): GridSize =>
    drafts[kind] ?? saved;
  const layout = gridLayout(
    width,
    window.fontScale,
    {
      nameWidth: preview('gridNameWidth', sizing.nameWidth),
      nameFactor: drafts.gridNameWidth === undefined ? sizing.nameFactor : 1,
      columnWidth: preview('gridColumnWidth', sizing.columnWidth),
    },
    PixelRatio.get(),
  );
  return (
    <GridPreview
      habits={habits.length ? habits.slice(0, 3) : demoHabits.slice(0, 3)}
      width={width}
      nameWidth={layout.nameWidth}
      columnWidth={layout.columnWidth}
      visibleDays={layout.visibleDays}
      rowHeight={gridRowHeight(
        preview('gridRowHeight', sizing.rowHeight),
        window.fontScale,
        screenLongSide(),
      )}
      appearance={appearance}
      caption={caption}
    />
  );
}

// A few rows drawn at the grid's real geometry, scaled down to fit the card.
// Name cells mirror HabitName (icon, 8-point gap, 15-point name, unit, right
// padding) so the name column looks exactly as roomy as it really is; rows grow
// for wrapped names as the grid's measured rows do.
function GridPreview({
  habits,
  width,
  nameWidth,
  columnWidth,
  visibleDays,
  rowHeight,
  appearance,
  caption,
}: {
  habits: readonly Habit[];
  width: number;
  nameWidth: number;
  columnWidth: number;
  visibleDays: number;
  rowHeight: number;
  appearance: PreviewAppearance;
  caption: boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const window = useAppWindowDimensions();
  const today = useLocalToday();
  const [available, setAvailable] = useState(0);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const scale = available && width ? Math.min(1, available / width) : 1;
  const fontScale = window.fontScale;
  const header = headingHeight(fontScale);
  const rows = habits.map((habit) => ({
    id: habit.id,
    height: Math.max(rowHeight, measured[habit.id] ?? 0),
  }));
  const bodyHeight = rows.reduce((sum, row) => sum + row.height, 0);
  const datesWidth = visibleDays * columnWidth;
  const { checkboxStyle, cellLook, weekDividers, weekStart } = appearance;
  const boxes = checkboxStyle === 'boxes';
  const picture = useMemo(() => {
    const palettes = Object.fromEntries(
      habits.map((habit) => [habit.id, createGridPalette(habit.color, theme)]),
    );
    const paints = gridPaints(palettes, theme);
    const labels = headingLabels(theme, fontScale, columnWidth);
    const shapes = cellShapes(
      rows,
      fontScale,
      columnWidth,
      boxes && cellLook.roundCheckboxes,
    );
    const style: CellStyle = {
      boxes,
      missedMarks: cellLook.missedDays,
      joined: boxes && cellLook.joinedCheckboxes,
      connector: cellLook.connectorThickness / 100,
      endsOnly: boxes && cellLook.joinedCheckboxes && cellLook.joinedEndsOnly,
    };
    const labelCache = new Map();
    const sample = (row: number, day: number) =>
      samples[row % samples.length][day % 8];
    const cellAt = (row: number, day: number): CanvasCell => {
      const kind = sample(row, day);
      const checked = kind === 'c';
      let streak = 0;
      while (checked && streak < 99 && sample(row, day + streak) === 'c')
        streak++;
      const habit = habits[row];
      return {
        k: 0,
        c: checked,
        m: checked,
        r: checked,
        s: kind === 'f' ? 2 : 1,
        p: null,
        q:
          checked && boxes && cellLook.streakNumbers
            ? streakLabel(
                labelCache,
                palettes[habit.id].checkmark,
                shapes[habit.id].box,
                streak,
              )
            : null,
      };
    };
    return createPicture(
      (canvas) => {
        drawHeadings(
          canvas,
          paints,
          labels,
          0,
          visibleDays - 1,
          datesWidth,
          header,
          0,
          columnWidth,
          ordinal(today),
          weekDividers,
          weekStart,
        );
        let top = header;
        rows.forEach((row, index) => {
          const p = paints.habit[row.id];
          const shape = shapes[row.id];
          for (let day = 0; day < visibleDays; day++) {
            const x = datesWidth - (day + 1) * columnWidth;
            const cell = cellAt(index, day);
            const olderChecked = cellAt(index, day + 1).c;
            const newerChecked = day > 0 && cellAt(index, day - 1).c;
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
              columnWidth,
              row.height,
              false,
              false,
              false,
              1,
            );
            if (!isHiddenMiddle(style, cell, olderChecked, newerChecked))
              drawCellMark(
                canvas,
                p,
                shape,
                style,
                cell,
                day,
                x,
                top,
                columnWidth,
                row.height,
                1,
              );
          }
          top += row.height;
        });
      },
      { width: datesWidth, height: header + bodyHeight },
    );
    // rows is derived from habits, rowHeight and measured each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    habits,
    theme,
    fontScale,
    columnWidth,
    visibleDays,
    rowHeight,
    measured,
    boxes,
    cellLook,
    weekDividers,
    weekStart,
    today,
  ]);
  const height = header + bodyHeight;
  return (
    <View style={styles.previewCard}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={(event) => {
          const next = event.nativeEvent.layout.width;
          setAvailable((previous) => (previous === next ? previous : next));
        }}
        style={{ height: height * scale, overflow: 'hidden' }}
      >
        {available > 0 && (
          <View
            style={{
              width,
              height,
              flexDirection: 'row',
              position: 'absolute',
              left: (available - width) / 2,
              top: (height * scale - height) / 2,
              transform: [{ scale }],
            }}
          >
            <View style={{ width: nameWidth }}>
              <View style={{ height: header }} />
              {habits.map((habit, index) => {
                const colour = theme.colour(habit.color);
                return (
                  <View
                    key={habit.id}
                    style={[styles.previewName, { height: rows[index].height }]}
                  >
                    <View
                      onLayout={(event) => {
                        // Names may wrap: grow the row as the grid does.
                        const next = Math.ceil(
                          event.nativeEvent.layout.height + 16,
                        );
                        // Re-centring a resized row moves its name by half a
                        // point, and pixel rounding can then change the
                        // measured height by one: ignore such noise, or the
                        // row flips between two heights indefinitely.
                        setMeasured((previous) =>
                          Math.abs((previous[habit.id] ?? 0) - next) < 2
                            ? previous
                            : { ...previous, [habit.id]: next },
                        );
                      }}
                      style={styles.previewNameInner}
                    >
                      <HabitSymbol icon={habit.icon} colour={colour} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          style={[styles.previewNameText, { color: colour }]}
                        >
                          {habit.name}
                        </Text>
                        {habit.unit && (
                          <Text style={[styles.previewUnit, { color: colour }]}>
                            {habit.unit}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
            <Canvas style={{ width: datesWidth, height }}>
              <Picture picture={picture} />
            </Canvas>
          </View>
        )}
      </View>
      {caption && (
        <Text style={styles.caption}>
          {visibleDays} {visibleDays === 1 ? 'day fits' : 'days fit'} on this
          screen
        </Text>
      )}
    </View>
  );
}

const useStyles = themedStyles((t) => ({
  control: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.ink(0x24),
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: { color: t.ink(0xde), fontSize: 17 },
  reset: { minHeight: 44, justifyContent: 'center' },
  resetText: { color: t.ink(0xbb), fontSize: 13 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slider: { flex: 1, minHeight: 44 },
  value: {
    color: t.ink(0xcc),
    fontSize: 14,
    minWidth: 64,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  previewCard: {
    padding: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.ink(0x24),
  },
  previewName: { justifyContent: 'center' },
  previewNameInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 10,
  },
  previewNameText: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  previewUnit: { fontSize: 11, lineHeight: 13, opacity: 0.8 },
  caption: { color: t.ink(0x92), fontSize: 13, textAlign: 'center' },
}));
