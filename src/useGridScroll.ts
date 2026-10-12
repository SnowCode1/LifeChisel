import { useLayoutEffect } from 'react';
import type { FlashListRef } from '@shopify/flash-list';
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  runOnJS,
  runOnUI,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { GridDay } from './calendar';
import {
  edgePullDecision,
  edgePullDistance,
  shouldRevealFuture,
  settledDay,
} from './gridNavigation';
import { feedback } from './haptics';

// Exactly one native list drives the other. Synchronization and visual pull
// feedback stay on the UI thread; React receives only discrete gesture events.
export function useGridScroll({
  columnWidth,
  visibleDays,
  dayCount,
  futureCount,
  origin,
  lockedDays = 0,
  onSettle,
  onReveal,
}: {
  columnWidth: number;
  visibleDays: number;
  dayCount: number;
  futureCount: number;
  origin: number;
  /** Loaded days newer than the scroll boundary (Android's future preload). */
  lockedDays?: number;
  onSettle: (day: number, finished: boolean) => void;
  onReveal: (offset: number) => void;
}) {
  const header = useAnimatedRef<FlashListRef<GridDay>>();
  const body = useAnimatedRef<FlashListRef<GridDay>>();
  const driver = useSharedValue(0);
  const geometryReady = useSharedValue(true);
  const pull = useSharedValue(0);
  const dragging = useSharedValue(false);
  const thresholdTicked = useSharedValue(false);
  const offset = useSharedValue(0);
  const navigationOffset = useSharedValue(0);
  const edgeStartX = useSharedValue(0);
  const edgeStartY = useSharedValue(0);
  const edgeDistance = useSharedValue(0);
  const boundary = lockedDays * columnWidth;

  useAnimatedReaction(
    () => (driver.value === 3 ? navigationOffset.value : null),
    (position) => {
      if (position === null) return;
      offset.set(position);
      scrollTo(header, position, 0, false);
      scrollTo(body, position, 0, false);
    },
  );

  useLayoutEffect(() => {
    driver.set(0);
    pull.set(0);
    dragging.set(false);
    thresholdTicked.set(false);
    cancelAnimation(navigationOffset);
    return () => {
      cancelAnimation(navigationOffset);
    };
  }, [
    columnWidth,
    futureCount,
    driver,
    pull,
    dragging,
    thresholdTicked,
    navigationOffset,
  ]);

  function tickAtThreshold(offset: number) {
    'worklet';
    if (
      dragging.value &&
      origin <= 0 &&
      !thresholdTicked.value &&
      shouldRevealFuture(offset)
    ) {
      thresholdTicked.set(true);
      runOnJS(feedback)('boundary');
    }
  }

  function dayForOffset(offset: number) {
    'worklet';
    return (
      origin +
      settledDay(
        Math.max(offset, boundary),
        columnWidth,
        dayCount,
        futureCount,
        visibleDays,
      )
    );
  }

  // Android's preloaded future dates sit beyond the boundary; ordinary
  // scrolling stops there as it would at a list's own edge. Navigation (3) and
  // geometry alignment (4) may cross it.
  function holdAtBoundary(x: number) {
    'worklet';
    if (
      boundary <= 0 ||
      x >= boundary - 0.5 ||
      driver.value === 3 ||
      driver.value === 4
    )
      return false;
    offset.set(boundary);
    scrollTo(header, boundary, 0, false);
    scrollTo(body, boundary, 0, false);
    return true;
  }

  const headerScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      cancelAnimation(navigationOffset);
      driver.set(1);
      dragging.set(true);
      thresholdTicked.set(false);
    },
    onScroll: (event) => {
      if (holdAtBoundary(event.contentOffset.x)) return;
      if (driver.value !== 1) return;
      offset.set(event.contentOffset.x);
      scrollTo(body, event.contentOffset.x, 0, false);
      pull.set(origin > 0 ? 0 : Math.max(0, -event.contentOffset.x));
      tickAtThreshold(event.contentOffset.x);
    },
    onEndDrag: (event) => {
      if (driver.value !== 1) return;
      tickAtThreshold(event.contentOffset.x);
      dragging.set(false);
      if (
        shouldRevealFuture(event.contentOffset.x) ||
        (origin > 0 && event.contentOffset.x < 0)
      ) {
        driver.set(0);
        pull.set(0);
        runOnJS(onReveal)(event.contentOffset.x);
      } else {
        runOnJS(onSettle)(
          dayForOffset(event.targetContentOffset?.x ?? event.contentOffset.x),
          Math.abs(
            (event.targetContentOffset?.x ?? event.contentOffset.x) -
              event.contentOffset.x,
          ) < 1,
        );
      }
    },
    onMomentumEnd: (event) => {
      if (driver.value === 1)
        runOnJS(onSettle)(dayForOffset(event.contentOffset.x), true);
    },
  });
  const bodyScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      cancelAnimation(navigationOffset);
      driver.set(2);
      dragging.set(true);
      thresholdTicked.set(false);
    },
    onScroll: (event) => {
      if (holdAtBoundary(event.contentOffset.x)) return;
      if (driver.value === 0 || driver.value === 2)
        offset.set(event.contentOffset.x);
      if (driver.value !== 2) return;
      scrollTo(header, event.contentOffset.x, 0, false);
      pull.set(origin > 0 ? 0 : Math.max(0, -event.contentOffset.x));
      tickAtThreshold(event.contentOffset.x);
    },
    onEndDrag: (event) => {
      if (driver.value !== 2) return;
      tickAtThreshold(event.contentOffset.x);
      dragging.set(false);
      if (
        shouldRevealFuture(event.contentOffset.x) ||
        (origin > 0 && event.contentOffset.x < 0)
      ) {
        driver.set(0);
        pull.set(0);
        runOnJS(onReveal)(event.contentOffset.x);
      } else {
        runOnJS(onSettle)(
          dayForOffset(event.targetContentOffset?.x ?? event.contentOffset.x),
          Math.abs(
            (event.targetContentOffset?.x ?? event.contentOffset.x) -
              event.contentOffset.x,
          ) < 1,
        );
      }
    },
    onMomentumEnd: (event) => {
      if (driver.value === 2)
        runOnJS(onSettle)(dayForOffset(event.contentOffset.x), true);
    },
  });
  function stopSync() {
    cancelAnimation(navigationOffset);
    driver.set(0);
    pull.set(0);
    dragging.set(false);
  }
  function scrollToDay(day: number, onArrive: () => void) {
    runOnUI(() => {
      'worklet';
      cancelAnimation(navigationOffset);
      dragging.set(false);
      pull.set(0);
      // Keep the expanded range until arrival, including when coming from future days.
      const target = (futureCount + day - origin) * columnWidth;
      navigationOffset.set(offset.value);
      driver.set(3);
      // Stop native momentum before taking over both lists on the UI thread.
      scrollTo(header, offset.value, 0, false);
      scrollTo(body, offset.value, 0, false);
      navigationOffset.set(
        withTiming(
          target,
          {
            duration: 280,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          },
          (finished) => {
            if (!finished) return;
            scrollTo(header, target, 0, false);
            scrollTo(body, target, 0, false);
            offset.set(target);
            driver.set(0);
            runOnJS(onArrive)();
          },
        ),
      );
    })();
  }
  function alignGeometry(target: number, ready: boolean) {
    runOnUI((position: number, finished: boolean) => {
      'worklet';
      cancelAnimation(navigationOffset);
      dragging.set(false);
      pull.set(0);
      // Ignore old mount offsets until both new lists have their native sizes.
      driver.set(finished ? 0 : 4);
      geometryReady.set(finished);
      offset.set(position);
      scrollTo(header, position, 0, false);
      scrollTo(body, position, 0, false);
    })(target, ready);
  }
  // Android's stand-in for the iOS overscroll pull (see FuturePullZone). The
  // list itself stays at its edge; the streak, threshold tick and release
  // reveal are the same as for a native pull.
  const edgePull = {
    begin(x: number, y: number) {
      'worklet';
      edgeStartX.set(x);
      edgeStartY.set(y);
      edgeDistance.set(0);
      // Only a list resting on its boundary (its newest unlocked date), not
      // navigating or resetting geometry, can be pulled.
      return (
        driver.value !== 3 &&
        driver.value !== 4 &&
        geometryReady.value &&
        offset.value <= boundary + 1
      );
    },
    move(x: number, y: number) {
      'worklet';
      return edgePullDecision(x - edgeStartX.value, y - edgeStartY.value);
    },
    start() {
      'worklet';
      cancelAnimation(navigationOffset);
      dragging.set(true);
      thresholdTicked.set(false);
    },
    update(translationX: number) {
      'worklet';
      const distance = edgePullDistance(-translationX);
      edgeDistance.set(distance);
      pull.set(origin > 0 ? 0 : distance);
      tickAtThreshold(-distance);
    },
    end(success: boolean) {
      'worklet';
      const distance = edgeDistance.value;
      edgeDistance.set(0);
      dragging.set(false);
      pull.set(0);
      // The columns never moved, so unlike a native pull there is no released
      // distance to continue: reveal one column, putting tomorrow at the edge.
      if (
        success &&
        (shouldRevealFuture(-distance) || (origin > 0 && distance > 0))
      )
        runOnJS(onReveal)(-columnWidth);
    },
  };
  function continueReveal(offset: number) {
    runOnUI((target: number) => {
      'worklet';
      // A new user drag takes priority over the reveal animation.
      if (dragging.value) return;
      driver.set(2);
      scrollTo(body, target, 0, true);
    })(offset);
  }
  return {
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
  };
}

export type EdgePull = ReturnType<typeof useGridScroll>['edgePull'];
