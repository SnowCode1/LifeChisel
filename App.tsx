import { useQuickUndo } from './src/useQuickUndo';
import { useDailyEntryActions } from './src/useDailyEntryActions';
import { NumericRecordDialog } from './src/NumericRecordDialog';
import { sameValue, type Change } from '@onpurpose/core/storage/model';
import { DailyRecordDialog } from './src/DailyRecordDialog';
import { HabitGoalsEditor } from './src/HabitGoalsEditor';
import { TypographyProvider, Text } from './src/Typography';
import { DescriptionVersions } from './src/DescriptionVersions';
import { DescriptionEditor } from './src/DescriptionEditor';
import type { NoteRestore } from './src/DescriptionHistory';
import { NoteSheet, type NoteSheetMode } from './src/NoteSheet';
import {
  addNote,
  habitNotes,
  moveNote,
  newNoteId,
  noteDraftKey,
  noteHint,
  noteVersions,
  removeNote,
  restoreNote,
  updateNote,
  type HabitNote,
  type NoteChange,
} from '@onpurpose/core/notes';
import { applyPlaceholderDescriptions } from '@onpurpose/core/storage/presetDescriptions';
import {
  displayDefaults,
  effectiveColumnSpacing,
  cellLookOf,
} from '@onpurpose/core/displayPreferences';
import { useGridDisplayPreferences } from './src/useGridDisplayPreferences';
import { gridSizing } from '@onpurpose/core/gridSizing';
import { habitTrackingStart } from '@onpurpose/core/statistics';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { blackTheme, themeFor, type Theme } from '@onpurpose/core/theme';
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
import { developmentToolsEnabled } from '@onpurpose/core/developmentFeatures';
import { HabitDetailsScreen } from './src/HabitDetailsScreen';
import type { HabitTab } from './src/useHabitPages';
import type { HabitOpening } from './src/TodayTiles';
import { HabitGrid } from './src/HabitGrid';
import {
  habitType,
  type Habit,
  type HabitCategory,
} from '@onpurpose/core/habits';
import { randomUUID } from 'expo-crypto';
import { HabitDialog, type HabitDialogMode } from './src/HabitDialog';
import { displayedHabitOrder, moveHabit } from '@onpurpose/core/habitOrdering';
import {
  statsLayoutChange,
  type StatsLayout,
} from '@onpurpose/core/statsLayout';
import type { HabitAction } from './src/HabitName';
import { useLocalToday } from './src/useLocalToday';
import { feedback, setHapticsEnabled } from './src/haptics';
import { AppPanel } from './src/AppPanel';
import { SheetModal } from './src/SheetModal';
import { usePersistentStore, useStoreOpening } from './src/usePersistentStore';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import { applyPresetIcons } from '@onpurpose/core/storage/presetIcons';
import { useBackupActions } from './src/useBackupActions';
import { loadGridMode, saveGridMode } from './src/storage/deviceView';
import type { GridMode } from '@onpurpose/core/gridModes';
import { weekJumpDay } from '@onpurpose/core/weekSummary';

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
  const {
    missedDays,
    joinedCheckboxes,
    streakNumbers,
    roundCheckboxes,
    connectorThickness,
    joinedEndsOnly,
  } = snapshot.replay.state;
  // One object per distinct look, so save acknowledgements keep its identity.
  const cellLook = useMemo(
    () =>
      cellLookOf({
        missedDays,
        joinedCheckboxes,
        streakNumbers,
        roundCheckboxes,
        connectorThickness,
        joinedEndsOnly,
      }),
    [
      missedDays,
      joinedCheckboxes,
      streakNumbers,
      roundCheckboxes,
      connectorThickness,
      joinedEndsOnly,
    ],
  );
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
      cellLook,
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
    fillCells,
    recordValue,
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
  const [statsId, setStatsId] = useState<string | null>(null);
  // The note shown on the habit sheet's Notes page (the first by default),
  // the note being written (an existing one, or a new one just named), its
  // versions list and the small note sheet.
  const [noteId, setNoteId] = useState<string | null>(null);
  // The page a habit sheet opens on, when chosen (a Today tile's buttons).
  const [statsTab, setStatsTab] = useState<HabitTab | undefined>(undefined);
  const [noteEditor, setNoteEditor] = useState<{
    habitId: string;
    noteId: string;
    title: string;
    isNew: boolean;
  } | null>(null);
  const [noteVersionsOpen, setNoteVersionsOpen] = useState(false);
  const [noteSheet, setNoteSheet] = useState<NoteSheetMode | null>(null);
  const editorHabit = habits.find((habit) => habit.id === noteEditor?.habitId);
  const [goalsId, setGoalsId] = useState<string | null>(null);
  const goalHabit = habits.find((habit) => habit.id === goalsId);
  const statsHabit = habits.find(
    (habit) => habit.id === statsId && !habit.archived,
  );
  const notesState = snapshot.replay.state.notes;
  const statsNotes = useMemo(
    () => (statsHabit ? habitNotes({ notes: notesState }, statsHabit) : []),
    [statsHabit, notesState],
  );
  const shownNote: HabitNote | undefined =
    statsNotes.find((note) => note.id === noteId) ?? statsNotes[0];
  const versions = useMemo(
    () =>
      statsHabit && shownNote
        ? noteVersions(snapshot.replay.undo, statsHabit.id, shownNote.id)
        : [],
    [snapshot.replay.undo, statsHabit, shownNote],
  );
  const editable = store.canEdit() && !backupBusy;
  const openDetails = useCallback((habit: Habit, open?: HabitOpening) => {
    setStatsId(habit.id);
    setNoteId(open?.noteId ?? null);
    setStatsTab(open?.tab);
    feedback('selection');
  }, []);

  // The home view is this phone's own choice, outside the change log.
  const [gridMode, setGridMode] = useState<GridMode>(loadGridMode);
  // Where a day grid opens: a week tapped in Weeks mode, otherwise Today.
  const [jump, setJump] = useState({ day: 0, mode: 'grid' as GridMode });
  const changeGridMode = useCallback((mode: GridMode) => {
    setGridMode(mode);
    saveGridMode(mode);
    setJump((current) => ({
      day: 0,
      mode: mode === 'compact' || mode === 'grid' ? mode : current.mode,
    }));
  }, []);
  // A week cell opens that week in the day grid last used (Grid or Compact).
  const showWeek = useCallback(
    (weeksAgo: number) => {
      feedback('selection');
      const mode = jump.mode;
      setJump({
        day: weekJumpDay(today, gridDisplay.weekStart, weeksAgo),
        mode,
      });
      setGridMode(mode);
      saveGridMode(mode);
    },
    [jump.mode, today, gridDisplay.weekStart],
  );

  const openHistory = useCallback(() => {
    feedback('selection');
    setPanel({ page: 'history', visible: true, deferGrid: true });
  }, []);
  const openSettings = useCallback(() => {
    feedback('selection');
    setPanel({ page: 'settings', visible: true, deferGrid: true });
  }, []);

  // v25: a habit's statistics layout, a preference outside History/Undo.
  const changeStatsLayout = useCallback(
    (habit: Habit, layout: StatsLayout | null) => {
      const change = statsLayoutChange(
        store.getSnapshot().replay.state,
        habit,
        layout,
      );
      if (change) store.change(change);
    },
    [store],
  );

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
    (edited: Habit): boolean => {
      const current = store.getSnapshot().replay.state.habits;
      const before = current.find((habit) => habit.id === edited.id) ?? null;
      // Notes are saved on their own (v23); a definition edit keeps whatever
      // older description the saved habit still has, unchanged.
      const { description: _description, ...rest } = edited;
      const after: Habit =
        before?.description !== undefined
          ? { ...rest, description: before.description }
          : rest;
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
  // Every note action is one ordinary undoable change, read against the
  // current store rather than the rendered habit.
  const applyNote = useCallback(
    (change: NoteChange | null): boolean => {
      if (!change || !editable) return false;
      const accepted = store.change(change);
      if (accepted) feedback('confirm');
      return accepted;
    },
    [store, editable],
  );
  const saveNoteText = useCallback(
    (
      target: {
        habitId: string;
        noteId: string;
        title: string;
        isNew: boolean;
      },
      text: string | undefined,
    ): boolean => {
      const state = store.getSnapshot().replay.state;
      if (target.isNew) {
        const added = applyNote(
          addNote(
            state,
            target.habitId,
            target.title,
            text ?? '',
            target.noteId,
          ),
        );
        if (added) setNoteId(target.noteId);
        return added;
      }
      const change = updateNote(state, target.habitId, target.noteId, {
        text: text ?? '',
      });
      if (change) return applyNote(change);
      // Unchanged text closes; a note removed meanwhile cannot be saved.
      const habit = state.habits.find((item) => item.id === target.habitId);
      return (
        !!habit &&
        habitNotes(state, habit).some((note) => note.id === target.noteId)
      );
    },
    [store, applyNote],
  );
  const restoreNoteVersion: NoteRestore = useCallback(
    (habitId, version) =>
      applyNote(
        restoreNote(store.getSnapshot().replay.state, habitId, version),
      ),
    [store, applyNote],
  );
  const closeNoteSheet = useCallback(() => setNoteSheet(null), []);
  const pickNoteTitle = useCallback(
    (title: string) => {
      if (!statsHabit || !noteSheet) return;
      if (noteSheet.kind === 'rename') {
        if (
          applyNote(
            updateNote(
              store.getSnapshot().replay.state,
              statsHabit.id,
              noteSheet.note.id,
              { title },
            ),
          )
        )
          setNoteSheet(null);
        return;
      }
      // A new note is written first and saved on Done, as one action.
      setNoteSheet(null);
      setNoteEditor({
        habitId: statsHabit.id,
        noteId: newNoteId(),
        title,
        isNew: true,
      });
    },
    [statsHabit, noteSheet, store, applyNote],
  );
  const removeShownNote = useCallback(
    (note: HabitNote) => {
      if (!statsHabit) return;
      const habitId = statsHabit.id;
      Alert.alert(
        `Remove the ${note.title} note?`,
        'Undo brings it back, and History keeps its text.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              if (
                applyNote(
                  removeNote(
                    store.getSnapshot().replay.state,
                    habitId,
                    note.id,
                  ),
                )
              )
                setNoteSheet(null);
            },
          },
        ],
      );
    },
    [statsHabit, store, applyNote],
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

  const closeStats = useCallback(() => {
    setStatsId(null);
    setNoteSheet(null);
    setNoteVersionsOpen(false);
  }, []);
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
      {noteEditor && editorHabit && (
        <DescriptionEditor
          key={`${noteEditor.habitId}:${noteEditor.noteId}`}
          title={editorHabit.name}
          subtitle={noteEditor.title}
          placeholder={noteHint(noteEditor.title)}
          colour={editorHabit.color}
          initialValue={
            noteEditor.isNew
              ? ''
              : (habitNotes(snapshot.replay.state, editorHabit).find(
                  (note) => note.id === noteEditor.noteId,
                )?.text ?? '')
          }
          draftKey={noteDraftKey(noteEditor.habitId, noteEditor.noteId)}
          temporary={sampleData}
          editable={editable}
          Heading={PreviewHeading}
          onClose={() => setNoteEditor(null)}
          onApply={(text) => saveNoteText(noteEditor, text)}
        />
      )}
      {noteVersionsOpen && statsHabit && shownNote && (
        <DescriptionVersions
          key={`${statsHabit.id}:${shownNote.id}`}
          habit={statsHabit}
          title={shownNote.title}
          text={shownNote.text}
          versions={versions}
          state={snapshot.replay.state}
          editable={editable}
          Heading={PreviewHeading}
          onRestore={restoreNoteVersion}
          onClose={() => setNoteVersionsOpen(false)}
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
          fillDates={editing.fill?.dates}
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
          fillDates={recording.fill?.dates}
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
        onRestoreNote={restoreNoteVersion}
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
        cellLook={cellLook}
        onCellLookChange={(kind, after) => {
          if (!editable) return;
          const before = store.getSnapshot().replay.state[kind] ?? null;
          if (store.change({ kind, before, after } as Change))
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
                        cellLook={gridDisplay.cellLook}
                        weekStart={gridDisplay.weekStart}
                        hideCompleted={gridDisplay.hideCompleted}
                        sampleData={sampleData}
                        mode={gridMode}
                        onModeChange={changeGridMode}
                        onWeekPress={showWeek}
                        startDay={jump.day}
                        DateButtonComponent={PreviewDateButton}
                        // Day and week columns (and Today's tiles) each start
                        // fresh; Grid and Compact share one mounted grid.
                        key={`${today}:${gridMode === 'compact' ? 'grid' : gridMode}`}
                        today={today}
                        habits={activeHabits}
                        editable={editable}
                        onHabitAction={habitAction}
                        onReorder={reorderHabits}
                        store={store}
                        onHabitPress={openDetails}
                        quickUndo={quickUndo}
                        onCellPress={pressCell}
                        onCellValue={recordValue}
                        onCellFill={fillCells}
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
                          initialTab={statsTab}
                          values={values}
                          events={snapshot.events}
                          actions={snapshot.replay.undo}
                          today={today}
                          Heading={PreviewHeading}
                          editable={editable}
                          onBack={closeStats}
                          onCellPress={pressCell}
                          notes={statsNotes}
                          note={shownNote}
                          onNoteSelect={(note) => setNoteId(note.id)}
                          onNoteAdd={() => setNoteSheet({ kind: 'add' })}
                          onNoteEdit={(note) =>
                            setNoteEditor({
                              habitId: statsHabit.id,
                              noteId: note.id,
                              title: note.title,
                              isNew: false,
                            })
                          }
                          onNoteVersions={
                            versions.length
                              ? () => setNoteVersionsOpen(true)
                              : undefined
                          }
                          onNoteActions={(note) =>
                            setNoteSheet({ kind: 'actions', note })
                          }
                          onEdit={editStats}
                          onGoalEdit={() => setGoalsId(statsHabit.id)}
                          statsLayout={
                            snapshot.replay.state.statsLayouts?.[
                              statsHabit.id
                            ] ?? null
                          }
                          onStatsLayout={(layout) =>
                            changeStatsLayout(statsHabit, layout)
                          }
                        />
                      </PerformanceBoundary>
                      {noteSheet && (
                        <NoteSheet
                          key={`${noteSheet.kind}:${noteSheet.kind === 'add' ? '' : noteSheet.note.id}`}
                          mode={noteSheet}
                          notes={statsNotes}
                          colour={theme.colour(statsHabit.color)}
                          onPick={pickNoteTitle}
                          onRename={(note) =>
                            setNoteSheet({ kind: 'rename', note })
                          }
                          onMove={(note, direction) =>
                            applyNote(
                              moveNote(
                                store.getSnapshot().replay.state,
                                statsHabit.id,
                                note.id,
                                direction,
                              ),
                            )
                          }
                          onRemove={removeShownNote}
                          onClose={closeNoteSheet}
                        />
                      )}
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
