import {
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { calendarDay, localDateKey } from '@onpurpose/core/calendar';
import {
  cellAccessibility,
  cellState,
  checkedStreak,
} from '@onpurpose/core/cellAccessibility';
import type { EntryValues } from '@onpurpose/core/entries';
import type { Habit } from '@onpurpose/core/habits';
import { ordinal } from '@onpurpose/core/goalTiming';
import { habitSummary } from '@onpurpose/core/habitSummary';
import {
  isShadedWeek,
  type WeekStart,
} from '@onpurpose/core/displayPreferences';
import {
  createGridPalette,
  type GridPalette,
} from '@onpurpose/core/gridAppearance';
import type { Theme } from '@onpurpose/core/theme';

// Layout A: a compact grid of about three weeks with Today close to the
// names. Older days scroll left; rows scroll inside the grid, never the page.
const DAYS = 120;
export const VISIBLE_DAYS = 21;

/** How cells are drawn, from the saved cell-look preferences. */
export type CellLookStyle = {
  boxes: boolean;
  round: boolean;
  joined: boolean;
  streaks: boolean;
  missed: boolean;
  /** Joining bar height as a fraction of the checkbox. */
  connector: number;
};
export type GridHandle = { showToday(): void };

type Day = {
  key: string;
  ago: number;
  weekday: string;
  number: number;
  label: string;
  shaded: boolean;
};

export function HabitGrid({
  ref,
  habits,
  values,
  today,
  theme,
  look,
  weekStart,
  weekDividers,
  editable,
  onToggle,
  onOpen,
}: {
  ref?: Ref<GridHandle>;
  habits: Habit[];
  values: EntryValues;
  today: string;
  theme: Theme;
  look: CellLookStyle;
  weekStart: WeekStart;
  weekDividers: boolean;
  editable: boolean;
  onToggle: (habit: Habit, date: string) => void;
  onOpen: (
    habit: Habit,
    date: string,
    label: string,
    anchor: HTMLElement,
  ) => void;
}) {
  const days = useMemo(
    () => gridDays(today, weekStart, weekDividers),
    [today, weekStart, weekDividers],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState({ row: 0, col: DAYS - 1 });
  const focusRow = Math.min(focus.row, Math.max(0, habits.length - 1));

  const cellAt = (row: number, col: number) =>
    scroller.current?.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`);
  useImperativeHandle(ref, () => ({
    showToday() {
      const element = scroller.current;
      if (element) element.scrollLeft = element.scrollWidth;
      setFocus({ row: focusRow, col: DAYS - 1 });
      cellAt(focusRow, DAYS - 1)?.focus({ preventScroll: true });
    },
  }));

  // Start at Today, and keep Today at the right edge through resizes unless
  // the reader has scrolled back into history.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let pinned = true;
    const pin = () => {
      if (pinned) element.scrollLeft = element.scrollWidth;
    };
    const track = () => {
      pinned =
        element.scrollWidth - element.clientWidth - element.scrollLeft < 2;
    };
    pin();
    const observer = new ResizeObserver(pin);
    observer.observe(element);
    element.addEventListener('scroll', track, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', track);
    };
  }, [today]);

  // Arrow keys move one roving focus through the cells; Space and Enter
  // activate the focused cell like any button.
  const onKeyDown = (event: KeyboardEvent) => {
    const step: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    let row = focusRow,
      col = focus.col;
    if (event.key in step) {
      row += step[event.key][0];
      col += step[event.key][1];
    } else if (event.key === 'Home') col = 0;
    else if (event.key === 'End') col = DAYS - 1;
    else return;
    event.preventDefault();
    row = Math.max(0, Math.min(habits.length - 1, row));
    col = Math.max(0, Math.min(DAYS - 1, col));
    setFocus({ row, col });
    cellAt(row, col)?.focus();
  };
  const onFocus = (event: { target: EventTarget }) => {
    const cell = (event.target as HTMLElement).dataset?.cell;
    if (!cell) return;
    const [row, col] = cell.split(':').map(Number);
    if (row !== focusRow || col !== focus.col) setFocus({ row, col });
  };

  const todayOrdinal = ordinal(today);
  const month = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  return (
    <div className="grid-area">
      <div
        className="grid-scroller"
        ref={scroller}
        style={{ '--visible-days': VISIBLE_DAYS } as CSSProperties}
      >
        <table className="grid" onKeyDown={onKeyDown} onFocus={onFocus}>
          <thead>
            <tr>
              <th className="corner" scope="col">
                {month}
              </th>
              {days.map((day) => (
                <th
                  key={day.key}
                  scope="col"
                  className={
                    day.ago === 0
                      ? 'day today'
                      : day.shaded
                        ? 'day shaded'
                        : 'day'
                  }
                  aria-label={day.label}
                >
                  <span className="weekday">
                    {day.ago === 0 ? 'Today' : day.weekday}
                  </span>
                  <span className="number">{day.number}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {habits.map((habit, row) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                row={row}
                days={days}
                values={values}
                today={today}
                todayOrdinal={todayOrdinal}
                palette={createGridPalette(habit.color, theme)}
                look={look}
                editable={editable}
                focusCol={row === focusRow ? focus.col : -1}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HabitRow({
  habit,
  row,
  days,
  values,
  today,
  todayOrdinal,
  palette,
  look,
  editable,
  focusCol,
  onToggle,
  onOpen,
}: {
  habit: Habit;
  row: number;
  days: Day[];
  values: EntryValues;
  today: string;
  todayOrdinal: number;
  palette: GridPalette;
  look: CellLookStyle;
  editable: boolean;
  focusCol: number;
  onToggle: (habit: Habit, date: string) => void;
  onOpen: (
    habit: Habit,
    date: string,
    label: string,
    anchor: HTMLElement,
  ) => void;
}) {
  const states = days.map((day) =>
    cellState(habit, values[`${habit.id}:${day.key}`], day.key),
  );
  const memo = new Map<string, number>();
  const box = look.boxes;
  return (
    <tr>
      <th scope="row" className="name">
        <span className="habit-name" style={{ color: palette.colour }}>
          {habit.name}
        </span>
        <span className="summary">{habitSummary(habit, values, today)}</span>
      </th>
      {days.map((day, col) => {
        const state = states[col];
        const value = values[`${habit.id}:${day.key}`];
        const background = state.met
          ? palette.completedBackground
          : day.ago === 0
            ? palette.todayBackground
            : undefined;
        const empty =
          state.kind === 'checkbox' ? !state.checked : !state.recorded;
        // Missed-day marks replace empty past cells: a cross on a due day,
        // nothing on an unscheduled one.
        const missedMark =
          look.missed && empty && day.ago > 0 && !state.met
            ? state.schedule === 'due'
              ? 'cross'
              : state.schedule === 'off'
                ? 'blank'
                : null
            : null;
        const a11y = cellAccessibility(habit, value, day.key, day.label);
        const shared = {
          'data-cell': `${row}:${col}`,
          tabIndex: col === focusCol ? 0 : -1,
          'aria-label': a11y.label,
        };
        const fill = state.met ? palette.colour : palette.checkbox;
        const joinOlder =
          box &&
          look.joined &&
          state.checked &&
          col > 0 &&
          states[col - 1].checked;
        const joinNewer =
          box &&
          look.joined &&
          state.checked &&
          col < days.length - 1 &&
          states[col + 1].checked;
        const streak =
          box && look.streaks && state.checked
            ? checkedStreak(habit, day.ago, values, todayOrdinal, memo)
            : 0;
        return (
          <td
            key={day.key}
            className={day.ago === 0 ? 'cell today' : 'cell'}
            style={{ backgroundColor: background }}
          >
            {joinOlder && <Join side="older" colour={fill} look={look} />}
            {joinNewer && <Join side="newer" colour={fill} look={look} />}
            {state.kind === 'checkbox' ? (
              <button
                {...shared}
                role="checkbox"
                aria-checked={state.checked}
                disabled={!editable}
                className="mark"
                onClick={() => onToggle(habit, day.key)}
              >
                {missedMark === 'cross' ? (
                  <Glyph
                    path={CROSS}
                    colour={`${palette.colour}66`}
                    size={16}
                    width={1.8}
                  />
                ) : missedMark === 'blank' ? null : box ? (
                  <span
                    className="box"
                    style={{
                      borderRadius: look.round ? '50%' : '7px',
                      backgroundColor: state.checked ? fill : 'transparent',
                      borderColor: state.checked
                        ? fill
                        : state.met
                          ? palette.colour
                          : palette.checkbox,
                      color: palette.checkmark,
                      fontSize: String(streak).length > 2 ? '11px' : '14px',
                    }}
                  >
                    {streak > 0 ? (
                      streak
                    ) : state.checked ? (
                      <Glyph
                        path={TICK}
                        colour={palette.checkmark}
                        size={22}
                        width={2.5}
                      />
                    ) : null}
                  </span>
                ) : (
                  <Glyph
                    path={state.checked ? TICK : CROSS}
                    colour={state.met ? palette.colour : palette.checkbox}
                    size={24}
                    width={state.checked ? 2.3 : 1.8}
                  />
                )}
              </button>
            ) : (
              // Number, text and category cells open the entry popover.
              <button
                {...shared}
                aria-haspopup="dialog"
                disabled={!editable}
                onClick={(event) =>
                  onOpen(habit, day.key, day.label, event.currentTarget)
                }
                className={state.kind === 'number' ? 'mark value' : 'mark text'}
                style={{
                  color: state.recorded ? palette.colour : palette.number,
                }}
              >
                {missedMark === 'cross' ? (
                  <Glyph
                    path={CROSS}
                    colour={`${palette.colour}66`}
                    size={16}
                    width={1.8}
                  />
                ) : missedMark === 'blank' ? null : (
                  <span>{state.label}</span>
                )}
              </button>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// Each cell draws its own half of a join, so backgrounds never cover it.
function Join({
  side,
  colour,
  look,
}: {
  side: 'older' | 'newer';
  colour: string;
  look: CellLookStyle;
}) {
  return (
    <span
      className={`join ${side}`}
      style={{
        backgroundColor: colour,
        height: `calc(var(--box) * ${look.connector})`,
      }}
    />
  );
}

const TICK = 'M5 12.5l4.5 4.5L19 7.5';
const CROSS = 'M6 6l12 12M18 6L6 18';
function Glyph({
  path,
  colour,
  size,
  width,
}: {
  path: string;
  colour: string;
  size: number;
  width: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colour}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function gridDays(
  today: string,
  weekStart: WeekStart,
  weekDividers: boolean,
): Day[] {
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  const full = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return Array.from({ length: DAYS }, (_, index) => {
    const ago = DAYS - 1 - index;
    const date = calendarDay(today, ago);
    const key = localDateKey(date);
    return {
      key,
      ago,
      weekday: weekday.format(date),
      number: date.getDate(),
      label: full.format(date),
      shaded: weekDividers && isShadedWeek(key, weekStart),
    };
  });
}
