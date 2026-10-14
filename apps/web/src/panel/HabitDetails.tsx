import { useId } from 'react';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import type { EntryValues } from '@onpurpose/core/entries';
import type { Habit } from '@onpurpose/core/habits';
import type { HistoryAction, StoredEvent } from '@onpurpose/core/storage/model';
import type { Theme } from '@onpurpose/core/theme';
import { HabitSymbol } from '../ui/HabitSymbol.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Modal } from '../ui/Modal.tsx';
import { Markdown } from './Markdown.tsx';
import { StatsView } from './StatsView.tsx';

export type HabitTab = 'notes' | 'statistics';

/**
 * A habit's Notes and Statistics in a wide dialog (full screen on phones), so
 * charts and calendars have room: the statistics summary sits beside two
 * columns of sections. Esc or Close returns to the grid.
 */
export function HabitDetails({
  habit,
  tab,
  values,
  events,
  actions,
  today,
  weekStart,
  theme,
  editable,
  onTab,
  onEdit,
  onClose,
  onDay,
  onEditGoal,
  onEditNotes,
}: {
  habit: Habit;
  tab: HabitTab;
  values: EntryValues;
  events: StoredEvent[];
  actions: HistoryAction[];
  today: string;
  weekStart: WeekStart;
  theme: Theme;
  editable: boolean;
  onTab: (tab: HabitTab) => void;
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
          <span style={{ color: colour }}>{habit.name}</span>
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
      <div
        className="segmented panel-tabs"
        role="tablist"
        aria-label="Habit details"
      >
        {(['notes', 'statistics'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${titleId}-${value}`}
            aria-selected={tab === value}
            aria-controls={`${titleId}-panel`}
            data-autofocus={tab === value ? true : undefined}
            onClick={() => onTab(value)}
          >
            {value === 'notes' ? 'Notes' : 'Statistics'}
          </button>
        ))}
      </div>
      <div
        className="details-body"
        id={`${titleId}-panel`}
        role="tabpanel"
        aria-labelledby={`${titleId}-${tab}`}
      >
        {tab === 'statistics' ? (
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
          />
        ) : (
          <div className="details-notes">
            {habit.description ? (
              <article className="note">
                <Markdown
                  text={habit.description}
                  scheme={theme.scheme}
                  colour={theme.link}
                />
              </article>
            ) : (
              <p className="muted">
                No notes yet. Notes can hold why this habit matters, a simple
                way to start, or links.
              </p>
            )}
            <div className="note-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={!editable}
                onClick={onEditNotes}
              >
                {habit.description ? 'Edit notes' : 'Add notes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
