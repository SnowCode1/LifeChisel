import type { ReactElement } from 'react';
import { Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { EdgePull } from './useGridScroll';

// Android scroll views stop at their newest date instead of overscrolling, so
// the iOS pull past Today never produces a negative offset there. This pan
// recognises a pull that starts at that edge and hands it to useGridScroll.
// It fails for past-ward or vertical movement, leaving the list's own
// scrolling and the cells' taps untouched. iOS and web render the child alone.
export function FuturePullZone({
  pull,
  enabled,
  children,
}: {
  pull: EdgePull;
  enabled: boolean;
  children: ReactElement;
}) {
  if (Platform.OS !== 'android') return children;
  const gesture = Gesture.Pan()
    .enabled(enabled)
    .manualActivation(true)
    .onTouchesDown((event, manager) => {
      const touch = event.changedTouches[0];
      if (
        event.numberOfTouches !== 1 ||
        !touch ||
        !pull.begin(touch.absoluteX, touch.absoluteY)
      )
        manager.fail();
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0];
      if (event.numberOfTouches !== 1 || !touch) {
        manager.fail();
        return;
      }
      const decision = pull.move(touch.absoluteX, touch.absoluteY);
      if (decision === 'activate') manager.activate();
      else if (decision === 'fail') manager.fail();
    })
    .onStart(() => pull.start())
    .onUpdate((event) => pull.update(event.translationX))
    .onEnd((_event, success) => pull.end(success));
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}
