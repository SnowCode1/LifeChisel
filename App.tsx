import { useQuickUndo } from './src/useQuickUndo';
import { useDailyEntryActions } from './src/useDailyEntryActions';
import { NumericRecordDialog } from './src/NumericRecordDialog';
import { sameValue, type Change } from './src/storage/model';
import { DailyRecordDialog } from './src/DailyRecordDialog';
import { HabitGoalsEditor } from './src/HabitGoalsEditor';
import { TypographyProvider, Text } from './src/Typography';
import { DescriptionVersions } from './src/DescriptionVersions';
import { descriptionVersions } from './src/descriptionVersionFilter';
import { DescriptionEditor } from './src/DescriptionEditor';
import { descriptionDraftKey } from './src/descriptionDrafts';
import { applyPlaceholderDescriptions } from './src/storage/presetDescriptions';
import {
  displayDefaults,
  effectiveColumnSpacing,
} from './src/displayPreferences';
import { useGridDisplayPreferences } from './src/useGridDisplayPreferences';
import { gridSizing } from './src/gridSizing';
import { habitTrackingStart } from './src/statistics';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { blackTheme, themeFor, type Theme } from './src/theme';
import { ThemeProvider, themedStyles } from './src/ThemeContext';
import type { ThemePreference } from './src/BackgroundSettings';
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Appearance,
  Pressable,
  type PressableProps,
  type TextProps,
  useColorScheme,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { PerformanceBoundary } from './src/PerformanceBoundary';
import { developmentToolsEnabled } from './src/developmentFeatures';
import { HabitDetailsScreen } from './src/HabitDetailsScreen';
import { HabitGrid } from './src/HabitGrid';
import { habitType, type Habit, type HabitCategory } from './src/habits';
import { randomUUID } from 'expo-crypto';
import { HabitDialog, type HabitDialogMode } from './src/HabitDialog';
import { displayedHabitOrder, moveHabit } from './src/habitOrdering';
import type { HabitAction } from './src/HabitName';
import { useLocalToday } from './src/useLocalToday';
import { feedback, setHapticsEnabled } from './src/haptics';
import { AppPanel } from './src/AppPanel';
import { SheetModal } from './src/SheetModal';
import { usePersistentStore, useStoreOpening } from './src/usePersistentStore';
import type { ChangeStore } from './src/storage/store';
import { applyPresetIcons } from './src/storage/presetIcons';
import { useBackupActions } from './src/useBackupActions';

// Metro removes this branch (and its module) from release JavaScript.
const PreviewHeading: ComponentType<TextProps> =
  __DEV__ &&
  developmentToolsEnabled &&
  process.env.EXPO_PUBLIC_DEV_PREVIEW === 'true'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep native capture out of release JS.
      require('./src/dev/DevPreviewText').DevPreviewText
    : Text;

const PreviewDateButton: ComponentType<PressableProps> =
  __DEV__ &&
  developmentToolsEnabled &&
  process.env.EXPO_PUBLIC_DEV_PREVIEW === 'true'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep native capture out of release JS.
      require('./src/dev/DevPreviewText').DevPreviewButton
    : Pressable;

// One global capture listener reaches native sheets and DOM editors alike.
const previewTools: typeof import('./src/dev/DevPreviewCapture') | null =
  __DEV__ &&
  developmentToolsEnabled &&
  process.env.EXPO_PUBLIC_DEV_PREVIEW === 'true'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- Development-only sensor/capture code.
      require('./src/dev/DevPreviewCapture')
    : null;
const PreviewCapture = previewTools?.DevPreviewCapture;
const PreviewControls = previewTools?.DevPreviewControls;
const performanceTools:
  typeof import('./src/dev/DevPerformanceControls') | null =
  __DEV__ &&
  developmentToolsEnabled &&
  process.env.EXPO_PUBLIC_DEV_PERFORMANCE === 'true'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- Native timing tools are development only.
      require('./src/dev/DevPerformanceControls')
    : null;
