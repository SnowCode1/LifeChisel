import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import type { SamplePresetInfo } from '@onpurpose/core/dev/samplePresets';
import {
  cellLookOf,
  displayDefaults,
  effectiveColumnSpacing,
} from '@onpurpose/core/displayPreferences';
import { gridSizing } from '@onpurpose/core/gridSizing';
import { useGridSizes } from './grid/gridSizes.ts';
import { themeFor, type Theme } from '@onpurpose/core/theme';
import { createQuickUndo } from '@onpurpose/core/quickUndo';
import { dateRangeLabel, localDateKey } from '@onpurpose/core/calendar';
import type { FillChange } from './grid/fillWave.ts';
import { openStore } from './storage/openStore.ts';
import type { SyncController } from './sync/controller.ts';
import { ApprovalPrompt } from './sync/ApprovalPrompt.tsx';
import {
  HabitGrid,
  type CellLookStyle,
  type GridHandle,
  type GridHandlers,
} from './grid/HabitGrid.tsx';
import type { Habit } from '@onpurpose/core/habits';
import { moveHabit } from '@onpurpose/core/habitOrdering';
import { habitTrackingStart } from '@onpurpose/core/statistics';
import { HabitMenu, type HabitMenuAction } from './habits/HabitMenu.tsx';
import { HabitEditor } from './habits/HabitEditor.tsx';
import { GoalEditor } from './habits/GoalEditor.tsx';
import { NoteVersions } from './notes/NoteVersions.tsx';
import type { HistoryAction } from '@onpurpose/core/storage/model';
import {
  addNote,
  habitNotes,
  moveNoteTo,
  newNoteId,
  noteVersions,
  removeNote,
  restoreNote,
  updateNote,
  type HabitNote,
  type NoteChange,
} from '@onpurpose/core/notes';
import { HabitDetails, type HabitView } from './panel/HabitDetails.tsx';
import { HistoryPanel } from './panel/HistoryPanel.tsx';
import { PanelResizer, usePanelWidth } from './panel/PanelResizer.tsx';
import { Icon } from './ui/Icon.tsx';
import { habitType } from '@onpurpose/core/habits';
import { useToday } from './useToday.ts';
import { useHiddenCompleted } from './useHiddenCompleted.ts';
import { Settings } from './settings/Settings.tsx';
import { useHabitActions, MAX_HABITS } from './actions.ts';
import { EntryDialog, type EntryTarget } from './entry/EntryDialog.tsx';
import { QuickUndoToast } from './QuickUndoToast.tsx';
import { Sidebar, type SamplePresetChoice } from './Sidebar.tsx';
import { ModeMenu, useGridMode } from './ModeMenu.tsx';
import { WeekGrid } from './grid/WeekGrid.tsx';
import { TodayTiles } from './grid/TodayTiles.tsx';
import type { GridMode } from '@onpurpose/core/gridModes';
import { weekJumpDay } from '@onpurpose/core/weekSummary';
import { Shortcuts } from './Shortcuts.tsx';
import type { SettingsPage } from './settings/Settings.tsx';

export function App() {
  const [store, setStore] = useState<ChangeStore | null>(null);
  const [sync, setSync] = useState<SyncController | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  useEffect(() => {
    openStore().then(
      (opened) => {
        setStore(opened);
        // Sync copies the saved log in the background (docs/SYNC.md); its
        // code loads after the grid, never in the way of opening it.
        // A failed load (a dropped connection, or a development server
        // restarted under an open tab) is retried once, then shown in
        // Settings → Sync rather than hiding sync silently.
        const load = () => import('./sync/controller.ts');
        void load()
          .catch(() => new Promise((wait) => setTimeout(wait, 2000)).then(load))
          .then(({ SyncController }) => {
            const controller = new SyncController(opened);
            setSync(controller);
            void controller.init();
          })
          .catch(() => setSyncFailed(true));
      },
      (error: unknown) =>
        setOpenError(
          error instanceof Error ? error.message : 'Saved data could not open.',
        ),
    );
  }, []);
  const sample = useSampleData();
  if (openError) return <Notice text={openError} />;
  if (!store) return <Notice text="Opening…" />;
  if (sample.enabled && !sample.store)
    return <Notice text={sample.error ?? 'Preparing sample history…'} />;
  return (
    <Tracker
      key={sample.enabled ? 'sample' : 'real'}
      store={sample.enabled ? sample.store! : store}
      sync={sample.enabled ? null : sync}
      syncFailed={!sample.enabled && syncFailed}
      sampleData={sample.enabled}
      onSampleData={sample.available ? sample.setEnabled : undefined}
      samplePreset={
        sample.presets.length
          ? {
              value: sample.preset ?? '',
              options: sample.presets,
              onChange: sample.setPreset,
            }
          : undefined
      }
    />
  );
}

