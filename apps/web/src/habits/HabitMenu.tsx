import { useId, type KeyboardEvent } from 'react';
import type { Habit } from '@onpurpose/core/habits';
import { AnchoredDialog } from '../ui/AnchoredDialog.tsx';

export type HabitMenuAction = 'edit' | 'moveUp' | 'moveDown' | 'archive';

// The habit's actions, from its row's ⋯ button or a right-click on its name.
// Move up/down make reordering possible without dragging.
export function HabitMenu({
  habit,
  anchor,
  colour,
  first,
  last,
  onClose,
  onAction,
}: {
  habit: Habit;
  anchor: HTMLElement;
  colour: string;
  first: boolean;
  last: boolean;
  onClose: () => void;
  onAction: (action: HabitMenuAction) => void;
}) {
  const titleId = useId();
  const items: [HabitMenuAction, string, boolean][] = [
    ['edit', 'Edit habit', true],
    ['moveUp', 'Move up', !first],
    ['moveDown', 'Move down', !last],
    ['archive', 'Archive', true],
  ];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      ),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
      buttons.length;
    buttons[next]?.focus();
  };
  return (
    <AnchoredDialog
      anchor={anchor}
      labelledBy={titleId}
      className="menu"
      onClose={onClose}
    >
      <h2 id={titleId} className="menu-title" style={{ color: colour }}>
        {habit.name}
      </h2>
      <div role="menu" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        {items.map(([action, label, enabled]) => (
          <button
            key={action}
            type="button"
            role="menuitem"
            disabled={!enabled}
            className={action === 'archive' ? 'menu-item danger' : 'menu-item'}
            onClick={() => {
              onClose();
              onAction(action);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </AnchoredDialog>
  );
}
