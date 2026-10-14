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
import type { Habit } from '@onpurpose/core/habits';
import { toggleCheckboxValue } from '@onpurpose/core/habitGoals';
import { openStore } from './storage/openStore.ts';
import {
  HabitGrid,
  type CellLookStyle,
  type GridHandle,
} from './HabitGrid.tsx';
import { useToday } from './useToday.ts';

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

  const toggle = (habit: Habit, date: string) => {
    const before =
      store.getSnapshot().replay.state.values[`${habit.id}:${date}`];
    store.change({
      kind: 'entry',
      habitId: habit.id,
      date,
      before: before ?? null,
      after: toggleCheckboxValue(habit, before, date),
    });
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
        onToggle={toggle}
      />
      <footer className="hints">
        Space ticks · Arrow keys move · Ctrl Z undoes
      </footer>
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
    style.colorScheme = theme.scheme;
  }, [theme]);
}
