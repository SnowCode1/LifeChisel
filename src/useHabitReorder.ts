import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  type ScrollView,
  type View,
} from 'react-native';
import {
  cancelAnimation,
  runOnJS,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { Habit } from '@onpurpose/core/habits';
import type { HabitAnchor } from './HabitName';
import {
  dragDestination,
  moveHabit,
  habitRowPositions,
} from '@onpurpose/core/habitOrdering';
import { feedback } from './haptics';
import { reorderSpring, rowRemovalTiming } from './motion';

export function useHabitReorder(
  habits: Habit[],
  heights: Record<string, number>,
  fallback: number,
  onReorder: (ids: string[]) => boolean,
  rowGeometry: string,
) {
  const root = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const viewport = useRef<View>(null);
  const geometry = useRef({
    rootY: 0,
    rootX: 0,
    bodyY: 0,
    bodyHeight: 0,
    rootHeight: 0,
    offset: 0,
  });
  const [menu, setMenu] = useState<{ id: string; anchor: HabitAnchor } | null>(
    null,
  );
  const [mode, setMode] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragY = useSharedValue(0);
  const rowTops = useSharedValue<Record<string, number>>({});
  const bodyTop = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const drag = useRef<{
    id: string;
    ids: string[];
    draft: string[];
    startY: number;
    pageY: number;
    offset: number;
    top: number;
    height: number;
    target: number;
  } | null>(null);
  const frame = useRef<number | null>(null);
  const settling = useRef<string | null>(null);
  const latest = useRef({ habits, heights, fallback, onReorder });
  const previousRows = useRef({ identity: '', geometry: rowGeometry });
  const identity = habits.map((habit) => habit.id).join('|');
  useLayoutEffect(() => {
    latest.current = { habits, heights, fallback, onReorder };
  });
  // Preview swaps write shared targets, never React state. A grid render here
  // rebuilds date cells and colour calculations on the same JS thread as touch input.
  function resetTargets() {
    const current = latest.current;
    rowTops.set(
      habitRowPositions(
        current.habits.map((habit) => habit.id),
        current.heights,
        current.fallback,
      ).tops,
    );
  }
  useLayoutEffect(() => {
    const previous = previousRows.current;
    previousRows.current = { identity, geometry: rowGeometry };
    if (drag.current || settling.current) return;
    const target = habitRowPositions(
      habits.map((habit) => habit.id),
      heights,
      fallback,
    ).tops;
    if (
      previous.identity &&
      previous.identity !== identity &&
      previous.geometry === rowGeometry
    ) {
      // Keep the object's keys identical for Reanimated's record interpolation.
      // Survivors start at their current animated position; restored/new rows
      // start at their own target. Removed IDs do not accumulate in this cache.
      const current = rowTops.get();
      rowTops.set(
        Object.fromEntries(
          Object.keys(target).map((id) => [id, current[id] ?? target[id]]),
        ),
      );
      rowTops.set(withTiming(target, rowRemovalTiming));
    } else resetTargets();
  }, [habits, heights, fallback, identity, rowGeometry]); // eslint-disable-line react-hooks/exhaustive-deps
  const [bounds, setBounds] = useState({ rootY: 0, rootHeight: 0 });
  function measure() {
    root.current?.measureInWindow((x, y, _, height) => {
      setBounds((previous) =>
        previous.rootY === y && previous.rootHeight === height
          ? previous
          : { rootY: y, rootHeight: height },
      );
      Object.assign(geometry.current, {
        rootX: x,
        rootY: y,
        rootHeight: height,
      });
      bodyTop.set(geometry.current.bodyY - y);
    });
    viewport.current?.measureInWindow((_, y, __, height) => {
      Object.assign(geometry.current, { bodyY: y, bodyHeight: height });
      bodyTop.set(y - geometry.current.rootY);
    });
  }
  function stop() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }
  function cancel() {
    stop();
    cancelAnimation(dragY);
    settling.current = null;
    drag.current = null;
    setDragId(null);
    resetTargets();
    setMenu(null);
  }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancel();
    });
    return () => {
      subscription.remove();
      stop();
      cancelAnimation(dragY);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Own committed drop is settling into place; unrelated changes cancel a drag.
    if (settling.current === identity) return stop;
    // Persisted identity changes must cancel an in-flight native drag.
    if (drag.current || settling.current) cancel();
    else setMenu(null);
    return stop;
  }, [identity]); // eslint-disable-line react-hooks/exhaustive-deps
  function update() {
    const d = drag.current;
    if (!d) return;
    const g = geometry.current;
    const delta = d.pageY - d.startY;
    dragY.set(
      Math.max(
        g.bodyY - g.rootY,
        Math.min(
          g.bodyY - g.rootY + g.bodyHeight - d.height,
          g.bodyY - g.rootY + d.top - d.offset + delta,
        ),
      ),
    );
    const centre = d.top + delta + (g.offset - d.offset) + d.height / 2;
    const target = dragDestination(
      d.ids,
      latest.current.heights,
      latest.current.fallback,
      centre,
    );
    if (target !== d.target) {
      d.target = target;
      d.draft = moveHabit(d.ids, d.id, target);
      rowTops.set(
        withSpring(
          habitRowPositions(
            d.draft,
            latest.current.heights,
            latest.current.fallback,
          ).tops,
          reorderSpring,
        ),
      );
      feedback('selection');
    }
  }
  function autoScroll() {
    const d = drag.current;
    if (!d) return;
    const g = geometry.current;
    const { total } = habitRowPositions(
      d.ids,
      latest.current.heights,
      latest.current.fallback,
    );
    const edge = 44;
    const speed =
      d.pageY < g.bodyY + edge
        ? -Math.min(7, (g.bodyY + edge - d.pageY) / 7)
        : d.pageY > g.bodyY + g.bodyHeight - edge
          ? Math.min(7, (d.pageY - (g.bodyY + g.bodyHeight - edge)) / 7)
          : 0;
    const next = Math.max(
      0,
      Math.min(Math.max(0, total - g.bodyHeight), g.offset + speed),
    );
    if (next !== g.offset) {
      g.offset = next;
      scrollOffset.set(next);
      scroll.current?.scrollTo({ y: next, animated: false });
      update();
    }
    frame.current = requestAnimationFrame(autoScroll);
  }
  function beginOrMove(id: string, pageY: number, startY: number) {
    if (settling.current) return;
    if (!drag.current) {
      const ids = latest.current.habits.map((habit) => habit.id),
        source = ids.indexOf(id);
      if (source < 0) return;
      const height = latest.current.heights[id] ?? latest.current.fallback;
      const top = habitRowPositions(
        ids,
        latest.current.heights,
        latest.current.fallback,
      ).tops[id];
      drag.current = {
        id,
        ids,
        draft: ids,
        startY,
        pageY,
        offset: geometry.current.offset,
        top,
        height,
        target: source,
      };
      setDragId(id);
      setMenu(null);
      resetTargets();
      if (!menu) feedback('selection');
      frame.current = requestAnimationFrame(autoScroll);
    }
    drag.current.pageY = pageY;
    update();
  }
  function finishDrop() {
    settling.current = null;
    setDragId(null);
    setMenu(null);
  }
  function drop() {
    const d = drag.current;
    if (!d) return;
    stop();
    drag.current = null;
    settling.current = d.draft.join('|');
    const changed = d.ids.join('|') !== settling.current;
    if (changed && !latest.current.onReorder(d.draft)) {
      cancel();
      return;
    }
    if (changed) {
      feedback('confirm');
      AccessibilityInfo.announceForAccessibility(
        `Moved to position ${d.target + 1}`,
      );
    }
    const top = habitRowPositions(
      d.draft,
      latest.current.heights,
      latest.current.fallback,
    ).tops[d.id];
    dragY.set(
      withSpring(
        geometry.current.bodyY -
          geometry.current.rootY +
          top -
          geometry.current.offset,
        reorderSpring,
        (finished) => {
          if (finished) runOnJS(finishDrop)();
        },
      ),
    );
  }
  return {
    bounds,
    root,
    scroll,
    viewport,
    updateOffset: (offset: number) => {
      geometry.current.offset = offset;
      scrollOffset.set(offset);
    },
    measure,
    menu,
    setMenu,
    mode,
    setMode,
    rowTops,
    dragId,
    dragY,
    bodyTop,
    scrollOffset,
    cancel,
    beginOrMove,
    drop,
    hold: (id: string, anchor: HabitAnchor) => {
      if (drag.current || settling.current) return;
      measure();
      setMenu({ id, anchor });
      feedback('selection');
    },
  };
}
