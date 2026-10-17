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
  type RefObject,
} from 'react';
import { calendarDay, localDateKey } from '@onpurpose/core/calendar';
import { cellState } from '@onpurpose/core/cellAccessibility';
import type { EntryValues } from '@onpurpose/core/entries';
import { fillDates } from '@onpurpose/core/entryFill';
import { habitType, type Habit } from '@onpurpose/core/habits';
import { ordinal } from '@onpurpose/core/goalTiming';
import { moveHabit } from '@onpurpose/core/habitOrdering';
import {
  isShadedWeek,
  type WeekStart,
} from '@onpurpose/core/displayPreferences';
import { createGridPalette } from '@onpurpose/core/gridAppearance';
import {
  FILL_DOUBLE_CLICK_MS,
  FILL_SLOP_PX,
  VALUE_OPEN_DELAY_MS,
  fillStrokeMs,
  joinContactMs,
} from '@onpurpose/core/tapMotion';
import type { Theme } from '@onpurpose/core/theme';
import { HabitRow } from './HabitRow.tsx';
import { GridScrollbars } from './Scrollbars.tsx';
import {
  changedBefore,
  edgeScrollStep,
  fillAgoAt,
  fillIntent,
  type FillChange,
  type FillRun,
} from './fillWave.ts';
import type { CellLookStyle, Day, GridHandlers, Pulse } from './types.ts';

export type { CellLookStyle, GridHandlers } from './types.ts';

