import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ScrollView } from 'react-native';
import {
  runOnJS,
  runOnUI,
  scrollTo,
  useAnimatedRef,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { feedback } from './haptics';

export type HabitTab = 'notes' | 'statistics';

// UIKit handles directional locking, snapping and finger-following movement.
// React only receives drag boundaries and aligned pages, never frame updates.
// The sheet opens on `start` when given (a Today tile's Notes or Statistics
// button), otherwise on Notes when the habit has any.
export function useHabitPages(
  hasNotes: boolean,
  width: number,
  start?: HabitTab,
) {
  const notesFirst = start ? start === 'notes' : hasNotes;
  const initial = notesFirst ? 0 : 1;
  const [tab, setTab] = useState<HabitTab>(notesFirst ? 'notes' : 'statistics');
  const [visited, setVisited] = useState({
    notes: notesFirst,
    statistics: !notesFirst,
  });
  const pager = useAnimatedRef<ScrollView>();
  const current = useRef(initial);
  const offset = useSharedValue(0);
  const pageWidth = useSharedValue(width);
  const reducedMotion = useReducedMotion();
  const prepare = useCallback(
    () =>
      setVisited((previous) =>
        previous.notes && previous.statistics
          ? previous
          : { notes: true, statistics: true },
      ),
    [],
  );
  useEffect(() => {
    // Warm the adjacent page after the first note is visible, not on every swipe.
    const timer = setTimeout(prepare, 200);
    return () => clearTimeout(timer);
  }, [prepare]);
  const align = useCallback(() => {
    if (!width) return;
    const x = current.current * width;
    runOnUI((nextWidth: number, nextOffset: number) => {
      // Change coordinate systems together, without a transient wrong page.
      pageWidth.set(nextWidth);
      offset.set(nextOffset);
      scrollTo(pager, nextOffset, 0, false);
    })(width, x);
  }, [width, pageWidth, offset, pager]);
  useLayoutEffect(align, [align]);

  const commit = useCallback(
    (index: number) => {
      if (index === current.current) return;
      prepare();
      current.current = index;
      setTab(index === 0 ? 'notes' : 'statistics');
      feedback('selection');
    },
    [prepare],
  );
  useAnimatedReaction(
    () => {
      const width = pageWidth.get();
      if (!width) return -1;
      const x = offset.get();
      const index = Math.max(0, Math.min(1, Math.round(x / width)));
      return Math.abs(x - index * width) < 0.5 ? index : -1;
    },
    (index, previous) => {
      // Reports the actual aligned page after swipes, taps or rotation.
      // Also covers web, which does not emit native momentum events.
      // No React traffic while between pages; only an aligned page is reported.
      if (index >= 0 && index !== previous) runOnJS(commit)(index);
    },
  );
  const select = useCallback(
    (next: HabitTab) => {
      prepare();
      const index = next === 'notes' ? 0 : 1;
      pager.current?.scrollTo({
        x: index * width,
        y: 0,
        animated: !reducedMotion,
      });
    },
    [prepare, width, reducedMotion, pager],
  );
  const onScroll = useAnimatedScrollHandler((event) =>
    offset.set(event.contentOffset.x),
  );

  return {
    tab,
    visited,
    pager,
    offset,
    pageWidth,
    select,
    prepare,
    onScroll,
    align,
  };
}
