import {
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

type Axis = 'x' | 'y';

/**
 * Thin overlay scrollbars for the grid. The browser's own bars are hidden
 * because they span the whole scroller: the vertical one ran beside the day
 * headings and the horizontal one under the habit names, which never move.
 * These cover only the area that scrolls: below the headings and right of
 * the names. Wheel, touch, keyboard and focus scrolling stay native; the bars
 * follow them and can also be dragged or clicked to page. Positions are
 * written straight to the DOM, so scrolling never re-renders React.
 */
export function GridScrollbars({
  scroller,
}: {
  scroller: RefObject<HTMLDivElement | null>;
}) {
  const barX = useRef<HTMLDivElement>(null);
  const barY = useRef<HTMLDivElement>(null);
  const thumbX = useRef<HTMLDivElement>(null);
  const thumbY = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = scroller.current;
    const frame = element?.parentElement;
    if (!element || !frame) return;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const head = element.querySelector<HTMLElement>('thead');
      const corner = element.querySelector<HTMLElement>('.corner');
      const top = head?.offsetHeight ?? 0;
      const left = corner?.offsetWidth ?? 0;
      for (const axis of ['x', 'y'] as Axis[]) {
        const bar = (axis === 'x' ? barX : barY).current;
        const thumb = (axis === 'x' ? thumbX : thumbY).current;
        if (!bar || !thumb) continue;
        // The scrolling part of each axis, outside the sticky headings/names.
        const viewport =
          axis === 'x'
            ? element.clientWidth - left
            : element.clientHeight - top;
        const content =
          axis === 'x'
            ? element.scrollWidth - left
            : element.scrollHeight - top;
        const position = axis === 'x' ? element.scrollLeft : element.scrollTop;
        const overflow = content - viewport;
        bar.hidden = overflow < 1;
        if (overflow < 1) continue;
        if (axis === 'x') bar.style.left = `${left}px`;
        else bar.style.top = `${top}px`;
        const track = axis === 'x' ? bar.clientWidth : bar.clientHeight;
        const size = Math.max(28, (track * viewport) / content);
        const offset = ((track - size) * position) / overflow;
        thumb.style[axis === 'x' ? 'width' : 'height'] = `${size}px`;
        thumb.style.transform =
          axis === 'x' ? `translateX(${offset}px)` : `translateY(${offset}px)`;
      }
    };
    const onScroll = () => {
      update();
      frame.classList.add('scrolling');
      clearTimeout(idle);
      idle = setTimeout(() => frame.classList.remove('scrolling'), 900);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    const table = element.querySelector('table');
    if (table) observer.observe(table);
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(idle);
      observer.disconnect();
      element.removeEventListener('scroll', onScroll);
    };
  }, [scroller]);

  // Dragging a thumb scrolls in proportion; clicking the track pages.
  const onPointerDown =
    (axis: Axis) => (event: ReactPointerEvent<HTMLDivElement>) => {
      const element = scroller.current;
      const bar = (axis === 'x' ? barX : barY).current;
      const thumb = (axis === 'x' ? thumbX : thumbY).current;
      if (!element || !bar || !thumb || event.button !== 0) return;
      event.preventDefault();
      const key = axis === 'x' ? 'scrollLeft' : 'scrollTop';
      const page =
        axis === 'x'
          ? element.clientWidth -
            (element.querySelector<HTMLElement>('.corner')?.offsetWidth ?? 0)
          : element.clientHeight -
            (element.querySelector('thead')?.offsetHeight ?? 0);
      if (event.target !== thumb) {
        const rect = thumb.getBoundingClientRect();
        const before =
          axis === 'x' ? event.clientX < rect.left : event.clientY < rect.top;
        element.scrollBy({
          [axis === 'x' ? 'left' : 'top']: before ? -page : page,
          behavior: 'smooth',
        });
        return;
      }
      const start = axis === 'x' ? event.clientX : event.clientY;
      const origin = element[key];
      const track = axis === 'x' ? bar.clientWidth : bar.clientHeight;
      const size = axis === 'x' ? thumb.offsetWidth : thumb.offsetHeight;
      const overflow =
        (axis === 'x'
          ? element.scrollWidth - element.clientWidth
          : element.scrollHeight - element.clientHeight) || 1;
      const ratio = overflow / Math.max(1, track - size);
      thumb.setPointerCapture(event.pointerId);
      bar.classList.add('dragging');
      // Free dragging; whole-day snapping resumes when the thumb is let go.
      element.style.scrollSnapType = 'none';
      const move = (moveEvent: PointerEvent) => {
        const now = axis === 'x' ? moveEvent.clientX : moveEvent.clientY;
        element[key] = origin + (now - start) * ratio;
      };
      const end = () => {
        thumb.removeEventListener('pointermove', move);
        thumb.removeEventListener('pointerup', end);
        thumb.removeEventListener('pointercancel', end);
        bar.classList.remove('dragging');
        element.style.scrollSnapType = '';
      };
      thumb.addEventListener('pointermove', move);
      thumb.addEventListener('pointerup', end);
      thumb.addEventListener('pointercancel', end);
    };

  return (
    <>
      {(['y', 'x'] as Axis[]).map((axis) => (
        <div
          key={axis}
          ref={axis === 'x' ? barX : barY}
          className={`grid-scrollbar ${axis}`}
          aria-hidden="true"
          hidden
          onPointerDown={onPointerDown(axis)}
        >
          <div ref={axis === 'x' ? thumbX : thumbY} className="thumb" />
        </div>
      ))}
    </>
  );
}