// Layout A: a compact grid of about three weeks with Today close to the
// names. Older days scroll left; rows scroll inside the grid, never the page.
// History loads in batches as the reader nears the oldest loaded day.
const DAYS = 120;
const MORE_DAYS = 120;
const MAX_DAYS = 3660;
export const VISIBLE_DAYS = 21;
// How long a tap's pulse, join, bump and fade may run before its state
// clears (a fill's wave adds its stagger along the run).
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
  compact = false,
  startAgo = 0,
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
  /** Compact mode: icons stand for names, leaving more room for days. */
  compact?: boolean;
  /** Opens with this day (days ago) at the right edge, e.g. a chosen week. */
  startAgo?: number;
  on: GridHandlers;
  /** Called when the reader scrolls away from Today or back to it. */
  onAwayFromToday?: (away: boolean) => void;
}) {
  const [count, setCount] = useState(() =>
    Math.min(MAX_DAYS, Math.max(DAYS, startAgo + MORE_DAYS)),
  );
  const days = useMemo(
    () => gridDays(today, weekStart, weekDividers, count),
    [today, weekStart, weekDividers, count],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const monthLabel = useRef<HTMLSpanElement>(null);
  const compactRef = useRef(compact);
  const startRef = useRef(startAgo);
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

  // Compact mode narrows the names: refit the frame and relabel the corner.
  useLayoutEffect(() => {
    compactRef.current = compact;
    scroller.current?.dispatchEvent(new Event('scroll'));
  }, [compact]);

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
      const newest = calendarDay(today, total - 1 - last);
      // The compact corner holds the newest month alone.
      target.textContent = compactRef.current
        ? newest.toLocaleDateString(undefined, { month: 'short' })
        : monthRange(calendarDay(today, total - 1 - first), newest);
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
    // is ever left half hidden behind the names, plus the scrollbar gutter.
    const fit = () => {
      const container = area.current;
      const frame = element.parentElement;
      const corner = element.querySelector<HTMLElement>('.corner');
      const day = element.querySelector<HTMLElement>('.day');
      if (!container || !frame || !corner || !day) return;
      const style = getComputedStyle(container);
      const gutter = parseFloat(getComputedStyle(frame).paddingRight) || 0;
      const available =
        container.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        gutter -
        corner.offsetWidth;
      const days = Math.max(
        1,
        Math.min(VISIBLE_DAYS, Math.floor(available / day.offsetWidth)),
      );
      frame.style.width = `${corner.offsetWidth + days * day.offsetWidth + gutter}px`;
    };
    fit();
    // A chosen week opens with its last day at the right edge.
    const day = element.querySelector<HTMLElement>('.day');
    if (startRef.current > 0 && day) {
      element.scrollLeft =
        element.scrollWidth -
        element.clientWidth -
        startRef.current * day.offsetWidth;
      startRef.current = 0;
      pinned = false;
      away = true;
      onAwayFromToday?.(true);
    } else pin();
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
  const daysRef = useRef(days);
  useEffect(() => {
    lookRef.current = look;
    valuesRef.current = values;
    daysRef.current = days;
  });
  // When a moving join touches the box it reaches; the box and column sizes
  // are the grid's CSS variables.
  // The box and column sizes are the grid's CSS variables.
  const boxSizes = useCallback(() => {
    const sizes = scroller.current && getComputedStyle(scroller.current);
    return {
      box: parseFloat(sizes?.getPropertyValue('--box') ?? '') || 0,
      column: parseFloat(sizes?.getPropertyValue('--column') ?? '') || 0,
    };
  }, []);
  const contactMs = useCallback(
    (joining: boolean) => {
      const { box, column } = boxSizes();
      return joinContactMs(box, column, joining);
    },
    [boxSizes],
  );
  const toggle = useCallback(
    (habit: Habit, date: string) => {
      const value = valuesRef.current[`${habit.id}:${date}`];
      const before = cellState(habit, value, date).checked;
      const accepted = on.toggle(habit, date);
      if (accepted && lookRef.current.animate)
        setPulse((current) => ({
          habitId: habit.id,
          kind: 'tap',
          dates: [date],
          before: { [date]: value ?? null },
          checked: !before,
          contactMs: contactMs(!before),
          reach: 0,
          n: (current?.n ?? 0) + 1,
        }));
      return accepted;
    },
    [on, contactMs],
  );
  // A committed fill animates as a wave along the run, in drag order.
  const startWave = useCallback(
    (
      habit: Habit,
      kind: 'checks' | 'values',
      dates: string[],
      change: FillChange,
    ) => {
      if (!lookRef.current.animate) return;
      const after =
        change.kind === 'entry'
          ? { [change.date]: change.after }
          : change.after;
      const [date] = Object.keys(after);
      const checked =
        kind === 'checks' &&
        cellState(habit, after[date] ?? undefined, date).checked;
      setPulse((current) => ({
        habitId: habit.id,
        kind,
        dates,
        before: changedBefore(change),
        checked,
        contactMs: contactMs(checked),
        reach: (() => {
          const { box, column } = boxSizes();
          return column > 0 ? box / 2 / column : 0;
        })(),
        n: (current?.n ?? 0) + 1,
      }));
    },
    [contactMs, boxSizes],
  );
  useEffect(() => {
    if (!pulse) return;
    const timer = setTimeout(
      () => setPulse(null),
      PULSE_MS + fillStrokeMs(pulse.dates.length),
    );
    return () => clearTimeout(timer);
  }, [pulse]);

  // Number, text and category cells open their popover a moment after a
  // pointer click, so a second press can start a fill instead; keyboard
  // activation opens at once.
  const pendingOpen = useRef<{ cell: string; timer: number } | null>(null);
  // The cell whose popover a delayed open showed (see armFill below).
  const openedFrom = useRef<string | null>(null);
  const openEntry = useCallback(
    (
      habit: Habit,
      date: string,
      label: string,
      anchor: HTMLElement,
      delayed?: boolean,
    ) => {
      cancelPending(pendingOpen);
      if (!delayed) return on.openEntry(habit, date, label, anchor);
      pendingOpen.current = {
        cell: anchor.dataset.cell ?? '',
        timer: window.setTimeout(() => {
          pendingOpen.current = null;
          if (!anchor.isConnected) return;
          openedFrom.current = anchor.dataset.cell ?? null;
          on.openEntry(habit, date, label, anchor);
        }, VALUE_OPEN_DELAY_MS),
      };
    },
    [on],
  );
  const rowHandlers = useMemo(
    () => ({ ...on, toggle, openEntry }),
    [on, toggle, openEntry],
  );

  // Drag to fill: with a mouse or pen, a second press on the cell just
  // clicked (within FILL_DOUBLE_CLICK_MS of its release) that moves along the
  // row draws a fill from that cell to the column under the pointer. The row
  // stays fixed; vertical movement is ignored. Touch keeps native scrolling.
  // Checkbox runs take the start cell's state on release; other types open
  // the entry popover for the run. The run stays highlighted until the fill
  // completes. Escape cancels.
  const [fill, setFill] = useState<{ habitId: string; run: FillRun } | null>(
    null,
  );
  const lastRelease = useRef<{ cell: string; time: number } | null>(null);
  const fillToken = useRef(0);
  const stopFill = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      cancelPending(pendingOpen);
      stopFill.current?.();
    },
    [],
  );
  const onCellPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') return;
    const cell = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-cell]',
    )?.dataset.cell;
    lastRelease.current = cell ? { cell, time: event.timeStamp } : null;
  };
  const onCellPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch' || event.button !== 0 || !editable)
      return;
    const button = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-cell]',
    );
    const cell = button?.dataset.cell;
    if (!button || !cell) return;
    // A second press on the cell just clicked continues that click: its
    // toggle already happened. Any other press that moves along the row also
    // draws a fill: a trackpad's tap-and-drag reaches the page as one press,
    // its first tap never arriving as a click.
    const last = lastRelease.current;
    const second =
      last?.cell === cell &&
      event.timeStamp - last.time <= FILL_DOUBLE_CLICK_MS;
    armFill(button, cell, event.nativeEvent, !second);
  };
  function armFill(
    button: HTMLElement,
    cell: string,
    event: globalThis.PointerEvent,
    /** No first click toggled the start cell (checkbox fills toggle it). */
    fresh: boolean,
  ) {
    if (pendingOpen.current?.cell === cell) cancelPending(pendingOpen);
    const [row, startAgo] = cell.split(':').map(Number);
    const habit = habits[row];
    const td = button.closest('td');
    const element = scroller.current;
    if (!habit || !td || !element) return;
    stopFill.current?.();

    const pointerId = event.pointerId;
    const x0 = event.clientX,
      y0 = event.clientY;
    let x = x0;
    let phase: 'armed' | 'drawing' | 'cancelled' = 'armed';
    let end = startAgo;
    let frame = 0;
    const show = (ago: number) => {
      end = ago;
      setFill({
        habitId: habit.id,
        run: { lo: Math.min(startAgo, ago), hi: Math.max(startAgo, ago) },
      });
      hoverColumn(cellAt(row, ago) ?? null);
    };
    // The column under the pointer, measured from the start cell (which
    // moves when the grid scrolls).
    const track = () => {
      const rect = td.getBoundingClientRect();
      const ago = fillAgoAt(
        x,
        rect.left,
        rect.width,
        startAgo,
        daysRef.current.length - 1,
      );
      if (ago !== end) show(ago);
    };
    // Near the left or right edge of the days in view, scroll the grid.
    const autoScroll = () => {
      const rect = element.getBoundingClientRect();
      const corner =
        element.querySelector<HTMLElement>('.corner')?.offsetWidth ?? 0;
      const step = edgeScrollStep(
        x,
        rect.left + corner,
        rect.left + element.clientWidth,
      );
      if (step) {
        element.scrollLeft += step;
        track();
      }
      frame = requestAnimationFrame(autoScroll);
    };
    const stopDrawing = () => {
      cancelAnimationFrame(frame);
      element.classList.remove('filling-row');
    };
    const onMove = (move: globalThis.PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      x = move.clientX;
      if (phase === 'drawing') {
        move.preventDefault();
        track();
        return;
      }
      if (phase !== 'armed') return;
      const intent = fillIntent(x - x0, move.clientY - y0, FILL_SLOP_PX);
      if (intent === 'none') finish();
      if (intent !== 'fill') return;
      phase = 'drawing';
      try {
        button.setPointerCapture(pointerId);
      } catch {
        // The pointer is gone; pointerup or pointercancel ends the fill.
      }
      element.classList.add('filling-row');
      window.getSelection()?.removeAllRanges();
      show(startAgo);
      track();
      frame = requestAnimationFrame(autoScroll);
    };
    const onUp = (up: globalThis.PointerEvent) => {
      if (up.pointerId !== pointerId) return;
      const drew = phase === 'drawing';
      // The click that follows would toggle or open the cell again.
      if (phase !== 'armed') swallowClick();
      finish();
      if (drew) commitFill(habit, row, startAgo, end, fresh);
    };
    const onCancel = (cancel: globalThis.PointerEvent) => {
      if (cancel.pointerId !== pointerId) return;
      if (phase === 'drawing') setFill(null);
      finish();
    };
    const onKey = (key: globalThis.KeyboardEvent) => {
      if (key.key !== 'Escape' || phase !== 'drawing') return;
      key.preventDefault();
      key.stopPropagation();
      phase = 'cancelled';
      stopDrawing();
      setFill(null);
    };
    const onSelect = (select: Event) => select.preventDefault();
    const finish = () => {
      stopDrawing();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('selectstart', onSelect);
      // A fill's release is not the first click of another.
      if (phase !== 'armed') lastRelease.current = null;
      if (stopFill.current === finish) stopFill.current = null;
    };
    stopFill.current = finish;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('selectstart', onSelect);
  }
  // A slower second click on a number, text or category cell can land after
  // its popover opened: on the popover's backdrop, over the same cell. It
  // closes that popover and arms the fill as if it had reached the cell.
  const armFillRef = useRef(armFill);
  useEffect(() => {
    armFillRef.current = armFill;
  });
  useEffect(() => {
    const onDown = (event: globalThis.PointerEvent) => {
      const cell = openedFrom.current;
      const last = lastRelease.current;
      if (
        !cell ||
        last?.cell !== cell ||
        event.pointerType === 'touch' ||
        event.button !== 0 ||
        event.timeStamp - last.time > FILL_DOUBLE_CLICK_MS
      )
        return;
      const button = scroller.current?.querySelector<HTMLElement>(
        `[data-cell="${cell}"]`,
      );
      const rect = button?.getBoundingClientRect();
      if (
        !button ||
        !rect ||
        event.clientX < rect.left ||
        event.clientX >= rect.right ||
        event.clientY < rect.top ||
        event.clientY >= rect.bottom
      )
        return;
      openedFrom.current = null;
      event.preventDefault();
      event.stopPropagation();
      on.closeEntry();
      armFillRef.current(button, cell, event, false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [on]);
  const commitFill = (
    habit: Habit,
    row: number,
    startAgo: number,
    endAgo: number,
    fresh: boolean,
  ) => {
    const list = daysRef.current;
    const from = list[list.length - 1 - startAgo];
    const to = list[list.length - 1 - endAgo];
    if (!from || !to) return setFill(null);
    const dates = fillDates(from.key, to.key);
    if (habitType(habit) === 'checkbox') {
      const change = on.fillChecks(habit, dates, fresh);
      setFill(null);
      if (change) startWave(habit, 'checks', dates, change);
      return;
    }
    const anchor = cellAt(row, endAgo);
    if (!anchor || dates.length < 2) {
      // Drawn back to where it started: an ordinary entry.
      setFill(null);
      if (anchor) on.openEntry(habit, from.key, from.label, anchor);
      return;
    }
    const token = ++fillToken.current;
    on.openFill(habit, dates, anchor, (change) => {
      if (fillToken.current !== token) return;
      fillToken.current++;
      setFill(null);
      if (change) startWave(habit, 'values', dates, change);
    });
  };

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
    <div className={compact ? 'grid-area compact' : 'grid-area'} ref={area}>
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
            onPointerDown={onCellPointerDown}
            onPointerUp={onCellPointerUp}
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
                  compact={compact}
                  focusAgo={row === focusRow ? focus.ago : -1}
                  on={rowHandlers}
                  dragStyle={dragStyle(row)}
                  dragging={drag?.from === row}
                  onHandleDown={onHandleDown}
                  pulse={pulse?.habitId === habit.id ? pulse : undefined}
                  fillRun={fill?.habitId === habit.id ? fill.run : undefined}
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

function cancelPending(
  pending: RefObject<{ cell: string; timer: number } | null>,
) {
  if (pending.current) clearTimeout(pending.current.timer);
  pending.current = null;
}

/** Stops the click that follows a drawn fill's release. */
function swallowClick() {
  const stop = (click: MouseEvent) => {
    click.stopPropagation();
    click.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  // The click comes in the same task as the release, if at all.
  setTimeout(() => window.removeEventListener('click', stop, true));
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
