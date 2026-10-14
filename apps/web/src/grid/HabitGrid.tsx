import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from 'react';
import { calendarDay, localDateKey } from '@onpurpose/core/calendar';
import { cellState } from '@onpurpose/core/cellAccessibility';
import type { EntryValues } from '@onpurpose/core/entries';
import type { Habit } from '@onpurpose/core/habits';
import { ordinal } from '@onpurpose/core/goalTiming';
import { moveHabit } from '@onpurpose/core/habitOrdering';
import {
  isShadedWeek,
  type WeekStart,
} from '@onpurpose/core/displayPreferences';
import { createGridPalette } from '@onpurpose/core/gridAppearance';
import type { Theme } from '@onpurpose/core/theme';
import { HabitRow } from './HabitRow.tsx';
import { GridScrollbars } from './Scrollbars.tsx';
import type { CellLookStyle, Day, GridHandlers, Pulse } from './types.ts';

export type { CellLookStyle, GridHandlers } from './types.ts';

// Layout A: a compact grid of about three weeks with Today close to the
// names. Older days scroll left; rows scroll inside the grid, never the page.
// History loads in batches as the reader nears the oldest loaded day.
const DAYS = 120;
const MORE_DAYS = 120;
const MAX_DAYS = 3660;
export const VISIBLE_DAYS = 21;
// How long a tap's pulse and join animation may run before its state clears.
const PULSE_MS = 450;

export type GridHandle = {
  showToday(): void;
  /** Focuses a habit's cell on the current day, after a move. */
  focusHabit(id: string): void;
};

