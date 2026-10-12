import { useMeasuredRowHeights } from './useMeasuredRowHeights';
import { QuickUndoActions } from './QuickUndoActions';
import type { QuickUndo } from './quickUndo';
import { DateNavigationSheet } from './DateNavigationSheet';
import { ordinal, timingDate } from './goalTiming';
import { useDelayedCompletionMask } from './useDelayedCompletionMask';
import { HabitNameDivider } from './HabitNameDivider';
import type { CheckboxStyle, WeekStart, CellLook } from './displayPreferences';
import type { GridSize } from './gridSizing';
import { Text, useAppWindowDimensions } from './Typography';
import { completedHabitsSelection } from './storage/selection';
import { visibleHabitRows } from './habitCompletion';
import { gridRowHeight } from './rowSpacing';
import { screenLongSide } from './screenSize';
import {
  type ComponentType,
  memo,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  type TextProps,
  PixelRatio,
  Pressable,
  type PressableProps,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { EntryDay } from './calendar';
import type { Habit } from './habits';
import { HabitName, type HabitAction } from './HabitName';
import { habitRowPositions, moveHabit } from './habitOrdering';
import { RowPositions, type RowMotion } from './ReorderRow';
import { useHabitReorder } from './useHabitReorder';
import { createGridPalette } from './gridAppearance';
import { themedStyles, useTheme } from './ThemeContext';
import type { ChangeStore } from './storage/store';
import { recordPerformance } from './performance';
import { gridLayout } from './gridLayout';
import Animated from 'react-native-reanimated';
import { useGridDates } from './useGridDates';
import { useCanvasGrid } from './canvasGrid/useCanvasGrid';
import { headingHeight } from './canvasGrid/gridGeometry';
import { feedback } from './haptics';
import { Icon } from './Icon';
import { rowTransition } from './motion';
import { HabitContextMenu } from './HabitContextMenu';

type Props = {
  nameWidth: GridSize;
  nameFactor: number;
  columnWidth: GridSize;
  rowHeight: GridSize;
  checkboxStyle: CheckboxStyle;
  cellLook: CellLook;
  weekDividers: boolean;
  tapAnimations: boolean;
  weekStart: WeekStart;
  // Reports the measured grid width so Settings can preview it exactly.
  onWidthChange?: (width: number) => void;
  hideCompleted: boolean;
  sampleData?: boolean;
  HeadingComponent: ComponentType<TextProps>;
  DateButtonComponent: ComponentType<PressableProps>;
  today: string;
  habits: Habit[];
  store: ChangeStore;
  onHabitPress: (habit: Habit) => void;
  onHabitAction: (habit: Habit, action: HabitAction) => void;
  onReorder: (ids: string[]) => boolean;
  editable: boolean;
  onCellPress: (habit: Habit, day: EntryDay) => void;
  quickUndo: QuickUndo;
  onHistoryPress: () => void;
  onSettingsPress: () => void;
  onAddHabit: () => void;
};

export const HabitGrid = memo(function HabitGrid({
  nameWidth: nameWidthSize,
  nameFactor,
  columnWidth: columnWidthSize,
  rowHeight: rowHeightSize,
  checkboxStyle,
  cellLook,
  weekDividers,
  tapAnimations,
  weekStart,
  onWidthChange,
  hideCompleted,
  sampleData = false,
  HeadingComponent,
  DateButtonComponent,
  today,
  habits: sourceHabits,
  store,
  onHabitPress,
  onHabitAction,
  onReorder,
  editable,
  onCellPress,
  quickUndo,
  onHistoryPress,
  onSettingsPress,
  onAddHabit,
}: Props) {
  recordPerformance('grid.container.render');
  const { fontScale } = useAppWindowDimensions();
  const theme = useTheme();
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const { visibleDays, nameWidth, dateWidth, columnWidth } = gridLayout(
    width,
    fontScale,
    { nameWidth: nameWidthSize, nameFactor, columnWidth: columnWidthSize },
    // Whole-pixel columns keep canvas cell edges crisp.
    PixelRatio.get(),
  );
  const [scrollLocked, setScrollLocked] = useState(false);
  const {
    rightmostDay,
    unlockedFuture,
    atTodayBoundary,
    datePickerOpen,
    setDatePickerOpen,
    month,
    year,
    pull,
    offset,
    pan,
    flinging,
    prepareResize,
    returnToToday,
    openDateActions,
    navigateToDate,
  } = useGridDates({
    today,
    columnWidth,
    dateWidth,
    visibleDays,
    enabled: !scrollLocked,
  });
  const [completionView, setCompletionView] = useState({
    enabled: hideCompleted,
    show: false,
  });
  if (completionView.enabled !== hideCompleted)
    setCompletionView({ enabled: hideCompleted, show: false });
  const showCompleted =
    completionView.enabled === hideCompleted && completionView.show;
  const completionSelection = useMemo(
    () => completedHabitsSelection(store, sourceHabits, today, hideCompleted),
    [store, sourceHabits, today, hideCompleted],
  );
  const completed = useSyncExternalStore(
    completionSelection.subscribe,
    completionSelection.getSnapshot,
  );
  const delayedCompleted = useDelayedCompletionMask(
    completed,
    sourceHabits,
    today,
    hideCompleted,
  );
  const completedCount = [...delayedCompleted].filter(
    (value) => value === '1',
  ).length;
  const habits = useMemo(
    () =>
      visibleHabitRows(
        sourceHabits,
        delayedCompleted,
        hideCompleted,
        showCompleted,
        rightmostDay,
      ),
    [
      sourceHabits,
      delayedCompleted,
      hideCompleted,
      showCompleted,
      rightmostDay,
    ],
  );
  const baseRowHeight = gridRowHeight(
    rowHeightSize,
    fontScale,
    screenLongSide(),
  );
  const rowGeometry = `${nameWidth}:${baseRowHeight}:${fontScale}`;
  const { heights: rowHeights, measure: measureRow } =
    useMeasuredRowHeights(rowGeometry);
  const {
    root: reorderRoot,
    scroll: reorderScroll,
    viewport: reorderViewport,
    bounds: reorderBounds,
    updateOffset: updateVerticalOffset,
    measure: measureReorder,
    menu: habitMenu,
    setMenu: setHabitMenu,
    mode: reorderMode,
    setMode: setReorderMode,
    rowTops,
    dragId,
    dragY,
    bodyTop,
    scrollOffset,
    cancel: cancelReorder,
    beginOrMove: moveReorder,
    drop: dropReorder,
    hold: holdHabit,
  } = useHabitReorder(
    habits,
    rowHeights,
    baseRowHeight,
    onReorder,
    rowGeometry,
  );
  // Keep sibling order stable during preview swaps; only animated Y targets move.
  const menuHabit = sourceHabits.find((habit) => habit.id === habitMenu?.id);
  const palettes = useMemo(
    () =>
      Object.fromEntries(
        sourceHabits.map((habit) => [
          habit.id,
          createGridPalette(habit.color, theme),
        ]),
      ),
    [sourceHabits, theme],
  );
  const { tops, total: gridHeight } = useMemo(
    () =>
      habitRowPositions(
        habits.map((habit) => habit.id),
        rowHeights,
        baseRowHeight,
      ),
    [habits, rowHeights, baseRowHeight],
  );
  const rowMotion = useMemo(
    () =>
      Object.fromEntries(
        habits.map((habit) => [
          habit.id,
          {
            id: habit.id,
            rowTops,
            active: dragId === habit.id,
            top: tops[habit.id] ?? 0,
            dragY,
            bodyTop,
            scrollOffset,
          } satisfies RowMotion,
        ]),
      ),
    [habits, rowTops, dragId, tops, dragY, bodyTop, scrollOffset],
  );
  const cellsDisabled = !editable || !!dragId || reorderMode;
  if (scrollLocked !== (!!habitMenu || !!dragId))
    setScrollLocked(!scrollLocked);
  const headerHeight = headingHeight(fontScale);
  const canvas = useCanvasGrid({
    store,
    habits: sourceHabits,
    rows: habits,
    tops,
    heights: rowHeights,
    baseHeight: baseRowHeight,
    gridHeight,
    headerHeight,
    palettes,
    theme,
    today,
    fontScale,
    column: columnWidth,
    width: dateWidth,
    visibleDays,
    rightmostDay,
    unlockedFuture,
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
    disabled: cellsDisabled,
    onCellPress,
    onNavigate: navigateToDate,
  });
  function actOnHabit(habit: Habit, action: HabitAction) {
    if (action === 'moveUp' || action === 'moveDown') {
      const ids = habits.map((row) => row.id);
      if (
        onReorder(
          moveHabit(
            ids,
            habit.id,
            ids.indexOf(habit.id) + (action === 'moveUp' ? -1 : 1),
          ),
        )
      )
        feedback('selection');
    } else onHabitAction(habit, action);
  }
  return (
    <RowPositions
      motions={rowMotion}
      collapsable={false}
      ref={reorderRoot}
      style={styles.container}
      onLayout={(event) => {
        measureReorder();
        const nextWidth = event.nativeEvent.layout.width;
        if (nextWidth !== width) {
          cancelReorder();
          prepareResize();
          setWidth(nextWidth);
          onWidthChange?.(nextWidth);
        }
      }}
    >
      <View
        accessibilityElementsHidden={!!habitMenu}
        importantForAccessibility={habitMenu ? 'no-hide-descendants' : 'auto'}
        style={styles.toolbar}
      >
        <View style={styles.toolbarBrand}>
          <HeadingComponent accessibilityRole="header" style={styles.brand}>
            {sampleData ? 'SAMPLE DATA' : 'ONPURPOSE'}
          </HeadingComponent>
        </View>
        <View style={styles.toolbarCentre}>
          <QuickUndoActions
            controller={quickUndo}
            atToday={atTodayBoundary}
            todayLabel={rightmostDay < 0 ? '← Today' : 'Today →'}
            onToday={returnToToday}
            editable={editable}
          />
        </View>
        <View style={styles.toolbarActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="History"
            accessibilityHint="Opens change history"
            onPress={onHistoryPress}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: pressed ? theme.ink(0x17) : 'transparent' },
            ]}
          >
            <Icon name="history" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={onSettingsPress}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: pressed ? theme.ink(0x17) : 'transparent' },
            ]}
          >
            <Icon name="settings" />
          </Pressable>
        </View>
      </View>
      {datePickerOpen && (
        <DateNavigationSheet
          date={timingDate(ordinal(today) - rightmostDay)}
          today={today}
          weekStart={weekStart}
          onClose={() => setDatePickerOpen(false)}
          onChoose={(date) => {
            feedback('selection');
            const day = ordinal(today) - ordinal(date);
            if (day === 0) returnToToday();
            else navigateToDate(day);
            setDatePickerOpen(false);
          }}
        />
      )}
      {reorderMode && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 6,
          }}
        >
          <Text style={{ color: theme.ink(0x99), fontSize: 12, flex: 1 }}>
            Drag a habit to arrange your list
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              cancelReorder();
              setReorderMode(false);
            }}
            style={{ minHeight: 44, padding: 12 }}
          >
            <Text style={{ color: theme.ink(0xdd) }}>Done</Text>
          </Pressable>
        </View>
      )}
      {width > 0 && (
        <>
          <View
            accessibilityElementsHidden={!!habitMenu}
            importantForAccessibility={
              habitMenu ? 'no-hide-descendants' : 'auto'
            }
            style={styles.header}
          >
            <View style={[styles.namesHeader, { width: nameWidth }]}>
              <DateButtonComponent
                style={({ pressed }) => [
                  styles.dateButton,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${month} ${year}, browse dates`}
                onPress={openDateActions}
              >
                <View style={styles.dateTitleRow}>
                  <Text numberOfLines={1} style={styles.dateTitle}>
                    {month}
                  </Text>
                  {/* A vector chevron sized with the text, flipped while open. */}
                  <View
                    style={
                      datePickerOpen && { transform: [{ rotate: '180deg' }] }
                    }
                  >
                    <Icon
                      name="chevron"
                      size={Math.round(16 * Math.max(1, fontScale))}
                      strokeWidth={2.2}
                      color={theme.ink(0x9c)}
                    />
                  </View>
                </View>
                <Text style={styles.dateYear}>{year}</Text>
              </DateButtonComponent>
              <HabitNameDivider />
            </View>
            {canvas.header}
          </View>
          <View
            accessibilityElementsHidden={!!habitMenu}
            importantForAccessibility={
              habitMenu ? 'no-hide-descendants' : 'auto'
            }
            collapsable={false}
            ref={reorderViewport}
            onLayout={(event) => {
              measureReorder();
            }}
            style={{ flex: 1 }}
          >
            <ScrollView
              ref={reorderScroll}
              onLayout={measureReorder}
              onScroll={(event) => {
                const y = event.nativeEvent.contentOffset.y;
                updateVerticalOffset(y);
              }}
              scrollEventThrottle={16}
              scrollEnabled={!habitMenu && !dragId}
              style={styles.rows}
              directionalLockEnabled
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.rowsContent}
            >
              {!habits.length && (
                <View
                  style={{
                    paddingVertical: 24,
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  <Text style={{ color: theme.ink(0x88), fontSize: 14 }}>
                    {sourceHabits.length
                      ? 'Completed habits are hidden.'
                      : 'No habits yet.'}
                  </Text>
                </View>
              )}
              <View style={styles.gridBody}>
                <View style={{ width: nameWidth, height: gridHeight }}>
                  {habits.map((habit) => (
                    <HabitName
                      key={habit.id}
                      habit={habit}
                      height={baseRowHeight}
                      selected={habitMenu?.id === habit.id}
                      motion={rowMotion[habit.id]}
                      reorder={reorderMode}
                      disabled={!editable}
                      onPress={() => {
                        if (habitMenu) setHabitMenu(null);
                        else onHabitPress(habit);
                      }}
                      onHold={(anchor) => holdHabit(habit.id, anchor)}
                      onDrag={(pageY, startY) =>
                        moveReorder(habit.id, pageY, startY)
                      }
                      onDrop={dropReorder}
                      onCancel={cancelReorder}
                      onAction={(action) => {
                        if (action === 'reorder') setReorderMode(true);
                        else actOnHabit(habit, action);
                      }}
                      onLayout={(event) => {
                        const height = event.nativeEvent.layout.height;
                        measureRow(habit.id, height, rowGeometry);
                      }}
                    />
                  ))}
                  <HabitNameDivider />
                </View>
                {canvas.body}
              </View>
              {hideCompleted && completedCount > 0 && rightmostDay === 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    showCompleted
                      ? 'Hide completed habits'
                      : `Show ${completedCount} completed habits`
                  }
                  disabled={!!dragId || reorderMode}
                  onPress={() =>
                    setCompletionView((value) => ({
                      enabled: hideCompleted,
                      show: !value.show,
                    }))
                  }
                  style={{
                    minHeight: 48,
                    justifyContent: 'center',
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ color: theme.ink(0xaa), fontSize: 14 }}>
                    {showCompleted
                      ? 'Hide completed'
                      : `Show completed · ${completedCount}`}
                  </Text>
                </Pressable>
              )}
              <Animated.View layout={rowTransition}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add habit"
                  accessibilityState={{
                    disabled: !editable || reorderMode || !!dragId,
                  }}
                  disabled={!editable || reorderMode || !!dragId}
                  onPress={onAddHabit}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 12,
                    opacity:
                      !editable || reorderMode || dragId
                        ? 0.3
                        : pressed
                          ? 0.5
                          : 1,
                  })}
                >
                  <Icon name="plus" size={18} color={theme.ink(0x77)} />
                  <Text style={{ color: theme.ink(0x88), fontSize: 14 }}>
                    Add habit
                  </Text>
                </Pressable>
              </Animated.View>
            </ScrollView>
          </View>
        </>
      )}
      <HabitContextMenu
        menu={habitMenu}
        habit={menuHabit}
        bounds={reorderBounds}
        width={width}
        nameWidth={nameWidth}
        onClose={() => setHabitMenu(null)}
        onAction={(action) => {
          if (action === 'reorder') setReorderMode(true);
          else if (menuHabit) actOnHabit(menuHabit, action);
        }}
      />
    </RowPositions>
  );
});

const useStyles = themedStyles((t) => ({
  container: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginBottom: 4,
  },
  toolbarBrand: { flex: 1, justifyContent: 'center' },
  toolbarCentre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  brand: {
    color: t.ink(0x88),
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    paddingVertical: 12,
  },
  dateButton: {
    minHeight: 56,
    width: '100%',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  dateTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateTitle: {
    flexShrink: 1,
    color: t.ink(0xed),
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  dateYear: {
    color: t.ink(0x8c),
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  toolbarActions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 2,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.ink(0x36),
  },
  namesHeader: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingRight: 10,
    minHeight: 56,
  },
  rows: { flex: 1 },
  rowsContent: { paddingBottom: 8 },
  gridBody: { flexDirection: 'row', alignItems: 'flex-start' },
}));
