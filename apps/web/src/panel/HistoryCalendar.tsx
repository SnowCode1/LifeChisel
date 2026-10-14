import type { ReactNode } from 'react';
import { addMonths } from '@onpurpose/core/calendar';
import {
  weekDayOrder,
  type WeekStart,
} from '@onpurpose/core/displayPreferences';
import {
  historyCountLabel,
  type HistoryCalendar as Calendar,
  type HistoryCalendarDay,
} from '@onpurpose/core/history';
import { monthDays } from '@onpurpose/core/statistics';
import type { StoredState } from '@onpurpose/core/storage/model';
import type { Theme } from '@onpurpose/core/theme';
import { Icon } from '../ui/Icon.tsx';

export type CalendarScale = 'month' | 'year';
// Dots per day in the month view; more habits show as "+n".
const DOTS = 4;

const weekdayNames = (() => {
  const format = new Intl.DateTimeFormat(undefined, {
    weekday: 'narrow',
    timeZone: 'UTC',
  });
  // 4 October 2026 was a Sunday.
  return Array.from({ length: 7 }, (_, day) =>
    format.format(new Date(Date.UTC(2026, 9, 4 + day, 12))),
  );
})();
const monthName = (month: string, style: 'long' | 'short') =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
  });
const dayName = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

/**
 * History as a calendar: a month with a coloured dot for each habit changed
 * that day, or a whole year with one dot per day in the colour of its
 * most-changed habit. Days are the days the changes were made, as in the day
 * list; choosing one opens it there.
 */