const PerformanceControls = performanceTools?.DevPerformanceControls;
const PerformanceLifecycle = performanceTools?.DevPerformanceLifecycle;

// Development sample history is excluded from production bundles.
const SampleDataMode:
  typeof import('./src/dev/SampleDataMode').SampleDataMode | null =
  __DEV__ && developmentToolsEnabled
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- Do not bundle sample fixtures in release JS.
      require('./src/dev/SampleDataMode').SampleDataMode
    : null;

export default function App() {
  const app = (
    <>
      {PreviewCapture && <PreviewCapture />}
      {PerformanceLifecycle && <PerformanceLifecycle />}
      <StoreApp />
    </>
  );
  // The canvas grid scrolls and taps through gesture-handler gestures, which
  // need this root on every platform.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>{app}</GestureHandlerRootView>
  );
}
function StoreApp() {
  const { store, error, retry } = useStoreOpening();
  if (!store) return <StorageGate error={error} onRetry={retry} />;
  if (SampleDataMode)
    return (
      <ThemeProvider theme={blackTheme}>
        <SampleDataMode store={store}>
          {(activeStore, sampleData, developmentControls) => (
            <PersistentApp
              key={sampleData ? 'sample' : 'real'}
              store={activeStore}
              sampleData={sampleData}
              developmentControls={developmentControls}
            />
          )}
        </SampleDataMode>
      </ThemeProvider>
    );
  return <PersistentApp store={store} />;
}

// Native controls (alerts, keyboards, date pickers) follow the app's theme;
// System hands the choice back to the phone. The root view colour shows
// briefly behind keyboards and rotation.
function useNativeAppearance(theme: Theme, followSystem: boolean) {
  useEffect(() => {
    if (typeof Appearance.setColorScheme === 'function')
      Appearance.setColorScheme(followSystem ? 'unspecified' : theme.scheme);
  }, [followSystem, theme.scheme]);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background).catch(() => {});
  }, [theme.background]);
}