/**
 * Development only: six months of fictional history in a separate in-memory
 * store (the phone's sample data), so the grid and statistics can be tried
 * without touching saved data. `?sample` in the address turns on the
 * development set and `?sample=athlete` (any id in samplePresets.ts) one of
 * the marketing presets. Production builds drop this code, since
 * import.meta.env.DEV is false.
 */
function useSampleData() {
  const available = import.meta.env.DEV;
  // null is off, '' the development set, otherwise a preset id.
  const [preset, setPresetState] = useState<string | null>(() =>
    available ? new URLSearchParams(location.search).get('sample') : null,
  );
  const [store, setStore] = useState<ChangeStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<SamplePresetInfo[]>([]);
  useEffect(() => {
    if (!available) return;
    let active = true;
    void import('@onpurpose/core/dev/samplePresets').then(
      ({ samplePresetList }) => active && setPresets(samplePresetList),
    );
    return () => {
      active = false;
    };
  }, [available]);
  useEffect(() => {
    if (!available || preset === null || store) return;
    let active = true;
    import('@onpurpose/core/dev/sampleData')
      .then(({ createSampleStore }) =>
        createSampleStore(localDateKey(new Date()), preset || undefined),
      )
      .then(
        (value) => active && setStore(value),
        () => active && setError('Sample data could not be opened.'),
      );
    return () => {
      active = false;
    };
  }, [available, preset, store]);
  const setPreset = (value: string | null) => {
    const url = new URL(location.href);
    if (value === null) url.searchParams.delete('sample');
    else url.searchParams.set('sample', value);
    history.replaceState(
      null,
      '',
      url.toString().replace(/([?&]sample)=(?=&|#|$)/, '$1'),
    );
    // Each visit or choice starts the sample history afresh.
    setStore(null);
    setError(null);
    setPresetState(value);
  };
  return {
    available,
    enabled: preset !== null,
    preset,
    presets,
    store,
    error,
    setPreset,
    setEnabled: (value: boolean) => setPreset(value ? '' : null),
  };
}

function Tracker({
  store,
  sync,
  syncFailed,
  sampleData,
  onSampleData,
  samplePreset,
}: {
  store: ChangeStore;
  sync: SyncController | null;
  syncFailed: boolean;
  sampleData: boolean;
  onSampleData?: (value: boolean) => void;
  samplePreset?: SamplePresetChoice;
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const state = snapshot.replay.state;
  const today = useToday();
  const prefersDark = usePrefersDark();
  const grid = useRef<GridHandle>(null);
  const [quickUndo] = useState(() => createQuickUndo(store));
  useEffect(() => () => quickUndo.dispose(), [quickUndo]);
  const actions = useHabitActions(store, quickUndo);
  const [entry, setEntry] = useState<EntryTarget | null>(null);
  const [menu, setMenu] = useState<{
    habit: Habit;
    anchor: HTMLElement;
  } | null>(null);
  const [editor, setEditor] = useState<{
    habit: Habit;
    creating: boolean;
  } | null>(null);
  // History docks beside the grid; a habit's Notes and Statistics open in a
  // wide dialog over it.
  const [panel, setPanel] = useState<{ kind: 'history' } | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  // The note shown in a habit's Notes view (the first by default).
  const [detailsNoteId, setDetailsNoteId] = useState<string | null>(null);
  // The view a habit's page opens on, when chosen (a Today tile's buttons).
  const [detailsView, setDetailsView] = useState<HabitView | undefined>();
  const showHabit = (id: string, view?: HabitView) => {
    setDetailsId(id);
    setDetailsNoteId(null);
    setDetailsView(view);
  };
  const newHabit = () =>
    setEditor({
      habit: {
        id: crypto.randomUUID(),
        name: '',
        color: '#82E6BC',
        type: 'checkbox',
        startDate: localDateKey(new Date()),
      },
      creating: true,
    });
  const openHabit = (habit: Habit) => showHabit(habit.id);
  const handlers = useMemo<GridHandlers>(
    () => ({
      openHabit: (habit, view) => showHabit(habit.id, view),
      toggle: actions.toggle,
      saveValue: actions.saveEntry,
      openEntry: (habit, date, label, anchor) =>
        setEntry({ habit, date, label, anchor }),
      closeEntry: () => setEntry(null),
      fillChecks: (habit, dates, toggleStart) =>
        actions.fillChecks(habit, dates, toggleStart) || null,
      // A value fill opens the entry popover for the run, prefilled with the
      // start day's value.
      openFill: (habit, dates, anchor, done) =>
        setEntry({
          habit,
          date: dates[0],
          label: dateRangeLabel(dates),
          anchor,
          fill: { dates, done },
        }),
      openMenu: (habit, anchor) => setMenu({ habit, anchor }),
      reorder: (ids) => void actions.reorder(ids),
      add: newHabit,
    }),
    [actions],
  );
  // A fill's popover tells the grid what it applied (or null) as it closes,
  // so the run stays highlighted until then.
  const fillApplied = useRef<FillChange | null>(null);
  useEffect(() => {
    const fill = entry?.fill;
    if (!fill) return;
    fillApplied.current = null;
    return () => fill.done(fillApplied.current);
  }, [entry]);
  const theme = themeFor(
    state.themeMode ?? displayDefaults.themeMode,
    prefersDark ? 'dark' : 'light',
    state.darkBackground ?? displayDefaults.darkBackground,
    state.lightBackground ?? displayDefaults.lightBackground,
  );
  useThemeVariables(theme);
  useGridSizes(gridSizing(state, effectiveColumnSpacing(state)));
  const [away, setAway] = useState(false);
  // The view is this browser's own choice, outside the change log.
  const [mode, saveMode] = useGridMode();
  // Where a day grid opens: a week chosen in Weeks mode, otherwise Today.
  const [jump, setJump] = useState<{ ago: number; mode: GridMode }>({
    ago: 0,
    mode: 'grid',
  });
  const changeMode = (next: GridMode) => {
    setAway(false);
    saveMode(next);
    setJump((current) => ({
      ago: 0,
      mode: next === 'grid' || next === 'compact' ? next : current.mode,
    }));
  };
  const weekStart = state.weekStart ?? displayDefaults.weekStart;
  // A week opens in the day grid last used (Grid or Compact).
  const showWeek = (weeksAgo: number) => {
    setAway(false);
    setJump({ ago: weekJumpDay(today, weekStart, weeksAgo), mode: jump.mode });
    saveMode(jump.mode);
  };
  const panelWidth = usePanelWidth();
  const habits = useMemo(
    () => state.habits.filter((habit) => !habit.archived),
    [state.habits],
  );
  // Hide completed today filters only displayed rows; hidden and archived
  // habits keep their saved slots when rows are reordered.
  const hideCompleted = state.hideCompleted ?? displayDefaults.hideCompleted;
  const [showCompleted, setShowCompleted] = useState(false);
  const hidden = useHiddenCompleted(
    habits,
    state.values,
    today,
    hideCompleted && !showCompleted,
  );
  const hiddenKey = [...hidden].join('|');
  const rows = useMemo(
    () =>
      hiddenKey
        ? habits.filter((habit) => !hiddenKey.split('|').includes(habit.id))
        : habits,
    [habits, hiddenKey],
  );
  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [collapsed, setCollapsed] = useStoredFlag('onpurpose.sidebarCollapsed');
  const [goalHabitId, setGoalHabitId] = useState<string | null>(null);
  const [noteAction, setNoteAction] = useState<HistoryAction | null>(null);
  // The same saved cell look as the phone; the last four apply to boxes only.
  const cell = cellLookOf(state);
  const boxes =
    (state.checkboxStyle ?? displayDefaults.checkboxStyle) === 'boxes';
  const animate = state.tapAnimations ?? displayDefaults.tapAnimations;
  const look = useMemo<CellLookStyle>(
    () => ({
      boxes,
      round: cell.roundCheckboxes,
      joined: cell.joinedCheckboxes,
      endsOnly: cell.joinedEndsOnly,
      streaks: cell.streakNumbers,
      missed: cell.missedDays,
      connector: cell.connectorThickness / 100,
      animate: animate,
    }),
    [
      animate,
      boxes,
      cell.roundCheckboxes,
      cell.joinedCheckboxes,
      cell.joinedEndsOnly,
      cell.streakNumbers,
      cell.missedDays,
      cell.connectorThickness,
    ],
  );
  // Global keys. Text fields keep their own undo and typing; single-letter
  // keys work only while no dialog is open.
  const toggleHistory = () =>
    setPanel((current) =>
      current?.kind === 'history' ? null : { kind: 'history' },
    );
  const keys = useRef({ newHabit, toggleHistory });
  useEffect(() => {
    keys.current = { newHabit, toggleHistory };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]'))
        return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' && !event.shiftKey) store.undo();
        else if (key === 'y' || (key === 'z' && event.shiftKey)) store.redo();
        else return;
        event.preventDefault();
        return;
      }
      if (event.altKey || document.querySelector('dialog[open]')) return;
      if (key === 't') grid.current?.showToday();
      else if (key === 'n') {
        if (store.canEdit()) keys.current.newHabit();
      } else if (key === 'h') keys.current.toggleHistory();
      else if (event.key === '?') setShortcutsOpen(true);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);
  if (snapshot.status === 'loading') return <Notice text="Opening…" />;
  if (snapshot.status === 'load-error')
    return <Notice text={snapshot.error ?? 'Saved data could not open.'} />;

  // The entry editor follows the current definition (new categories appear).
  const entryHabit =
    entry && state.habits.find((habit) => habit.id === entry.habit.id);
  const menuIndex = menu
    ? rows.findIndex((habit) => habit.id === menu.habit.id)
    : -1;
  // Each note action is one ordinary undoable change, read against the
  // current store rather than the rendered page.
  const current = () => store.getSnapshot().replay.state;
  const applyNote = (change: NoteChange | null) =>
    !!change && store.canEdit() && store.change(change);
  const restoreNoteVersion = (habitId: string, version: HabitNote) =>
    applyNote(restoreNote(current(), habitId, version));
  const goalHabit = goalHabitId
    ? state.habits.find((habit) => habit.id === goalHabitId)
    : undefined;
  const detailsHabit = detailsId
    ? state.habits.find((habit) => habit.id === detailsId && !habit.archived)
    : undefined;
  const detailsNotes = detailsHabit ? habitNotes(state, detailsHabit) : [];
  const detailsNote =
    detailsNotes.find((note) => note.id === detailsNoteId) ?? detailsNotes[0];
  const detailsVersions =
    detailsHabit && detailsNote
      ? noteVersions(snapshot.replay.undo, detailsHabit.id, detailsNote.id)
      : [];
  // Calendar days in the panel tick checkboxes or open the entry popover.
  const panelDay = (
    habit: Habit,
    date: string,
    label: string,
    anchor: HTMLElement,
  ) => {
    if (habitType(habit) === 'checkbox') actions.toggle(habit, date);
    else setEntry({ habit, date, label, anchor });
  };
  const menuAction = (habit: Habit, action: HabitMenuAction) => {
    if (action === 'details') openHabit(habit);
    else if (action === 'edit') setEditor({ habit, creating: false });
    else if (action === 'archive')
      actions.saveHabit({ ...habit, archived: true });
    else {
      const ids = rows.map((item) => item.id);
      const target = ids.indexOf(habit.id) + (action === 'moveUp' ? -1 : 1);
      grid.current?.focusHabit(habit.id);
      actions.reorder(moveHabit(ids, habit.id, target));
    }
  };
  return (
    <div className="app">
      <Sidebar
        collapsed={collapsed}
        habitCount={habits.length}
        archivedCount={state.habits.length - habits.length}
        historyOpen={panel?.kind === 'history'}
        canAdd={store.canEdit() && state.habits.length < MAX_HABITS}
        saveError={!!snapshot.error}
        sync={sync}
        conflicts={snapshot.conflicts.length}
        sampleData={sampleData}
        onSampleData={onSampleData}
        samplePreset={samplePreset}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
        onAdd={newHabit}
        onHistory={toggleHistory}
        onArchived={() => setSettingsPage('archived')}
        onSettings={() => setSettingsPage('appearance')}
        onBackups={() => setSettingsPage(sync ? 'sync' : 'backups')}
        onShortcuts={() => setShortcutsOpen(true)}
      />
      <main className="main">
        <header className="top-bar">
          <ModeMenu mode={mode} sampleData={sampleData} onChange={changeMode} />
          {mode === 'today' ? (
            <span />
          ) : (
            <button
              className="today"
              aria-label={mode === 'weeks' ? 'This week' : 'Today'}
              onClick={() => grid.current?.showToday()}
            >
              {mode === 'weeks'
                ? away
                  ? 'This week →'
                  : 'This week'
                : away
                  ? 'Today →'
                  : 'Today'}
            </button>
          )}
          <span className="actions">
            <button
              aria-pressed={panel?.kind === 'history'}
              onClick={toggleHistory}
            >
              <Icon name="history" size={19} />
              <span className="label">History</span>
            </button>
            <button
              aria-haspopup="dialog"
              aria-label="Settings"
              onClick={() => setSettingsPage('appearance')}
            >
              <Icon name="settings" size={19} />
              <span className="label">Settings</span>
            </button>
          </span>
        </header>
        {snapshot.error && (
          <div className="save-error" role="alert">
            {snapshot.error}
            <button onClick={store.retry}>Retry</button>
          </div>
        )}
        <div className="workspace" style={panelWidth.style}>
          {mode === 'today' ? (
            <TodayTiles
              habits={rows}
              values={state.values}
              notes={state.notes}
              today={today}
              theme={theme}
              look={look}
              editable={store.canEdit()}
              canAdd={state.habits.length < MAX_HABITS}
              on={handlers}
            />
          ) : mode === 'weeks' ? (
            <WeekGrid
              ref={grid}
              habits={rows}
              values={state.values}
              today={today}
              theme={theme}
              weekStart={weekStart}
              weekDividers={state.weekDividers ?? displayDefaults.weekDividers}
              missed={look.missed}
              onWeek={showWeek}
              onOpenHabit={openHabit}
              onOpenMenu={handlers.openMenu}
              onAwayFromToday={setAway}
            />
          ) : (
            <HabitGrid
              ref={grid}
              compact={mode === 'compact'}
              startAgo={jump.ago}
              habits={rows}
              values={state.values}
              today={today}
              theme={theme}
              look={look}
              weekStart={state.weekStart ?? displayDefaults.weekStart}
              weekDividers={state.weekDividers ?? displayDefaults.weekDividers}
              editable={store.canEdit()}
              canAdd={state.habits.length < MAX_HABITS}
              on={handlers}
              onAwayFromToday={setAway}
            />
          )}
          {panel?.kind === 'history' && (
            <PanelResizer
              width={panelWidth.width}
              onWidth={panelWidth.setWidth}
            />
          )}
          {panel?.kind === 'history' && (
            <HistoryPanel
              snapshot={snapshot}
              store={store}
              today={today}
              weekStart={state.weekStart ?? displayDefaults.weekStart}
              theme={theme}
              editable={store.canEdit()}
              onUndo={store.undo}
              onRedo={store.redo}
              onClose={() => setPanel(null)}
              onOpenNote={setNoteAction}
            />
          )}
          {detailsHabit && (
            <HabitDetails
              key={detailsHabit.id}
              habit={detailsHabit}
              initialView={detailsView}
              values={state.values}
              events={snapshot.events}
              actions={snapshot.replay.undo}
              today={today}
              weekStart={state.weekStart ?? displayDefaults.weekStart}
              theme={theme}
              editable={store.canEdit()}
              onEdit={() => setEditor({ habit: detailsHabit, creating: false })}
              onClose={() => setDetailsId(null)}
              onDay={panelDay}
              onEditGoal={() => setGoalHabitId(detailsHabit.id)}
              statsLayout={state.statsLayouts?.[detailsHabit.id] ?? null}
              onStatsLayout={(layout) =>
                actions.setStatsLayout(detailsHabit, layout)
              }
              notes={detailsNotes}
              note={detailsNote}
              versions={detailsVersions}
              onSelectNote={(note) => setDetailsNoteId(note.id)}
              onCreateNote={(title, text) => {
                const noteId = newNoteId();
                const added = applyNote(
                  addNote(current(), detailsHabit.id, title, text, noteId),
                );
                if (added) setDetailsNoteId(noteId);
                return added;
              }}
              onSaveNote={(note, text) => {
                const change = updateNote(current(), detailsHabit.id, note.id, {
                  text,
                });
                // Unchanged words close; a note removed meanwhile cannot save.
                return change
                  ? applyNote(change)
                  : habitNotes(current(), detailsHabit).some(
                      (item) => item.id === note.id,
                    );
              }}
              onRenameNote={(note, title) =>
                applyNote(
                  updateNote(current(), detailsHabit.id, note.id, { title }),
                )
              }
              onMoveNote={(note, index) => {
                for (const change of moveNoteTo(
                  current(),
                  detailsHabit.id,
                  note.id,
                  index,
                ))
                  if (!applyNote(change)) break;
              }}
              onRemoveNote={(note) => {
                if (
                  window.confirm(
                    `Remove the ${note.title} note?\n\nUndo brings it back, and History keeps its text.`,
                  )
                )
                  applyNote(removeNote(current(), detailsHabit.id, note.id));
              }}
              onOpenVersion={setNoteAction}
            />
          )}
        </div>
        {hideCompleted && (hidden.size > 0 || showCompleted) && (
          <footer className="hints">
            {showCompleted
              ? 'Showing completed habits'
              : `${hidden.size} completed today hidden`}{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => setShowCompleted((value) => !value)}
            >
              {showCompleted ? 'Hide' : 'Show'}
            </button>
          </footer>
        )}
      </main>
      {entry && entryHabit && (
        <EntryDialog
          key={`${entry.habit.id}:${entry.date}${entry.fill ? ':fill' : ''}`}
          target={{ ...entry, habit: entryHabit }}
          value={state.values[`${entry.habit.id}:${entry.date}`]}
          values={state.values}
          theme={theme}
          editable={store.canEdit()}
          onClose={() => setEntry(null)}
          onSave={(value) => {
            if (!entry.fill)
              return actions.saveEntry(entryHabit, entry.date, value);
            const applied = actions.fillValues(
              entryHabit,
              entry.fill.dates,
              value,
            );
            if (applied === false) return false;
            fillApplied.current = applied;
            return true;
          }}
          onAddCategories={(added) =>
            actions.addCategories(entryHabit.id, added)
          }
        />
      )}
      {menu && menuIndex >= 0 && (
        <HabitMenu
          habit={menu.habit}
          anchor={menu.anchor}
          colour={theme.colour(menu.habit.color)}
          first={menuIndex === 0}
          last={menuIndex === rows.length - 1}
          onClose={() => setMenu(null)}
          onAction={(action) => menuAction(menu.habit, action)}
        />
      )}
      {editor && (
        <HabitEditor
          key={editor.habit.id}
          habit={editor.habit}
          creating={editor.creating}
          initialStartDate={habitTrackingStart(
            editor.habit,
            state.values,
            snapshot.events,
            today,
          )}
          today={today}
          weekStart={state.weekStart ?? displayDefaults.weekStart}
          theme={theme}
          editable={store.canEdit()}
          onClose={() => setEditor(null)}
          onSave={actions.saveHabit}
        />
      )}
      {goalHabit && (
        <GoalEditor
          habit={goalHabit}
          today={today}
          weekStart={state.weekStart ?? displayDefaults.weekStart}
          creating={false}
          editable={store.canEdit()}
          theme={theme}
          onClose={() => setGoalHabitId(null)}
          onApply={(goals) => {
            const { goals: _goals, ...base } = goalHabit;
            return actions.saveHabit({ ...base, ...(goals ? { goals } : {}) });
          }}
        />
      )}
      {noteAction && (
        <NoteVersions
          action={noteAction}
          state={state}
          theme={theme}
          editable={store.canEdit()}
          onClose={() => setNoteAction(null)}
          onRestore={restoreNoteVersion}
        />
      )}
      {shortcutsOpen && <Shortcuts onClose={() => setShortcutsOpen(false)} />}
      {settingsPage && (
        <Settings
          initialPage={settingsPage}
          sampleData={sampleData}
          store={store}
          sync={sync}
          syncFailed={syncFailed}
          onReviewConflicts={() => {
            setSettingsPage(null);
            setPanel({ kind: 'history' });
          }}
          snapshot={snapshot}
          theme={theme}
          look={look}
          cellLook={cell}
          today={today}
          editable={store.canEdit()}
          actions={actions}
          onClose={() => setSettingsPage(null)}
        />
      )}
      <QuickUndoToast quickUndo={quickUndo} editable={store.canEdit()} />
      {sync && <ApprovalPrompt sync={sync} />}
    </div>
  );
}

// A per-browser convenience (like a remembered tab), never app data.
function useStoredFlag(key: string) {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) === 'true';
    } catch {
      return false;
    }
  });
  const set = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem(key, String(next));
    } catch {
      // Private windows may refuse storage; the choice lasts this visit.
    }
  };
  return [value, set] as const;
}

