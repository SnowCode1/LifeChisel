import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  runOnJS,
  runOnUI,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { FUTURE_PULL_DISTANCE } from '../gridNavigation';
import { feedback } from '../haptics';
import { rightmostDayAt, rubberBand } from './gridGeometry';
import { planFling, rubberBandSlope, TAP_STOP_SPEED } from './gridMotion';
import { withFling } from './withFling';

// A century of history is effectively unlimited: dates are generated per frame.
const PAST_DAYS = 36_600;
const navigation = {
  duration: 280,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};

// Horizontal scrolling for the canvas grid, entirely on the UI thread. React
// hears only discrete events: a settled day, a future reveal and arrivals.
export function useCanvasGridScroll({
  column,
  width,
  unlockedFuture,
  enabled,
  onSettle,
  onReveal,
}: {
  column: number;
  width: number;
  unlockedFuture: number;
  enabled: boolean;
  onSettle: (day: number) => void;
  onReveal: (pullDistance: number) => void;
}) {
  const offset = useSharedValue(0);
  // Displayed distance beyond the Today/future boundary; drives the streak.
  const pull = useSharedValue(0);
  const start = useSharedValue(0);
  const dragged = useSharedValue(false);
  const ticked = useSharedValue(false);
  // Momentum speed and when it was measured, for telling taps from stops.
  const speed = useSharedValue(0);
  const speedAt = useSharedValue(0);
  const minimum = -unlockedFuture * column;
  const maximum = PAST_DAYS * column;

  function settleAt(target: number) {
    'worklet';
    runOnJS(onSettle)(rightmostDayAt(target, column));
  }
  // Momentum, edge bounces and snapping are one planned curve that ends
  // exactly on a column (see gridMotion.ts).
  function release(velocity: number) {
    'worklet';
    const fling = planFling(offset.value, velocity, column, minimum, maximum);
    offset.set(
      withFling(
        fling,
        () => settleAt(fling.rest),
        (current) => {
          speed.set(current);
          speedAt.set(Date.now());
        },
      ),
    );
  }

  /**
   * Whether a touch now lands on fast momentum. Read at touch-down, it stays
   * true after the pan stops the fling, so that touch only stops the scroll.
   */
  function flinging() {
    'worklet';
    return speed.value > TAP_STOP_SPEED && Date.now() - speedAt.value < 100;
  }

  function pan() {
    return Gesture.Pan()
      .enabled(enabled && column > 0)
      .activeOffsetX([-10, 10])
      .failOffsetY([-12, 12])
      .onBegin(() => {
        // A finger stops momentum, as a native scroll view does.
        cancelAnimation(offset);
        dragged.set(false);
      })
      .onStart((event) => {
        dragged.set(true);
        ticked.set(false);
        // The pan activates after 10 pt of travel; absorb that slop so the
        // grid picks up under the finger instead of jumping to catch up.
        start.set(offset.value - event.translationX);
      })
      .onUpdate((event) => {
        const raw = start.value + event.translationX;
        if (raw < minimum) {
          const distance = rubberBand(minimum - raw, width);
          offset.set(minimum - distance);
          pull.set(distance);
          if (distance >= FUTURE_PULL_DISTANCE && !ticked.value) {
            ticked.set(true);
            runOnJS(feedback)('boundary');
          }
        } else {
          offset.set(Math.min(maximum, raw));
          pull.set(0);
        }
      })
      .onEnd((event) => {
        const distance = pull.value;
        pull.set(0);
        if (distance >= FUTURE_PULL_DISTANCE) {
          // Only a deliberate release past the threshold reveals dates.
          runOnJS(onReveal)(distance);
          return;
        }
        // Past the edge, the content moves slower than the finger.
        const over = minimum - (start.value + event.translationX);
        release(
          event.velocityX * (distance > 0 ? rubberBandSlope(over, width) : 1),
        );
      })
      .onFinalize(() => {
        // A touch that never became a drag may have stopped a fling between
        // columns; settle it on the nearest one.
        if (dragged.value) return;
        const target = rightmostDayAt(offset.value, column) * column;
        if (Math.abs(target - offset.value) > 0.01) release(0);
      });
  }

  /** Animate to a day (rightmost column), then call `onArrive` on JS. */
  function scrollToDay(day: number, onArrive: () => void) {
    runOnUI((target: number) => {
      'worklet';
      cancelAnimation(offset);
      pull.set(0);
      offset.set(
        withTiming(target, navigation, (done) => {
          if (done) runOnJS(onArrive)();
        }),
      );
    })(day * column);
  }

  /** Place a day immediately, e.g. after the column width changes. */
  function placeDay(day: number, nextColumn: number) {
    runOnUI((target: number) => {
      'worklet';
      cancelAnimation(offset);
      offset.set(target);
    })(day * nextColumn);
  }

  return { offset, pull, pan, flinging, scrollToDay, placeDay };
}
