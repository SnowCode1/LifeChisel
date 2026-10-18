import {
  memo,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import {
  cellAccessibility,
  cellState,
  checkedStreak,
} from '@onpurpose/core/cellAccessibility';
import type { EntryValue, EntryValues } from '@onpurpose/core/entries';
import { ordinal } from '@onpurpose/core/goalTiming';
import {
  createGridPalette,
  type GridPalette,
} from '@onpurpose/core/gridAppearance';
import { habitInitial } from '@onpurpose/core/gridModes';
import { habitSummary } from '@onpurpose/core/habitSummary';
import { habitType, type Habit } from '@onpurpose/core/habits';
import { recentNumericTotals } from '@onpurpose/core/numericSuggestions';
import { habitNotes, type HabitNote } from '@onpurpose/core/notes';
import type { StoredState } from '@onpurpose/core/storage/model';
import type { Theme } from '@onpurpose/core/theme';
import {
  todayCount,
  todayCountLabel,
  todayStatus,
} from '@onpurpose/core/todaySummary';
import { HabitSymbol } from '../ui/HabitSymbol.tsx';
import { Icon } from '../ui/Icon.tsx';
import { CROSS, Glyph, TICK, fillOf } from './HabitRow.tsx';
import type { CellLookStyle, GridHandlers } from './types.ts';

// Today mode: one tile per habit, in the saved order, without date or name
// axes. A tile is the habit's name cell over its Today cell: the checkbox
// (drawn with the saved cell look) toggles, a blank number records in one
// tap from its usual totals, other types open the entry popover. Under the
// name sits the grid's line (schedule, rule or quota progress), and a habit
// not scheduled today dims. A slim row along the bottom holds a Notes button
// and a Statistics button that open the habit's page on that view (a trial,
// 18 October 2026; Notes is fainter while the habit has none). A right-click
// opens the actions.
export function TodayTiles({
  habits,
  values,
  notes,
  today,
  theme,
  look,
  editable,
  canAdd,
  on,
}: {
  habits: Habit[];
  values: EntryValues;
  notes: StoredState['notes'];
  today: string;
  theme: Theme;
  look: CellLookStyle;
  editable: boolean;
  canAdd: boolean;
  on: GridHandlers;
}) {
  const palettes = useMemo(
    () =>
      new Map(
        habits.map((habit) => [
          habit.id,
          createGridPalette(habit.color, theme),
        ]),
      ),
    [habits, theme],
  );
  const label = new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const count = todayCountLabel(todayCount(habits, values, today));
  const todayOrdinal = ordinal(today);
  // Per-habit value signatures: a tile redraws only when its own values do.
  const signatures = useMemo(() => {
    const parts = new Map<string, string[]>();
    for (const [key, value] of Object.entries(values)) {
      const split = key.lastIndexOf(':');
      const id = key.slice(0, split);
      let list = parts.get(id);
      if (!list) parts.set(id, (list = []));
      list.push(`${key.slice(split + 1)}=${JSON.stringify(value)}`);
    }
    return new Map([...parts].map(([id, list]) => [id, list.join(',')]));
  }, [values]);
  // One roving keyboard focus, as in the grid: arrows move between tiles
  // (up and down by a row of tiles), Home and End to the first and last.
  const area = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const focused = Math.min(focusIndex, Math.max(0, habits.length - 1));
  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.dataset?.tile === undefined) return;
    const tiles = [
      ...(area.current?.querySelectorAll<HTMLElement>('[data-tile]') ?? []),
    ];
    if (!tiles.length) return;
    const wrap = tiles.findIndex(
      (tile, index) => index > 0 && tile.offsetTop > tiles[0].offsetTop,
    );
    const perRow = wrap > 0 ? wrap : tiles.length;
    let index = Number(target.dataset.tile);
    if (event.key === 'ArrowRight') index += 1;
    else if (event.key === 'ArrowLeft') index -= 1;
    else if (event.key === 'ArrowDown') index += perRow;
    else if (event.key === 'ArrowUp') index -= perRow;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tiles.length - 1;
    else return;
    event.preventDefault();
    index = Math.max(0, Math.min(tiles.length - 1, index));
    setFocusIndex(index);
    tiles[index].focus();
  };
  return (
    <div className="today-area" ref={area}>
      <section className="today-tiles" aria-label={`Today, ${label}`}>
        <h2 className="today-date">
          {label}
          {count && <span className="today-count"> · {count}</span>}
        </h2>
        <div
          className="today-tile-grid"
          onKeyDown={onKeyDown}
          onFocus={(event) => {
            const tile = (event.target as HTMLElement).dataset?.tile;
            if (tile !== undefined) setFocusIndex(Number(tile));
          }}
        >
          {habits.map((habit, index) => (
            <TodayTile
              key={habit.id}
              habit={habit}
              index={index}
              value={values[`${habit.id}:${today}`]}
              values={values}
              notes={habitNotes({ notes }, habit)}
              signature={signatures.get(habit.id) ?? ''}
              today={today}
              todayOrdinal={todayOrdinal}
              palette={palettes.get(habit.id)!}
              look={look}
              editable={editable}
              focusable={index === focused}
              on={on}
            />
          ))}
        </div>
        {habits.length === 0 && (
          <p className="empty-grid">
            No habits yet. Add one to start tracking.
          </p>
        )}
        <button
          type="button"
          className="add-habit"
          disabled={!editable || !canAdd}
          onClick={on.add}
        >
          <Icon name="plus" size={18} />
          Add habit
        </button>
      </section>
    </div>
  );
}

