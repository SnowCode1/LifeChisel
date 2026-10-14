import { useId } from 'react';
import type { HistoryAction } from '@onpurpose/core/storage/model';
import type { Theme } from '@onpurpose/core/theme';
import { Modal } from '../ui/Modal.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Markdown } from '../panel/Markdown.tsx';

/**
 * Before and After of one note change from History. Restoring applies only
 * that description to the habit's current definition, as a new change.
 */
export function NoteVersions({
  action,
  theme,
  editable,
  canRestore,
  onClose,
  onRestore,
}: {
  action: HistoryAction;
  theme: Theme;
  editable: boolean;
  canRestore: boolean;
  onClose: () => void;
  onRestore: (description: string | undefined) => boolean;
}) {
  const titleId = useId();
  const change = action.change;
  if (change.kind !== 'habit') return null;
  const habit = change.after ?? change.before!;
  const versions: [string, string | undefined][] = [
    ['Before', change.before?.description],
    ['After', change.after?.description],
  ];
  return (
    <Modal
      titleId={titleId}
      title={
        <span style={{ color: theme.colour(habit.color) }}>
          {habit.name} · notes
        </span>
      }
      className="note-versions"
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
      <p className="hint">
        Changed{' '}
        {new Date(action.recordedAt).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
        {!canRestore &&
          ' · this habit no longer exists, so its notes cannot be restored'}
      </p>
      <div className="version-columns">
        {versions.map(([label, text]) => (
          <section key={label} className="version-column">
            <header>
              <h3>{label}</h3>
              <button
                type="button"
                className="secondary-button"
                disabled={!editable || !canRestore}
                onClick={() => {
                  if (onRestore(text)) onClose();
                }}
              >
                Restore {label.toLowerCase()}
              </button>
            </header>
            <article className="note">
              {text ? (
                <Markdown
                  text={text}
                  scheme={theme.scheme}
                  colour={theme.link}
                />
              ) : (
                <p className="muted">No notes</p>
              )}
            </article>
          </section>
        ))}
      </div>
    </Modal>
  );
}
