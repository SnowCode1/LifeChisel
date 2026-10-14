import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import type { EntryValues } from '@onpurpose/core/entries';
import type { Habit } from '@onpurpose/core/habits';
import { habitSummary } from '@onpurpose/core/habitSummary';
import type { HistoryAction, StoredEvent } from '@onpurpose/core/storage/model';
import type { Theme } from '@onpurpose/core/theme';
import { HabitSymbol } from '../ui/HabitSymbol.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Modal } from '../ui/Modal.tsx';
import { Markdown } from './Markdown.tsx';
import { StatsView } from './StatsView.tsx';

/**
 * One page per habit in a wide dialog (full screen on phones): an overview
 * column with the summary and the habit's notes, beside a grid of statistics
 * cards. Esc, Close or a click outside returns to the grid.
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
  onEdit,
  onClose,
  onDay,
  onEditGoal,
  onEditNotes,
}: {
  habit: Habit;
  values: EntryValues;
  events: StoredEvent[];
  actions: HistoryAction[];
  today: string;
  weekStart: WeekStart;
  theme: Theme;
  editable: boolean;
  onEdit: () => void;
  onClose: () => void;
  onEditGoal: () => void;
  onEditNotes: () => void;
  onDay: (
    habit: Habit,
    date: string,
    label: string,
    anchor: HTMLElement,
  ) => void;
}) {
  const titleId = useId();
  const colour = theme.colour(habit.color);
  return (
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
          <span className="summary">{habitSummary(habit, values, today)}</span>
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
      onClose={onClose}
    >
      <StatsView
        key={habit.id}
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
        aside={
          <NotesCard
            habit={habit}
            theme={theme}
            editable={editable}
            onEdit={onEditNotes}
          />
        }
      />
    </Modal>
  );
}

// Notes as a card in the overview column. Long notes show their start, with
// Show all to read the rest in place.
function NotesCard({
  habit,
  theme,
  editable,
  onEdit,
}: {
  habit: Habit;
  theme: Theme;
  editable: boolean;
  onEdit: () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);
  const text = habit.description;
  // Measured whenever the card or its text changes size: the dialog may
  // still be closed (unlaid out) when the card first renders.
  useLayoutEffect(() => {
    const element = body.current;
    if (!element || expanded) return;
    const measure = () =>
      setLong(element.scrollHeight > element.clientHeight + 2);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [text, expanded]);
  return (
    <section className="stats-card notes-card" aria-labelledby="notes-heading">
      <header>
        <h3 id="notes-heading">Notes</h3>
        <button
          type="button"
          className="text-button"
          disabled={!editable}
          onClick={onEdit}
        >
          {text ? 'Edit' : 'Add notes'}
        </button>
      </header>
      {text ? (
        <>
          <div
            ref={body}
            // Clamped until expanded; the fade shows only when text is cut.
            className={
              expanded
                ? 'note-body'
                : long
                  ? 'note-body clamped faded'
                  : 'note-body clamped'
            }
          >
            <article className="note">
              <Markdown text={text} scheme={theme.scheme} colour={theme.link} />
            </article>
          </div>
          {(long || expanded) && (
            <button
              type="button"
              className="link-button show-all"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? 'Show less' : 'Show all'}
            </button>
          )}
        </>
      ) : (
        <p className="muted">
          Why this habit matters, a simple way to start, or links.
        </p>
      )}
    </section>
  );
}
