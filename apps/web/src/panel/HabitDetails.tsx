import { useId, useRef, useState } from 'react';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import type { EntryValues } from '@onpurpose/core/entries';
import type { Habit } from '@onpurpose/core/habits';
import { habitSummary } from '@onpurpose/core/habitSummary';
import type { HabitNote, NoteVersion } from '@onpurpose/core/notes';
import type { HistoryAction, StoredEvent } from '@onpurpose/core/storage/model';
import type { Theme } from '@onpurpose/core/theme';
import { HabitSymbol } from '../ui/HabitSymbol.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Modal } from '../ui/Modal.tsx';
import { NoteNameDialog } from '../notes/NoteNameDialog.tsx';
import { NotesView } from './NotesView.tsx';
import { StatsView } from './StatsView.tsx';

export type HabitView = 'notes' | 'statistics';

/**
 * One page per habit in a wide dialog (full screen on phones), switched
 * between its notes and its statistics like the phone's habit sheet. It opens
 * on the chosen view, or on Notes when the habit has any. Esc, Close or a
 * click outside returns to the grid.
 */
export function HabitDetails({
  habit,
  initialView,
  values,
  events,
  actions,
  today,
  weekStart,
  theme,
  editable,
  notes,
  note,
  versions,
  onEdit,
  onClose,
  onDay,
  onEditGoal,
  onSelectNote,
  onCreateNote,
  onSaveNote,
  onRenameNote,
  onMoveNote,
  onRemoveNote,
  onOpenVersion,
}: {
  habit: Habit;
  /** The view to open on; by default Notes when the habit has any. */
  initialView?: HabitView;
  values: EntryValues;
  events: StoredEvent[];
  actions: HistoryAction[];
  today: string;
  weekStart: WeekStart;
  theme: Theme;
  editable: boolean;
  notes: readonly HabitNote[];
  /** The note shown in the Notes view (undefined without notes). */
  note: HabitNote | undefined;
  versions: NoteVersion[];
  onEdit: () => void;
  onClose: () => void;
  onEditGoal: () => void;
  onSelectNote: (note: HabitNote) => void;
  /** Saves a new note, written in place after it was named. */
  onCreateNote: (title: string, text: string) => boolean;
  onSaveNote: (note: HabitNote, text: string) => boolean;
  onRenameNote: (note: HabitNote, title: string) => boolean;
  /** Moves a note to a position (a drag, Alt+arrows or the menu). */
  onMoveNote: (note: HabitNote, index: number) => void;
  onRemoveNote: (note: HabitNote) => void;
  onOpenVersion: (action: HistoryAction) => void;
  onDay: (
    habit: Habit,
    date: string,
    label: string,
    anchor: HTMLElement,
  ) => void;
}) {
  const titleId = useId();
  const colour = theme.colour(habit.color);
  const [view, setView] = useState<HabitView>(
    initialView ?? (notes.length ? 'notes' : 'statistics'),
  );
  // Statistics mount on first view and then stay, keeping range and scroll.
  const [statsSeen, setStatsSeen] = useState(view === 'statistics');
  // The range tabs and period stepper live in the dialog's toolbar; the
  // statistics view renders them there once it exists.
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  // Naming a note opens a dialog beside this one, never nested in it: Esc
  // in a dialog inside another closes both.
  const [naming, setNaming] = useState<{ renaming?: HabitNote } | null>(null);
  // A new note's name while it is written in place, before it is saved.
  const [pending, setPending] = useState<string | null>(null);
  // Unsaved words in the open note: leaving the view or the page asks first.
  const dirty = useRef(false);
  const mayLeave = () =>
    !dirty.current ||
    window.confirm('Discard your changes to this note?\n\nThey are not saved.');
  const close = () => {
    if (mayLeave()) onClose();
  };
  const startNote = (title: string) => {
    setNaming(null);
    setView('notes');
    setPending(title);
  };
  const show = (next: HabitView) => {
    if (next === view || !mayLeave()) return;
    dirty.current = false;
    setPending(null);
    setView(next);
    if (next === 'statistics') setStatsSeen(true);
  };
  return (
    <>
      <Modal
        titleId={titleId}
        className="habit-details"
        closeOnBackdrop
        title={
          <span className="habit-details-title">
            <HabitSymbol icon={habit.icon} colour={colour} size={22} />
            <span className="name" style={{ color: colour }}>
              {habit.name}
            </span>
            <span className="summary">
              {habitSummary(habit, values, today)}
            </span>
          </span>
        }
        leading={
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={close}
          >
            <Icon name="close" size={18} />
          </button>
        }
        trailing={
          <button
            type="button"
            className="text-button"
            disabled={!editable}
            onClick={onEdit}
          >
            Edit habit
          </button>
        }
        toolbar={
          <div className="details-toolbar-row">
            <div
              className="segmented details-views"
              role="tablist"
              aria-label="Habit views"
            >
              {(['notes', 'statistics'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={view === value}
                  onClick={() => show(value)}
                >
                  {value === 'notes'
                    ? notes.length
                      ? `Notes · ${notes.length}`
                      : 'Notes'
                    : 'Statistics'}
                </button>
              ))}
            </div>
            <div
              ref={setToolbar}
              className="details-toolbar"
              hidden={view !== 'statistics'}
            />
          </div>
        }
        onClose={close}
      >
        {/* Focus lands on the page itself, so keys scroll it without drawing
          a focus ring on a control. */}
        <div className="details-page" tabIndex={-1} data-autofocus>
          {view === 'notes' && (
            <NotesView
              notes={notes}
              selected={note}
              versions={versions}
              theme={theme}
              colour={colour}
              editable={editable}
              onSelect={(note) => {
                setPending(null);
                onSelectNote(note);
              }}
              onAdd={() => setNaming({})}
              pendingTitle={pending}
              onPreset={startNote}
              onRename={(renaming) => setNaming({ renaming })}
              onMoveTo={onMoveNote}
              onRemove={onRemoveNote}
              onSaveText={onSaveNote}
              onCreate={(title, text) => {
                if (!onCreateNote(title, text)) return false;
                setPending(null);
                return true;
              }}
              onCancelNew={() => setPending(null)}
              onDirtyChange={(value) => {
                dirty.current = value;
              }}
              onOpenVersion={onOpenVersion}
            />
          )}
          {statsSeen && (
            <div hidden={view !== 'statistics'}>
              <StatsView
                key={habit.id}
                toolbarHost={toolbar}
                habit={habit}
                values={values}
                events={events}
                actions={actions}
                today={today}
                weekStart={weekStart}
                theme={theme}
                editable={editable}
                onDay={onDay}
                onEditGoal={onEditGoal}
              />
            </div>
          )}
        </div>
      </Modal>
      {naming && (
        <NoteNameDialog
          notes={notes}
          renaming={naming.renaming}
          colour={colour}
          onClose={() => setNaming(null)}
          onPick={(title) => {
            if (naming.renaming) {
              if (onRenameNote(naming.renaming, title)) setNaming(null);
              return;
            }
            startNote(title);
          }}
        />
      )}
    </>
  );
}
