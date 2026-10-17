import { useRef, useState, type KeyboardEvent } from 'react';
import { descriptionExcerpt } from '@onpurpose/core/descriptionReading';
import {
  MAX_NOTES,
  noteHint,
  notePresets,
  type HabitNote,
  type NoteVersion,
} from '@onpurpose/core/notes';
import type { HistoryAction } from '@onpurpose/core/storage/model';
import type { Theme } from '@onpurpose/core/theme';
import { Icon } from '../ui/Icon.tsx';
import { Markdown } from './Markdown.tsx';

/**
 * A habit's notes, one at a time: their names down the side (a row across
 * narrow dialogs) and the chosen note at a reading width. Each note's earlier
 * versions open in place; Before and After open above.
 */
export function NotesView({
  notes,
  selected,
  versions,
  theme,
  colour,
  editable,
  onSelect,
  onAdd,
  onPreset,
  onEdit,
  onRename,
  onMove,
  onRemove,
  onOpenVersion,
}: {
  notes: readonly HabitNote[];
  selected: HabitNote | undefined;
  /** The selected note's text versions, newest first. */
  versions: NoteVersion[];
  theme: Theme;
  colour: string;
  editable: boolean;
  onSelect: (note: HabitNote) => void;
  onAdd: () => void;
  onPreset: (title: string) => void;
  onEdit: (note: HabitNote) => void;
  onRename: (note: HabitNote) => void;
  onMove: (note: HabitNote, direction: -1 | 1) => void;
  onRemove: (note: HabitNote) => void;
  onOpenVersion: (action: HistoryAction) => void;
}) {
  const [showVersions, setShowVersions] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  if (!selected)
    return (
      <div className="notes-empty">
        <p>
          Keep why this habit matters, what counts, or useful links beside it.
          Start with one of these, or use your own name.
        </p>
        <div className="note-presets">
          {notePresets.map((preset) => (
            <button
              key={preset.title}
              type="button"
              className="note-preset"
              disabled={!editable}
              onClick={() => onPreset(preset.title)}
            >
              <strong>{preset.title}</strong>
              <span>{preset.hint}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="link-button"
          disabled={!editable}
          onClick={onAdd}
        >
          Use your own name
        </button>
      </div>
    );
  const index = notes.findIndex((note) => note.id === selected.id);
  const current = versions.find((version) => version.after === selected.text);
  // Up/Down (and Left/Right in the narrow row) move between notes.
  const onKeyDown = (event: KeyboardEvent) => {
    const step =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    const next = notes[index + step];
    if (!step || !next) return;
    event.preventDefault();
    onSelect(next);
    setShowVersions(false);
    requestAnimationFrame(() =>
      list.current
        ?.querySelector<HTMLElement>(`[data-note="${next.id}"]`)
        ?.focus(),
    );
  };
  return (
    <div className="notes-view">
      <div
        ref={list}
        className="note-list"
        role="tablist"
        aria-label="Notes"
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
      >
        {notes.map((note) => {
          const active = note.id === selected.id;
          return (
            <button
              key={note.id}
              type="button"
              role="tab"
              data-note={note.id}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              style={
                active
                  ? {
                      color: colour,
                      backgroundColor: theme.mix(colour, 0.14),
                    }
                  : undefined
              }
              onClick={() => {
                onSelect(note);
                setShowVersions(false);
              }}
            >
              {note.title}
            </button>
          );
        })}
        {notes.length < MAX_NOTES && (
          <button
            type="button"
            className="note-add"
            disabled={!editable}
            onClick={onAdd}
          >
            <Icon name="plus" size={15} />
            Add note
          </button>
        )}
      </div>
      <section
        className="note-pane"
        role="tabpanel"
        aria-label={selected.title}
      >
        <header className="note-pane-header">
          <h3>{selected.title}</h3>
          <span className="note-pane-actions">
            <button
              type="button"
              className="text-button"
              disabled={!editable}
              onClick={() => onEdit(selected)}
            >
              {selected.text ? 'Edit' : 'Write'}
            </button>
            {versions.length > 0 && (
              <button
                type="button"
                className="text-button"
                aria-expanded={showVersions}
                onClick={() => setShowVersions((open) => !open)}
              >
                {showVersions ? 'Hide versions' : 'Versions'}
              </button>
            )}
            <button
              type="button"
              className="text-button"
              disabled={!editable}
              onClick={() => onRename(selected)}
            >
              Rename
            </button>
            <button
              type="button"
              className="icon-button flip"
              aria-label="Move up"
              title="Move up"
              disabled={!editable || index <= 0}
              onClick={() => onMove(selected, -1)}
            >
              <Icon name="chevron" size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Move down"
              title="Move down"
              disabled={!editable || index >= notes.length - 1}
              onClick={() => onMove(selected, 1)}
            >
              <Icon name="chevron" size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${selected.title}`}
              title="Remove"
              disabled={!editable}
              onClick={() => onRemove(selected)}
            >
              <Icon name="erase" size={16} />
            </button>
          </span>
        </header>
        {showVersions ? (
          <ol className="note-version-list">
            {versions.map((version) => (
              <li key={version.action.id}>
                <button
                  type="button"
                  onClick={() => onOpenVersion(version.action)}
                >
                  <span className="muted">
                    {new Date(version.action.recordedAt).toLocaleString(
                      undefined,
                      { dateStyle: 'medium', timeStyle: 'short' },
                    )}
                    {version === current && ' · current'}
                  </span>
                  <span>
                    {version.after
                      ? descriptionExcerpt(version.after)
                      : version.action.change.kind === 'note' &&
                          !version.action.change.after
                        ? 'Note removed'
                        : 'Note cleared'}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : selected.text.trim() ? (
          <article className="note">
            <Markdown
              text={selected.text}
              scheme={theme.scheme}
              colour={theme.link}
            />
          </article>
        ) : (
          <div className="note-blank">
            <p className="muted">{noteHint(selected.title)}</p>
            <button
              type="button"
              className="secondary-button"
              disabled={!editable}
              onClick={() => onEdit(selected)}
            >
              Write
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
