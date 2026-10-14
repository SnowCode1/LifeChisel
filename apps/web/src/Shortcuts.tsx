import { useId } from 'react';
import { Modal } from './ui/Modal.tsx';
import { Icon } from './ui/Icon.tsx';

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Grid',
    keys: [
      ['↑ ↓ ← →', 'Move between cells'],
      ['Space', 'Tick a checkbox'],
      ['Enter', 'Tick, or open a number, text or category value'],
      ['Home / End', 'Oldest loaded day / Today'],
      ['Alt ↑ / Alt ↓', 'Move the habit up or down'],
      ['Shift F10', 'Habit actions'],
    ],
  },
  {
    title: 'Everywhere',
    keys: [
      ['Ctrl Z', 'Undo'],
      ['Ctrl Y / Ctrl Shift Z', 'Redo'],
      ['T', 'Go to Today'],
      ['N', 'New habit'],
      ['H', 'Show or hide History'],
      ['?', 'These shortcuts'],
    ],
  },
  {
    title: 'Values and notes',
    keys: [
      ['Enter', 'Save a value'],
      ['Ctrl Enter', 'Save text or notes'],
      ['Esc', 'Close without saving'],
    ],
  },
];

export function Shortcuts({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  return (
    <Modal
      titleId={titleId}
      title="Keyboard shortcuts"
      className="shortcuts"
      leading={
        <button
          type="button"
          className="icon-button"
          aria-label="Close"
          onClick={onClose}
        >
          <Icon name="close" size={18} />
        </button>
      }
      onClose={onClose}
    >
      {GROUPS.map((group) => (
        <section key={group.title} className="shortcut-group">
          <h3>{group.title}</h3>
          <dl>
            {group.keys.map(([keys, action]) => (
              <div key={keys + action}>
                <dt>
                  {keys.split(' / ').map((combo, index) => (
                    <span key={combo}>
                      {index > 0 && ' or '}
                      {combo.split(' ').map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </span>
                  ))}
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </Modal>
  );
}
