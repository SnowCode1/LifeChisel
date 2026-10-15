import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import {
  cellLookOf,
  displayDefaults,
  effectiveColumnSpacing,
} from '@onpurpose/core/displayPreferences';
import { gridSizing } from '@onpurpose/core/gridSizing';
import { useGridSizes } from './grid/gridSizes.ts';
import { themeFor, type Theme } from '@onpurpose/core/theme';
import { createQuickUndo } from '@onpurpose/core/quickUndo';
import { localDateKey } from '@onpurpose/core/calendar';
import { openStore } from './storage/openStore.ts';
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
import { NotesEditor } from './notes/NotesEditor.tsx';
import { NoteVersions } from './notes/NoteVersions.tsx';
import type { HistoryAction } from '@onpurpose/core/storage/model';
import { HabitDetails } from './panel/HabitDetails.tsx';
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
import { Sidebar } from './Sidebar.tsx';
import { LANDING_URL } from './config.ts';
import { Shortcuts } from './Shortcuts.tsx';
import type { SettingsPage } from './settings/Settings.tsx';

export function App() {
  const [store, setStore] = useState<ChangeStore | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  useEffect(() => {
    openStore().then(setStore, (error: unknown) =>
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
      sampleData={sample.enabled}
      onSampleData={sample.available ? sample.setEnabled : undefined}
    />
  );
}

/**
 * Development only: six months of fictional history in a separate in-memory
 * store (the phone's sample data), so the grid and statistics can be tried
 * without touching saved data. `?sample` in the address turns it on.
 * Production builds drop this code, since import.meta.env.DEV is false.
 */
function useSampleData() {
  const available = import.meta.env.DEV;
  const [enabled, setEnabledState] = useState(
    () => available && new URLSearchParams(location.search).has('sample'),
  );
  const [store, setStore] = useState<ChangeStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!available || !enabled || store) return;
    let active = true;
    import('@onpurpose/core/dev/sampleData')
      .then(({ createSampleStore }) =>
        createSampleStore(localDateKey(new Date())),
      )
      .then(
        (value) => active && setStore(value),
        () => active && setError('Sample data could not be opened.'),
      );
    return () => {
      active = false;
    };
  }, [available, enabled, store]);
  const setEnabled = (value: boolean) => {
    const url = new URL(location.href);
    if (value) url.searchParams.set('sample', '');
    else url.searchParams.delete('sample');
    history.replaceState(null, '', url.toString().replace('sample=', 'sample'));
    // Each visit starts the sample history afresh.
    if (!value) setStore(null);
    setError(null);
    setEnabledState(value);
  };
  return { available, enabled, store, error, setEnabled };
}

function Tracker({
  store,
  sampleData,
  onSampleData,
}: {
  store: ChangeStore;
  sampleData: boolean;
  onSampleData?: (value: boolean) => void;
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
  const openHabit = (habit: Habit) => setDetailsId(habit.id);
  const handlers = useMemo<GridHandlers>(
    () => ({
      openHabit: (habit) => setDetailsId(habit.id),
      toggle: actions.toggle,
      openEntry: (habit, date, label, anchor) =>
        setEntry({ habit, date, label, anchor }),
      openMenu: (habit, anchor) => setMenu({ habit, anchor }),
      reorder: (ids) => void actions.reorder(ids),
      add: newHabit,
    }),
    [actions],
  );
  const theme = themeFor(
    state.themeMode ?? displayDefaults.themeMode,
    prefersDark ? 'dark' : 'light',
    state.darkBackground ?? displayDefaults.darkBackground,
    state.lightBackground ?? displayDefaults.lightBackground,
  );
  useThemeVariables(theme);
  useGridSizes(gridSizing(state, effectiveColumnSpacing(state)));
  const [away, setAway] = useState(false);
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
  const [notesHabitId, setNotesHabitId] = useState<string | null>(null);
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
  // Notes change only the description of the habit's current definition.
  const setDescription = (id: string, description: string | undefined) => {
    const current = state.habits.find((habit) => habit.id === id);
    if (!current) return false;
    const { description: _description, ...rest } = current;
    return actions.saveHabit({
      ...rest,
      ...(description ? { description } : {}),
    });
  };
  const notesHabit = notesHabitId
    ? state.habits.find((habit) => habit.id === notesHabitId)
    : undefined;
  const goalHabit = goalHabitId
    ? state.habits.find((habit) => habit.id === goalHabitId)
    : undefined;
  const detailsHabit = detailsId
    ? state.habits.find((habit) => habit.id === detailsId && !habit.archived)
    : undefined;
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
        sampleData={sampleData}
        onSampleData={onSampleData}
        onToggleCollapsed={() => setCollapsed(!collapsed)}
        onAdd={newHabit}
        onHistory={toggleHistory}
        onArchived={() => setSettingsPage('archived')}
        onSettings={() => setSettingsPage('appearance')}
        onBackups={() => setSettingsPage('backups')}
        onShortcuts={() => setShortcutsOpen(true)}
      />
      <main className="main">
        <header className="top-bar">
          <a className="wordmark" href={LANDING_URL}>
            {sampleData ? 'Sample data' : 'OnPurpose'}
          </a>
          <button
            className="today"
            aria-label="Today"
            onClick={() => grid.current?.showToday()}
          >
            {away ? 'Today →' : 'Today'}
          </button>
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
          <HabitGrid
            ref={grid}
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
          {panel?.kind === 'history' && (
            <PanelResizer
              width={panelWidth.width}
              onWidth={panelWidth.setWidth}
            />
          )}
          {panel?.kind === 'history' && (
            <HistoryPanel
              snapshot={snapshot}
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
              habit={detailsHabit}
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
              onEditNotes={() => setNotesHabitId(detailsHabit.id)}
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
          key={`${entry.habit.id}:${entry.date}`}
          target={{ ...entry, habit: entryHabit }}
          value={state.values[`${entry.habit.id}:${entry.date}`]}
          values={state.values}
          theme={theme}
          editable={store.canEdit()}
          onClose={() => setEntry(null)}
          onSave={(value) => actions.saveEntry(entryHabit, entry.date, value)}
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
      {notesHabit && (
        <NotesEditor
          key={notesHabit.id}
          title={notesHabit.name}
          colour={theme.colour(notesHabit.color)}
          initial={notesHabit.description ?? ''}
          theme={theme}
          editable={store.canEdit()}
          onClose={() => setNotesHabitId(null)}
          onApply={(description) => setDescription(notesHabit.id, description)}
        />
      )}
      {noteAction && noteAction.change.kind === 'habit' && (
        <NoteVersions
          action={noteAction}
          theme={theme}
          editable={store.canEdit()}
          canRestore={state.habits.some(
            (habit) =>
              noteAction.change.kind !== 'order' &&
              habit.id === noteAction.change.habitId,
          )}
          onClose={() => setNoteAction(null)}
          onRestore={(description) =>
            noteAction.change.kind === 'habit' &&
            setDescription(noteAction.change.habitId, description)
          }
        />
      )}
      {shortcutsOpen && <Shortcuts onClose={() => setShortcutsOpen(false)} />}
      {settingsPage && (
        <Settings
          initialPage={settingsPage}
          sampleData={sampleData}
          store={store}
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