export function HistoryCalendar({
  calendar,
  state,
  theme,
  today,
  weekStart,
  scale,
  month,
  onScale,
  onMonth,
  onChoose,
}: {
  calendar: Calendar;
  state: StoredState;
  theme: Theme;
  today: string;
  weekStart: WeekStart;
  scale: CalendarScale;
  /** The month shown (YYYY-MM); the year view shows its year. */
  month: string;
  onScale: (scale: CalendarScale) => void;
  onMonth: (month: string) => void;
  onChoose: (date: string) => void;
}) {
  const colours = new Map(
    state.habits.map((habit) => [habit.id, theme.colour(habit.color)]),
  );
  const names = new Map(state.habits.map((habit) => [habit.id, habit.name]));
  const thisMonth = today.slice(0, 7);
  const firstMonth = calendar.first?.slice(0, 7) ?? thisMonth;
  const step = scale === 'month' ? 1 : 12;
  const year = month.slice(0, 4);
  const canBack =
    scale === 'month' ? month > firstMonth : year > firstMonth.slice(0, 4);
  const canForward =
    scale === 'month' ? month < thisMonth : year < thisMonth.slice(0, 4);
  const label = (day: HistoryCalendarDay | undefined, date: string) => {
    if (!day) return `${dayName(date)}, no changes`;
    const habits = day.habits.map((habit) => names.get(habit.id) ?? 'Habit');
    return `${dayName(date)}, ${historyCountLabel(day.counts)}${habits.length ? `: ${habits.join(', ')}` : ''}`;
  };
  const weekdays = weekDayOrder(weekStart);

  return (
    <div className="history-calendar">
      <div className="calendar-bar">
        <div className="segmented small" role="tablist" aria-label="Show">
          {(['month', 'year'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={scale === value}
              onClick={() => onScale(value)}
            >
              {value === 'month' ? 'Month' : 'Year'}
            </button>
          ))}
        </div>
        <div className="calendar-step">
          <button
            type="button"
            className="icon-button"
            aria-label={scale === 'month' ? 'Previous month' : 'Previous year'}
            disabled={!canBack}
            onClick={() => onMonth(addMonths(month, -step))}
          >
            <span className="chevron-left">
              <Icon name="chevron" size={16} />
            </span>
          </button>
          <h3 aria-live="polite">
            {scale === 'month' ? monthName(month, 'long') : year}
          </h3>
          <button
            type="button"
            className="icon-button"
            aria-label={scale === 'month' ? 'Next month' : 'Next year'}
            disabled={!canForward}
            onClick={() =>
              onMonth(
                addMonths(month, step) > thisMonth
                  ? thisMonth
                  : addMonths(month, step),
              )
            }
          >
            <span className="chevron-right">
              <Icon name="chevron" size={16} />
            </span>
          </button>
        </div>
      </div>

      {scale === 'month' ? (
        <div className="month-view">
          <div className="weekdays" aria-hidden="true">
            {weekdays.map((day) => (
              <span key={day}>{weekdayNames[day]}</span>
            ))}
          </div>
          <MonthGrid
            month={month}
            weekStart={weekStart}
            className="month-days"
            render={(date) => {
              const day = calendar.days.get(date);
              const shown = day?.habits.slice(0, DOTS) ?? [];
              const extra =
                (day?.habits.length ?? 0) - shown.length + (day?.other ? 1 : 0);
              return (
                <button
                  key={date}
                  type="button"
                  className={date === today ? 'day today' : 'day'}
                  disabled={!day}
                  aria-label={label(day, date)}
                  title={day ? label(day, date) : undefined}
                  onClick={() => onChoose(date)}
                >
                  <span className="date">{Number(date.slice(8))}</span>
                  {day && (
                    <span className="dots" aria-hidden="true">
                      {shown.map((habit) => (
                        <span
                          key={habit.id}
                          className="dot"
                          style={{
                            backgroundColor:
                              colours.get(habit.id) ?? theme.ink(0x97),
                          }}
                        />
                      ))}
                      {!shown.length && day.other > 0 && (
                        <span
                          className="dot"
                          style={{ backgroundColor: theme.ink(0x97) }}
                        />
                      )}
                      {extra > 0 && shown.length > 0 && (
                        <span className="more">+{extra}</span>
                      )}
                    </span>
                  )}
                </button>
              );
            }}
          />
        </div>
      ) : (
        <div className="year-view">
          {Array.from({ length: 12 }, (_, index) => {
            const shownMonth = `${year}-${String(index + 1).padStart(2, '0')}`;
            const future = shownMonth > thisMonth;
            return (
              <section key={shownMonth} className="mini-month">
                <button
                  type="button"
                  className="mini-title"
                  disabled={future}
                  onClick={() => {
                    onMonth(shownMonth);
                    onScale('month');
                  }}
                >
                  {monthName(shownMonth, 'short')}
                </button>
                <MonthGrid
                  month={shownMonth}
                  weekStart={weekStart}
                  className="mini-days"
                  render={(date) => {
                    const day = calendar.days.get(date);
                    const top = day?.habits[0];
                    return (
                      <button
                        key={date}
                        type="button"
                        className={date === today ? 'mini today' : 'mini'}
                        disabled={!day}
                        aria-label={label(day, date)}
                        title={day ? label(day, date) : undefined}
                        onClick={() => onChoose(date)}
                      >
                        <span
                          className={day ? 'dot' : 'dot empty'}
                          style={
                            day
                              ? {
                                  backgroundColor: top
                                    ? colours.get(top.id)
                                    : theme.ink(0x97),
                                }
                              : undefined
                          }
                        />
                      </button>
                    );
                  }}
                />
              </section>
            );
          })}
        </div>
      )}
      <p className="hint calendar-hint">
        {calendar.days.size
          ? scale === 'month'
            ? 'Dots show the habits changed each day. Choose a day to see its changes.'
            : 'Each dot is a day with changes, in the colour of its most-changed habit. Choose a month or a day.'
          : 'No changes to show.'}
      </p>
    </div>
  );
}

function MonthGrid({
  month,
  weekStart,
  className,
  render,
}: {
  month: string;
  weekStart: WeekStart;
  className: string;
  render: (date: string) => ReactNode;
}) {
  const { padding, days } = monthDays(month, weekStart);
  return (
    <div className={className}>
      {Array.from({ length: padding }, (_, index) => (
        <span key={`pad-${index}`} aria-hidden="true" />
      ))}
      {days.map(render)}
    </div>
  );
}
