import type { CSSProperties } from 'react';
import {
  weekDayOrder,
  type WeekStart,
} from '@onpurpose/core/displayPreferences';
import { cellEntryLabel, entryLabel } from '@onpurpose/core/entries';
import { checkmarkColor } from '@onpurpose/core/colors';
import { checkboxChecked } from '@onpurpose/core/habitGoals';
import { habitType, type Habit } from '@onpurpose/core/habits';
import { dateKey, dayNumber } from '@onpurpose/core/statistics';
import {
  formatStatistic as format,
  statisticDateLabel,
  statisticDayLabel,
  statisticMonthLabel,
} from '@onpurpose/core/statisticsFormatting';
import {
  isRecorded,
  weekStartOf,
  type Outcome,
  type SeriesDay,
} from '@onpurpose/core/statsSeries';
import { MISSED_OPACITY } from '@onpurpose/core/outcomeColours';
import type { Theme } from '@onpurpose/core/theme';

type State = Outcome | 'beyond';
type Cell = { day: number; date: string; item: SeriesDay | null; state: State };
const STATE_TEXT: Partial<Record<State, string>> = {
  met: 'goal met',
  missed: 'goal missed',
  open: 'goal not met yet',
  off: 'not scheduled',
  outside: 'before the start date',
  future: 'future date',
};
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// The same day colours as the phone's calendar.
function dayFill(
  habit: Habit,
  cell: Cell,
  colour: string,
  max: number,
  theme: Theme,
) {
  const recorded = isRecorded(habit, cell.item?.value),
    plain = habitType(habit) === 'categorical' || habitType(habit) === 'text';
  switch (cell.state) {
    case 'met':
      return plain ? theme.mix(colour, 0.42) : colour;
    case 'missed':
      return theme.mix(colour, recorded ? MISSED_OPACITY * 0.7 : 0.13);
    case 'open':
      return recorded
        ? theme.mix(colour, MISSED_OPACITY * 0.7)
        : theme.ink(0x1a);
    case 'off':
      return recorded ? theme.ink(0x2a) : theme.ink(0x0b);
    case 'track': {
      if (!recorded) return theme.ink(0x17);
      const value = cell.item?.value;
      return theme.mix(
        colour,
        typeof value === 'number'
          ? 0.3 + 0.45 * Math.min(1, value / Math.max(1, max))
          : 0.3,
      );
    }
    case 'future':
      return theme.ink(0x0c);
    default:
      return 'transparent';
  }
}

function describe(habit: Habit, cell: Cell) {
  const value = cell.item?.value;
  const unit = habit.unit ? ` ${habit.unit}` : '';
  const recorded =
    habitType(habit) === 'checkbox'
      ? checkboxChecked(habit, value, cell.date)
        ? 'checked'
        : value === 0
          ? 'unchecked'
          : ''
      : value === undefined
        ? 'no entry'
        : typeof value === 'number'
          ? `${format(value)}${unit}`
          : entryLabel(habit, value);
  return [recorded, STATE_TEXT[cell.state] ?? ''].filter(Boolean).join(' · ');
}

/**
 * Up to about three months: rows of weeks where successful days join into one
 * bar. Longer ranges: compact month grids. Days in the window can be edited.
 */