type TileProps = {
  habit: Habit;
  index: number;
  value: EntryValue | undefined;
  /** Every saved value; the tile reads only its own habit's. */
  values: EntryValues;
  notes: readonly HabitNote[];
  /** Changes exactly when this habit's saved values change. */
  signature: string;
  today: string;
  todayOrdinal: number;
  palette: GridPalette;
  look: CellLookStyle;
  editable: boolean;
  focusable: boolean;
  on: GridHandlers;
};

const TodayTile = memo(TodayTileView, (before, after) => {
  for (const key of Object.keys(after) as (keyof TileProps)[])
    if (key !== 'values' && before[key] !== after[key]) return false;
  return true;
});

function TodayTileView({
  habit,
  index,
  value,
  values,
  notes,
  today,
  todayOrdinal,
  palette,
  look,
  editable,
  focusable,
  on,
}: TileProps) {
  // Restarts the pulse on every accepted tick.
  const [pulse, setPulse] = useState(0);
  const state = cellState(habit, value, today);
  const status = todayStatus(habit, value, today);
  const a11y = cellAccessibility(habit, value, today, 'Today');
  const checkbox = state.kind === 'checkbox';
  const number = habitType(habit) === 'number';
  const summary =
    status === 'off' ? 'Not today' : habitSummary(habit, values, today);
  // A blank number offers its most usual total (the dialog's first
  // suggestion) as one chip that records in one tap; … opens the dialog,
  // and a recorded value opens it to change it.
  const usual =
    number && !state.recorded && editable
      ? recentNumericTotals(values, habit.id, today)[0]
      : undefined;
  const streak =
    checkbox && look.boxes && look.streaks && state.checked
      ? checkedStreak(habit, 0, values, todayOrdinal, new Map())
      : 0;
  const unit = habit.unit ? ` ${habit.unit}` : '';
  const fill = fillOf(palette, state);
  const open = (anchor: HTMLElement) =>
    on.openEntry(habit, today, 'Today', anchor);
  const activate = (event: { currentTarget: HTMLElement }) => {
    if (checkbox) {
      if (on.toggle(habit, today) && look.animate)
        setPulse((value) => value + 1);
    } else open(event.currentTarget);
  };
  return (
    <div
      className={`today-tile${state.met ? ' met' : ''}${status === 'off' ? ' off' : ''}`}
      style={{
        color: palette.colour,
        backgroundColor: state.met ? palette.completedBackground : undefined,
        borderColor: state.met ? `${palette.colour}55` : `${palette.colour}26`,
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        on.openMenu(habit, event.currentTarget);
      }}
    >
      <button
        type="button"
        className="today-tile-main"
        data-tile={index}
        tabIndex={focusable ? 0 : -1}
        role={checkbox ? 'checkbox' : undefined}
        aria-checked={checkbox ? state.checked : undefined}
        aria-label={a11y.label}
        disabled={!editable}
        onClick={activate}
      >
        <span className="today-tile-head">
          {habit.icon ? (
            <HabitSymbol icon={habit.icon} colour={palette.colour} size={20} />
          ) : (
            <span className="habit-initial">{habitInitial(habit.name)}</span>
          )}
          <span className="today-tile-text">
            <span className="today-tile-name">{habit.name}</span>
            {summary && <span className="today-tile-summary">{summary}</span>}
          </span>
        </span>
        {usual === undefined && (
          <span className="today-tile-cell">
            {checkbox ? (
              look.boxes ? (
                <span
                  key={pulse}
                  className={pulse ? 'box today-box pulse' : 'box today-box'}
                  style={
                    {
                      borderRadius: look.round ? '50%' : '9px',
                      backgroundColor: state.checked ? fill : 'transparent',
                      borderColor: state.checked
                        ? fill
                        : state.met
                          ? palette.colour
                          : palette.checkbox,
                      color: palette.checkmark,
                      fontSize: String(streak).length > 2 ? '14px' : '17px',
                    } as CSSProperties
                  }
                >
                  {streak > 0 ? (
                    streak
                  ) : state.checked ? (
                    <Glyph
                      path={TICK}
                      colour={palette.checkmark}
                      size={26}
                      width={2.5}
                    />
                  ) : null}
                </span>
              ) : (
                <span key={pulse} className={pulse ? 'glyph pulse' : 'glyph'}>
                  <Glyph
                    path={state.checked ? TICK : CROSS}
                    colour={state.met ? palette.colour : palette.checkbox}
                    size={30}
                    width={state.checked ? 2.3 : 1.8}
                  />
                </span>
              )
            ) : state.recorded ? (
              <span
                className={
                  number ? 'today-tile-value number' : 'today-tile-value'
                }
              >
                {state.label}
                {number && unit && (
                  <span className="today-tile-unit">{unit}</span>
                )}
              </span>
            ) : (
              <span className="today-tile-value blank">—</span>
            )}
          </span>
        )}
      </button>
      {usual !== undefined && (
        <span className="today-tile-chips">
          <span className="today-chips-label" aria-hidden="true">
            Usual
          </span>
          <span className="today-chips-row">
            <button
              type="button"
              className="today-chip"
              aria-label={`Record the usual total, ${usual}${unit}`}
              onClick={() => on.saveValue(habit, today, usual)}
            >
              {usual}
              {unit && <span className="today-chip-unit">{unit}</span>}
            </button>
            <button
              type="button"
              className="today-chip more"
              aria-label={`Enter today's total${unit}`}
              onClick={(event) => open(event.currentTarget)}
            >
              …
            </button>
          </span>
        </span>
      )}
      <span className="today-tile-links">
        <button
          type="button"
          className={notes.length ? 'today-tile-link' : 'today-tile-link faint'}
          tabIndex={-1}
          aria-label={
            notes.length
              ? `Notes for ${habit.name}: ${notes.map((note) => note.title).join(', ')}`
              : `Notes for ${habit.name}, none yet`
          }
          title={
            notes.length
              ? `Notes: ${notes.map((note) => note.title).join(', ')}`
              : 'Notes'
          }
          onClick={() => on.openHabit(habit, 'notes')}
        >
          <Icon name="text" size={15} />
        </button>
        <button
          type="button"
          className="today-tile-link"
          tabIndex={-1}
          aria-label={`Statistics for ${habit.name}`}
          title="Statistics"
          onClick={() => on.openHabit(habit, 'statistics')}
        >
          <Icon name="stats" size={15} />
        </button>
      </span>
    </div>
  );
}