type Drag = {
  id: string;
  from: number;
  to: number;
  offset: number;
  rowHeight: number;
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
  canAdd,
  on,
  onAwayFromToday,
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
  canAdd: boolean;
  on: GridHandlers;
  /** Called when the reader scrolls away from Today or back to it. */
  onAwayFromToday?: (away: boolean) => void;
}) {
  const [count, setCount] = useState(DAYS);
  const days = useMemo(
    () => gridDays(today, weekStart, weekDividers, count),
    [today, weekStart, weekDividers, count],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const monthLabel = useRef<HTMLSpanElement>(null);
  // Focus is kept by days ago, so loading older days never moves it.
  const [focus, setFocus] = useState({ row: 0, ago: 0 });
  const focusRow = Math.min(focus.row, Math.max(0, habits.length - 1));
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragStart = useRef({ y: 0, rowHeight: 56 });
  const [pulse, setPulse] = useState<Pulse | null>(null);

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

  const cellAt = (row: number, ago: number) =>
    scroller.current?.querySelector<HTMLElement>(`[data-cell="${row}:${ago}"]`);
  const pendingFocus = useRef<{ id: string; ago: number } | null>(null);
  useImperativeHandle(ref, () => ({
    showToday() {
      const element = scroller.current;
      if (element) element.scrollLeft = element.scrollWidth;
      setFocus({ row: focusRow, ago: 0 });
      cellAt(focusRow, 0)?.focus({ preventScroll: true });
    },
    focusHabit(id) {
      pendingFocus.current = { id, ago: focus.ago };
    },
  }));
  // After a move re-renders the rows, keep focus with the moved habit.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const row = habits.findIndex((habit) => habit.id === pending.id);
    if (row < 0) return;
    setFocus({ row, ago: pending.ago });
    scroller.current
      ?.querySelector<HTMLElement>(`[data-cell="${row}:${pending.ago}"]`)
      ?.focus();
  }, [habits]);

  // Older days arrive on the left; keep the same days in view.
  // Days being added, and the scroll position they were requested from.
  const added = useRef({ days: 0, from: 0 });
  const counted = useRef(count);
  useLayoutEffect(() => {
    counted.current = count;
    const element = scroller.current;
    const day = element?.querySelector<HTMLElement>('.day');
    if (!element || !day || !added.current.days) return;
    // An absolute position: browsers that re-snap to the same day after the
    // insertion (Chrome) and those that do not end up in the same place.
    element.scrollLeft =
      added.current.from + added.current.days * day.offsetWidth;
    added.current = { days: 0, from: 0 };
  }, [count]);

  // Start at Today, and keep Today at the right edge through resizes unless
  // the reader has scrolled back into history.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let pinned = true;
    let away = false;
    let frame = 0;
    const pin = () => {
      if (pinned) element.scrollLeft = element.scrollWidth;
    };
    // The corner names the months in view.
    const label = () => {
      const corner = element.querySelector<HTMLElement>('.corner');
      const day = element.querySelector<HTMLElement>('.day');
      const target = monthLabel.current;
      if (!corner || !day || !target) return;
      const total = counted.current;
      const width = day.offsetWidth;
      const first = Math.max(0, Math.round(element.scrollLeft / width));
      const visible = Math.floor(
        (element.clientWidth - corner.offsetWidth) / width,
      );
      const last = Math.min(total - 1, first + Math.max(0, visible - 1));
      target.textContent = monthRange(
        calendarDay(today, total - 1 - first),
        calendarDay(today, total - 1 - last),
      );
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
      // Near the oldest loaded day, load an earlier batch.
      const day = element.querySelector<HTMLElement>('.day');
      if (
        day &&
        !added.current.days &&
        element.scrollLeft < day.offsetWidth * 7 &&
        counted.current < MAX_DAYS
      ) {
        added.current = {
          days: Math.min(MORE_DAYS, MAX_DAYS - counted.current),
          from: element.scrollLeft,
        };
        setCount(counted.current + added.current.days);
      }
    };
    // Size the grid to whole day columns (at most VISIBLE_DAYS), so no column
    // is ever left half hidden behind the names. The overlay scrollbars take
    // no width.
    const fit = () => {
      const container = area.current;
      const frame = element.parentElement;
      const corner = element.querySelector<HTMLElement>('.corner');
      const day = element.querySelector<HTMLElement>('.day');
      if (!container || !frame || !corner || !day) return;
      const style = getComputedStyle(container);
      const available =
        container.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        corner.offsetWidth;
      const days = Math.max(
        1,
        Math.min(VISIBLE_DAYS, Math.floor(available / day.offsetWidth)),
      );
      frame.style.width = `${corner.offsetWidth + days * day.offsetWidth}px`;
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
    // Grid size settings change the table, not the area.
    const table = element.querySelector('table');
    if (table) observer.observe(table);
    element.addEventListener('scroll', track, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener('scroll', track);
    };
  }, [today, onAwayFromToday]);

  const move = (row: number, delta: -1 | 1) => {
    const target = row + delta;
    if (target < 0 || target >= habits.length) return;
    const id = habits[row].id;
    pendingFocus.current = { id, ago: focus.ago };
    on.reorder(
      moveHabit(
        habits.map((habit) => habit.id),
        id,
        target,
      ),
    );
  };

  // Arrow keys move one roving focus through the cells; Space and Enter
  // activate the focused cell. Alt with ↑/↓ moves the row; the context-menu
  // key or Shift+F10 opens its actions.
  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.target as HTMLElement).dataset?.cell) return;
    if (
      event.altKey &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    ) {
      event.preventDefault();
      if (editable) move(focusRow, event.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (
      event.key === 'ContextMenu' ||
      (event.shiftKey && event.key === 'F10')
    ) {
      event.preventDefault();
      const button = scroller.current?.querySelector<HTMLElement>(
        `[data-row-menu="${focusRow}"]`,
      );
      if (button) on.openMenu(habits[focusRow], button);
      return;
    }
    // Columns run oldest (left) to Today (right): Left goes back a day.
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
    } else if (event.key === 'Home') ago = days.length - 1;
    else if (event.key === 'End') ago = 0;
    else return;
    event.preventDefault();
    row = Math.max(0, Math.min(habits.length - 1, row));
    ago = Math.max(0, Math.min(days.length - 1, ago));
    setFocus({ row, ago });
    cellAt(row, ago)?.focus();
  };
  const onFocus = (event: { target: EventTarget }) => {
    const cell = (event.target as HTMLElement).dataset?.cell;
    if (!cell) return;
    const [row, ago] = cell.split(':').map(Number);
    if (row !== focusRow || ago !== focus.ago) setFocus({ row, ago });
  };

  // The hovered day's heading lights up, so a cell's date is easy to find.
  const hovered = useRef<HTMLElement | null>(null);
  const hoverColumn = (target: EventTarget | null) => {
    const ago = (target as HTMLElement | null)?.closest?.<HTMLElement>(
      '[data-ago]',
    )?.dataset.ago;
    const heading =
      ago === undefined
        ? null
        : scroller.current?.querySelector<HTMLElement>(
            `thead [data-ago="${ago}"]`,
          );
    if (heading === hovered.current) return;
    hovered.current?.classList.remove('hover');
    heading?.classList.add('hover');
    hovered.current = heading ?? null;
  };

  // Ticks from the grid pulse (and grow or retract joins) when the saved
  // look allows it; Undo, other windows and the panel never animate.
  const lookRef = useRef(look);
  const valuesRef = useRef(values);
  useEffect(() => {
    lookRef.current = look;
    valuesRef.current = values;
  });
  const toggle = useCallback(
    (habit: Habit, date: string) => {
      const before = cellState(
        habit,
        valuesRef.current[`${habit.id}:${date}`],
        date,
      ).checked;
      const accepted = on.toggle(habit, date);
      if (accepted && lookRef.current.animate)
        setPulse((current) => ({
          habitId: habit.id,
          date,
          checked: !before,
          n: (current?.n ?? 0) + 1,
        }));
      return accepted;
    },
    [on],
  );
  useEffect(() => {
    if (!pulse) return;
    const timer = setTimeout(() => setPulse(null), PULSE_MS);
    return () => clearTimeout(timer);
  }, [pulse]);
  const rowHandlers = useMemo(() => ({ ...on, toggle }), [on, toggle]);

  // Dragging a name's handle moves the real row; the rows it passes slide
  // out of the way. Only a completed drop saves; Esc cancels.
  const startDrag = (row: number, event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const tr = handle.closest('tr');
    dragStart.current = { y: event.clientY, rowHeight: tr?.offsetHeight ?? 56 };
    const id = habits[row].id;
    const rowHeight = dragStart.current.rowHeight;
    const target = (y: number) =>
      Math.max(
        0,
        Math.min(
          habits.length - 1,
          row + Math.round((y - dragStart.current.y) / rowHeight),
        ),
      );
    setDrag({ id, from: row, to: row, offset: 0, rowHeight });
    const onMove = (moveEvent: globalThis.PointerEvent) =>
      setDrag({
        id,
        from: row,
        to: target(moveEvent.clientY),
        offset: moveEvent.clientY - dragStart.current.y,
        rowHeight,
      });
    const finish =
      (commit: boolean) => (endEvent?: globalThis.PointerEvent) => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey);
        setDrag(null);
        if (!commit || !endEvent) return;
        const to = target(endEvent.clientY);
        if (to !== row)
          on.reorder(
            moveHabit(
              habits.map((habit) => habit.id),
              id,
              to,
            ),
          );
      };
    const onUp = finish(true);
    const onCancel = finish(false);
    const onKey = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key === 'Escape') onCancel();
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
  };
  // A stable handler, so rows need not redraw for it.
  const dragImpl = useRef(startDrag);
  useEffect(() => {
    dragImpl.current = startDrag;
  });
  const onHandleDown = useCallback(
    (row: number, event: PointerEvent<HTMLElement>) =>
      dragImpl.current(row, event),
    [],
  );
  const dragStyle = (row: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    const height = drag.rowHeight;
    if (row === drag.from)
      return { transform: `translateY(${drag.offset}px)`, transition: 'none' };
    if (drag.from < drag.to && row > drag.from && row <= drag.to)
      return { transform: `translateY(${-height}px)` };
    if (drag.from > drag.to && row < drag.from && row >= drag.to)
      return { transform: `translateY(${height}px)` };
    return { transform: 'translateY(0)' };
  };

  const todayOrdinal = ordinal(today);
  return (
    <div className="grid-area" ref={area}>
      <div
        className="grid-frame"
        style={{ '--visible-days': VISIBLE_DAYS } as CSSProperties}
      >
        <div
          className={drag ? 'grid-scroller dragging-rows' : 'grid-scroller'}
          ref={scroller}
        >
          <table
            className="grid"
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onPointerOver={(event) => hoverColumn(event.target)}
            onPointerLeave={() => hoverColumn(null)}
          >
            <thead>
              <tr>
                <th className="corner" scope="col">
                  <span ref={monthLabel} />
                </th>
                {days.map((day) => (
                  <th
                    key={day.key}
                    scope="col"
                    data-ago={day.ago}
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
                  signature={signatures.get(habit.id) ?? ''}
                  today={today}
                  todayOrdinal={todayOrdinal}
                  palette={palettes.get(habit.id)!}
                  look={look}
                  editable={editable}
                  focusAgo={row === focusRow ? focus.ago : -1}
                  on={rowHandlers}
                  dragStyle={dragStyle(row)}
                  dragging={drag?.from === row}
                  onHandleDown={onHandleDown}
                  pulse={pulse?.habitId === habit.id ? pulse : undefined}
                />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="name add-row">
                  <button
                    type="button"
                    className="add-habit"
                    disabled={!editable || !canAdd}
                    onClick={on.add}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add habit
                  </button>
                </th>
                <td colSpan={days.length} />
              </tr>
            </tfoot>
          </table>
          {habits.length === 0 && (
            <p className="empty-grid">
              No habits yet. Add one to start tracking.
            </p>
          )}
        </div>
        <GridScrollbars scroller={scroller} />
      </div>
    </div>
  );
}

/** "October 2026", "September – October 2026" or "Dec 2025 – Jan 2026". */
function monthRange(first: Date, last: Date) {
  const sameYear = first.getFullYear() === last.getFullYear();
  if (sameYear && first.getMonth() === last.getMonth())
    return first.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  if (sameYear)
    return `${first.toLocaleDateString(undefined, { month: 'long' })} – ${last.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`;
  const short = { month: 'short', year: 'numeric' } as const;
  return `${first.toLocaleDateString(undefined, short)} – ${last.toLocaleDateString(undefined, short)}`;
}

/** The last `count` days ending today, oldest first (also used by previews). */
export function gridDays(
  today: string,
  weekStart: WeekStart,
  weekDividers: boolean,
  count = DAYS,
): Day[] {
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  const full = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return Array.from({ length: count }, (_, index) => {
    const ago = count - 1 - index;
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
