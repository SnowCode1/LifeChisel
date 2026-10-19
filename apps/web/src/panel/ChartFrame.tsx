import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

export type ChartSlot = {
  key: string;
  /** Horizontal extent as fractions of the plot width. */
  x0: number;
  x1: number;
  /** Vertical extent as fractions of the plot height, for stacked rows. */
  y0?: number;
  y1?: number;
  title: string;
  value: string;
};

/**
 * Shared frame for the statistics charts: an SVG plot drawn at its measured
 * size, time ticks below, axis labels at the right, and one reading line.
 * Hover, or focus and the arrow keys, select a slot; the reading line (a live
 * region) then names it, so every value is reachable without a pointer.
 */
export function ChartFrame({
  name,
  slots,
  height,
  ticks,
  axis,
  legend,
  draw,
}: {
  name: string;
  slots: ChartSlot[];
  height: number;
  ticks: { x: number; label: string }[];
  axis: { y: number; label: string }[];
  legend: string;
  draw: (size: {
    width: number;
    height: number;
    selected: number | null;
  }) => ReactNode;
}) {
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [selected, setSelected] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = plot.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(40, element.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const slotAt = (clientX: number, clientY: number) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box) return null;
    const x = (clientX - box.left) / box.width;
    const y = (clientY - box.top) / box.height;
    const index = slots.findIndex(
      (slot) =>
        x >= slot.x0 &&
        x < slot.x1 &&
        (slot.y0 === undefined || (y >= slot.y0 && y < (slot.y1 ?? 1))),
    );
    return index < 0 ? null : index;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!slots.length) return;
    let next = selected ?? slots.length;
    if (event.key === 'ArrowLeft') next = Math.max(0, next - 1);
    else if (event.key === 'ArrowRight')
      next = Math.min(
        slots.length - 1,
        selected === null ? slots.length - 1 : next + 1,
      );
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = slots.length - 1;
    else if (event.key === 'Escape') {
      setSelected(null);
      return;
    } else return;
    event.preventDefault();
    setSelected(next);
  };
  const current = selected === null ? null : slots[selected];
  return (
    <figure className="chart">
      <p className="chart-reading" aria-live="polite">
        {current ? (
          <>
            <strong>{current.title}</strong> · {current.value}
          </>
        ) : (
          <span className="muted">{legend}</span>
        )}
      </p>
      <div className="chart-body">
        <div
          ref={plot}
          className="chart-plot"
          tabIndex={0}
          role="group"
          aria-label={`${name}. Use the left and right arrow keys to read each value.`}
          onKeyDown={onKeyDown}
          onPointerMove={(event) =>
            setSelected(slotAt(event.clientX, event.clientY))
          }
          onPointerLeave={() => setSelected(null)}
          onBlur={() => setSelected(null)}
          style={{ height }}
        >
          <svg
            width={width}
            height={height}
            overflow="visible"
            aria-hidden="true"
          >
            {axis.map((line) => (
              <line
                key={line.label}
                x1={0}
                x2={width}
                y1={Math.round(line.y * (height - 1)) + 0.5}
                y2={Math.round(line.y * (height - 1)) + 0.5}
                className="chart-gridline"
              />
            ))}
            {draw({ width, height, selected })}
            {current && (
              <rect
                x={current.x0 * width}
                y={(current.y0 ?? 0) * height}
                width={Math.max(1, (current.x1 - current.x0) * width)}
                height={((current.y1 ?? 1) - (current.y0 ?? 0)) * height}
                className="chart-selection"
              />
            )}
          </svg>
        </div>
        <div className="chart-axis" aria-hidden="true" style={{ height }}>
          {axis.map((line) => (
            <span key={line.label} style={{ top: `${line.y * 100}%` }}>
              {line.label}
            </span>
          ))}
        </div>
      </div>
      <div className="chart-ticks" aria-hidden="true">
        {ticks.map((tick) => (
          <span
            key={`${tick.x}:${tick.label}`}
            style={{ left: `${tick.x * 100}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
