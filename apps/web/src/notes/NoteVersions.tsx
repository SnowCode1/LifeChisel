import { useId } from 'react';
import { habitNotes, noteVersion, type HabitNote } from '@onpurpose/core/notes';
import type { HistoryAction, StoredState } from '@onpurpose/core/storage/model';
import type { Theme } from '@onpurpose/core/theme';
import { Modal } from '../ui/Modal.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Markdown } from '../panel/Markdown.tsx';

/**
 * Before and After of one change to a note's words (from History or a
 * note's versions). Restoring applies only that text to the habit's current
 * note, as a new change; a removed note comes back at the end.
 */
export function NoteVersions({
  action,
  state,
  theme,
  editable,
  onClose,
  onRestore,
}: {
  action: HistoryAction;
  state: StoredState;
  theme: Theme;
  editable: boolean;
  onClose: () => void;
  onRestore: (habitId: string, version: HabitNote) => boolean;
}) {
  const titleId = useId();
  const version = noteVersion(action);
  const change = action.change;
  if (!version || !('habitId' in change)) return null;
  const current = state.habits.find((habit) => habit.id === change.habitId);
  const habit =
    change.kind === 'habit' ? (change.after ?? change.before!) : current;
  if (!habit) return null;
  const note = current
    ? habitNotes(state, current).find((item) => item.id === version.noteId)
    : undefined;
  const sides: [string, string][] = [
    ['Before', version.before],
    ['After', version.after],
  ];
  return (
    <Modal
      titleId={titleId}
      title={
        <span style={{ color: theme.colour(habit.color) }}>
          {habit.name} · {note?.title ?? version.title}
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
        {!current &&
          ' · this habit no longer exists, so its notes cannot be restored'}
        {current && !note && ' · this note was removed; Restore brings it back'}
      </p>
      <div className="version-columns">
        {sides.map(([label, text]) => (
          <section key={label} className="version-column">
            <header>
              <h3>{label}</h3>
              <button
                type="button"
                className="secondary-button"
                disabled={
                  !editable ||
                  !current ||
                  (note ? note.text === text : !text.trim())
                }
                onClick={() => {
                  if (
                    onRestore(habit.id, {
                      id: version.noteId,
                      title: note?.title ?? version.title,
                      text,
                    })
                  )
                    onClose();
                }}
              >
                Restore {label.toLowerCase()}
              </button>
            </header>
            <article className="note">
              {text.trim() ? (
                <Markdown
                  text={text}
                  scheme={theme.scheme}
                  colour={theme.link}
                />
              ) : (
                <p className="muted">No text</p>
              )}
            </article>
          </section>
        ))}
      </div>
    </Modal>
  );
}
