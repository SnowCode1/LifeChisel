import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { descriptionSummary } from '@onpurpose/core/description';
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
import { NoteComposer } from '../notes/NoteComposer.tsx';
import { Markdown } from './Markdown.tsx';

type Props = {
  notes: readonly HabitNote[];
  selected: HabitNote | undefined;
  /** The selected note's text versions, newest first. */
  versions: NoteVersion[];
  /** A new note's name while it is being written (saved on Save). */
  pendingTitle: string | null;
  theme: Theme;
  colour: string;
  editable: boolean;
  onSelect: (note: HabitNote) => void;
  onAdd: () => void;
  onPreset: (title: string) => void;
  onRename: (note: HabitNote) => void;
  onMoveTo: (note: HabitNote, index: number) => void;
  onRemove: (note: HabitNote) => void;
  onSaveText: (note: HabitNote, text: string) => boolean;
  onCreate: (title: string, text: string) => boolean;
  onCancelNew: () => void;
  /** Whether unsaved words are open, so leaving can ask first. */
  onDirtyChange: (dirty: boolean) => void;
  onOpenVersion: (action: HistoryAction) => void;
};

const discard = () =>
  window.confirm('Discard your changes to this note?\n\nThey are not saved.');

/**
 * A habit's notes. One note fills the view on its own; with several, their
 * names run down a rail (a wrapping row when narrow) that can be dragged to
 * reorder, beside the chosen note. Notes are read and written in place, at a
 * reading width, on one page that fills the dialog.
 */
