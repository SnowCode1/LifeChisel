import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAnimatedStyle } from 'react-native-reanimated';
import { type GridDay, createGridDayCache, calendarDay } from './calendar';
import { performanceEnabled, recordPerformance } from './performance';
import { useGridScroll } from './useGridScroll';
import { FUTURE_BATCH, futureRevealDay } from './gridNavigation';
import { feedback } from './haptics';

// Discrete date navigation and native-list generations belong together. Scrolling
// still runs in useGridScroll on the UI thread; no per-frame React state is added.
export function useGridDates({
  today,
  columnWidth,
  dateWidth,
  visibleDays,
}: {
  today: string;
  columnWidth: number;
  dateWidth: number;
  visibleDays: number;
}) {
  const [dayCount, setDayCount] = useState(90);
  const [futureCount, setFutureCount] = useState(0);
  const [origin, setOrigin] = useState(0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const layoutStarted = useRef(0);
  const pendingNavigation = useRef<number | null>(null);
  const layoutReady = useRef<{
    frame: object;
    width: number;
    target: number;
    headerSize: boolean;
    bodySize: boolean;
    headerLayout: boolean;
    bodyLayout: boolean;
    startedAt: number;
  } | null>(null);
  const [rangeReset, setRangeReset] = useState(0);
  const pendingReveal = useRef<{
    futureCount: number;
    dayCount: number;
    origin: number;
    day: number;
    headerReady: boolean;
    bodyReady: boolean;
  } | null>(null);
  const [rightmostDay, setRightmostDay] = useState(0);
  const atTodayBoundary =
    rightmostDay === 0 && futureCount === 0 && origin === 0;
  const dateCache = useMemo(() => createGridDayCache(today), [today]);
  const days = useMemo(
    () => dateCache(dayCount, futureCount, origin),
    [dateCache, dayCount, futureCount, origin],
  );
  const [frame, setFrame] = useState({
    width: columnWidth,
    reset: rangeReset,
    index: 0,
    offset: { x: 0, y: 0 },
  });
  const [readyFrame, setReadyFrame] = useState<object | null>(null);
  const layoutBusy = readyFrame !== frame;
  if (frame.width !== columnWidth || frame.reset !== rangeReset) {
    const index = Math.max(
      0,
      Math.min(days.length - visibleDays, futureCount + rightmostDay - origin),
    );
    setFrame({
      width: columnWidth,
      reset: rangeReset,
      index,
      offset: { x: index * columnWidth, y: 0 },
    });
  }
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

  function revealFuture(offset?: number) {
    if (origin > 0) {
      loadNewerHistory();
      return;
    }
    if (pendingReveal.current) return;
    stopSync();
    const day =
      origin +
      futureRevealDay(offset ?? -columnWidth, columnWidth, futureCount);
    // The pull already ticks at its threshold. Explicit menu access gets a tick.
    if (offset === undefined) feedback('selection');
    if (Platform.OS === 'android') {
      // Android FlashList corrects for prepended columns after its content-size
      // events, so settling the reveal then raced each list's correction and
      // left them drifting. Remount both at the new date, as far navigation does.
      setFutureCount(futureCount + FUTURE_BATCH);
      setRightmostDay(day);
      setRangeReset((value) => value + 1);
      return;
    }
    pendingReveal.current = {
      futureCount: futureCount + FUTURE_BATCH,
      dayCount,
      origin,
      day,
      headerReady: false,
      bodyReady: false,
    };
    setFutureCount(futureCount + FUTURE_BATCH);
  }

  const {
    header,
    body,
    stopSync,
    continueReveal,
    scrollToDay,
    alignGeometry,
    pull,
    offset,
    geometryReady,
    headerScroll,
    bodyScroll,
    edgePull,
  } = useGridScroll({
    columnWidth,
    visibleDays,
    dayCount,
    futureCount,
    origin,
    onSettle: settleDate,
    onReveal: revealFuture,
  });

  function revealWhenReady(list: 'header' | 'body', contentWidth: number) {
    const pending = pendingReveal.current;
    if (!pending) return;
    const expectedWidth =
      (pending.dayCount + pending.futureCount) * columnWidth;
    if (contentWidth < expectedWidth - 1) return;
    if (list === 'header') pending.headerReady = true;
    else pending.bodyReady = true;
    if (!pending.headerReady || !pending.bodyReady) return;
    pendingReveal.current = null;
    setRightmostDay(pending.day);
    // Native anchoring preserves the visible dates as new columns are inserted.
    // Only after both lists have that content do we smoothly settle the pull.
    continueReveal(
      (pending.futureCount + pending.day - pending.origin) * columnWidth,
    );
  }
  const columnReadiness = useAnimatedStyle(() => ({
    opacity: geometryReady.value ? 1 : 0,
  }));
  function returnToToday() {
    if (!atTodayBoundary) feedback('selection');
    stopSync();
    pendingReveal.current = null;
    if (origin !== 0) {
      navigateToDate(0);
      return;
    }
    scrollToDay(0, () => {
      setRightmostDay(0);
      if (futureCount) {
        setFutureCount(0);
        setRangeReset((reset) => reset + 1);
      }
    });
  }

  function openDateActions() {
    feedback('selection');
    setDatePickerOpen(true);
  }

  function settleDate(day: number, finished: boolean) {
    setRightmostDay(day);
    // Android loads newer history only once a gesture settles near the newest
    // loaded date: without native anchoring, inserting it needs a remount.
    if (
      Platform.OS === 'android' &&
      finished &&
      origin > 0 &&
      day - (origin - futureCount) < visibleDays * 2
    ) {
      loadNewerHistory(day);
      return;
    }
    if (
      !finished ||
      dayCount + futureCount <= 360 ||
      pendingReveal.current ||
      layoutReady.current
    )
      return;
    // Compact only after the native gesture settles; never rebuild a window
    // under an active finger or allocate a lifetime of fallback date labels.
    stopSync();
    const first = origin - futureCount;
    setOrigin(day > 90 ? day - 90 : first < 0 ? Math.max(first, day - 90) : 0);
    setFutureCount(0);
    setDayCount(270);
    setRangeReset((value) => value + 1);
  }

  function navigateToDate(day: number) {
    setDatePickerOpen(false);
    stopSync();
    pendingReveal.current = null;
    const first = origin - futureCount;
    const last = origin + dayCount - visibleDays;
    if (day >= first && day <= last) {
      scrollToDay(day, () => setRightmostDay(day));
      return;
    }
    // Start close enough to animate arrival without mounting intervening years.
    const nextOrigin =
      day === 0 ? 0 : day > 30 ? day - 30 : day < 0 ? day - 30 : 0;
    // Android FlashList re-applies its initial index for ~100 ms after first
    // layout, overriding an arrival animation started at readiness; land there.
    const animateArrival = Platform.OS !== 'android';
    pendingNavigation.current = animateArrival ? day : null;
    setOrigin(nextOrigin);
    setFutureCount(0);
    setDayCount(120);
    setRightmostDay(animateArrival ? day + visibleDays : day);
    setRangeReset((value) => value + 1);
  }

  function loadNewerHistory(settled?: number) {
    if (origin <= 0 || pendingReveal.current || layoutReady.current) return;
    const added = Math.min(90, origin);
    const day =
      settled ?? origin + Math.round(offset.value / columnWidth) - futureCount;
    if (Platform.OS === 'android') {
      // Native anchoring is off on Android (see `shared`), so inserted newer
      // days would shift the visible columns. Remount at this date instead.
      stopSync();
      setOrigin(origin - added);
      setDayCount(dayCount + added);
      setRightmostDay(day);
      setRangeReset((value) => value + 1);
      return;
    }
    pendingReveal.current = {
      origin: origin - added,
      futureCount,
      dayCount: dayCount + added,
      day,
      headerReady: false,
      bodyReady: false,
    };
    setOrigin((value) => value - added);
    setDayCount((count) => count + added);
  }

  useLayoutEffect(() => {
    if (columnWidth <= 0) return;
    layoutReady.current = {
      frame,
      width: columnWidth,
      target: frame.offset.x,
      headerSize: false,
      bodySize: false,
      headerLayout: false,
      bodyLayout: false,
      startedAt: performanceEnabled
        ? layoutStarted.current || performance.now()
        : 0,
    };
    alignGeometry(frame.offset.x, false);
    layoutStarted.current = 0;
    // This effect belongs to a new native-list generation, not scroll settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  function finishLayout() {
    const pending = layoutReady.current;
    if (
      !pending ||
      !pending.headerSize ||
      !pending.bodySize ||
      !pending.headerLayout ||
      !pending.bodyLayout
    )
      return;
    layoutReady.current = null;
    if (performanceEnabled)
      recordPerformance('grid.ready', performance.now() - pending.startedAt);
    setReadyFrame(pending.frame);
    alignGeometry(pending.target, true);
    const day = pendingNavigation.current;
    if (day !== null) {
      pendingNavigation.current = null;
      scrollToDay(day, () => setRightmostDay(day));
    }
  }
  function listLaidOut(list: 'header' | 'body', viewportWidth: number) {
    const pending = layoutReady.current;
    if (
      !pending ||
      pending.frame !== frame ||
      pending.width !== columnWidth ||
      Math.abs(viewportWidth - dateWidth) > 1
    )
      return;
    if (list === 'header') pending.headerLayout = true;
    else pending.bodyLayout = true;
    finishLayout();
  }
  function listLoaded(list: 'header' | 'body') {
    const pending = layoutReady.current;
    if (!pending || pending.frame !== frame || pending.width !== columnWidth)
      return;
    // FlashList onLoad means its first visible items have actually been drawn.
    // Total content width is estimated; waiting for exact lifetime width can
    // leave valid, drawn columns hidden indefinitely.
    if (list === 'header') pending.headerSize = true;
    else pending.bodySize = true;
    finishLayout();
  }
  function listSized(list: 'header' | 'body', contentWidth: number) {
    const pending = layoutReady.current;
    if (
      Platform.OS === 'web' &&
      pending &&
      pending.frame === frame &&
      pending.width === columnWidth &&
      Math.abs(contentWidth - days.length * columnWidth) <= 1
    ) {
      if (list === 'header') pending.headerSize = true;
      else pending.bodySize = true;
      finishLayout();
    }
    revealWhenReady(list, contentWidth);
  }

  const shared = {
    data: days,
    horizontal: true,
    inverted: true,
    bounces: true,
    alwaysBounceHorizontal: true,
    overScrollMode: 'auto' as const,
    showsHorizontalScrollIndicator: false,
    directionalLockEnabled: true,
    nestedScrollEnabled: true,
    snapToInterval: columnWidth,
    decelerationRate: 'fast' as const,
    scrollEventThrottle: 16,
    drawDistance: dateWidth,
    columnWidth,
    keyExtractor: (day: GridDay) => day.key,
    // Android's native anchoring follows one recycled column view; when
    // FlashList moves that view, Android scrolls by the same distance and the
    // dates jump. Android remounts instead of inserting columns before the
    // visible ones, so it never needs anchoring.
    maintainVisibleContentPosition: { disabled: Platform.OS === 'android' },
    // Both lists may request the same expansion; use this rendered boundary once.
    onEndReached: () => setDayCount((count) => Math.max(count, dayCount + 90)),
    onEndReachedThreshold: 2,
    onStartReached:
      Platform.OS === 'android' ? undefined : () => loadNewerHistory(),
    onStartReachedThreshold: 2,
  };

  function prepareResize() {
    if (performanceEnabled) layoutStarted.current = performance.now();
    stopSync();
    if (pendingReveal.current) {
      setRightmostDay(pendingReveal.current.day);
      pendingReveal.current = null;
    }
    // Read the current native position once at rotation, not the earlier
    // predicted momentum destination. Both remounts receive that anchor.
    const anchor =
      origin +
      Math.round(offset.value / Math.max(1, columnWidth)) -
      futureCount;
    setRightmostDay(anchor);
    setDayCount((count) => Math.max(count, rightmostDay - origin + 90));
  }
  return {
    days,
    rightmostDay,
    atTodayBoundary,
    datePickerOpen,
    setDatePickerOpen,
    month,
    year,
    layoutBusy,
    frame,
    rangeReset,
    columnReadiness,
    header,
    body,
    headerScroll,
    bodyScroll,
    edgePull,
    pull,
    offset,
    shared,
    listLaidOut,
    listLoaded,
    listSized,
    prepareResize,
    returnToToday,
    openDateActions,
    navigateToDate,
    revealFuture,
  };
}