export function StatsCalendar({
  habit,
  days,
  from,
  to,
  today,
  weekStart,
  colour,
  theme,
  editable,
  highlight,
  categoryColours,
  onDay,
}: {
  habit: Habit;
  days: SeriesDay[];
  from: number;
  to: number;
  today: string;
  weekStart: WeekStart;
  colour: string;
  theme: Theme;
  editable: boolean;
  /** A category to emphasise; other days fade. */
  highlight?: string | null;
  categoryColours?: Map<string, string>;
  onDay: (date: string, label: string, anchor: HTMLElement) => void;
}) {
  const now = dayNumber(today);
  const max = Math.max(
    1,
    ...days.map((d) => (typeof d.value === 'number' ? d.value : 0)),
  );
  const compact = to - from + 1 > 100;
  const start = weekStartOf(from, weekStart),
    end = weekStartOf(to, weekStart) + 6;
  const cells: Cell[] = [];
  for (let day = start; day <= end; day++) {
    const item = day >= from && day <= to ? days[day - from] : null;
    cells.push({
      day,
      date: dateKey(day),
      item,
      state: item ? item.outcome : day > now ? 'future' : 'beyond',
    });
  }
  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const fade = (cell: Cell) =>
    !!highlight &&
    !(Array.isArray(cell.item?.value) && cell.item.value.includes(highlight));
  const markColour = (cell: Cell) => {
    const value = cell.item?.value;
    if (highlight && Array.isArray(value) && value.includes(highlight))
      return categoryColours?.get(highlight);
    return undefined;
  };
  const dayButton = (cell: Cell, joinLeft: boolean, joinRight: boolean) => {
    const inWindow = !!cell.item && cell.state !== 'outside';
    const label = `${statisticDayLabel(cell.date, today)}, ${describe(habit, cell)}`;
    const fill = markColour(cell) ?? dayFill(habit, cell, colour, max, theme);
    return (
      <div
        key={cell.day}
        className={`calendar-day${joinLeft ? ' join-left' : ''}${joinRight ? ' join-right' : ''}${cell.day === now ? ' today' : ''}`}
        style={
          {
            '--join': joinLeft || joinRight ? fill : 'transparent',
          } as CSSProperties
        }
      >
        {cell.state === 'beyond' ? null : (
          <button
            type="button"
            aria-label={label}
            title={label}
            disabled={!editable || !inWindow || cell.state === 'future'}
            onClick={(event) =>
              onDay(
                cell.date,
                statisticDayLabel(cell.date, today),
                event.currentTarget,
              )
            }
            style={{
              backgroundColor: fill,
              color:
                cell.state === 'met' && habitType(habit) === 'checkbox'
                  ? theme.background
                  : theme.ink(cell.state === 'future' ? 0x40 : 0xc0),
              opacity: fade(cell) ? 0.25 : 1,
            }}
          >
            {compact ? '' : Number(cell.date.slice(8))}
          </button>
        )}
      </div>
    );
  };
  if (compact) {
    // Compact months for longer ranges: each month its own small grid.
    const months = new Map<string, Cell[]>();
    for (const cell of cells) {
      if (cell.day < from || cell.day > to) continue;
      const key = cell.date.slice(0, 7);
      months.set(key, [...(months.get(key) ?? []), cell]);
    }
    return (
      <div className="calendar-months">
        {[...months].map(([key, monthCells]) => {
          const lead =
            (new Date(`${key}-01T12:00:00`).getDay() -
              (weekStart === 'monday' ? 1 : 0) +
              7) %
            7;
          const firstDay = dayNumber(`${key}-01`);
          return (
            <div key={key} className="calendar-month">
              <span className="muted">{statisticMonthLabel(`${key}-01`)}</span>
              <div className="calendar-grid compact">
                {Array.from(
                  { length: lead + (monthCells[0].day - firstDay) },
                  (_, i) => (
                    <div key={`lead${i}`} />
                  ),
                )}
                {monthCells.map((cell) => dayButton(cell, false, false))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  const type = habitType(habit);
  // Up to about six weeks the tiles are taller, with room for a value.
  const tall = to - from < 45;
  const tile = (
    cell: Cell,
    fill: string,
    joinLeft: boolean,
    joinRight: boolean,
  ) => {
    const inWindow = !!cell.item && cell.state !== 'outside';
    const label = `${statisticDayLabel(cell.date, today)}, ${describe(habit, cell)}`;
    const value = cell.item?.value;
    // Strong fills (a met checkbox day) carry their own readable ink.
    const strong =
      fill.startsWith('#') && fill.length === 7 && theme.contrast(fill) > 7;
    const ink = strong
      ? checkmarkColor(fill)
      : cell.state === 'future' || cell.state === 'outside'
        ? theme.ink(0x5c)
        : theme.ink(0xa8);
    const firstLabel =
      cell.date.endsWith('-01') || (cell.day === from && cell.item !== null);
    return (
      <div
        key={cell.day}
        className={`calendar-cell${joinLeft ? ' join-left' : ''}${joinRight ? ' join-right' : ''}${cell.day === now ? ' today' : ''}`}
      >
        {cell.state === 'beyond' ? null : (
          <button
            type="button"
            aria-label={label}
            title={label}
            disabled={!editable || !inWindow || cell.state === 'future'}
            onClick={(event) =>
              onDay(
                cell.date,
                statisticDayLabel(cell.date, today),
                event.currentTarget,
              )
            }
            style={{
              backgroundColor: fill,
              color: ink,
              opacity: fade(cell) ? 0.25 : 1,
            }}
          >
            <span className="tile-date">
              {firstLabel
                ? statisticDateLabel(cell.date)
                : Number(cell.date.slice(8))}
            </span>
            {type === 'number' && typeof value === 'number' && (
              <span
                className="tile-value"
                style={{ color: strong ? ink : colour }}
              >
                {cellEntryLabel(habit, value)}
              </span>
            )}
            {type === 'categorical' && Array.isArray(value) && (
              <span className="tile-dots">
                {value.slice(0, 4).map((id) => (
                  <span
                    key={id}
                    style={{
                      backgroundColor: categoryColours?.get(id) ?? colour,
                      opacity: !highlight || highlight === id ? 1 : 0.2,
                    }}
                  />
                ))}
              </span>
            )}
            {type === 'text' && typeof value === 'string' && (
              <span className="tile-dots">
                <span style={{ backgroundColor: colour }} />
              </span>
            )}
          </button>
        )}
      </div>
    );
  };
  return (
    <div className={tall ? 'calendar tall' : 'calendar'}>
      <div className="calendar-grid headings" aria-hidden="true">
        {weekDayOrder(weekStart).map((day) => (
          <span key={day}>{WEEKDAYS[day]}</span>
        ))}
      </div>
      {weeks.map((week) => {
        // Days off between successes keep a streak alive: bridge them.
        const bridged = week.map((cell, i) => {
          if (cell.state !== 'off') return false;
          let left = i - 1,
            right = i + 1;
          while (left >= 0 && week[left].state === 'off') left--;
          while (right < week.length && week[right].state === 'off') right++;
          return week[left]?.state === 'met' && week[right]?.state === 'met';
        });
        const joined = (i: number) =>
          i >= 0 && i < week.length && (week[i].state === 'met' || bridged[i]);
        return (
          <div key={week[0].day} className="calendar-grid">
            {week.map((cell, i) => {
              const inRun = cell.state === 'met' || bridged[i];
              const fill = bridged[i]
                ? theme.mix(colour, 0.38)
                : (markColour(cell) ??
                  dayFill(habit, cell, colour, max, theme));
              return tile(
                cell,
                fill,
                inRun && joined(i - 1),
                inRun && joined(i + 1),
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
