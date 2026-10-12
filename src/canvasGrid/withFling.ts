import { defineAnimation } from 'react-native-reanimated';
import type { AnimationCallback } from 'react-native-reanimated';
import { flingAt, type Fling } from './gridMotion';

type FlingState = {
  current: number;
  startTime: number;
  lastTime: number;
  settled: boolean;
};

/**
 * Runs a planned fling on a shared value. Positions come from the closed-form
 * curve at each frame's timestamp, so 60 and 120 Hz screens trace the same
 * path. `onSettled` runs once on the UI thread when the remaining creep is
 * invisible, before the final sub-pixel arrival; `onMove` hears the speed
 * (points per ms) every frame and 0 on arrival. Scrolling follows the finger,
 * so Reduce Motion does not skip it.
 */
export function withFling(
  fling: Fling,
  onSettled: () => void,
  onMove: (speed: number) => void,
  callback?: AnimationCallback,
): number {
  'worklet';
  return defineAnimation(fling.start, () => {
    'worklet';
    return {
      onStart(animation: FlingState, _value: number, now: number) {
        animation.current = fling.start;
        animation.startTime = now;
        animation.lastTime = now;
        animation.settled = false;
      },
      onFrame(animation: FlingState, now: number) {
        const [position, done, settled] = flingAt(
          fling,
          now - animation.startTime,
        );
        const elapsed = now - animation.lastTime;
        if (elapsed > 0)
          onMove(done ? 0 : Math.abs(position - animation.current) / elapsed);
        else if (done) onMove(0);
        animation.lastTime = now;
        animation.current = position;
        if (settled && !animation.settled) {
          animation.settled = true;
          onSettled();
        }
        return done;
      },
      callback,
      // Reanimated skips an animation whose `current` equals the value before
      // onStart (built-ins keep their target there). NaN never matches, so a
      // bounce that starts and ends on the same column still runs.
      current: NaN,
      toValue: fling.rest,
      startTime: 0,
      lastTime: 0,
      settled: false,
      reduceMotion: false,
    };
  }) as unknown as number;
}
