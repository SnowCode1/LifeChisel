import { RecordStatsScreen } from './RecordStatsScreen';
import type { EntryValues } from '@onpurpose/core/entries';
import { memo, useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, View, type TextProps } from 'react-native';
import { Text, useAppWindowDimensions } from './Typography';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useHabitPages, type HabitTab } from './useHabitPages';
import { HabitNotes } from './HabitNotes';
import { HabitStatsScreen } from './HabitStatsScreen';
import type { StatsLayout } from '@onpurpose/core/statsLayout';
import { ChartScrubLock } from './ChartFrame';
import { HabitSymbol } from './HabitSymbol';
import { Icon } from './Icon';
import { themedStyles, useTheme } from './ThemeContext';
import type { Habit } from '@onpurpose/core/habits';
import type { HabitNote } from '@onpurpose/core/notes';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import type { HistoryAction, StoredEvent } from '@onpurpose/core/storage/model';
import type { EntryDay } from '@onpurpose/core/calendar';

export const HabitDetailsScreen = memo(function HabitDetailsScreen({
  habit,
  weekStart,
  values,
  events,
  actions,
  today,
  Heading,
  onBack,
  initialTab,
  notes,
  note,
  onNoteSelect,
  onNoteAdd,
  onNoteEdit,
  onNoteVersions,
  onNoteActions,
  onEdit,
  onGoalEdit,
  onCellPress,
  editable,
  statsLayout,
  onStatsLayout,
}: {
  habit: Habit;
  weekStart: WeekStart;
  values: EntryValues;
  events: StoredEvent[];
  actions: HistoryAction[];
  today: string;
  Heading: ComponentType<TextProps>;
  onBack: () => void;
  /** The page to open on; by default Notes when the habit has any. */
  initialTab?: HabitTab;
  notes: readonly HabitNote[];
  /** The note shown on the Notes page (undefined without notes). */
  note: HabitNote | undefined;
  onNoteSelect: (note: HabitNote) => void;
  onNoteAdd: () => void;
  onNoteEdit: (note: HabitNote) => void;
  onNoteVersions?: (note: HabitNote) => void;
  onNoteActions: (note: HabitNote) => void;
  onEdit: () => void;
  onGoalEdit: () => void;
  onCellPress: (habit: Habit, day: EntryDay) => void;
  editable: boolean;
  /** v25: this habit's statistics layout (null: the default). */
  statsLayout: StatsLayout | null;
  onStatsLayout: (layout: StatsLayout | null) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const StatsContent =
    habit.type === 'categorical' || habit.type === 'text'
      ? RecordStatsScreen
      : HabitStatsScreen;
  const [width, setWidth] = useState(0);
  const [islandHeight, setIslandHeight] = useState(54);
  // While a chart is thumb-tracked, sideways drags read it instead of paging.
  const [chartScrubbing, setChartScrubbing] = useState(false);
  const { fontScale } = useAppWindowDimensions();
  const pages = useHabitPages(notes.length > 0, width, initialTab);
  const { tab, visited, offset, pageWidth } = pages;
  const islandWidth = Math.min(
    Math.max(0, width - 32),
    Math.round(248 * Math.max(1, fontScale)),
  );
  const islandInset = 4 + StyleSheet.hairlineWidth;
  const segmentWidth = Math.max(0, (islandWidth - 2 * islandInset) / 2);
  const selectionStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          pageWidth.get() > 0
            ? Math.max(0, Math.min(1, offset.get() / pageWidth.get())) *
              segmentWidth
            : 0,
      },
    ],
  }));
  const bottomInset = islandHeight + 40;
  const accent = theme.colour(habit.color);
  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Close habit details and return to habit grid"
          style={styles.nav}
        >
          <Icon name="close" />
        </Pressable>
        <View style={styles.title}>
          <HabitSymbol icon={habit.icon} colour={accent} size={20} />
          <Heading
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.name, { color: accent }]}
          >
            {habit.name}
          </Heading>
        </View>
        <Pressable
          onPress={
            tab === 'statistics'
              ? onEdit
              : note
                ? () => onNoteEdit(note)
                : onNoteAdd
          }
          disabled={!editable}
          accessibilityRole="button"
          accessibilityLabel={
            tab === 'statistics'
              ? `Edit ${habit.name}`
              : note
                ? `Edit ${note.title} note`
                : 'Add a note'
          }
          accessibilityState={{ disabled: !editable }}
          style={[
            styles.nav,
            { alignItems: 'flex-end', opacity: editable ? 1 : 0.35 },
          ]}
        >
          <Icon name="edit" />
        </Pressable>
      </View>
      <View
        style={{ flex: 1 }}
        onLayout={(event) => {
          const next = event.nativeEvent.layout.width;
          setWidth((previous) => (previous === next ? previous : next));
        }}
      >
        {width > 0 && (
          <>
            <ChartScrubLock.Provider value={setChartScrubbing}>
              <Animated.ScrollView
                testID="habit-pager"
                ref={pages.pager}
                horizontal
                pagingEnabled
                scrollEnabled={!chartScrubbing}
                directionalLockEnabled
                bounces={false}
                alwaysBounceVertical={false}
                alwaysBounceHorizontal={false}
                showsHorizontalScrollIndicator={false}
                contentInsetAdjustmentBehavior="never"
                contentContainerStyle={{ height: '100%' }}
                scrollEventThrottle={16}
                onScroll={pages.onScroll}
                onScrollBeginDrag={pages.prepare}
                onContentSizeChange={pages.align}
              >
                <View
                  testID="habit-notes-panel"
                  style={{ width, height: '100%' }}
                  pointerEvents={tab === 'notes' ? 'auto' : 'none'}
                  accessibilityElementsHidden={tab !== 'notes'}
                  aria-hidden={tab !== 'notes'}
                  importantForAccessibility={
                    tab === 'notes' ? 'auto' : 'no-hide-descendants'
                  }
                >
                  {visited.notes && (
                    <HabitNotes
                      notes={notes}
                      selected={note}
                      colour={accent}
                      editable={editable}
                      onSelect={onNoteSelect}
                      onAdd={onNoteAdd}
                      onEdit={onNoteEdit}
                      onVersions={onNoteVersions}
                      onActions={onNoteActions}
                      bottomInset={bottomInset}
                    />
                  )}
                </View>
                <View
                  testID="habit-statistics-panel"
                  style={{ width, height: '100%' }}
                  pointerEvents={tab === 'statistics' ? 'auto' : 'none'}
                  accessibilityElementsHidden={tab !== 'statistics'}
                  aria-hidden={tab !== 'statistics'}
                  importantForAccessibility={
                    tab === 'statistics' ? 'auto' : 'no-hide-descendants'
                  }
                >
                  {visited.statistics && (
                    <StatsContent
                      habit={habit}
                      weekStart={weekStart}
                      values={values}
                      events={events}
                      actions={actions}
                      today={today}
                      editable={editable}
                      onCellPress={onCellPress}
                      onGoalEdit={onGoalEdit}
                      bottomInset={bottomInset}
                      layout={statsLayout}
                      onStatsLayout={onStatsLayout}
                    />
                  )}
                </View>
              </Animated.ScrollView>
            </ChartScrubLock.Provider>
            <LinearGradient
              colors={[
                `${theme.background}00`,
                `${theme.background}D9`,
                theme.background,
              ]}
              locations={[0, 0.72, 1]}
              style={[styles.fade, { height: islandHeight + 48 }]}
              pointerEvents="none"
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              aria-hidden
            />
            <View style={styles.tabFrame} pointerEvents="box-none">
              <View
                accessibilityRole="tablist"
                accessibilityLabel="Habit views"
                style={[styles.tabs, { width: islandWidth }]}
                onLayout={(event) => {
                  // Native events are pooled; deferred updates retain only the value.
                  const height = event.nativeEvent.layout.height;
                  setIslandHeight((previous) =>
                    previous === height ? previous : height,
                  );
                }}
              >
                <Animated.View
                  pointerEvents="none"
                  accessible={false}
                  style={[
                    styles.selection,
                    {
                      width: segmentWidth,
                      left: islandInset,
                      top: islandInset,
                      bottom: islandInset,
                      backgroundColor: theme.mix(accent, 0.16),
                    },
                    selectionStyle,
                  ]}
                />
                {(['notes', 'statistics'] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityLabel={
                      value === 'notes' ? 'Notes' : 'Statistics'
                    }
                    accessibilityState={{ selected: tab === value }}
                    aria-selected={tab === value}
                    onPress={() => pages.select(value)}
                    style={styles.tab}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        { color: tab === value ? accent : theme.ink(0xa0) },
                      ]}
                    >
                      {value === 'notes' ? 'Notes' : 'Statistics'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
});
const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    minHeight: 56,
    gap: 8,
  },
  nav: { minHeight: 44, minWidth: 60, justifyContent: 'center' },
  title: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  name: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tabFrame: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    alignItems: 'center',
  },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.ink(0x36),
    borderRadius: 18,
    backgroundColor: t.ink(0x18),
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  selection: {
    position: 'absolute',
    left: 5,
    top: 5,
    bottom: 5,
    borderRadius: 13,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 9,
  },
  tabText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
}));
