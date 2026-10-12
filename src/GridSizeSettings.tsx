import { useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Text, useAppWindowDimensions } from './Typography';
import { gridLayout } from './gridLayout';
import { gridRowHeight } from './rowSpacing';
import { screenLongSide } from './screenSize';
import { HabitSymbol } from './HabitSymbol';
import { demoHabits, type Habit } from './habits';
import {
  AUTO_COLUMN_WIDTH,
  autoNameWidth,
  autoRowHeight,
  gridSizeRanges,
  snapGridSize,
  type GridSize,
  type GridSizeKind,
  type GridSizing,
} from './gridSizing';
import { themedStyles, useTheme } from './ThemeContext';

const labels: Record<GridSizeKind, string> = {
  gridNameWidth: 'Name column',
  gridColumnWidth: 'Day columns',
  gridRowHeight: 'Rows',
};
const checkedPatterns = [
  [1, 1, 0, 1, 1, 1, 0],
  [0, 1, 1, 0, 1, 0, 1],
  [1, 0, 1, 1, 0, 1, 1],
];

// Stepped sliders for the three grid sizes with a live preview drawn at the
// real grid width. Drafts update the preview while dragging; a size is saved
// once when the slider is released. Reset returns a size to automatic.
export function GridSizeSettings({
  sizing,
  gridWidth,
  habits,
  editable,
  onChange,
}: {
  sizing: GridSizing;
  gridWidth: number;
  // The first displayed habits, so the preview shows real names and icons.
  habits: readonly Habit[];
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
  const [drafts, setDrafts] = useState<Partial<Record<GridSizeKind, number>>>(
    {},
  );
  const committed = (kind: GridSizeKind) => {
    const current = saved[kind];
    return current === 'auto' ? automatic[kind] : current;
  };
  // Preview: drafts while dragging, otherwise the saved (possibly automatic) size.
  const preview = (kind: GridSizeKind): GridSize => drafts[kind] ?? saved[kind];
  const layout = gridLayout(
    width,
    window.fontScale,
    {
      nameWidth: preview('gridNameWidth'),
      nameFactor: drafts.gridNameWidth === undefined ? sizing.nameFactor : 1,
      columnWidth: preview('gridColumnWidth'),
    },
    PixelRatio.get(),
  );
  const rowHeight = gridRowHeight(
    preview('gridRowHeight'),
    window.fontScale,
    longSide,
  );
  return (
    <View>
      <GridPreview
        habits={habits.length ? habits.slice(0, 3) : demoHabits.slice(0, 3)}
        width={width}
        nameWidth={layout.nameWidth}
        columnWidth={layout.columnWidth}
        visibleDays={layout.visibleDays}
        rowHeight={rowHeight}
      />
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

// The saved sizes drawn in the current theme, for previews elsewhere in
// Settings (the background picker draws it in its draft theme).
export function GridLivePreview({
  sizing,
  gridWidth,
  habits,
}: {
  sizing: GridSizing;
  gridWidth: number;
  habits: readonly Habit[];
}) {
  const window = useAppWindowDimensions();
  const width = gridWidth || Math.max(0, window.width - 36);
  const layout = gridLayout(width, window.fontScale, sizing, PixelRatio.get());
  return (
    <GridPreview
      habits={habits.length ? habits.slice(0, 3) : demoHabits.slice(0, 3)}
      width={width}
      nameWidth={layout.nameWidth}
      columnWidth={layout.columnWidth}
      visibleDays={layout.visibleDays}
      rowHeight={gridRowHeight(
        sizing.rowHeight,
        window.fontScale,
        screenLongSide(),
      )}
      caption={false}
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
  caption = true,
}: {
  habits: readonly Habit[];
  width: number;
  nameWidth: number;
  columnWidth: number;
  visibleDays: number;
  rowHeight: number;
  caption?: boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const [available, setAvailable] = useState(0);
  const [height, setHeight] = useState(0);
  const scale = available && width ? Math.min(1, available / width) : 1;
  const box = Math.min(26, Math.max(16, columnWidth * 0.5));
  const days = Array.from({ length: visibleDays }, (_, index) => index);
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
            onLayout={(event) => {
              const next = event.nativeEvent.layout.height;
              setHeight((previous) => (previous === next ? previous : next));
            }}
            style={{
              width,
              position: 'absolute',
              left: (available - width) / 2,
              top: (height * scale - height) / 2,
              transform: [{ scale }],
            }}
          >
            <View style={styles.previewHeadings}>
              <View style={{ width: nameWidth }} />
              {days.map((day) => (
                <View
                  key={day}
                  style={[styles.previewHeading, { width: columnWidth }]}
                >
                  <Text style={styles.previewDay}>{day + 1}</Text>
                </View>
              ))}
            </View>
            {habits.map((habit, row) => {
              const colour = theme.colour(habit.color);
              return (
                <View
                  key={habit.id}
                  style={[styles.previewRow, { minHeight: rowHeight }]}
                >
                  <View
                    style={[
                      styles.previewName,
                      {
                        width: nameWidth,
                        paddingVertical: rowHeight < 52 ? 4 : 8,
                      },
                    ]}
                  >
                    <HabitSymbol icon={habit.icon} colour={colour} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.previewNameText, { color: colour }]}>
                        {habit.name}
                      </Text>
                      {habit.unit && (
                        <Text style={[styles.previewUnit, { color: colour }]}>
                          {habit.unit}
                        </Text>
                      )}
                    </View>
                  </View>
                  {days.map((day) => {
                    const pattern =
                      checkedPatterns[row % checkedPatterns.length];
                    const checked = pattern[day % pattern.length];
                    return (
                      <View
                        key={day}
                        style={[styles.previewCell, { width: columnWidth }]}
                      >
                        <View
                          style={{
                            width: box,
                            height: box,
                            borderRadius: box * 0.28,
                            borderWidth: 2,
                            borderColor: colour,
                            backgroundColor: checked ? colour : 'transparent',
                            opacity: checked ? 1 : 0.6,
                          }}
                        />
                      </View>
                    );
                  })}
                </View>
              );
            })}
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
  previewHeading: { alignItems: 'center', justifyContent: 'center' },
  previewDay: { color: t.ink(0xbb), fontSize: 15, fontWeight: '600' },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.ink(0x22),
  },
  previewHeadings: { flexDirection: 'row', height: 44 },
  previewName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 10,
  },
  previewNameText: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  previewUnit: { fontSize: 11, lineHeight: 13, opacity: 0.8 },
  previewCell: { alignItems: 'center', justifyContent: 'center' },
  caption: { color: t.ink(0x92), fontSize: 13, textAlign: 'center' },
}));