function Notice({ text }: { text: string }) {
  return (
    <p className="notice" role="status">
      {text}
    </p>
  );
}

function usePrefersDark() {
  return useSyncExternalStore(
    (listener) => {
      const query = matchMedia('(prefers-color-scheme: dark)');
      query.addEventListener('change', listener);
      return () => query.removeEventListener('change', listener);
    },
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );
}

// The shared theme derives every colour from one background, as on the phone.
function useThemeVariables(theme: Theme) {
  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty('--background', theme.background);
    style.setProperty('--ink', theme.ink(0xe8));
    style.setProperty('--ink-strong', theme.ink(0xff));
    style.setProperty('--ink-soft', theme.ink(0xb8));
    style.setProperty('--ink-quiet', theme.ink(0x97));
    style.setProperty('--ink-hint', theme.ink(0x70));
    style.setProperty('--rule', theme.ink(0x1c));
    style.setProperty('--today-pill', theme.ink(0x19));
    style.setProperty('--today-edge', theme.ink(0x26));
    style.setProperty('--week-shade', theme.ink(0x0c));
    style.setProperty('--row-highlight', theme.overlay(0x0d));
    style.setProperty('--fill-highlight', theme.overlay(0x1f));
    style.setProperty('--accent', theme.accent);
    style.setProperty('--danger', theme.danger);
    style.setProperty('--accent-text', theme.accentText);
    style.setProperty('--surface', theme.ink(0x10));
    style.setProperty('--sidebar', theme.ink(0x07));
    style.setProperty('--scroll-thumb', theme.overlay(0x38));
    style.setProperty('--scroll-thumb-active', theme.overlay(0x70));
    style.setProperty('--surface-raised', theme.ink(0x1c));
    style.setProperty('--surface-edge', theme.ink(0x2a));
    style.setProperty('--card-edge', theme.ink(0x20));
    style.setProperty('--scrim', theme.scrim(0x66));
    style.colorScheme = theme.scheme;
  }, [theme]);
}
