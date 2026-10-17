import { useId, useState } from 'react';
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
 * on Notes when the habit has any. Esc, Close or a click outside returns to
 * the grid.
 */
export function HabitDetails({
  habit,
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
  onNewNote,
  onEditNote,
  onRenameNote,
  onMoveNote,
  onRemoveNote,
  onOpenVersion,
}: {
  habit: Habit;
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
  /** A title chosen for a new note, which then opens to be written. */
  onNewNote: (title: string) => void;
  onEditNote: (note: HabitNote) => void;
  onRenameNote: (note: HabitNote, title: string) => boolean;
  onMoveNote: (note: HabitNote, direction: -1 | 1) => void;
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
    notes.length ? 'notes' : 'statistics',
  );
  // Statistics mount on first view and then stay, keeping range and scroll.
  const [statsSeen, setStatsSeen] = useState(view === 'statistics');
  // The range tabs and period stepper live in the dialog's toolbar; the
  // statistics view renders them there once it exists.
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  // Naming a note opens a dialog beside this one, never nested in it: Esc
  // in a dialog inside another closes both.
  const [naming, setNaming] = useState<{ renaming?: HabitNote } | null>(null);
  const show = (next: HabitView) => {
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
            onClick={onClose}
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
        onClose={onClose}
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
              onSelect={onSelectNote}
              onAdd={() => setNaming({})}
              onPreset={onNewNote}
              onEdit={onEditNote}
              onRename={(renaming) => setNaming({ renaming })}
              onMove={onMoveNote}
              onRemove={onRemoveNote}
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
            setNaming(null);
            setView('notes');
            onNewNote(title);
          }}
        />
      )}
    </>
  );
}
