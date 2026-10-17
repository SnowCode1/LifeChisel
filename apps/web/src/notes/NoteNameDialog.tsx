import { useId, useState } from 'react';
import {
  availablePresets,
  MAX_NOTE_TITLE,
  normalizeNoteTitle,
  noteTitleProblem,
  type HabitNote,
} from '@onpurpose/core/notes';
import { Modal } from '../ui/Modal.tsx';
import { Icon } from '../ui/Icon.tsx';

/**
 * Names a new note, or renames one: suggested titles with a line on what
 * each is for, or any name of your own. Presets are only suggestions.
 */
export function NoteNameDialog({
  notes,
  renaming,
  colour,
  onPick,
  onClose,
}: {
  notes: readonly HabitNote[];
  /** The note being renamed; a new note when absent. */
  renaming?: HabitNote;
  colour: string;
  onPick: (title: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [name, setName] = useState(renaming?.title ?? '');
  const problem = name.trim()
    ? noteTitleProblem(notes, name, renaming?.id)
    : null;
  const unchanged = !!renaming && normalizeNoteTitle(name) === renaming.title;
  const canSave = !!name.trim() && !problem && !unchanged;
  const presets = availablePresets(notes);
  return (
    <Modal
      titleId={titleId}
      className="note-name"
      closeOnBackdrop
      title={renaming ? 'Rename note' : 'New note'}
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
      <form
        className="note-name-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onPick(normalizeNoteTitle(name));
        }}
      >
        <label className="field">
          <span className="field-label">
            {renaming ? 'Name' : 'Your own name'}
          </span>
          <span className="note-name-row">
            <input
              data-autofocus
              className="text-input"
              value={name}
              maxLength={MAX_NOTE_TITLE}
              placeholder="Recipes, Plan, Gear…"
              aria-invalid={!!problem}
              onChange={(event) => setName(event.target.value)}
            />
            <button
              type="submit"
              className="secondary-button"
              disabled={!canSave}
              style={canSave ? { color: colour } : undefined}
            >
              {renaming ? 'Rename' : 'Add'}
            </button>
          </span>
          {problem && (
            <span className="hint error" role="status">
              {problem}
            </span>
          )}
        </label>
      </form>
      {presets.length > 0 && (
        <>
          <h3 className="note-name-heading">
            {renaming ? 'Or choose' : 'Suggestions'}
          </h3>
          <div className="note-presets">
            {presets.map((preset) => (
              <button
                key={preset.title}
                type="button"
                className="note-preset"
                onClick={() => onPick(preset.title)}
              >
                <strong>{preset.title}</strong>
                <span>{preset.hint}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
