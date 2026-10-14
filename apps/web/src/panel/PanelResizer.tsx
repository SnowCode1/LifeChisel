import { useEffect, useState, type CSSProperties } from 'react';

const DEFAULT_WIDTH = 440;
const MIN_WIDTH = 320;
const MAX_WIDTH = 960;
// The grid keeps at least this much beside a docked panel.
const GRID_RESERVE = 420;
const STORAGE_KEY = 'onpurpose.panelWidth';
const STEP = 24;

function stored() {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

/**
 * The docked panel's width, remembered per browser (a convenience, never app
 * data). `style` goes on the workspace, which the panel reads as
 * `--panel-width`.
 */
export function usePanelWidth() {
  const [width, setWidth] = useState(stored);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      // Private windows may refuse storage; the width lasts this visit.
    }
  }, [width]);
  return {
    width,
    setWidth,
    style: { '--panel-width': `${width}px` } as CSSProperties,
  };
}

/**
 * The draggable edge between the grid and the docked panel. A focusable
 * separator: arrow keys resize by 24 px, Home and End go to the narrowest and
 * widest, and a double click (or Enter) returns to the default width.
 */
export function PanelResizer({
  width,
  onWidth,
}: {
  width: number;
  onWidth: (width: number) => void;
}) {
  const maximum = () =>
    Math.max(
      MIN_WIDTH,
      Math.min(MAX_WIDTH, window.innerWidth - GRID_RESERVE - 60),
    );
  const clamp = (value: number) =>
    Math.round(Math.max(MIN_WIDTH, Math.min(maximum(), value)));
  // Keep the saved width usable when the window shrinks.
  useEffect(() => {
    const fit = () => {
      const fitted = clamp(width);
      if (fitted !== width) onWidth(fitted);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });
  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={maximum()}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onDoubleClick={() => onWidth(clamp(DEFAULT_WIDTH))}
      onKeyDown={(event) => {
        const next =
          event.key === 'ArrowLeft'
            ? width + STEP
            : event.key === 'ArrowRight'
              ? width - STEP
              : event.key === 'Home'
                ? MIN_WIDTH
                : event.key === 'End'
                  ? maximum()
                  : event.key === 'Enter'
                    ? DEFAULT_WIDTH
                    : null;
        if (next === null) return;
        event.preventDefault();
        onWidth(clamp(next));
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const handle = event.currentTarget;
        handle.setPointerCapture(event.pointerId);
        handle.classList.add('dragging');
        document.body.classList.add('resizing');
        const start = event.clientX;
        const origin = width;
        // The panel is on the right: dragging left widens it.
        const move = (moveEvent: PointerEvent) =>
          onWidth(clamp(origin + start - moveEvent.clientX));
        const end = () => {
          handle.classList.remove('dragging');
          document.body.classList.remove('resizing');
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', end);
          handle.removeEventListener('pointercancel', end);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
      }}
    />
  );
}
