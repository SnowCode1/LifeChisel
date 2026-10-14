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
} from '@onpurpose/core/displayPreferences';
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
import { HabitPanel, type HabitTab } from './panel/HabitPanel.tsx';
import { habitType } from '@onpurpose/core/habits';
import { useToday } from './useToday.ts';
import { useHabitActions, MAX_HABITS } from './actions.ts';
import { EntryDialog, type EntryTarget } from './entry/EntryDialog.tsx';
import { QuickUndoToast } from './QuickUndoToast.tsx';

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
  if (openError) return <Notice text={openError} />;
  if (!store) return <Notice text="Opening…" />;
  return <Tracker store={store} />;
}

function Tracker({ store }: { store: ChangeStore }) {
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
  const [panel, setPanel] = useState<{ habitId: string; tab: HabitTab } | null>(
    null,
  );
  const openHabit = (habit: Habit) =>
    setPanel({
      habitId: habit.id,
      tab: habit.description ? 'notes' : 'statistics',
    });
  const handlers = useMemo<GridHandlers>(
    () => ({
      openHabit: (habit) =>
        setPanel({
          habitId: habit.id,
          tab: habit.description ? 'notes' : 'statistics',
        }),
      toggle: actions.toggle,
      openEntry: (habit, date, label, anchor) =>
        setEntry({ habit, date, label, anchor }),
      openMenu: (habit, anchor) => setMenu({ habit, anchor }),
      reorder: (ids) => void actions.reorder(ids),
      add: () =>
        setEditor({
          habit: {
            id: crypto.randomUUID(),
            name: '',
            color: '#82E6BC',
            type: 'checkbox',
            startDate: localDateKey(new Date()),
          },
          creating: true,
        }),
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
  const habits = useMemo(
    () => state.habits.filter((habit) => !habit.archived),
    [state.habits],
  );
  // The same saved cell look as the phone; the last four apply to boxes only.
  const cell = cellLookOf(state);
  const boxes =
    (state.checkboxStyle ?? displayDefaults.checkboxStyle) === 'boxes';
  const look = useMemo<CellLookStyle>(
    () => ({
      boxes,
      round: cell.roundCheckboxes,
      joined: cell.joinedCheckboxes,
      streaks: cell.streakNumbers,
      missed: cell.missedDays,
      connector: cell.connectorThickness / 100,
    }),
    [
      boxes,
      cell.roundCheckboxes,
      cell.joinedCheckboxes,
      cell.streakNumbers,
      cell.missedDays,
      cell.connectorThickness,
    ],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      // Text fields keep their own undo.
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) store.undo();
      else if (key === 'y' || (key === 'z' && event.shiftKey)) store.redo();
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
    ? habits.findIndex((habit) => habit.id === menu.habit.id)
    : -1;
  const panelHabit =
    panel &&
    state.habits.find((habit) => habit.id === panel.habitId && !habit.archived);
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
      const ids = habits.map((item) => item.id);
      const target = ids.indexOf(habit.id) + (action === 'moveUp' ? -1 : 1);
      grid.current?.focusHabit(habit.id);
      actions.reorder(moveHabit(ids, habit.id, target));
    }
  };
  return (
    <div className="app">
      <header className="top-bar">
        <span className="wordmark">OnPurpose</span>
        <button className="today" onClick={() => grid.current?.showToday()}>
          Today
        </button>
        <span className="actions">
          <button
            onClick={store.undo}
            disabled={!snapshot.replay.undo.length || !store.canEdit()}
          >
            Undo
          </button>
          <button
            onClick={store.redo}
            disabled={!snapshot.replay.redo.length || !store.canEdit()}
          >
            Redo
          </button>
        </span>
      </header>
      {snapshot.error && (
        <div className="save-error" role="alert">
          {snapshot.error}
          <button onClick={store.retry}>Retry</button>
        </div>
      )}
      <div className="workspace">
        <HabitGrid
          ref={grid}
          habits={habits}
          values={state.values}
          today={today}
          theme={theme}
          look={look}
          weekStart={state.weekStart ?? displayDefaults.weekStart}
          weekDividers={state.weekDividers ?? displayDefaults.weekDividers}
          editable={store.canEdit()}
          canAdd={state.habits.length < MAX_HABITS}
          on={handlers}
        />
        {panel && panelHabit && (
          <HabitPanel
            habit={panelHabit}
            tab={panel.tab}
            values={state.values}
            events={snapshot.events}
            actions={snapshot.replay.undo}
            today={today}
            weekStart={state.weekStart ?? displayDefaults.weekStart}
            theme={theme}
            editable={store.canEdit()}
            onTab={(tab) => setPanel({ habitId: panelHabit.id, tab })}
            onEdit={() => setEditor({ habit: panelHabit, creating: false })}
            onClose={() => setPanel(null)}
            onDay={panelDay}
          />
        )}
      </div>
      <footer className="hints">
        Space ticks · Enter opens a value · Arrow keys move · Alt ↑↓ reorders ·
        Ctrl Z undoes
      </footer>
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
          last={menuIndex === habits.length - 1}
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
          theme={theme}
          editable={store.canEdit()}
          onClose={() => setEditor(null)}
          onSave={actions.saveHabit}
        />
      )}
      <QuickUndoToast quickUndo={quickUndo} editable={store.canEdit()} />
    </div>
  );
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
    style.setProperty('--row-highlight', theme.overlay(0.05));
    style.setProperty('--accent', theme.accent);
    style.setProperty('--danger', theme.danger);
    style.setProperty('--accent-text', theme.accentText);
    style.setProperty('--surface', theme.ink(0x10));
    style.setProperty('--surface-raised', theme.ink(0x1c));
    style.setProperty('--surface-edge', theme.ink(0x2a));
    style.setProperty('--scrim', theme.scrim(0x66));
    style.colorScheme = theme.scheme;
  }, [theme]);
}
