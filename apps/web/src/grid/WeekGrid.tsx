import {
  memo,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from 'react';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import type { EntryValues } from '@onpurpose/core/entries';
import {
  createGridPalette,
  type GridPalette,
} from '@onpurpose/core/gridAppearance';
import type { Habit } from '@onpurpose/core/habits';
import { timingDate } from '@onpurpose/core/goalTiming';
import type { Theme } from '@onpurpose/core/theme';
import {
  weekCellLabel,
  weekColumnStart,
  weekHeading,
  weekSummary,
} from '@onpurpose/core/weekSummary';
import { HabitSymbol } from '../ui/HabitSymbol.tsx';
import { GridScrollbars } from './Scrollbars.tsx';
import type { GridHandle } from './HabitGrid.tsx';

// Weeks mode: the grid's frame and names beside one column per calendar
// week, the current week at the right. Each cell shows the week's number over
// seven day dots (core weekSummary); choosing one shows that week's days.
const WEEKS = 53;
const MORE_WEEKS = 52;
const MAX_WEEKS = 530;
const VISIBLE_WEEKS = 16;

type Week = {
  ago: number;
  first: number;
  month: string;
  day: number;
  label: string;
  current: boolean;
  shaded: boolean;
};

export function WeekGrid({
  ref,
  habits,
  values,
  today,
  theme,
  weekStart,
  weekDividers,
  missed,
  onWeek,
  onOpenHabit,
  onOpenMenu,
  onAwayFromToday,
}: {
  ref?: Ref<GridHandle>;
  habits: Habit[];
  values: EntryValues;
  today: string;
  theme: Theme;
  weekStart: WeekStart;
  weekDividers: boolean;
  /** The Missed day crosses preference: missed days draw a distinct dot. */
  missed: boolean;
  /** A week was chosen: show its days (weeks ago). */
  onWeek: (weeksAgo: number) => void;
  onOpenHabit: (habit: Habit) => void;
  onOpenMenu: (habit: Habit, anchor: HTMLElement) => void;
  onAwayFromToday?: (away: boolean) => void;
}) {
  const [count, setCount] = useState(WEEKS);
  const weeks = useMemo(
    () => weekColumns(today, weekStart, weekDividers, count),
    [today, weekStart, weekDividers, count],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const corner = useRef<HTMLSpanElement>(null);
  const counted = useRef(count);
  const added = useRef({ weeks: 0, from: 0 });
  const [focus, setFocus] = useState({ row: 0, ago: 0 });
  const focusRow = Math.min(focus.row, Math.max(0, habits.length - 1));
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
  // Per-habit value signatures: a row redraws only when its own values do.
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
  const cellAt = (row: number, ago: number) =>
    scroller.current?.querySelector<HTMLElement>(`[data-week="${row}:${ago}"]`);
  useImperativeHandle(ref, () => ({
    showToday() {
      const element = scroller.current;
      if (element) element.scrollLeft = element.scrollWidth;
      setFocus({ row: focusRow, ago: 0 });
      cellAt(focusRow, 0)?.focus({ preventScroll: true });
    },
    focusHabit() {},
  }));

  // Older weeks arrive on the left; keep the same weeks in view.
  useLayoutEffect(() => {
    counted.current = count;
    const element = scroller.current;
    const column = element?.querySelector<HTMLElement>('.week');
    if (!element || !column || !added.current.weeks) return;
    element.scrollLeft =
      added.current.from + added.current.weeks * column.offsetWidth;
    added.current = { weeks: 0, from: 0 };
  }, [count]);

  // As the day grid: start at the current week, fit whole columns, keep the
  // newest week pinned through resizes and name the months in view.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let pinned = true;
    let away = false;
    let frame = 0;
    const pin = () => {
      if (pinned) element.scrollLeft = element.scrollWidth;
    };
    const label = () => {
      const name = element.querySelector<HTMLElement>('.corner');
      const column = element.querySelector<HTMLElement>('.week');
      const target = corner.current;
      if (!name || !column || !target) return;
      const total = counted.current;
      const width = column.offsetWidth;
      const first = Math.max(0, Math.round(element.scrollLeft / width));
      const visible = Math.floor(
        (element.clientWidth - name.offsetWidth) / width,
      );
      const last = Math.min(total - 1, first + Math.max(0, visible - 1));
      const date = (ago: number) =>
        new Date(
          `${timingDate(weekColumnStart(today, weekStart, ago))}T00:00:00`,
        );
      const oldest = date(total - 1 - first);
      const newest = date(total - 1 - last);
      const short = { month: 'short', year: 'numeric' } as const;
      target.textContent =
        oldest.getMonth() === newest.getMonth() &&
        oldest.getFullYear() === newest.getFullYear()
          ? newest.toLocaleDateString(undefined, short)
          : `${oldest.toLocaleDateString(undefined, short)} – ${newest.toLocaleDateString(undefined, short)}`;
    };
    const track = () => {
      pinned =
        element.scrollWidth - element.clientWidth - element.scrollLeft < 2;
      if (away !== !pinned) {
        away = !pinned;
        onAwayFromToday?.(away);
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(label);
      const column = element.querySelector<HTMLElement>('.week');
      if (
        column &&
        !added.current.weeks &&
        element.scrollLeft < column.offsetWidth * 4 &&
        counted.current < MAX_WEEKS
      ) {
        added.current = {
          weeks: Math.min(MORE_WEEKS, MAX_WEEKS - counted.current),
          from: element.scrollLeft,
        };
        setCount(counted.current + added.current.weeks);
      }
    };
    const fit = () => {
      const container = area.current;
      const frameElement = element.parentElement;
      const name = element.querySelector<HTMLElement>('.corner');
      const column = element.querySelector<HTMLElement>('.week');
      if (!container || !frameElement || !name || !column) return;
      const style = getComputedStyle(container);
      const gutter =
        parseFloat(getComputedStyle(frameElement).paddingRight) || 0;
      const available =
        container.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        gutter -
        name.offsetWidth;
      const columns = Math.max(
        1,
        Math.min(VISIBLE_WEEKS, Math.floor(available / column.offsetWidth)),
      );
      frameElement.style.width = `${name.offsetWidth + columns * column.offsetWidth + gutter}px`;
    };
    fit();
    pin();
    label();
    const observer = new ResizeObserver(() => {
      fit();
      pin();
      label();
    });
    if (area.current) observer.observe(area.current);
    const table = element.querySelector('table');
    if (table) observer.observe(table);
    element.addEventListener('scroll', track, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener('scroll', track);
    };
  }, [today, weekStart, onAwayFromToday]);

  // Arrow keys move one roving focus; Enter and Space open the week.
  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.target as HTMLElement).dataset?.week) return;
    const step: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, 1],
      ArrowRight: [0, -1],
    };
    let row = focusRow,
      ago = focus.ago;
    if (event.key in step) {
      row += step[event.key][0];
      ago += step[event.key][1];
    } else if (event.key === 'Home') ago = weeks.length - 1;
    else if (event.key === 'End') ago = 0;
    else return;
    event.preventDefault();
    row = Math.max(0, Math.min(habits.length - 1, row));
    ago = Math.max(0, Math.min(weeks.length - 1, ago));
    setFocus({ row, ago });
    cellAt(row, ago)?.focus();
  };

  return (
    <div className="grid-area" ref={area}>
      <div
        className="grid-frame"
        style={{ '--visible-days': VISIBLE_WEEKS } as CSSProperties}
      >
        <div className="grid-scroller" ref={scroller}>
          <table
            className="grid weeks"
            onKeyDown={onKeyDown}
            onFocus={(event) => {
              const cell = (event.target as HTMLElement).dataset?.week;
              if (!cell) return;
              const [row, ago] = cell.split(':').map(Number);
              if (row !== focusRow || ago !== focus.ago) setFocus({ row, ago });
            }}
          >
            <thead>
              <tr>
                <th className="corner" scope="col">
                  <span ref={corner} />
                </th>
                {weeks.map((week) => (
                  <th
                    key={week.first}
                    scope="col"
                    className={
                      week.current
                        ? 'week today'
                        : week.shaded
                          ? 'week shaded'
                          : 'week'
                    }
                    aria-label={week.label}
                  >
                    <span className="weekday">{week.month}</span>
                    <span className="number">{week.day}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {habits.map((habit, row) => (
                <WeekRow
                  key={habit.id}
                  habit={habit}
                  row={row}
                  weeks={weeks}
                  values={values}
                  signature={signatures.get(habit.id) ?? ''}
                  today={today}
                  palette={palettes.get(habit.id)!}
                  missed={missed}
                  focusAgo={row === focusRow ? focus.ago : -1}
                  onWeek={onWeek}
                  onOpenHabit={onOpenHabit}
                  onOpenMenu={onOpenMenu}
                />
              ))}
            </tbody>
          </table>
          {habits.length === 0 && <p className="empty-grid">No habits yet.</p>}
        </div>
        <GridScrollbars scroller={scroller} />
      </div>
    </div>
  );
}

type RowProps = {
  habit: Habit;
  row: number;
  weeks: Week[];
  values: EntryValues;
  signature: string;
  today: string;
  palette: GridPalette;
  missed: boolean;
  focusAgo: number;
  onWeek: (weeksAgo: number) => void;
  onOpenHabit: (habit: Habit) => void;
  onOpenMenu: (habit: Habit, anchor: HTMLElement) => void;
};

// Rows redraw only when their own values or display inputs change.
const WeekRow = memo(WeekRowView, (before, after) => {
  for (const key of Object.keys(after) as (keyof RowProps)[])
    if (key !== 'values' && before[key] !== after[key]) return false;
  return true;
});

function WeekRowView({
  habit,
  row,
  weeks,
  values,
  today,
  palette,
  missed,
  focusAgo,
  onWeek,
  onOpenHabit,
  onOpenMenu,
}: RowProps) {
  return (
    <tr>
      <th
        scope="row"
        className="name"
        onContextMenu={(event) => {
          event.preventDefault();
          onOpenMenu(habit, event.currentTarget);
        }}
      >
        <div className="name-inner">
          <HabitSymbol icon={habit.icon} colour={palette.colour} size={20} />
          <button
            type="button"
            className="name-text name-button"
            tabIndex={-1}
            title={`Notes and statistics for ${habit.name}`}
            onClick={() => onOpenHabit(habit)}
          >
            <span className="habit-name" style={{ color: palette.colour }}>
              {habit.name}
            </span>
          </button>
        </div>
      </th>
      {weeks.map((week) => {
        const summary = weekSummary(habit, values, today, week.first);
        return (
          <td
            key={week.first}
            className={week.current ? 'cell week-cell today' : 'cell week-cell'}
            style={
              summary.met
                ? { backgroundColor: palette.completedBackground }
                : undefined
            }
          >
            <button
              type="button"
              className="mark week-mark"
              data-week={`${row}:${week.ago}`}
              tabIndex={week.ago === focusAgo ? 0 : -1}
              aria-label={weekCellLabel(habit, summary, week.first)}
              title="Show this week's days"
              onClick={() => onWeek(week.ago)}
            >
              <span className="week-number" style={{ color: palette.colour }}>
                {summary.label}
              </span>
              <span className="week-dots" aria-hidden="true">
                {summary.dots.map((dot, index) => (
                  <i
                    key={index}
                    className={`dot dot-${dot === 'missed' && !missed ? 'empty' : dot}`}
                    style={
                      dot === 'done'
                        ? { backgroundColor: palette.colour }
                        : dot === 'missed' && missed
                          ? { backgroundColor: palette.missed }
                          : undefined
                    }
                  />
                ))}
              </span>
            </button>
          </td>
        );
      })}
    </tr>
  );
}

/** The last `count` weeks ending with the current one, oldest first. */
function weekColumns(
  today: string,
  weekStart: WeekStart,
  weekDividers: boolean,
  count: number,
): Week[] {
  return Array.from({ length: count }, (_, index) => {
    const ago = count - 1 - index;
    const first = weekColumnStart(today, weekStart, ago);
    const heading = weekHeading(first);
    const month = Number(timingDate(first).slice(5, 7));
    return {
      ago,
      first,
      month: heading.month,
      day: heading.day,
      label: heading.label,
      current: ago === 0,
      // Alternate months are faintly shaded, grouping their weeks.
      shaded: weekDividers && month % 2 === 0,
    };
  });
}
