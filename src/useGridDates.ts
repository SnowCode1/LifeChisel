import { useLayoutEffect, useState } from 'react';
import { calendarDay } from '@onpurpose/core/calendar';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import { ordinal } from '@onpurpose/core/goalTiming';
import { weekColumnStart } from '@onpurpose/core/weekSummary';
import { useCanvasGridScroll } from './canvasGrid/useCanvasGridScroll';
import { FUTURE_BATCH, futureRevealDay } from './gridNavigation';
import { feedback } from './haptics';

// Discrete date navigation for the canvas grid. Every date is generated on the
// fly, so there are no list windows, remounts or anchoring: React holds only
// the settled rightmost day and how far the future is unlocked. In Weeks mode
// every column (and so every "day" here) is a calendar week.
export function useGridDates({
  today,
  columnWidth,
  dateWidth,
  visibleDays,
  enabled,
  unit = 'day',
  weekStart = 'monday',
  initialDay = 0,
}: {
  today: string;
  columnWidth: number;
  dateWidth: number;
  visibleDays: number;
  enabled: boolean;
  unit?: 'day' | 'week';
  weekStart?: WeekStart;
  /** The rightmost column when the grid first appears (Weeks → a week). */
  initialDay?: number;
}) {
  const [rightmostDay, setRightmostDay] = useState(initialDay);
  const [unlockedFuture, setUnlockedFuture] = useState(
    Math.max(0, -initialDay),
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const atTodayBoundary = rightmostDay === 0 && unlockedFuture === 0;
  const scroll = useCanvasGridScroll({
    column: columnWidth,
    width: dateWidth,
    unlockedFuture,
    enabled,
    onSettle: setRightmostDay,
    onReveal: revealFuture,
  });

  // Days ago of the newest and oldest dates in view.
  const weekDaysAgo = (week: number, end: number) =>
    ordinal(today) - (weekColumnStart(today, weekStart, week) + end);
  const newestAgo =
    unit === 'day'
      ? rightmostDay
      : rightmostDay === 0
        ? 0
        : weekDaysAgo(rightmostDay, 6);
  const oldestAgo =
    unit === 'day'
      ? rightmostDay + visibleDays - 1
      : weekDaysAgo(rightmostDay + visibleDays - 1, 0);
  const newest = calendarDay(today, newestAgo);
  const oldest = calendarDay(today, oldestAgo);
  const sameMonth =
    newest.getMonth() === oldest.getMonth() &&
    newest.getFullYear() === oldest.getFullYear();
  const month = sameMonth
    ? newest.toLocaleDateString(undefined, { month: 'long' })
    : `${oldest.toLocaleDateString(undefined, { month: 'short' })} – ${newest.toLocaleDateString(undefined, { month: 'short' })}`;
  const year =
    oldest.getFullYear() === newest.getFullYear()
      ? String(newest.getFullYear())
      : `${oldest.getFullYear()} – ${newest.getFullYear()}`;

  function revealFuture(pullDistance?: number) {
    // The release continues by its own distance: normally tomorrow lands
    // beside the old edge. Explicit menu access gets a tick.
    const day = futureRevealDay(
      -(pullDistance ?? columnWidth),
      columnWidth,
      unlockedFuture,
    );
    if (pullDistance === undefined) feedback('selection');
    setUnlockedFuture(unlockedFuture + FUTURE_BATCH);
    scroll.scrollToDay(day, () => setRightmostDay(day));
  }

  function returnToToday() {
    if (!atTodayBoundary) feedback('selection');
    scroll.scrollToDay(0, () => {
      setRightmostDay(0);
      setUnlockedFuture(0);
    });
  }

  function openDateActions() {
    feedback('selection');
    setDatePickerOpen(true);
  }

  function navigateToDate(day: number) {
    setDatePickerOpen(false);
    if (day < -unlockedFuture) setUnlockedFuture(-day);
    scroll.scrollToDay(day, () => setRightmostDay(day));
  }

  // Width, column size and font changes keep the logical rightmost date.
  function prepareResize() {
    if (columnWidth > 0)
      setRightmostDay(Math.round(scroll.offset.get() / columnWidth));
  }
  useLayoutEffect(() => {
    if (columnWidth > 0) scroll.placeDay(rightmostDay, columnWidth);
    // Only a new column width moves the canvas; settles never do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnWidth]);

  // Compact mode's narrow corner: the newest month alone.
  const shortMonth = newest.toLocaleDateString(undefined, { month: 'short' });
  return {
    rightmostDay,
    unlockedFuture,
    atTodayBoundary,
    datePickerOpen,
    setDatePickerOpen,
    month,
    shortMonth,
    newestYear: String(newest.getFullYear()),
    year,
    offset: scroll.offset,
    pull: scroll.pull,
    pan: scroll.pan,
    flinging: scroll.flinging,
    prepareResize,
    returnToToday,
    openDateActions,
    navigateToDate,
    revealFuture,
  };
}