function StorageGate({
  error,
  onRetry,
}: {
  error: boolean;
  onRetry: () => void;
}) {
  // Saved preferences are not readable yet: use the default dark theme.
  const theme = blackTheme;
  const styles = useStyles.get(theme);
  return (
    <ThemeProvider theme={theme}>
      <SafeAreaProvider>
        <SafeAreaView
          style={[
            styles.screen,
            { justifyContent: 'center', padding: 24, gap: 16 },
          ]}
        >
          <StatusBar style={theme.statusBar} />
          {error ? (
            <>
              <Text style={styles.secondary}>
                Saved data could not be opened. Your database has not been
                reset.
              </Text>
              <Pressable
                accessibilityRole="button"
                style={styles.action}
                onPress={onRetry}
              >
                <Text style={styles.actionText}>Retry</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator
              color={theme.ink(0x88)}
              accessibilityLabel="Opening saved habits"
            />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function PersistentApp({
  store,
  sampleData = false,
  developmentControls,
}: {
  store: ChangeStore;
  sampleData?: boolean;
  developmentControls?: ReactNode;
}) {
  const snapshot = usePersistentStore(store);
  useEffect(() => {
    if (!sampleData && snapshot.status === 'ready') {
      applyPresetIcons(store);
      applyPlaceholderDescriptions(store);
    }
  }, [store, snapshot.status, sampleData]);
  const {
    habits,
    values,
    hapticsEnabled,
    weekStart = displayDefaults.weekStart,
    checkboxStyle = displayDefaults.checkboxStyle,
    weekDividers = displayDefaults.weekDividers,
    tapAnimations = displayDefaults.tapAnimations,
    hideCompleted = displayDefaults.hideCompleted,
    textScale = displayDefaults.textScale,
    themeMode = displayDefaults.themeMode,
    darkBackground = displayDefaults.darkBackground,
    lightBackground = displayDefaults.lightBackground,
  } = snapshot.replay.state;
  const theme = themeFor(
    themeMode,
    useColorScheme(),
    darkBackground,
    lightBackground,
  );
  useNativeAppearance(theme, themeMode === 'system');
  const styles = useStyles.get(theme);
  const { nameWidth, nameFactor, columnWidth, rowHeight } = gridSizing(
    snapshot.replay.state,
    effectiveColumnSpacing(snapshot.replay.state),
  );
  const [gridWidth, setGridWidth] = useState(0);
  const activeHabits = useMemo(
    () => habits.filter((habit) => !habit.archived),
    [habits],
  );
  const { backupBusy, exportBackup, restoreBackup, recoverPrevious } =
    useBackupActions(store, sampleData);
  useEffect(() => {
    setHapticsEnabled(hapticsEnabled);
  }, [hapticsEnabled]);
  const today = useLocalToday();
  const quickUndo = useQuickUndo(store);
  const captureQuickUndo = quickUndo.capture;
  const [panel, setPanel] = useState<{
    page: 'history' | 'settings' | 'archive';
    visible: boolean;
    deferGrid: boolean;
  }>({ page: 'history', visible: false, deferGrid: false });
  const gridDisplay = useGridDisplayPreferences(
    {
      theme,
      nameWidth,
      nameFactor,
      columnWidth,
      rowHeight,
      textScale,
      hideCompleted,
      checkboxStyle,
      weekDividers,
      tapAnimations,
      weekStart,
    },
    panel.deferGrid,
  );
  const {
    editing,
    recording,
    pressCell,
    saveNumber,
    saveRecord,
    closeNumber,
    closeRecord,
    closeEntries,
  } = useDailyEntryActions(store, captureQuickUndo);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = habits.find((habit) => habit.id === detailId);
  const [habitMode, setHabitMode] = useState<HabitDialogMode>('edit');
  const [newHabit, setNewHabit] = useState<Habit | null>(null);
  const [descriptionId, setDescriptionId] = useState<string | null>(null);
  const descriptionHabit = habits.find((habit) => habit.id === descriptionId);
  const [versionsId, setVersionsId] = useState<string | null>(null);
  const versionsHabit = habits.find((habit) => habit.id === versionsId);
  const [statsId, setStatsId] = useState<string | null>(null);
  const [goalsId, setGoalsId] = useState<string | null>(null);
  const goalHabit = habits.find((habit) => habit.id === goalsId);
  const statsHabit = habits.find(
    (habit) => habit.id === statsId && !habit.archived,
  );
  const versions = useMemo(() => {
    const id = versionsId ?? statsId;
    return id ? descriptionVersions(snapshot.replay.undo, id) : [];
  }, [snapshot.replay.undo, versionsId, statsId]);
  const editable = store.canEdit() && !backupBusy;
  const openDetails = useCallback((habit: Habit) => {
    setStatsId(habit.id);
    feedback('selection');
  }, []);

  const openHistory = useCallback(() => {
    feedback('selection');
    setPanel({ page: 'history', visible: true, deferGrid: true });
  }, []);
  const openSettings = useCallback(() => {
    feedback('selection');
    setPanel({ page: 'settings', visible: true, deferGrid: true });
  }, []);

  function changeHaptics(value: boolean) {
    const before = store.getSnapshot().replay.state.hapticsEnabled;
    if (store.change({ kind: 'haptics', before, after: value })) {
      setHapticsEnabled(value);
      if (value) feedback('selection');
    }
  }

  function closeDialog() {
    closeEntries();
    setDetailId(null);
    setNewHabit(null);
  }

  function applyColour(colour: string): boolean {
    const habit = store
      .getSnapshot()
      .replay.state.habits.find((habit) => habit.id === detailId);
    if (!habit || !store.canEdit()) return false;
    if (colour === habit.color) return true;
    const change = {
      kind: 'colour' as const,
      habitId: habit.id,
      before: habit.color,
      after: colour,
    };
    const accepted = store.change(change);
    if (accepted) feedback('confirm');
    return accepted;
  }
  const saveHabit = useCallback(
    (after: Habit): boolean => {
      const current = store.getSnapshot().replay.state.habits;
      const before = current.find((habit) => habit.id === after.id) ?? null;
      if (
        before &&
        before.name === after.name &&
        before.color === after.color &&
        before.unit === after.unit &&
        habitType(before) === habitType(after) &&
        sameValue(before.categories, after.categories) &&
        sameValue(before.goals, after.goals) &&
        before.archived === after.archived &&
        before.icon === after.icon &&
        before.startDate === after.startDate &&
        before.description === after.description
      )
        return true;
      const change = {
        kind: 'habit' as const,
        habitId: after.id,
        index: before ? current.indexOf(before) : current.length,
        before,
        after,
      };
      const accepted = store.change(change);
      if (accepted) {
        captureQuickUndo(change);
        feedback('confirm');
      }
      return accepted;
    },
    [store, captureQuickUndo],
  );
  // Categories added from the daily entry sheet: an ordinary undoable habit
  // edit, applied just before that entry is saved (which gives the feedback).
  const addCategories = useCallback(
    (habitId: string, added: HabitCategory[]): boolean => {
      const current = store.getSnapshot().replay.state.habits;
      const before = current.find((habit) => habit.id === habitId);
      if (!before) return false;
      return store.change({
        kind: 'habit',
        habitId,
        index: current.indexOf(before),
        before,
        after: {
          ...before,
          categories: [...(before.categories ?? []), ...added],
        },
      });
    },
    [store],
  );
  const restoreDescription = useCallback(
    (id: string, description: string | undefined) => {
      const current = store
        .getSnapshot()
        .replay.state.habits.find((habit) => habit.id === id);
      if (!current || !editable) return false;
      const { description: _description, ...rest } = current;
      return saveHabit({ ...rest, ...(description ? { description } : {}) });
    },
    [store, editable, saveHabit],
  );
  const reorderHabits = useCallback(
    (ids: string[]): boolean => {
      const current = store.getSnapshot().replay.state.habits;
      const before = current.map((habit) => habit.id),
        after = displayedHabitOrder(current, ids);
      if (before.join('|') === after.join('|')) return false;
      return store.change({ kind: 'order', before, after });
    },
    [store],
  );
  const habitAction = useCallback(
    (habit: Habit, action: HabitAction) => {
      if (!store.canEdit()) return;
      if (action === 'archive') {
        saveHabit({ ...habit, archived: true });
        return;
      }
      if (action === 'moveUp' || action === 'moveDown') {
        const ids = store
          .getSnapshot()
          .replay.state.habits.filter((habit) => !habit.archived)
          .map((habit) => habit.id);
        if (
          reorderHabits(
            moveHabit(
              ids,
              habit.id,
              ids.indexOf(habit.id) + (action === 'moveUp' ? -1 : 1),
            ),
          )
        )
          feedback('selection');
        return;
      }
      if (action === 'reorder') return; // Grid owns reorder mode.
      setNewHabit(null);
      setDetailId(habit.id);
      setHabitMode(action === 'colour' ? 'colour' : 'edit');
      feedback('selection');
    },
    [store, saveHabit, reorderHabits],
  );
  const addHabit = useCallback(() => {
    if (!store.canEdit()) return;
    if (store.getSnapshot().replay.state.habits.length >= 1000) {
      Alert.alert(
        'Habit limit reached',
        'This preview supports up to 1,000 habits, including archived habits.',
      );
      return;
    }
    setDetailId(null);
    setNewHabit({
      id: randomUUID(),
      name: '',
      color: '#82E6BC',
      type: 'checkbox',
      startDate: today,
    });
    setHabitMode('create');
  }, [store, today]);

  const closeStats = useCallback(() => setStatsId(null), []);
  const editStats = useCallback(() => {
    if (statsHabit) habitAction(statsHabit, 'edit');
  }, [statsHabit, habitAction]);

  function undo() {
    if (store.undo()) feedback('undo');
  }
  function redo() {
    if (store.redo()) feedback('confirm');
  }
  if (snapshot.status !== 'ready')
    return (
      <StorageGate
        error={snapshot.status === 'load-error'}
        onRetry={() => {
          void store.retry();
        }}
      />
    );

  const habitDialog =
    detail || newHabit ? (
      <HabitDialog
        weekStart={weekStart}
        today={today}
        key={detail?.id ?? newHabit?.id}
        habit={(detail ?? newHabit)!}
        initialStartDate={habitTrackingStart(
          (detail ?? newHabit)!,
          values,
          snapshot.events,
          today,
        )}
        temporary={sampleData}
        mode={habitMode}
        Heading={PreviewHeading}
        onClose={closeDialog}
        onSave={saveHabit}
        onColour={applyColour}
        editable={editable}
      />
    ) : null;

  const overlays = (
    <>
      {descriptionHabit && (
        <DescriptionEditor
          key={descriptionHabit.id}
          title={descriptionHabit.name}
          colour={descriptionHabit.color}
          initialValue={descriptionHabit.description ?? ''}
          draftKey={descriptionDraftKey(descriptionHabit.id)}
          temporary={sampleData}
          editable={editable}
          Heading={PreviewHeading}
          onClose={() => setDescriptionId(null)}
          onApply={(description) =>
            restoreDescription(descriptionHabit.id, description)
          }
        />
      )}
      {versionsHabit && (
        <DescriptionVersions
          key={versionsHabit.id}
          habit={versionsHabit}
          actions={versions}
          state={snapshot.replay.state}
          editable={editable}
          Heading={PreviewHeading}
          onRestore={restoreDescription}
          onClose={() => setVersionsId(null)}
        />
      )}
      {editing && (
        <NumericRecordDialog
          key={editing.key}
          habit={editing.habit}
          day={editing.day}
          initialValue={
            typeof editing.value === 'number' ? editing.value : null
          }
          values={values}
          editable={editable}
          Heading={PreviewHeading}
          onClose={closeNumber}
          onSave={saveNumber}
        />
      )}
      {recording && (
        <DailyRecordDialog
          key={recording.key}
          habit={recording.habit}
          day={recording.day}
          value={values[recording.key]}
          editable={editable}
          Heading={PreviewHeading}
          onClose={closeRecord}
          onSave={saveRecord}
          onAddCategories={(added) => addCategories(recording.habit.id, added)}
        />
      )}
      {habitDialog}
      {goalHabit && (
        <HabitGoalsEditor
          weekStart={weekStart}
          habit={goalHabit}
          today={today}
          editable={editable}
          Heading={PreviewHeading}
          onClose={() => setGoalsId(null)}
          onApply={(goals) => {
            const current = store
              .getSnapshot()
              .replay.state.habits.find((habit) => habit.id === goalHabit.id);
            if (!current) return false;
            const { goals: _goals, ...base } = current;
            return saveHabit({ ...base, ...(goals ? { goals } : {}) });
          }}
        />
      )}
      <AppPanel
        sampleData={sampleData}
        developmentControls={
          developmentControls || PreviewControls || PerformanceControls ? (
            <>
              {developmentControls}
              {PreviewControls && <PreviewControls />}
              {PerformanceControls && (
                <PerformanceControls sampleData={sampleData} />
              )}
            </>
          ) : undefined
        }
        page={panel.page}
        onArchive={() =>
          setPanel({ page: 'archive', visible: true, deferGrid: true })
        }
        onBack={() =>
          setPanel({ page: 'settings', visible: true, deferGrid: true })
        }
        onRestoreHabit={(habit) => saveHabit({ ...habit, archived: false })}
        onDeleteHabit={(habit) => {
          if (store.deleteArchivedHabit(habit.id)) feedback('confirm');
        }}
        visible={panel.visible}
        HeadingComponent={PreviewHeading}
        snapshot={snapshot}
        backupBusy={backupBusy}
        onRestoreDescription={restoreDescription}
        onUndo={undo}
        onRedo={redo}
        onExport={() => {
          void exportBackup();
        }}
        onRestore={() => {
          void restoreBackup();
        }}
        onRecover={() => {
          void recoverPrevious();
        }}
        onRetry={() => {
          void store.retry();
        }}
        gridWidth={gridWidth}
        sizing={{ nameWidth, nameFactor, columnWidth, rowHeight }}
        onGridSizeChange={(kind, after) => {
          if (!editable) return;
          const before = store.getSnapshot().replay.state[kind] ?? null;
          if (store.change({ kind, before, after } as Change))
            feedback('selection');
        }}
        weekStart={weekStart}
        hideCompleted={hideCompleted}
        onHideCompletedChange={(after) => {
          if (!editable) return;
          const before =
            store.getSnapshot().replay.state.hideCompleted ??
            displayDefaults.hideCompleted;
          if (store.change({ kind: 'hideCompleted', before, after }))
            feedback('selection');
        }}
        weekDividers={weekDividers}
        onWeekDividersChange={(after) => {
          if (!editable) return;
          const before =
            store.getSnapshot().replay.state.weekDividers ??
            displayDefaults.weekDividers;
          if (store.change({ kind: 'weekDividers', before, after }))
            feedback('selection');
        }}
        tapAnimations={tapAnimations}
        onTapAnimationsChange={(after) => {
          if (!editable) return;
          const before =
            store.getSnapshot().replay.state.tapAnimations ??
            displayDefaults.tapAnimations;
          if (store.change({ kind: 'tapAnimations', before, after }))
            feedback('selection');
        }}
        checkboxStyle={checkboxStyle}
        onCheckboxStyleChange={(after) => {
          if (!editable) return;
          const before =
            store.getSnapshot().replay.state.checkboxStyle ??
            displayDefaults.checkboxStyle;
          if (store.change({ kind: 'checkboxStyle', before, after }))
            feedback('selection');
        }}
        onWeekStartChange={(after) => {
          if (!editable) return;
          const before =
            store.getSnapshot().replay.state.weekStart ??
            displayDefaults.weekStart;
          if (store.change({ kind: 'weekStart', before, after }))
            feedback('selection');
        }}
        textScale={textScale}
        onTextScaleChange={(after) => {
          if (!editable) return;
          const before =
            store.getSnapshot().replay.state.textScale ??
            displayDefaults.textScale;
          if (store.change({ kind: 'textScale', before, after }))
            feedback('selection');
        }}
        hapticsEnabled={hapticsEnabled}
        onHapticsChange={changeHaptics}
        themeMode={themeMode}
        darkBackground={darkBackground}
        lightBackground={lightBackground}
        onThemeChange={(preference: ThemePreference) => {
          if (!editable) return;
          const before =
            store.getSnapshot().replay.state[preference.kind] ?? null;
          if (
            store.change({
              kind: preference.kind,
              before,
              after: preference.value,
            } as Change)
          )
            feedback('selection');
        }}
        onClose={() =>
          setPanel((previous) => ({ ...previous, visible: false }))
        }
        onDismiss={() =>
          setPanel((previous) =>
            previous.visible || !previous.deferGrid
              ? previous
              : { ...previous, deferGrid: false },
          )
        }
      />
    </>
  );

  const saveError = snapshot.error && (
    <View
      accessibilityLiveRegion="assertive"
      style={{
        paddingHorizontal: 18,
        paddingVertical: 8,
        backgroundColor: theme.tint('#251C16'),
      }}
    >
      <Text style={styles.secondary}>{snapshot.error}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void store.retry();
        }}
        style={styles.action}
      >
        <Text style={styles.actionText}>Retry saving</Text>
      </Pressable>
    </View>
  );

  // Sheets and dialogs use the current theme at once; the grid region keeps its
  // displayed theme until Settings finishes dismissing, like other presentation.
  return (
    <ThemeProvider theme={theme}>
      <TypographyProvider scale={textScale}>
        <SafeAreaProvider>
          <SafeAreaView
            style={[
              styles.screen,
              { backgroundColor: gridDisplay.theme.background },
            ]}
          >
            <StatusBar style={theme.statusBar} />
            {!statsHabit && saveError}
            <View style={{ flex: 1 }}>
              <View
                style={styles.content}
                pointerEvents={statsHabit ? 'none' : 'auto'}
                accessibilityElementsHidden={!!statsHabit}
                importantForAccessibility={
                  statsHabit ? 'no-hide-descendants' : 'auto'
                }
              >
                <ThemeProvider theme={gridDisplay.theme}>
                  <TypographyProvider scale={gridDisplay.textScale}>
                    <PerformanceBoundary name="grid">
                      <HabitGrid
                        nameWidth={gridDisplay.nameWidth}
                        nameFactor={gridDisplay.nameFactor}
                        columnWidth={gridDisplay.columnWidth}
                        rowHeight={gridDisplay.rowHeight}
                        onWidthChange={setGridWidth}
                        weekDividers={gridDisplay.weekDividers}
                        tapAnimations={gridDisplay.tapAnimations}
                        checkboxStyle={gridDisplay.checkboxStyle}
                        weekStart={gridDisplay.weekStart}
                        hideCompleted={gridDisplay.hideCompleted}
                        sampleData={sampleData}
                        HeadingComponent={PreviewHeading}
                        DateButtonComponent={PreviewDateButton}
                        key={today}
                        today={today}
                        habits={activeHabits}
                        editable={editable}
                        onHabitAction={habitAction}
                        onReorder={reorderHabits}
                        store={store}
                        onHabitPress={openDetails}
                        quickUndo={quickUndo}
                        onCellPress={pressCell}
                        onHistoryPress={openHistory}
                        onSettingsPress={openSettings}
                        onAddHabit={addHabit}
                      />
                    </PerformanceBoundary>
                  </TypographyProvider>
                </ThemeProvider>
              </View>
              {statsHabit && (
                <SheetModal onClose={closeStats}>
                  <SafeAreaProvider>
                    <SafeAreaView style={styles.screen}>
                      {saveError}
                      <PerformanceBoundary name="statistics">
                        <HabitDetailsScreen
                          weekStart={weekStart}
                          key={statsHabit.id}
                          habit={statsHabit}
                          values={values}
                          events={snapshot.events}
                          actions={snapshot.replay.undo}
                          today={today}
                          Heading={PreviewHeading}
                          editable={editable}
                          onBack={closeStats}
                          onCellPress={pressCell}
                          onDescriptionEdit={() =>
                            setDescriptionId(statsHabit.id)
                          }
                          onDescriptionVersions={
                            versions.length
                              ? () => setVersionsId(statsHabit.id)
                              : undefined
                          }
                          onEdit={editStats}
                          onGoalEdit={() => setGoalsId(statsHabit.id)}
                        />
                      </PerformanceBoundary>
                      {overlays}
                    </SafeAreaView>
                  </SafeAreaProvider>
                </SheetModal>
              )}
            </View>
            {!statsHabit && overlays}
          </SafeAreaView>
        </SafeAreaProvider>
      </TypographyProvider>
    </ThemeProvider>
  );
}

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.background },
  content: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 18,
  },
  secondary: { color: t.ink(0xa1), fontSize: 13, lineHeight: 20 },
  action: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionText: { color: t.ink(0xd0) },
}));
