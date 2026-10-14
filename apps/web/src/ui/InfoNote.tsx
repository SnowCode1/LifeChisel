import { useState } from 'react';
import { Icon } from './Icon.tsx';

/**
 * An explanation behind an (i) row, as on the phone: it takes no space until
 * asked for. Sits below a separator at the foot of a view.
 */
export function InfoNote({ label, text }: { label: string; text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="info-note-block">
      <button
        type="button"
        className="info-note-row"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <Icon name="info" size={17} />
        <span>{label}</span>
        <span className="chevron">
          <Icon name="chevron" size={13} />
        </span>
      </button>
      {expanded && <p className="info-note-text">{text}</p>}
    </div>
  );
}
