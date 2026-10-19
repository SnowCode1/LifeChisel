import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  weekDayOrder,
  type WeekStart,
} from '@onpurpose/core/displayPreferences';
import { entryLabel, type EntryValues } from '@onpurpose/core/entries';
import { habitType, isNumericHabit, type Habit } from '@onpurpose/core/habits';
import { periodMet, periodSummary } from '@onpurpose/core/goalTiming';
import type { PeriodResult } from '@onpurpose/core/periodStatistics';
import {
  dateKey,
  dayNumber,
  habitStatistics,
  habitTrackingStart,
  type StatsRange,
} from '@onpurpose/core/statistics';
import { recordStatistics } from '@onpurpose/core/recordStatistics';
import {
  binSeries,
  habitSeries,
  observations,
  smoothedRates,
  statsWindow,
  streakRuns,
  successMode,
  successUnit,
  TREND_MINIMUM_WEIGHT,
  TREND_SIGMA_DAYS,
  valueUnit,
} from '@onpurpose/core/statsSeries';
import {
  statisticDateLabel,
  statisticMonthLabel,
  statisticSpanLabel,
} from '@onpurpose/core/statisticsFormatting';
import { entryMinutes, timeOfDayStatistics } from '@onpurpose/core/timeOfDay';
import { categoryColours } from '@onpurpose/core/categoryColours';
import { habitSummary } from '@onpurpose/core/habitSummary';
import type { HistoryAction, StoredEvent } from '@onpurpose/core/storage/model';
import type { Theme } from '@onpurpose/core/theme';
import {
  CategoryMatrix,
  hourRange,
  StreakChart,
  SuccessChart,
  TimeOfDayChart,
  ValueChart,
  WeekdayBars,
} from './charts.tsx';
import { StatsCalendar } from './StatsCalendar.tsx';
import {
  moveStatsSection,
  NUMBER_COMBINES,
  numberCombine,
  numberCombineHint,
  numberCombineLabel,
  setStatsSectionHidden,
  statsSections,
  statsSectionTitle,
  type StatsLayout,
  type StatsSectionId,
} from '@onpurpose/core/statsLayout';
import {
  numberRulesNote,
  numberSummary,
  valueChartInfo,
  valueChartTitle,
  weekdayInfo,
} from '@onpurpose/core/numberSummary';

const RANGES: { value: StatsRange; label: string }[] = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: 'Year' },
  { value: 'all', label: 'All time' },
];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type Tile = { label: string; value: string };
// Customize's move and hide buttons, shown in each section's header.
const SectionControls = createContext<ReactNode>(null);

