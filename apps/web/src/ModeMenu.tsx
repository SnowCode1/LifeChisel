import { useId, useState, type KeyboardEvent } from 'react';
import {
  GRID_MODE_KEY,
  gridModes,
  readGridMode,
  type GridMode,
} from '@onpurpose/core/gridModes';
import { AnchoredDialog } from './ui/AnchoredDialog.tsx';
import { Icon } from './ui/Icon.tsx';

/** This browser's remembered view (never saved with the habits). */
export function useGridMode() {
  const [mode, setMode] = useState<GridMode>(() => {
    try {
      return readGridMode(localStorage.getItem(GRID_MODE_KEY));
    } catch {
      return readGridMode(null);
    }
  });
  const set = (next: GridMode) => {
    setMode(next);
    try {
      localStorage.setItem(GRID_MODE_KEY, next);
    } catch {
      // Private windows may refuse storage; the choice lasts this visit.
    }
  };
  return [mode, set] as const;
}

// The top bar's left corner: the current view, opening the four (the same
// list as the phone's).
export function ModeMenu({
  mode,
  sampleData,
  onChange,
}: {
  mode: GridMode;
  sampleData: boolean;
  onChange: (mode: GridMode) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const titleId = useId();
  const current = gridModes.find((option) => option.mode === mode)!;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
      buttons.length;
    buttons[next]?.focus();
  };
  return (
    <>
      <button
        type="button"
        className="mode-button"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        aria-label={`View: ${current.label}${sampleData ? ', sample data' : ''}`}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <Icon name={current.icon} size={19} />
        <span className="mode-label">
          {current.label}
          {sampleData && <span className="mode-sample">Sample data</span>}
        </span>
        <Icon name="chevron" size={14} strokeWidth={2.2} />
      </button>
      {anchor && (
        <AnchoredDialog
          anchor={anchor}
          labelledBy={titleId}
          className="menu mode-menu"
          placement="below"
          onClose={() => setAnchor(null)}
        >
          <h2 id={titleId} className="menu-title">
            View
          </h2>
          <div role="menu" aria-labelledby={titleId} onKeyDown={onKeyDown}>
            {gridModes.map((option) => (
              <button
                key={option.mode}
                type="button"
                role="menuitemradio"
                aria-checked={option.mode === mode}
                className="menu-item mode-item"
                data-autofocus={option.mode === mode ? '' : undefined}
                onClick={() => {
                  setAnchor(null);
                  if (option.mode !== mode) onChange(option.mode);
                }}
              >
                <Icon name={option.icon} size={19} />
                <span>
                  <span className="mode-item-label">{option.label}</span>
                  <span className="mode-item-description">
                    {option.description}
                  </span>
                </span>
                {option.mode === mode && <Icon name="tick" size={16} />}
              </button>
            ))}
          </div>
        </AnchoredDialog>
      )}
    </>
  );
}
