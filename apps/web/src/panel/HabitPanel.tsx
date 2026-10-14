import { useEffect, useId, useRef } from 'react';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import type { EntryValues } from '@onpurpose/core/entries';
import type { Habit } from '@onpurpose/core/habits';
import type { HistoryAction, StoredEvent } from '@onpurpose/core/storage/model';
import type { Theme } from '@onpurpose/core/theme';
import { HabitSymbol } from '../ui/HabitSymbol.tsx';
import { Markdown } from './Markdown.tsx';
import { StatsView } from './StatsView.tsx';

export type HabitTab = 'notes' | 'statistics';

// A habit's Notes and Statistics, docked beside the grid (which narrows but
// stays usable). On narrow screens it covers the grid instead.
export function HabitPanel({
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
  const panel = useRef<HTMLElement>(null);
  // Opening a habit moves focus into its panel; Esc closes it.
  useEffect(() => {
    panel.current?.focus();
  }, [habit.id]);
  return (
    <aside
      ref={panel}
      className="side-panel"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <header className="panel-header">
        <div className="panel-title">
          <HabitSymbol icon={habit.icon} colour={colour} size={22} />
          <h2 id={titleId} style={{ color: colour }}>
            {habit.name}
          </h2>
        </div>
        <div className="panel-actions">
          <button
            type="button"
            className="text-button"
            disabled={!editable}
            onClick={onEdit}
          >
            Edit habit
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </header>
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
            onClick={() => onTab(value)}
          >
            {value === 'notes' ? 'Notes' : 'Statistics'}
          </button>
        ))}
      </div>
      <div
        className="panel-body"
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
          <>
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
          </>
        )}
      </div>
    </aside>
  );
}
