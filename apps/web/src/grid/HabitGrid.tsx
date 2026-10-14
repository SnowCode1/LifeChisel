import {
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
import type { CellLookStyle, Day, GridHandlers } from './types.ts';

export type { CellLookStyle, GridHandlers } from './types.ts';

// Layout A: a compact grid of about three weeks with Today close to the
// names. Older days scroll left; rows scroll inside the grid, never the page.
const DAYS = 120;
export const VISIBLE_DAYS = 21;

export type GridHandle = {
  showToday(): void;
  /** Focuses a habit's cell on the current column, after a move. */
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
}) {
  const days = useMemo(
    () => gridDays(today, weekStart, weekDividers),
    [today, weekStart, weekDividers],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState({ row: 0, col: DAYS - 1 });
  const focusRow = Math.min(focus.row, Math.max(0, habits.length - 1));
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragStart = useRef({ y: 0, rowHeight: 56 });

  const cellAt = (row: number, col: number) =>
    scroller.current?.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`);
  const pendingFocus = useRef<{ id: string; col: number } | null>(null);
  useImperativeHandle(ref, () => ({
    showToday() {
      const element = scroller.current;
      if (element) element.scrollLeft = element.scrollWidth;
      setFocus({ row: focusRow, col: DAYS - 1 });
      cellAt(focusRow, DAYS - 1)?.focus({ preventScroll: true });
    },
    focusHabit(id) {
      pendingFocus.current = { id, col: focus.col };
    },
  }));
  // After a move re-renders the rows, keep focus with the moved habit.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const row = habits.findIndex((habit) => habit.id === pending.id);
    if (row < 0) return;
    setFocus({ row, col: pending.col });
    scroller.current
      ?.querySelector<HTMLElement>(`[data-cell="${row}:${pending.col}"]`)
      ?.focus();
  }, [habits]);

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
    // Size the grid to whole day columns (at most VISIBLE_DAYS), so no column
    // is ever left half hidden behind the names.
    const fit = () => {
      const container = area.current;
      const corner = element.querySelector<HTMLElement>('.corner');
      const day = element.querySelector<HTMLElement>('.day');
      if (!container || !corner || !day) return;
      const padding = parseFloat(getComputedStyle(container).paddingLeft) * 2;
      const scrollbar = element.offsetWidth - element.clientWidth;
      const available =
        container.clientWidth - padding - corner.offsetWidth - scrollbar;
      const days = Math.max(
        1,
        Math.min(VISIBLE_DAYS, Math.floor(available / day.offsetWidth)),
      );
      element.style.width = `${corner.offsetWidth + days * day.offsetWidth + scrollbar}px`;
      element.style.maxWidth = '100%';
    };
    fit();
    pin();
    const observer = new ResizeObserver(() => {
      fit();
      pin();
    });
    observer.observe(element);
    if (area.current) observer.observe(area.current);
    element.addEventListener('scroll', track, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', track);
    };
  }, [today]);

  const move = (row: number, delta: -1 | 1) => {
    const target = row + delta;
    if (target < 0 || target >= habits.length) return;
    const id = habits[row].id;
    pendingFocus.current = { id, col: focus.col };
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

  // Dragging a name's handle moves the real row; the rows it passes slide
  // out of the way. Only a completed drop saves; Esc cancels.
  const startDrag = (row: number) => (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const tr = handle.closest('tr');
    dragStart.current = { y: event.clientY, rowHeight: tr?.offsetHeight ?? 56 };
    const id = habits[row].id;
    const rowHeight = dragStart.current.rowHeight;
    setDrag({ id, from: row, to: row, offset: 0, rowHeight });
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const offset = moveEvent.clientY - dragStart.current.y;
      const to = Math.max(
        0,
        Math.min(
          habits.length - 1,
          row + Math.round(offset / dragStart.current.rowHeight),
        ),
      );
      setDrag({ id, from: row, to, offset, rowHeight });
    };
    const finish =
      (commit: boolean) => (endEvent?: globalThis.PointerEvent) => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey);
        setDrag(null);
        if (!commit || !endEvent) return;
        const offset = endEvent.clientY - dragStart.current.y;
        const to = Math.max(
          0,
          Math.min(
            habits.length - 1,
            row + Math.round(offset / dragStart.current.rowHeight),
          ),
        );
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
  const month = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  return (
    <div className="grid-area" ref={area}>
      <div
        className={drag ? 'grid-scroller dragging-rows' : 'grid-scroller'}
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
                on={on}
                dragStyle={dragStyle(row)}
                dragging={drag?.from === row}
                onHandleDown={startDrag(row)}
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
              <td colSpan={DAYS} />
            </tr>
          </tfoot>
        </table>
        {habits.length === 0 && (
          <p className="empty-grid">
            No habits yet. Add one to start tracking.
          </p>
        )}
      </div>
    </div>
  );
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