// Statistics for one habit, computed by the same core functions as the
// phone's screens; only the drawing is the web's own.
export function StatsView({
  habit,
  values,
  events,
  actions,
  today,
  weekStart,
  theme,
  editable,
  onDay,
  onEditGoal,
  toolbarHost,
  layout,
  onStatsLayout,
}: {
  /** Where the range tabs and period stepper render (the dialog's toolbar). */
  toolbarHost?: HTMLElement | null;
  habit: Habit;
  values: EntryValues;
  events: StoredEvent[];
  actions: HistoryAction[];
  today: string;
  weekStart: WeekStart;
  theme: Theme;
  editable: boolean;
  onEditGoal: () => void;
  onDay: (
    habit: Habit,
    date: string,
    label: string,
    anchor: HTMLElement,
  ) => void;
  /** This habit's saved statistics layout (v25; null: the default). */
  layout: StatsLayout | null;
  onStatsLayout: (layout: StatsLayout | null) => void;
}) {
  const colour = theme.colour(habit.color);
  const [range, setRange] = useState<StatsRange>(30);
  const [offset, setOffset] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  // Edit mode: reorder and hide sections, and choose how numbers combine.
  const [editing, setEditing] = useState(false);
  const record =
    habitType(habit) === 'categorical' || habitType(habit) === 'text';
  const numeric = isNumericHabit(habit);
  const combine = numeric ? numberCombine(layout) : 'total';
  const trackingStart = useMemo(
    () => habitTrackingStart(habit, values, events, today),
    [habit, values, events, today],
  );
  const window = statsWindow(range, offset, trackingStart, today);
  const from = window.shown,
    end = dateKey(window.to),
    span = window.to - from + 1;
  const habitStats = useMemo(
    () =>
      record
        ? null
        : habitStatistics(habit, values, events, today, range, end, combine),
    [record, habit, values, events, today, range, end, combine],
  );
  const recordStats = useMemo(
    () =>
      record
        ? recordStatistics(habit, values, events, today, range, end)
        : null,
    [record, habit, values, events, today, range, end],
  );
  const history = useMemo(
    () =>
      habitSeries(
        habit,
        values,
        trackingStart,
        today,
        dayNumber(trackingStart),
        dayNumber(today),
      ),
    [habit, values, trackingStart, today],
  );
  const days = useMemo(
    () => habitSeries(habit, values, trackingStart, today, from, window.to),
    [habit, values, trackingStart, today, from, window.to],
  );
  const mode = successMode(history);
  const period = mode === 'period' ? history.at(-1)?.goal?.period : undefined;
  const observed = useMemo(
    () => observations(habit, history, mode, today),
    [habit, history, mode, today],
  );
  const trend = useMemo(
    () =>
      smoothedRates(
        observed,
        from,
        window.to,
        period ? period.days * 2 : TREND_SIGMA_DAYS,
        period ? 1 : TREND_MINIMUM_WEIGHT,
      ),
    [observed, from, window.to, period],
  );
  const runs = useMemo(
    () => streakRuns(habit, history, mode, observed, today),
    [habit, history, mode, observed, today],
  );
  const timeOfDay = useMemo(
    () => timeOfDayStatistics(habit, values, actions, dateKey(from), end),
    [habit, values, actions, from, end],
  );
  const colours = useMemo(() => categoryColours(habit, theme), [habit, theme]);

  const plural = (count: number, noun = 'day') =>
    `${count} ${count === 1 ? noun : `${noun}s`}`;
  const unit = habit.unit ?? '';
  const periodNoun = period?.unit === 'week' ? 'weeks' : 'periods';
  const streakTiles = (
    existing: number,
    label: string,
    current: number,
    longest: number,
  ): Tile[] =>
    existing % 2 === 1
      ? [
          {
            label: `${label} · longest ${plural(longest)}`,
            value: plural(current),
          },
        ]
      : [
          { label, value: plural(current) },
          {
            label: label.startsWith('Current')
              ? 'Longest streak'
              : `Longest · ${label.toLowerCase()}`,
            value: plural(longest),
          },
        ];

  // Headline, note and tiles: the phone's rules for each kind of habit.
  let headline: string, note: string;
  const tiles: Tile[] = [];
  const stats = habitStats ?? recordStats!;
  const periodGoals = stats.periodGoals;
  if (habitStats && numeric) {
    const summary = numberSummary(habitStats, combine, unit);
    headline = summary.headline;
    note = summary.note;
    tiles.push(...summary.tiles);
    if (!periodGoals.current)
      tiles.push(
        ...streakTiles(
          tiles.length,
          habitStats.completion.active
            ? 'Current streak'
            : 'Days recorded in a row',
          habitStats.streak,
          habitStats.bestStreak,
        ),
      );
  } else if (habitStats) {
    headline = habitStats.eligible
      ? `${habitStats.successes} of ${plural(habitStats.eligible)}`
      : 'No days yet';
    note =
      habitStats.rate === null
        ? 'Your records will appear here.'
        : `${Math.round(habitStats.rate * 100)}% successful`;
    if (!periodGoals.current)
      tiles.push(
        ...streakTiles(
          tiles.length,
          'Current streak',
          habitStats.streak,
          habitStats.bestStreak,
        ),
      );
  } else {
    const r = recordStats!;
    const goalShown = r.completion.active || r.completion.eligible > 0;
    headline = goalShown
      ? `${r.completion.successes} of ${plural(r.completion.eligible)}`
      : `${r.recorded} of ${plural(r.eligible)}`;
    note = goalShown
      ? periodGoals.current
        ? 'Meeting the daily condition'
        : 'Meeting the goal'
      : 'Recorded';
    const sameDays =
      r.recorded === r.completion.successes &&
      r.eligible === r.completion.eligible;
    const sameStreaks =
      r.streak === r.completion.streak &&
      r.bestStreak === r.completion.bestStreak;
    if (goalShown && !sameDays)
      tiles.push({
        label: 'Days recorded',
        value: `${r.recorded} of ${r.eligible}`,
      });
    const goalStreaks = goalShown && !periodGoals.current;
    if (goalStreaks)
      tiles.push(
        ...streakTiles(
          tiles.length + (sameStreaks ? 0 : 1),
          'Current streak',
          r.completion.streak,
          r.completion.bestStreak,
        ),
      );
    if (!goalStreaks || !sameStreaks)
      tiles.push(
        ...streakTiles(
          tiles.length,
          'Days recorded in a row',
          r.streak,
          r.bestStreak,
        ),
      );
  }
  const trendNow = trend.findLast((value) => value !== null);
  const visibleRuns = runs.filter(
    (run) => run.to >= from && run.from <= window.to,
  );
  const longestRun = visibleRuns.reduce<(typeof runs)[number] | null>(
    (best, run) => (!best || run.length >= best.length ? run : best),
    null,
  );
  const eligible = habitStats ? habitStats.eligible : recordStats!.eligible;
  const goalShown = stats.completion.active || stats.completion.eligible > 0;

  // Range tabs, the period stepper and Customize: in the dialog's toolbar
  // when it has one, above the overview otherwise.
  const rangeBar = (
    <div className="range-bar">
      <div className="segmented range-tabs" role="tablist" aria-label="Range">
        {RANGES.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="tab"
            aria-selected={range === option.value}
            onClick={() => {
              setRange(option.value);
              setOffset(0);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="period-navigator">
        <button
          type="button"
          className="icon-button"
          aria-label="Earlier period"
          disabled={!window.canGoBack}
          onClick={() => setOffset((value) => value + 1)}
        >
          ‹
        </button>
        <span>
          {eligible
            ? statisticSpanLabel(dateKey(from), end, today)
            : `Starts ${statisticDateLabel(trackingStart, true)}`}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Later period"
          disabled={!window.canGoForward}
          onClick={() => setOffset((value) => Math.max(0, value - 1))}
        >
          ›
        </button>
      </div>
      <button
        type="button"
        className={
          editing ? 'text-button customize active' : 'text-button customize'
        }
        aria-pressed={editing}
        disabled={!editable && !editing}
        onClick={() => setEditing((value) => !value)}
      >
        {editing ? 'Done' : 'Customize'}
      </button>
    </div>
  );

  const valueBins = valueUnit(span);
  const sections = statsSections(habit, layout);
  const content: Record<StatsSectionId, () => ReactNode> = {
    values: () =>
      habitStats && (
        <Section
          title={valueChartTitle(combine, valueBins)}
          subtitle={
            habitStats.recorded ? null : 'Nothing recorded in this period'
          }
          info={valueChartInfo(combine, valueBins, goalShown)}
        >
          <ValueChart
            key={`${range}:${offset}`}
            habit={habit}
            colour={colour}
            theme={theme}
            bins={binSeries(habit, days, valueBins, weekStart)}
            unit={valueBins}
            combine={combine}
            from={from}
            to={window.to}
            today={today}
            weekStart={weekStart}
          />
        </Section>
      ),
    success: () => (
      <Section
        title={mode === 'recording' ? 'Days recorded' : 'Success over time'}
        subtitle={
          trendNow === undefined || trendNow === null
            ? null
            : `Trend ${Math.round(trendNow * 100)}%${offset ? ` on ${statisticDateLabel(end)}` : ''}`
        }
        info={
          mode === 'period'
            ? `Columns show whether each finished period met its target. The line smooths success over about two ${periodNoun} either side; rest periods and the current period don’t count.`
            : mode === 'recording'
              ? 'Columns show the share of days with an entry. The line smooths that share over about two weeks either side. Today counts once it’s recorded.'
              : 'Columns show the share of scheduled days that met the goal. The line smooths success over about two weeks either side. Days off don’t count, and today counts once it’s done.'
        }
      >
        <SuccessChart
          key={`${range}:${offset}`}
          colour={colour}
          theme={theme}
          bins={binSeries(habit, days, successUnit(span), weekStart)}
          unit={successUnit(span)}
          observations={observed}
          trend={trend}
          mode={mode}
          periodNoun={periodNoun}
          from={from}
          to={window.to}
          today={today}
          weekStart={weekStart}
        />
      </Section>
    ),
    streaks: () => (
      <Section
        title="Streaks"
        subtitle={
          longestRun
            ? `Longest here: ${plural(longestRun.length, mode === 'period' ? periodNoun.replace(/s$/, '') : 'day')}, ${statisticSpanLabel(dateKey(longestRun.from), dateKey(longestRun.to), today)}`
            : 'No streak in this period'
        }
        info={
          mode === 'period'
            ? 'Each bar is a streak of finished periods in a row that met their target; rest periods hold it and a missed period breaks it.'
            : mode === 'recording'
              ? 'Each bar is a streak of days in a row with an entry; a day without one breaks it, and an unfinished today keeps it.'
              : 'Each bar is a streak of successful scheduled days in a row, carried across days off; a missed day breaks it, and an unfinished today keeps it.'
        }
      >
        <StreakChart
          key={`${range}:${offset}`}
          colour={colour}
          theme={theme}
          runs={runs}
          noun={mode === 'period' ? periodNoun : 'days'}
          from={from}
          to={window.to}
          today={today}
          weekStart={weekStart}
        />
      </Section>
    ),
    categories: () => (
      <Section
        title="Categories"
        subtitle={
          category
            ? `Showing ${habit.categories?.find((option) => option.id === category)?.label} · select again for all`
            : null
        }
        info="Each row shows when that category was chosen; longer ranges shade each week or month by how often. Several categories can share a day, so rows are never added together. The number is days in this period. Select a row to show only that category in the calendar and entries. Renamed and archived options keep their records."
      >
        <CategoryMatrix
          habit={habit}
          days={days}
          colours={colours}
          weekStart={weekStart}
          theme={theme}
          selected={category}
          onSelect={setCategory}
        />
      </Section>
    ),
    calendar: () => (
      <Section
        title="Calendar"
        info={
          habitType(habit) === 'checkbox'
            ? 'Select a day to check or uncheck it. Successful days join into one bar while the streak lasts, bridged across days off.'
            : `Select a day to edit its entry. Bright days met their goal and faded days missed it; without a goal, brightness follows the value${numeric && combine !== 'total' ? ' between the period’s lowest and highest' : ''}.`
        }
      >
        <StatsCalendar
          key={`${range}:${offset}`}
          habit={habit}
          days={days}
          from={from}
          to={window.to}
          today={today}
          weekStart={weekStart}
          colour={colour}
          theme={theme}
          editable={editable && !editing}
          combine={combine}
          highlight={category}
          categoryColours={colours}
          onDay={(date, label, anchor) => onDay(habit, date, label, anchor)}
        />
      </Section>
    ),
    weekday: () =>
      habitStats && (
        <Section
          title="By day of the week"
          info={
            numeric
              ? weekdayInfo(combine, unit)
              : 'Share of each weekday’s scheduled days that were successful in the selected period.'
          }
        >
          <WeekdayBars
            rows={weekDayOrder(weekStart).map((day) => ({
              day,
              label: WEEKDAY_NAMES[day],
              value:
                habitStats.weekday.find((item) => item.day === day)?.value ??
                null,
            }))}
            colour={colour}
            numeric={numeric}
            fitted={numeric && combine !== 'total'}
            unit={unit}
          />
        </Section>
      ),
    timeOfDay: () => (
      <Section
        title="Time of day"
        subtitle={
          timeOfDay.peak !== null
            ? `Most often ${hourRange(timeOfDay.peak)}`
            : timeOfDay.recorded
              ? 'No same-day entries in this period'
              : 'Nothing recorded in this period'
        }
        info={`Each bar counts days by the hour their entry was first made, in the local time where it was made. Only entries made on the day they belong to count: this period has ${timeOfDay.counted} of ${timeOfDay.recorded} ${timeOfDay.recorded === 1 ? 'day' : 'days'}${timeOfDay.recorded - timeOfDay.counted ? `; ${timeOfDay.recorded - timeOfDay.counted} added on a later day ${timeOfDay.recorded - timeOfDay.counted === 1 ? 'is' : 'are'} left out` : ''}. Corrections keep the original time and undone changes never count.`}
      >
        {timeOfDay.counted > 0 && (
          <TimeOfDayChart stats={timeOfDay} colour={colour} />
        )}
      </Section>
    ),
  };

  return (
    // A summary band across the top (headline, tiles, goal), then cards of
    // statistics flowing in columns (container queries in panel.css).
    <div className={editing ? 'stats editing' : 'stats'}>
      {toolbarHost ? createPortal(rangeBar, toolbarHost) : rangeBar}
      <div className="stats-card overview-card">
        <div className="stats-overview">
          <p className="stats-headline">{headline}</p>
          <p className="muted">{note}</p>
          <p className="goal-line">
            <span className="muted">Goal</span>{' '}
            {habitSummary(habit, values, today)}{' '}
            <button
              type="button"
              className="link-button"
              disabled={!editable}
              onClick={onEditGoal}
            >
              Edit
            </button>
          </p>
        </div>
        {tiles.length > 0 && (
          <div className="tiles">
            {tiles.map((tile) => (
              <div key={tile.label} className="tile">
                <span className="muted">{tile.label}</span>
                <strong>{tile.value}</strong>
              </div>
            ))}
          </div>
        )}
        {offset === 0 && <PeriodProgress data={periodGoals} colour={colour} />}
        {editing && numeric && (
          <div
            className="combine-picker"
            role="group"
            aria-label="Combine days by"
          >
            <span className="combine-label">Combine days by</span>
            <div
              className="segmented"
              role="radiogroup"
              aria-label="Combine days by"
            >
              {NUMBER_COMBINES.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={combine === option}
                  onClick={() => onStatsLayout({ ...layout, combine: option })}
                >
                  {numberCombineLabel(option)}
                </button>
              ))}
            </div>
            <p className="muted">{numberCombineHint(combine)}</p>
          </div>
        )}
      </div>
      {editing && (
        <div className="stats-edit-bar">
          <p className="muted">
            Move sections with the arrows and hide the ones you don’t need. Each
            habit keeps its own layout, on every device.
          </p>
          <button
            type="button"
            className="text-button"
            disabled={!layout}
            onClick={() => onStatsLayout(null)}
          >
            Reset to default
          </button>
        </div>
      )}
      <div className="stats-columns">
        {sections.map(({ id, hidden }, index) => {
          if (hidden && !editing) return null;
          const title = statsSectionTitle(id, habit, layout);
          const controls = (
            <div className="section-controls">
              <button
                type="button"
                className="icon-button"
                aria-label={`Move ${title} up`}
                disabled={index === 0}
                onClick={() =>
                  onStatsLayout(moveStatsSection(habit, layout, id, -1))
                }
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Move ${title} down`}
                disabled={index === sections.length - 1}
                onClick={() =>
                  onStatsLayout(moveStatsSection(habit, layout, id, 1))
                }
              >
                ↓
              </button>
              <button
                type="button"
                className="text-button"
                aria-label={`${hidden ? 'Show' : 'Hide'} ${title}`}
                onClick={() =>
                  onStatsLayout(setStatsSectionHidden(layout, id, !hidden))
                }
              >
                {hidden ? 'Show' : 'Hide'}
              </button>
            </div>
          );
          return (
            <div
              key={id}
              className={hidden ? 'stats-slot is-hidden' : 'stats-slot'}
            >
              {hidden ? (
                <section className="stats-section">
                  <header>
                    <h3>{title}</h3>
                    {controls}
                  </header>
                </section>
              ) : (
                <SectionControls.Provider value={editing ? controls : null}>
                  {content[id]()}
                </SectionControls.Provider>
              )}
            </div>
          );
        })}
      </div>
      {recordStats && (
        <Entries
          habit={habit}
          days={days}
          actions={actions}
          category={category}
          colours={colours}
          colour={colour}
          theme={theme}
          today={today}
          onDay={onDay}
          onShowAll={() => setCategory(null)}
          editable={editable}
        />
      )}
      <details className="info-note">
        <summary>How statistics work</summary>
        <p>
          {numeric
            ? numberRulesNote(combine)
            : 'Success rates use scheduled days since the start, including today. Days off do not break a success streak; an unfinished today has a grace period.'}{' '}
          Success uses each day’s effective goal and schedule, with blank days
          never successful. Use the arrows beside the dates to step back through
          earlier periods. Future entries and records before the start date are
          excluded. Earlier records stay saved; edit the start date to include
          them. Customize reorders and hides sections for this habit.
        </p>
      </details>
    </div>
  );
}

function Section({
  title,
  subtitle,
  info,
  children,
}: {
  title: string;
  subtitle?: string | null;
  info: string;
  children: ReactNode;
}) {
  const controls = useContext(SectionControls);
  return (
    <section className="stats-section">
      <header>
        <h3>{title}</h3>
        <details className="info">
          <summary aria-label={`About ${title.toLowerCase()}`}>i</summary>
          <p>{info}</p>
        </details>
        {controls}
      </header>
      {subtitle && <p className="muted">{subtitle}</p>}
      {children}
    </section>
  );
}

// Progress in the open quota period, and finished periods on request.
function PeriodProgress({
  data,
  colour,
}: {
  data: {
    current: PeriodResult | null;
    recent: PeriodResult[];
    eligible: number;
    met: number;
    streak: number;
    bestStreak: number;
  };
  colour: string;
}) {
  if (!data.current && !data.recent.length) return null;
  const label = (date: string) => statisticDateLabel(date);
  const status = (row: PeriodResult) =>
    row.status === 'rest'
      ? 'Rest period'
      : row.status === 'partial'
        ? 'Partial period · not scored'
        : row.status === 'met'
          ? 'Goal met'
          : row.status === 'missed'
            ? 'Goal not met'
            : periodMet(row.period, row.count)
              ? row.period.operator === 'atLeast'
                ? 'Target reached'
                : 'Within limit so far'
              : row.period.operator !== 'atLeast' &&
                  row.count > (row.period.upper ?? row.period.target)
                ? 'Over limit'
                : 'In progress';
  return (
    <div className="period-progress">
      {data.current && (
        <div>
          <p className="period-heading">
            <strong>
              {data.current.count} {data.current.count === 1 ? 'day' : 'days'}{' '}
              so far
            </strong>
            <span style={{ color: colour }}>{status(data.current)}</span>
          </p>
          <p className="muted">
            {periodSummary(data.current.period)} · {label(data.current.start)} –{' '}
            {label(data.current.end)}
          </p>
        </div>
      )}
      <details>
        <summary>
          {data.eligible
            ? `Goal met in ${data.met} of ${data.eligible} finished periods`
            : 'No finished periods yet'}
        </summary>
        <p className="muted">
          Period streak {data.streak} · longest {data.bestStreak} (all time)
        </p>
        {data.recent.map((row) => (
          <p key={row.id}>
            {label(row.start)} – {label(row.end)}
            <span className="muted">
              {' '}
              · {row.count} days · {status(row)}
            </span>
          </p>
        ))}
      </details>
    </div>
  );
}

// The journal for text and category habits, as on the phone: newest first,
// grouped by month, optionally one category. Each entry shows its day, its
// value (category chips or up to four lines of text), and whether it met the
// goal and when it was made.
function Entries({
  habit,
  days,
  actions,
  category,
  colours,
  colour,
  theme,
  today,
  editable,
  onDay,
  onShowAll,
}: {
  habit: Habit;
  days: ReturnType<typeof habitSeries>;
  actions: HistoryAction[];
  category: string | null;
  colours: Map<string, string>;
  colour: string;
  theme: Theme;
  today: string;
  editable: boolean;
  onDay: (
    habit: Habit,
    date: string,
    label: string,
    anchor: HTMLElement,
  ) => void;
  onShowAll: () => void;
}) {
  const minutes = useMemo(() => entryMinutes(habit, actions), [habit, actions]);
  const entries = days
    .filter(
      (item) =>
        item.value !== undefined &&
        item.outcome !== 'future' &&
        item.outcome !== 'outside' &&
        (!category ||
          (Array.isArray(item.value) && item.value.includes(category))),
    )
    .reverse();
  const months = new Map<string, typeof entries>();
  for (const item of entries) {
    const key = item.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), item]);
  }
  const selectedLabel = habit.categories?.find(
    (option) => option.id === category,
  )?.label;
  const time = (minute: number) =>
    new Date(
      2000,
      0,
      1,
      Math.floor(minute / 60),
      minute % 60,
    ).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <section className="stats-section journal">
      <header>
        <h3>Entries</h3>
        {selectedLabel && category && (
          <button
            type="button"
            className="journal-filter"
            aria-label={`Show all entries, not only ${selectedLabel}`}
            style={{
              color: colours.get(category) ?? colour,
              backgroundColor: theme.mix(colours.get(category) ?? colour, 0.2),
            }}
            onClick={onShowAll}
          >
            {selectedLabel}
            <span aria-hidden="true">×</span>
          </button>
        )}
      </header>
      {entries.length > 0 && (
        <p className="muted">
          {selectedLabel
            ? `Days with ${selectedLabel}, newest first`
            : 'Newest first'}
        </p>
      )}
      {!entries.length && (
        <p className="muted">
          {selectedLabel
            ? `No days with ${selectedLabel} in this period.`
            : 'Nothing recorded in this period.'}
        </p>
      )}
      {[...months].map(([key, items]) => (
        <div key={key} className="journal-month">
          <h4>
            {statisticMonthLabel(`${key}-01`)} · {items.length}{' '}
            {items.length === 1 ? 'entry' : 'entries'}
          </h4>
          {items.map((item) => {
            const minute = minutes.get(item.date);
            const date = new Date(`${item.date}T12:00:00`);
            const met = item.outcome === 'met';
            // "Record anything" goals are met by every entry: no need to say so.
            const scheduled =
              item.goal?.rule.kind !== 'recorded' &&
              (met || item.outcome === 'missed' || item.outcome === 'open');
            const label = statisticDateLabel(
              item.date,
              item.date.slice(0, 4) !== today.slice(0, 4),
            );
            return (
              <button
                key={item.date}
                type="button"
                className="journal-entry"
                disabled={!editable}
                aria-label={`${label}${minute === undefined ? '' : `, entered ${time(minute)}`}, ${entryLabel(habit, item.value)}${scheduled ? (met ? ', goal met' : ', goal not met') : ''}. Edit this day's entry`}
                onClick={(event) =>
                  onDay(habit, item.date, label, event.currentTarget)
                }
              >
                <span className="journal-when" aria-hidden="true">
                  <strong>{date.getDate()}</strong>
                  <span>
                    {date.toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                </span>
                <span className="journal-body" aria-hidden="true">
                  {Array.isArray(item.value) ? (
                    <span className="journal-chips">
                      {item.value.map((id) => {
                        const chip = colours.get(id) ?? colour;
                        return (
                          <span
                            key={id}
                            style={{
                              color: chip,
                              backgroundColor: theme.mix(chip, 0.18),
                              opacity: !category || category === id ? 1 : 0.45,
                            }}
                          >
                            {habit.categories?.find(
                              (option) => option.id === id,
                            )?.label ?? id}
                          </span>
                        );
                      })}
                    </span>
                  ) : (
                    <span className="journal-text">
                      {entryLabel(habit, item.value)}
                    </span>
                  )}
                  {(minute !== undefined || scheduled) && (
                    <span className="journal-meta">
                      {scheduled && (
                        <span
                          className="goal-dot"
                          style={
                            met
                              ? { backgroundColor: colour }
                              : {
                                  boxShadow: `inset 0 0 0 1px ${theme.ink(0x66)}`,
                                }
                          }
                        />
                      )}
                      {[
                        scheduled ? (met ? 'Goal met' : 'Goal not met') : '',
                        minute === undefined ? '' : time(minute),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </section>
  );
}
