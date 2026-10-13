import { useLayoutEffect, useMemo, useRef } from 'react';
import { calendarDay, localDateKey } from '@onpurpose/core/calendar';
import { cellEntryLabel, type EntryValues } from '@onpurpose/core/entries';
import { habitType, type Habit } from '@onpurpose/core/habits';
import { checkboxChecked } from '@onpurpose/core/habitGoals';
import { habitIsComplete } from '@onpurpose/core/habitCompletion';
import { createGridPalette } from '@onpurpose/core/gridAppearance';
import type { Theme } from '@onpurpose/core/theme';

// A first web grid: plain DOM table, oldest day on the left, Today on the
// right, habit names pinned. Browsers scroll and announce tables natively.
const DAYS = 60;

type Day = { key: string; weekday: string; number: number; label: string };

export function HabitGrid({
  habits,
  values,
  today,
  theme,
  editable,
  onToggle,
}: {
  habits: Habit[];
  values: EntryValues;
  today: string;
  theme: Theme;
  editable: boolean;
  onToggle: (habit: Habit, date: string) => void;
}) {
  const days = useMemo(() => gridDays(today), [today]);
  const scroller = useRef<HTMLDivElement>(null);
  // Start at Today, and keep Today at the right edge through window resizes
  // unless the reader has scrolled back into history.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let pinned = true;
    const pin = () => {
      if (pinned) element.scrollLeft = element.scrollWidth;
    };
    const track = () => {
      pinned =
        element.scrollWidth - element.clientWidth - element.scrollLeft < 2;
    };
    pin();
    const observer = new ResizeObserver(pin);
    observer.observe(element);
    element.addEventListener('scroll', track, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', track);
    };
  }, [today]);
  const month = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  return (
    <div className="grid-scroller" ref={scroller}>
      <table className="grid">
        <thead>
          <tr>
            <th className="corner" scope="col">
              {month}
            </th>
            {days.map((day) => (
              <th
                key={day.key}
                scope="col"
                className={day.key === today ? 'day is-today' : 'day'}
                data-today={day.key === today || undefined}
                aria-label={day.label}
              >
                <span className="weekday">{day.weekday}</span>
                <span className="number">{day.number}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {habits.map((habit) => {
            const palette = createGridPalette(habit.color, theme);
            return (
              <tr key={habit.id}>
                <th
                  scope="row"
                  className="name"
                  style={{ color: palette.colour }}
                >
                  {habit.name}
                </th>
                {days.map((day) => {
                  const value = values[`${habit.id}:${day.key}`];
                  const met = habitIsComplete(habit, value, day.key);
                  const background = met
                    ? palette.completedBackground
                    : day.key === today
                      ? palette.todayBackground
                      : undefined;
                  if (habitType(habit) !== 'checkbox')
                    return (
                      <td
                        key={day.key}
                        className="cell value"
                        style={{ background, color: palette.number }}
                        title={
                          value === undefined
                            ? undefined
                            : cellEntryLabel(habit, value)
                        }
                      >
                        {value === undefined
                          ? ''
                          : cellEntryLabel(habit, value)}
                      </td>
                    );
                  const checked = checkboxChecked(habit, value, day.key);
                  return (
                    <td key={day.key} className="cell" style={{ background }}>
                      <button
                        role="checkbox"
                        aria-checked={checked}
                        aria-label={`${habit.name}, ${day.label}`}
                        disabled={!editable}
                        className="checkbox"
                        style={{
                          borderColor: palette.checkbox,
                          background: checked ? palette.colour : 'transparent',
                          color: palette.checkmark,
                        }}
                        onClick={() => onToggle(habit, day.key)}
                      >
                        {checked ? '✓' : ''}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function gridDays(today: string): Day[] {
  return Array.from({ length: DAYS }, (_, index) => {
    const date = calendarDay(today, DAYS - 1 - index);
    return {
      key: localDateKey(date),
      weekday: date.toLocaleDateString(undefined, { weekday: 'narrow' }),
      number: date.getDate(),
      label: date.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    };
  });
}
