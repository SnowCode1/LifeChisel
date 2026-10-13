import { useLayoutEffect, useState } from 'react';
import { calendarDay } from '@onpurpose/core/calendar';
import { useCanvasGridScroll } from './canvasGrid/useCanvasGridScroll';
import { FUTURE_BATCH, futureRevealDay } from './gridNavigation';
import { feedback } from './haptics';

// Discrete date navigation for the canvas grid. Every date is generated on the
// fly, so there are no list windows, remounts or anchoring: React holds only
// the settled rightmost day and how far the future is unlocked.
export function useGridDates({
  today,
  columnWidth,
  dateWidth,
  visibleDays,
  enabled,
}: {
  today: string;
  columnWidth: number;
  dateWidth: number;
  visibleDays: number;
  enabled: boolean;
}) {
  const [rightmostDay, setRightmostDay] = useState(0);
  const [unlockedFuture, setUnlockedFuture] = useState(0);
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

  const newest = calendarDay(today, rightmostDay);
  const oldest = calendarDay(today, rightmostDay + visibleDays - 1);
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

  return {
    rightmostDay,
    unlockedFuture,
    atTodayBoundary,
    datePickerOpen,
    setDatePickerOpen,
    month,
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