export function NotesView(props: Props) {
  const {
    notes,
    selected,
    pendingTitle,
    editable,
    onSelect,
    onAdd,
    onPreset,
    onDirtyChange,
  } = props;
  // The page reports unsaved words; switching notes asks before losing them.
  const dirty = useRef(false);
  const report = useRef(onDirtyChange);
  useLayoutEffect(() => {
    report.current = onDirtyChange;
  });
  const reportDirty = useCallback((value: boolean) => {
    dirty.current = value;
    report.current(value);
  }, []);
  const leave = () => !dirty.current || discard();
  if (!selected && pendingTitle === null)
    return (
      <div className="notes-empty">
        <h3>Notes</h3>
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
  // The rail appears once there is a choice to make.
  const rail = notes.length + (pendingTitle !== null ? 1 : 0) > 1;
  return (
    <div className={rail ? 'notes-view with-rail' : 'notes-view'}>
      {rail && (
        <NoteRail
          {...props}
          onSelect={(note) => {
            if (note.id !== selected?.id && leave()) {
              reportDirty(false);
              onSelect(note);
            }
          }}
          onAdd={() => leave() && onAdd()}
        />
      )}
      <NotePage
        key={pendingTitle !== null ? 'new' : selected!.id}
        {...props}
        showAdd={!rail}
        onDirtyChange={reportDirty}
      />
    </div>
  );
}

// Note names with their first words. Drag a card (or Alt+Up/Down) to move it.
function NoteRail({
  notes,
  selected,
  pendingTitle,
  editable,
  onSelect,
  onAdd,
  onMoveTo,
}: Props) {
  const list = useRef<HTMLDivElement>(null);
  // The drag, with the cards' places measured when it started.
  const [drag, setDrag] = useState<{
    id: string;
    from: number;
    to: number;
    dy: number;
    moved: boolean;
    y: number;
    tops: number[];
    heights: number[];
  } | null>(null);
  const suppressClick = useRef(false);
  const items = () => [
    ...(list.current?.querySelectorAll<HTMLElement>('[data-note]') ?? []),
  ];
  const onPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!editable || event.button !== 0 || pendingTitle !== null) return;
    const rects = items().map((item) => item.getBoundingClientRect());
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id: notes[index]!.id,
      from: index,
      to: index,
      dy: 0,
      moved: false,
      y: event.clientY,
      tops: rects.map((rect) => rect.top),
      heights: rects.map((rect) => rect.height),
    });
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const dy = event.clientY - drag.y;
    const moved = drag.moved || Math.abs(dy) > 4;
    if (!moved) return;
    const { tops, heights } = drag;
    const centre = tops[drag.from]! + heights[drag.from]! / 2 + dy;
    let to = 0;
    tops.forEach((top, index) => {
      if (index !== drag.from && centre > top + heights[index]! / 2) to++;
    });
    setDrag({ ...drag, dy, to, moved });
  };
  const onPointerUp = () => {
    if (!drag) return;
    if (drag.moved) {
      suppressClick.current = true;
      if (drag.to !== drag.from) onMoveTo(notes[drag.from]!, drag.to);
    }
    setDrag(null);
  };
  // While dragging, the others slide to make room for the dragged card.
  const shift = (index: number) => {
    if (!drag?.moved || index === drag.from) return 0;
    const size = drag.heights[drag.from]! + 4;
    if (drag.from < index && index <= drag.to) return -size;
    if (drag.to <= index && index < drag.from) return size;
    return 0;
  };
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    const next = index + step;
    if (!step || next < 0 || next >= notes.length) return;
    event.preventDefault();
    const note = notes[index]!;
    if (event.altKey) {
      if (editable) onMoveTo(note, next);
    } else onSelect(notes[next]!);
    requestAnimationFrame(() =>
      list.current
        ?.querySelector<HTMLElement>(
          `[data-note="${event.altKey ? note.id : notes[next]!.id}"]`,
        )
        ?.focus(),
    );
  };
  return (
    <div
      ref={list}
      className="note-rail"
      role="tablist"
      aria-label="Notes"
      aria-orientation="vertical"
    >
      {notes.map((note, index) => {
        const active = pendingTitle === null && note.id === selected?.id;
        const dragging = drag?.moved && drag.id === note.id;
        const offset = dragging ? drag!.dy : shift(index);
        const first = descriptionSummary(note.text).slice(0, 120);
        return (
          <button
            key={note.id}
            type="button"
            role="tab"
            data-note={note.id}
            aria-selected={active}
            aria-roledescription="Note, Alt and the arrow keys move it"
            tabIndex={active || (!selected && index === 0) ? 0 : -1}
            className={dragging ? 'note-card dragging' : 'note-card'}
            style={
              offset ? { transform: `translateY(${offset}px)` } : undefined
            }
            onPointerDown={(event) => onPointerDown(event, index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              onSelect(note);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {editable && (
              <span className="note-grip" aria-hidden="true">
                ⋮⋮
              </span>
            )}
            <span className="note-card-title">{note.title}</span>
            <span className="note-card-text">{first || 'Empty'}</span>
          </button>
        );
      })}
      {pendingTitle !== null && (
        <span className="note-card pending">
          <span className="note-card-title">{pendingTitle}</span>
          <span className="note-card-text">New note</span>
        </span>
      )}
      {notes.length < MAX_NOTES && pendingTitle === null && (
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
  );
}

// One note as a page: its name, when it last changed and its actions, then
// the note at a reading width. Edit (or a double-click) writes it in place.
function NotePage({
  notes,
  selected,
  versions,
  pendingTitle,
  theme,
  colour,
  editable,
  showAdd,
  onAdd,
  onRename,
  onMoveTo,
  onRemove,
  onSaveText,
  onCreate,
  onCancelNew,
  onDirtyChange,
  onOpenVersion,
}: Props & { showAdd: boolean }) {
  const isNew = pendingTitle !== null;
  const note = isNew ? undefined : selected!;
  const title = isNew ? pendingTitle : note!.title;
  const [draft, setDraft] = useState<string | null>(isNew ? '' : null);
  const [showVersions, setShowVersions] = useState(false);
  const [menu, setMenu] = useState(false);
  const dirty = draft !== null && draft !== (note?.text ?? '');
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const index = note ? notes.findIndex((item) => item.id === note.id) : -1;
  const current = versions.find((version) => version.after === note?.text);
  const changed = versions[0]?.action.recordedAt;
  const edit = () => {
    if (!editable || !note) return;
    setShowVersions(false);
    setDraft(note.text);
  };
  const cancel = () => {
    if (dirty && !discard()) return;
    if (isNew) onCancelNew();
    else setDraft(null);
  };
  const save = () => {
    if (draft === null || !editable) return;
    if (isNew) onCreate(title, draft);
    else if (onSaveText(note!, draft)) setDraft(null);
  };
  const action = (run: () => void) => {
    setMenu(false);
    run();
  };
  return (
    <section
      className={draft !== null ? 'note-page editing' : 'note-page'}
      role={notes.length > 1 ? 'tabpanel' : undefined}
      aria-label={title}
    >
      <header className="note-page-header">
        <div className="note-page-title">
          <h3>{title}</h3>
          <span className="muted">
            {isNew
              ? 'New note'
              : changed
                ? `Changed ${new Date(changed).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year:
                      new Date(changed).getFullYear() ===
                      new Date().getFullYear()
                        ? undefined
                        : 'numeric',
                  })}`
                : null}
          </span>
        </div>
        <span className="note-page-actions">
          {draft !== null ? (
            <>
              <button type="button" className="text-button" onClick={cancel}>
                Cancel
              </button>
              <button
                type="button"
                className="done-button"
                disabled={!editable}
                onClick={save}
              >
                Save
              </button>
            </>
          ) : (
            <>
              {versions.length > 0 && (
                <button
                  type="button"
                  className="text-button"
                  aria-expanded={showVersions}
                  onClick={() => setShowVersions((open) => !open)}
                >
                  {showVersions ? 'Back to note' : 'Versions'}
                </button>
              )}
              {showAdd && notes.length < MAX_NOTES && (
                <button
                  type="button"
                  className="text-button"
                  disabled={!editable}
                  onClick={onAdd}
                >
                  Add note
                </button>
              )}
              <span className="note-menu">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`More for ${title}`}
                  aria-haspopup="menu"
                  aria-expanded={menu}
                  disabled={!editable}
                  onClick={() => setMenu((open) => !open)}
                >
                  ⋯
                </button>
                {menu && (
                  <NoteMenu
                    onClose={() => setMenu(false)}
                    items={[
                      ['Rename', () => action(() => onRename(note!))],
                      ...(notes.length > 1
                        ? ([
                            [
                              'Move up',
                              () => action(() => onMoveTo(note!, index - 1)),
                              index <= 0,
                            ],
                            [
                              'Move down',
                              () => action(() => onMoveTo(note!, index + 1)),
                              index >= notes.length - 1,
                            ],
                          ] as const)
                        : []),
                      ['Remove', () => action(() => onRemove(note!))],
                    ]}
                  />
                )}
              </span>
              <button
                type="button"
                className="text-button"
                disabled={!editable}
                onClick={edit}
              >
                {note!.text.trim() ? 'Edit' : 'Write'}
              </button>
            </>
          )}
        </span>
      </header>
      <div className="note-page-body">
        {draft !== null ? (
          <NoteComposer
            text={draft}
            onText={setDraft}
            label={`${title} note`}
            placeholder={noteHint(title)}
            theme={theme}
            editable={editable}
            onSave={save}
            onCancel={cancel}
          />
        ) : showVersions ? (
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
        ) : note!.text.trim() ? (
          <article
            className="note"
            title={editable ? 'Double-click to edit' : undefined}
            onDoubleClick={edit}
          >
            <Markdown
              text={note!.text}
              scheme={theme.scheme}
              colour={theme.link}
            />
          </article>
        ) : (
          <div className="note-blank">
            <p className="muted">{noteHint(title)}</p>
            <button
              type="button"
              className="secondary-button"
              disabled={!editable}
              onClick={edit}
            >
              Start writing
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// A small menu below its button; Esc or a click elsewhere closes it, without
// closing the dialog around it.
function NoteMenu({
  items,
  onClose,
}: {
  items: readonly (readonly [string, () => void, boolean?])[];
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    const away = (event: PointerEvent) => {
      if (!menu.current?.parentElement?.contains(event.target as Node))
        onClose();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [onClose]);
  return (
    <div
      ref={menu}
      className="note-menu-list"
      role="menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const buttons = [
          ...(menu.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled)',
          ) ?? []),
        ];
        const at = buttons.indexOf(document.activeElement as HTMLElement);
        buttons[
          (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
            buttons.length
        ]?.focus();
      }}
    >
      {items.map(([label, run, disabled]) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          disabled={disabled}
          className={label === 'Remove' ? 'danger' : undefined}
          onClick={run}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
