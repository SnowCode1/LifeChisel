import {
  type CheckboxStyle,
  type WeekStart,
  type CellLook,
  type CellLookKind,
} from '@onpurpose/core/displayPreferences';
import type {
  GridSize,
  GridSizeKind,
  GridSizing,
} from '@onpurpose/core/gridSizing';
import { useState, type ComponentType, type ReactNode } from 'react';
import {
  SettingsScreen,
  settingsParents,
  settingsTitles,
  type SettingsPage,
} from './SettingsScreen';
import type { ThemePreference } from './BackgroundSettings';
import type { ThemeMode } from '@onpurpose/core/theme';
import { themedStyles } from './ThemeContext';
import type { Habit } from '@onpurpose/core/habits';
import { ArchivedHabits } from './ArchivedHabits';
import Animated from 'react-native-reanimated';
import { appear } from './motion';
import { Pressable, type TextProps, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { SheetModal } from './SheetModal';
import { HistoryView } from './HistoryView';
import type { StoreSnapshot } from '@onpurpose/core/storage/store';

export function AppPanel({
  sampleData = false,
  developmentControls,
  page,
  visible,
  HeadingComponent,
  gridWidth,
  sizing,
  onGridSizeChange,
  weekStart,
  onWeekStartChange,
  weekDividers,
  onWeekDividersChange,
  tapAnimations,
  onTapAnimationsChange,
  checkboxStyle,
  onCheckboxStyleChange,
  cellLook,
  onCellLookChange,
  textScale,
  onTextScaleChange,
  hideCompleted,
  onHideCompletedChange,
  hapticsEnabled,
  onHapticsChange,
  themeMode,
  darkBackground,
  lightBackground,
  onThemeChange,
  onClose,
  onDismiss,
  snapshot,
  backupBusy,
  onRestoreDescription,
  onUndo,
  onRedo,
  onExport,
  onRestore,
  onRecover,
  onRetry,
  onArchive,
  onBack,
  onRestoreHabit,
  onDeleteHabit,
}: {
  sampleData?: boolean;
  developmentControls?: ReactNode;
  page: 'history' | 'settings' | 'archive';
  onArchive: () => void;
  onBack: () => void;
  onRestoreHabit: (habit: Habit) => void;
  onDeleteHabit: (habit: Habit) => void;
  visible: boolean;
  HeadingComponent: ComponentType<TextProps>;
  gridWidth: number;
  sizing: GridSizing;
  onGridSizeChange: (kind: GridSizeKind, value: GridSize) => void;
  weekStart: WeekStart;
  onWeekStartChange: (value: WeekStart) => void;
  weekDividers: boolean;
  onWeekDividersChange: (value: boolean) => void;
  tapAnimations: boolean;
  onTapAnimationsChange: (value: boolean) => void;
  checkboxStyle: CheckboxStyle;
  onCheckboxStyleChange: (value: CheckboxStyle) => void;
  cellLook: CellLook;
  onCellLookChange: <K extends CellLookKind>(
    kind: K,
    value: CellLook[K],
  ) => void;
  textScale: number;
  onTextScaleChange: (value: number) => void;
  hideCompleted: boolean;
  onHideCompletedChange: (value: boolean) => void;
  hapticsEnabled: boolean;
  onHapticsChange: (enabled: boolean) => void;
  themeMode: ThemeMode;
  darkBackground: string;
  lightBackground: string;
  onThemeChange: (preference: ThemePreference) => void;
  onClose: () => void;
  onDismiss: () => void;
  snapshot: StoreSnapshot;
  backupBusy: boolean;
  onRestoreDescription: (id: string, text: string | undefined) => boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onRestore: () => void;
  onRecover: () => void;
  onRetry: () => void;
}) {
  const styles = useStyles();
  const editable = !snapshot.error && !snapshot.busy && !backupBusy;
  const context = visible ? page : 'closed';
  const [navigation, setNavigation] = useState<{
    context: string;
    page: SettingsPage;
  }>({ context, page: 'index' });
  // Reset navigation together with a new presentation, without an effect render.
  if (navigation.context !== context) setNavigation({ context, page: 'index' });
  const settingsPage =
    navigation.context === context ? navigation.page : 'index';
  // History's jump calendar; like navigation, it resets with each presentation.
  const [calendar, setCalendar] = useState({ context, open: false });
  const calendarOpen = calendar.context === context && calendar.open;
  const setSettingsPage = (next: SettingsPage) =>
    setNavigation({ context, page: next });
  const parentPage = settingsParents[settingsPage] ?? 'index';
  return (
    <SheetModal visible={visible} onClose={onClose} onDismiss={onDismiss}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen}>
          <View accessibilityViewIsModal style={styles.content}>
            <View style={styles.header}>
              {(page === 'archive' ||
                (page === 'settings' && settingsPage !== 'index')) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Back to ${
                    page === 'archive' ? 'Settings' : settingsTitles[parentPage]
                  }`}
                  onPress={
                    page === 'archive'
                      ? onBack
                      : () => setSettingsPage(parentPage)
                  }
                  style={styles.close}
                >
                  <View style={{ transform: [{ rotate: '90deg' }] }}>
                    <Icon name="chevron" size={18} />
                  </View>
                </Pressable>
              )}
              <HeadingComponent accessibilityRole="header" style={styles.title}>
                {page === 'history'
                  ? 'History'
                  : page === 'archive'
                    ? 'Archived habits'
                    : settingsTitles[settingsPage]}
              </HeadingComponent>
              {page === 'history' && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Jump to a date"
                  accessibilityState={{ expanded: calendarOpen }}
                  onPress={() => setCalendar({ context, open: !calendarOpen })}
                  style={({ pressed }) => [
                    styles.close,
                    calendarOpen && styles.active,
                    { opacity: pressed ? 0.55 : 1 },
                  ]}
                >
                  <Icon name="calendar" size={18} />
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Close ${page}`}
                onPress={onClose}
                style={({ pressed }) => [
                  styles.close,
                  { opacity: pressed ? 0.55 : 1 },
                ]}
              >
                <Icon name="close" size={18} />
              </Pressable>
            </View>
            <Animated.View
              key={page === 'settings' ? settingsPage : page}
              entering={appear}
              style={{ flex: 1 }}
            >
              {page === 'history' ? (
                <HistoryView
                  Heading={HeadingComponent}
                  sampleData={sampleData}
                  snapshot={snapshot}
                  backupBusy={backupBusy}
                  weekStart={weekStart}
                  calendarOpen={calendarOpen}
                  onCalendarClose={() => setCalendar({ context, open: false })}
                  onRestoreDescription={onRestoreDescription}
                  onUndo={onUndo}
                  onRedo={onRedo}
                  onRetry={onRetry}
                />
              ) : page === 'archive' ? (
                <ArchivedHabits
                  sampleData={sampleData}
                  habits={snapshot.replay.state.habits}
                  editable={editable}
                  onRestore={onRestoreHabit}
                  onDelete={onDeleteHabit}
                  values={snapshot.replay.state.values}
                  pending={snapshot.pending}
                  error={snapshot.error}
                  onRetry={onRetry}
                />
              ) : (
                <SettingsScreen
                  page={settingsPage}
                  onPage={setSettingsPage}
                  sampleData={sampleData}
                  developmentControls={developmentControls}
                  snapshot={snapshot}
                  backupBusy={backupBusy}
                  textScale={textScale}
                  onTextScaleChange={onTextScaleChange}
                  gridWidth={gridWidth}
                  sizing={sizing}
                  onGridSizeChange={onGridSizeChange}
                  weekStart={weekStart}
                  onWeekStartChange={onWeekStartChange}
                  weekDividers={weekDividers}
                  onWeekDividersChange={onWeekDividersChange}
                  tapAnimations={tapAnimations}
                  onTapAnimationsChange={onTapAnimationsChange}
                  checkboxStyle={checkboxStyle}
                  onCheckboxStyleChange={onCheckboxStyleChange}
                  cellLook={cellLook}
                  onCellLookChange={onCellLookChange}
                  hideCompleted={hideCompleted}
                  onHideCompletedChange={onHideCompletedChange}
                  hapticsEnabled={hapticsEnabled}
                  onHapticsChange={onHapticsChange}
                  themeMode={themeMode}
                  darkBackground={darkBackground}
                  lightBackground={lightBackground}
                  onThemeChange={onThemeChange}
                  onArchive={onArchive}
                  onRetry={onRetry}
                  onExport={onExport}
                  onRestore={onRestore}
                  onRecover={onRecover}
                />
              )}
            </Animated.View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </SheetModal>
  );
}
const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.background },
  content: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: {
    minHeight: 72,
    paddingHorizontal: 24,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  title: { flex: 1, fontSize: 24, fontWeight: '600', color: t.ink(0xe8) },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.ink(0x15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { backgroundColor: t.ink(0x2c) },
}));
