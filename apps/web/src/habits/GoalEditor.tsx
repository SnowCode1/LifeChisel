import { useEffect, useId, useState, type ReactNode } from 'react';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import { calendarDay, localDateKey } from '@onpurpose/core/calendar';
import { goalDraftIssue, parseGoalAmount } from '@onpurpose/core/goalEditing';
import {
  allWeekdays,
  defaultSuccessRule,
  goalAt,
  replaceGoal,
  resolveGoalDraft,
  ruleSummary,
  scheduleSummary,
  timingSummary,
  validGoalTimeline,
  validSuccessRule,
  type HabitGoal,
  type SuccessRule,
} from '@onpurpose/core/habitGoals';
import {
  cycleSummary,
  nextPeriodStart,
  ordinal,
  periodSummary,
  periodWindow,
  timingDate,
  validCycle,
  validPeriod,
  validTimingDate,
  weekAnchor,
  type GoalPeriod,
  type GoalTiming,
} from '@onpurpose/core/goalTiming';
import { habitType, type Habit } from '@onpurpose/core/habits';
import { sameValue } from '@onpurpose/core/storage/model';
import type { Theme } from '@onpurpose/core/theme';
import { Modal } from '../ui/Modal.tsx';
import { Icon } from '../ui/Icon.tsx';

const WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dateLabel = (date: string, today: string) =>
  validTimingDate(date)
    ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
      })
    : 'Choose a date';

/**
 * A habit's dated goal versions: a timeline of versions and a form for one.
 * Done hands the whole timeline to onApply (a staged draft in the habit
 * editor, or one undoable habit change from the statistics panel).
 */
export function GoalEditor({
  habit,
  today,
  weekStart,
  creating,
  initialDate = today,
  editable,
  theme,
  onClose,
  onApply,
}: {
  habit: Habit;
  today: string;
  weekStart: WeekStart;
  creating: boolean;
  initialDate?: string;
  editable: boolean;
  theme: Theme;
  onClose: () => void;
  onApply: (goals: HabitGoal[] | undefined) => boolean;
}) {
  const titleId = useId();
  const colour = theme.colour(habit.color);
  const newDraft = (): HabitGoal => {
    const current = goalAt(habit, initialDate);
    return {
      id: crypto.randomUUID(),
      from:
        current?.period && !creating
          ? nextPeriodStart(current.period, initialDate)
          : initialDate,
      ...(current?.period ? { period: current.period } : {}),
      ...(current?.cycle ? { cycle: current.cycle } : {}),
      ...(current?.defaultChecked !== undefined
        ? { defaultChecked: current.defaultChecked }
        : {}),
      rule: current?.rule ?? defaultSuccessRule(habit),
      weekdays: [...(current?.weekdays ?? allWeekdays)],
    };
  };
  const [draft, setDraft] = useState<HabitGoal>(newDraft);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const select = (next: HabitGoal, id: string | null) => {
    if (
      dirty &&
      !window.confirm(
        'Discard this draft?\n\nYour unapplied goal changes will be discarded.',
      )
    )
      return;
    setDirty(false);
    setDraft(next);
    setOriginalId(id);
  };
  const apply = (goals: HabitGoal[] | undefined) => {
    if (onApply(goals)) onClose();
  };
  const save = (next: HabitGoal) => {
    const goals = replaceGoal(habit.goals, next);
    if (!validGoalTimeline(goals, habit)) return;
    // Opening and closing an unchanged goal never adds a historical version.
    if (
      sameValue(next, resolveGoalDraft(habit.goals, draft, !!originalId)) ||
      sameValue(goals, habit.goals)
    ) {
      onClose();
      return;
    }
    const previousDate = habit.goals?.find(
      (goal) => goal.id === originalId,
    )?.from;
    if (
      !creating &&
      (next.from < today || (previousDate && previousDate < today)) &&
      !window.confirm(
        'Update earlier results?\n\nThis changes the goal for its date period. Recorded values stay saved, and you can undo the change in History.',
      )
    )
      return;
    apply(goals);
  };
  const remove = () => {
    if (!originalId) return;
    if (
      !window.confirm(
        'Remove this goal?\n\nThe preceding goal, or the original default, will apply through this period. Recorded values stay saved. You can undo this in History.',
      )
    )
      return;
    const remaining = habit.goals!.filter((goal) => goal.id !== originalId);
    apply(remaining.length ? remaining : undefined);
  };
  const active = goalAt(habit, today);
  const goals = habit.goals ?? [];
  return (
    <Modal
      titleId={titleId}
      title="Goal"
      className="goal-editor"
      leading={
        <button
          type="button"
          className="icon-button"
          aria-label="Close goal without applying changes"
          onClick={onClose}
        >
          <Icon name="close" size={18} />
        </button>
      }
      onClose={onClose}
    >
      <div className="goal-layout">
        <aside className="goal-timeline" aria-label="Goal timeline">
          <h3 style={{ color: colour }}>{habit.name}</h3>
          <button
            type="button"
            className={
              !originalId ? 'goal-version selected new' : 'goal-version new'
            }
            disabled={!editable}
            onClick={() => select(newDraft(), null)}
          >
            <Icon name="plus" size={18} color={colour} />
            <span style={{ color: colour }}>New goal</span>
          </button>
          <ol>
            {[...goals].reverse().map((goal) => {
              const index = goals.findIndex((item) => item.id === goal.id);
              const end = goals[index + 1]?.from;
              const status =
                goal.from > today
                  ? 'Upcoming'
                  : goal.id === active?.id
                    ? 'Current'
                    : null;
              return (
                <li key={goal.id}>
                  <button
                    type="button"
                    className={
                      originalId === goal.id
                        ? 'goal-version selected'
                        : 'goal-version'
                    }
                    disabled={!editable}
                    aria-label={`Edit goal from ${goal.from}, ${ruleSummary(habit, goal.rule)}`}
                    onClick={() => select(goal, goal.id)}
                  >
                    <span className="version-dates">
                      {dateLabel(goal.from, today)}
                      {end
                        ? ` – ${dateLabel(localDateKey(calendarDay(end, 1)), today)}`
                        : ' onwards'}
                      {status && (
                        <span
                          className="badge"
                          style={
                            status === 'Current' ? { color: colour } : undefined
                          }
                        >
                          {status}
                        </span>
                      )}
                    </span>
                    <span>
                      {ruleSummary(habit, goal.rule)}
                      {goal.defaultChecked ? ' · default On' : ''}
                    </span>
                    <span className="muted">{timingSummary(goal)}</span>
                  </button>
                </li>
              );
            })}
            {(!goals.length ||
              !habit.startDate ||
              goals[0].from > habit.startDate) && (
              <li className="goal-version original">
                <span className="version-dates">
                  {goals.length
                    ? `Before ${dateLabel(goals[0].from, today)}`
                    : 'Original goal'}
                </span>
                <span>{ruleSummary(habit, defaultSuccessRule(habit))}</span>
                <span className="muted">Every day</span>
              </li>
            )}
          </ol>
          <p className="hint">
            Select a dated goal to edit that period. A new goal starts on its
            date and keeps earlier goals.
          </p>
        </aside>
        <GoalForm
          key={`${draft.id}:${originalId ?? 'new'}`}
          habit={habit}
          initial={draft}
          existing={!!originalId}
          creating={creating}
          today={today}
          weekStart={weekStart}
          colour={colour}
          theme={theme}
          editable={editable}
          onDirty={setDirty}
          onSave={save}
          onRemove={remove}
        />
      </div>
    </Modal>
  );
}

function GoalForm({
  habit,
  initial,
  existing,
  creating,
  today,
  weekStart,
  colour,
  theme,
  editable,
  onDirty,
  onSave,
  onRemove,
}: {
  habit: Habit;
  initial: HabitGoal;
  existing: boolean;
  creating: boolean;
  today: string;
  weekStart: WeekStart;
  colour: string;
  theme: Theme;
  editable: boolean;
  onDirty: (dirty: boolean) => void;
  onSave: (goal: HabitGoal) => void;
  onRemove: () => void;
}) {
  const type = habitType(habit);
  const [defaultChecked, setDefaultChecked] = useState(
    initial.defaultChecked ?? false,
  );
  const [from, setFrom] = useState(initial.from);
  const [kind, setKind] = useState<SuccessRule['kind']>(initial.rule.kind);
  const [operator, setOperator] = useState(
    initial.rule.kind === 'number' ? initial.rule.operator : 'atLeast',
  );
  const [target, setTarget] = useState(
    initial.rule.kind === 'number' ? String(initial.rule.target) : '',
  );
  const [upper, setUpper] = useState(
    initial.rule.kind === 'number' ? String(initial.rule.upper ?? '') : '',
  );
  const [match, setMatch] = useState<'any' | 'all' | 'count'>(
    initial.rule.kind === 'categories' || initial.rule.kind === 'text'
      ? initial.rule.match
      : 'any',
  );
  const [ids, setIds] = useState(
    initial.rule.kind === 'categories' ? initial.rule.ids : [],
  );
  const [exclude, setExclude] = useState(
    initial.rule.kind === 'categories' ? initial.rule.exclude : [],
  );
  const [count, setCount] = useState(
    initial.rule.kind === 'categories' ? String(initial.rule.count ?? 1) : '1',
  );
  const [terms, setTerms] = useState(
    initial.rule.kind === 'text' ? initial.rule.terms.join('\n') : '',
  );
  const [timing, setTiming] = useState<GoalTiming>({
    weekdays: initial.weekdays,
    ...(initial.period ? { period: initial.period } : {}),
    ...(initial.cycle ? { cycle: initial.cycle } : {}),
  });
  const [dateEdited, setDateEdited] = useState(false);
  const [selectedDays, setSelectedDays] = useState(
    !initial.period && initial.weekdays.length < 7,
  );
  const [customCycle, setCustomCycle] = useState(
    !!initial.cycle &&
      !['5:2:days', '3:1:weeks', '1:1:weeks'].includes(
        `${initial.cycle.on}:${initial.cycle.off}:${initial.cycle.unit}`,
      ),
  );
  const rule: SuccessRule =
    kind === 'number'
      ? {
          kind,
          operator,
          target: parseGoalAmount(target),
          ...(operator === 'between' ? { upper: parseGoalAmount(upper) } : {}),
        }
      : kind === 'categories'
        ? {
            kind,
            match,
            ids: match === 'count' ? [] : [...ids].sort(),
            exclude: [...exclude].sort(),
            ...(match === 'count' ? { count: parseGoalAmount(count) } : {}),
          }
        : kind === 'text'
          ? {
              kind,
              match: match === 'all' ? 'all' : 'any',
              terms: terms
                .split('\n')
                .map((term) => term.trim())
                .filter(Boolean),
            }
          : { kind };
  const goal: HabitGoal = resolveGoalDraft(
    habit.goals,
    {
      id: initial.id,
      from,
      rule,
      ...timing,
      ...(type === 'checkbox' &&
      (defaultChecked || initial.defaultChecked !== undefined)
        ? { defaultChecked }
        : {}),
      weekdays: [...timing.weekdays].sort((a, b) => a - b),
    },
    existing,
  );
  const issue = goalDraftIssue(habit, goal);
  const changed = !sameValue(
    goal,
    resolveGoalDraft(habit.goals, initial, existing),
  );
  // Tell the timeline whether switching versions would discard changes.
  useEffect(() => onDirty(changed), [changed, onDirty]);
  const anchorDate = validTimingDate(from) ? from : today;
  const changeTiming = (next: GoalTiming) => {
    setTiming(next);
    if (
      next.period &&
      validPeriod(next.period) &&
      !existing &&
      !creating &&
      !dateEdited &&
      (!timing.period ||
        next.period.days !== timing.period.days ||
        next.period.unit !== timing.period.unit)
    )
      setFrom(nextPeriodStart(next.period, today));
  };
  const period = timing.period,
    cycle = timing.cycle;
  const changePeriod = (patch: Partial<GoalPeriod>) =>
    changeTiming({ ...timing, period: { ...period!, ...patch } });
  const toggle = (items: string[], id: string) =>
    items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
  const chips = (
    label: string,
    selected: string[],
    onToggle: (id: string) => void,
  ) => (
    <fieldset className="chip-field">
      <legend className="field-label">{label}</legend>
      <div className="chips">
        {habit.categories?.map((option) => (
          <label
            key={option.id}
            className="chip-check"
            style={
              selected.includes(option.id)
                ? { color: colour, backgroundColor: theme.mix(colour, 0.18) }
                : undefined
            }
          >
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={() => onToggle(option.id)}
            />
            {option.label}
            {option.archived ? ' · archived' : ''}
          </label>
        ))}
      </div>
    </fieldset>
  );
  const numberField = (
    label: string,
    value: number,
    onChange: (value: number) => void,
  ) => (
    <label className="field small">
      <span className="field-label">{label}</span>
      <input
        className="text-input"
        inputMode="numeric"
        maxLength={3}
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(event) =>
          onChange(
            /^\d+$/.test(event.target.value) ? Number(event.target.value) : NaN,
          )
        }
      />
    </label>
  );
  return (
    <form
      className="goal-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!issue && editable) onSave(goal);
      }}
    >
      <Section
        title="Success condition"
        summary={
          validSuccessRule(rule, habit)
            ? `${ruleSummary(habit, rule)}${type === 'checkbox' && defaultChecked ? ' · default On' : ''}`
            : 'Finish this condition'
        }
      >
        {type === 'checkbox' ? (
          <>
            <Choice
              label="Success condition"
              value={kind}
              options={[
                ['checked', 'Checked'],
                ['unchecked', 'Unchecked'],
              ]}
              onChange={(value) => setKind(value as SuccessRule['kind'])}
            />
            <label className="switch-row">
              <span>
                Checked by default
                <span className="hint">
                  Days count as checked until you untick them
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={defaultChecked}
                onChange={(event) => setDefaultChecked(event.target.checked)}
              />
            </label>
          </>
        ) : (
          <Choice
            label="Success condition"
            value={kind}
            options={[
              ['none', 'Track only'],
              [
                'recorded',
                type === 'text'
                  ? 'Text entered'
                  : type === 'categorical'
                    ? 'Any selection'
                    : 'Total entered',
              ],
              [
                type === 'number'
                  ? 'number'
                  : type === 'categorical'
                    ? 'categories'
                    : 'text',
                type === 'number'
                  ? 'Target'
                  : type === 'categorical'
                    ? 'Match'
                    : 'Match text',
              ],
            ]}
            onChange={(value) => {
              setKind(value as SuccessRule['kind']);
              if (value === 'none')
                setTiming(({ period: _period, ...rest }) => rest);
            }}
          />
        )}
        {kind === 'number' && (
          <>
            <Choice
              label="Comparison"
              value={operator}
              options={[
                ['atLeast', 'At least'],
                ['atMost', 'At most'],
                ['between', 'Between'],
                ['exactly', 'Exactly'],
              ]}
              onChange={(value) => setOperator(value as typeof operator)}
            />
            <div className="field-row">
              <label className="field">
                <span className="field-label">
                  {operator === 'between'
                    ? 'Lower limit'
                    : `Target${habit.unit ? ` (${habit.unit})` : ''}`}
                </span>
                <input
                  className="text-input"
                  inputMode="decimal"
                  maxLength={20}
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                />
              </label>
              {operator === 'between' && (
                <label className="field">
                  <span className="field-label">Upper limit</span>
                  <input
                    className="text-input"
                    inputMode="decimal"
                    maxLength={20}
                    value={upper}
                    onChange={(event) => setUpper(event.target.value)}
                  />
                </label>
              )}
            </div>
          </>
        )}
        {kind === 'categories' && (
          <>
            <Choice
              label="Match"
              value={match}
              options={[
                ['any', 'Any of'],
                ['all', 'All of'],
                ['count', 'At least N'],
              ]}
              onChange={(value) => setMatch(value as typeof match)}
            />
            {match === 'count' ? (
              <label className="field small">
                <span className="field-label">Number selected</span>
                <input
                  className="text-input"
                  inputMode="numeric"
                  maxLength={3}
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                />
              </label>
            ) : (
              chips('Include', ids, (id) => {
                setIds((previous) => toggle(previous, id));
                setExclude((previous) =>
                  previous.filter((item) => item !== id),
                );
              })
            )}
            {chips('Must not include', exclude, (id) => {
              setExclude((previous) => toggle(previous, id));
              setIds((previous) => previous.filter((item) => item !== id));
            })}
          </>
        )}
        {kind === 'text' && (
          <>
            <Choice
              label="Match text"
              value={match === 'all' ? 'all' : 'any'}
              options={[
                ['any', 'Any phrase'],
                ['all', 'All phrases'],
              ]}
              onChange={(value) => setMatch(value as typeof match)}
            />
            <label className="field">
              <span className="field-label">Phrases · one per line</span>
              <textarea
                className="text-area"
                maxLength={2400}
                value={terms}
                onChange={(event) => setTerms(event.target.value)}
              />
              <span className="hint">Ignores case and extra spaces.</span>
            </label>
          </>
        )}
      </Section>

      <Section
        title="Repeat"
        summary={
          period
            ? validPeriod(period)
              ? periodSummary(period)
              : 'Finish the period target'
            : scheduleSummary(timing.weekdays) || 'Choose days'
        }
      >
        <Choice
          label="How often"
          value={period ? 'period' : selectedDays ? 'weekdays' : 'daily'}
          options={[
            ['daily', 'Every day'],
            ['weekdays', 'Selected days'],
            ...(kind === 'none'
              ? []
              : [['period', 'Per period'] as [string, string]]),
          ]}
          onChange={(key) => {
            setSelectedDays(key === 'weekdays');
            const { period: _period, ...base } = timing;
            changeTiming({
              ...base,
              weekdays: key === 'weekdays' ? [1, 2, 3, 4, 5] : [...allWeekdays],
              ...(key === 'period'
                ? {
                    period: {
                      unit: 'week',
                      days: 7,
                      anchor: weekAnchor(anchorDate, weekStart),
                      operator: 'atLeast',
                      target: 3,
                    } as GoalPeriod,
                  }
                : {}),
            });
          }}
        />
        {!period && selectedDays && (
          <div className="weekday-picker" role="group" aria-label="Applies on">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <label
                key={day}
                className="chip-check day"
                title={WEEKDAY_LONG[day]}
                style={
                  timing.weekdays.includes(day)
                    ? {
                        color: colour,
                        backgroundColor: theme.mix(colour, 0.18),
                      }
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  aria-label={`Applies on ${WEEKDAY_LONG[day]}`}
                  checked={timing.weekdays.includes(day)}
                  onChange={() =>
                    changeTiming({
                      ...timing,
                      weekdays: timing.weekdays.includes(day)
                        ? timing.weekdays.filter((item) => item !== day)
                        : [...timing.weekdays, day].sort((a, b) => a - b),
                    })
                  }
                />
                {WEEKDAY_SHORT[day]}
              </label>
            ))}
          </div>
        )}
        {period && (
          <>
            <Choice
              label="Period"
              value={period.unit}
              options={[
                ['week', 'Week'],
                ['days', 'Custom days'],
              ]}
              onChange={(unit) =>
                changePeriod({
                  unit: unit as GoalPeriod['unit'],
                  days: unit === 'week' ? 7 : period.days,
                  anchor:
                    unit === 'week'
                      ? weekAnchor(anchorDate, weekStart)
                      : anchorDate,
                })
              }
            />
            {period.unit === 'days' &&
              numberField('Days per period', period.days, (days) =>
                changePeriod({ days }),
              )}
            <Choice
              label="Successful days"
              value={period.operator}
              options={[
                ['atLeast', 'At least'],
                ['atMost', 'At most'],
                ['between', 'Between'],
              ]}
              onChange={(next) => {
                const { upper: _upper, ...base } = period;
                changeTiming({
                  ...timing,
                  period: {
                    ...base,
                    operator: next as GoalPeriod['operator'],
                    ...(next === 'between'
                      ? {
                          upper: Math.max(
                            period.target,
                            Math.min(period.days, 5),
                          ),
                        }
                      : {}),
                  },
                });
              }}
            />
            <div className="field-row">
              {numberField(
                period.operator === 'between'
                  ? 'Minimum days'
                  : 'Successful day count',
                period.target,
                (value) => changePeriod({ target: value }),
              )}
              {period.operator === 'between' &&
                numberField('Maximum days', period.upper!, (value) =>
                  changePeriod({ upper: value }),
                )}
            </div>
          </>
        )}
      </Section>

      <Section
        title="Cycle"
        summary={
          cycle
            ? validCycle(cycle)
              ? cycleSummary(cycle)
              : 'Finish the cycle'
            : 'None'
        }
      >
        <Choice
          label="Pattern"
          value={
            !cycle
              ? 'none'
              : customCycle
                ? 'custom'
                : `${cycle.on}:${cycle.off}:${cycle.unit}`
          }
          options={[
            ['none', 'None'],
            ['5:2:days', '5 days on / 2 off'],
            ['3:1:weeks', '3 weeks on / 1 off'],
            ['1:1:weeks', 'Alternate weeks'],
            ['custom', 'Custom'],
          ]}
          onChange={(key) => {
            const { cycle: _cycle, ...base } = timing;
            if (key === 'none') return changeTiming(base);
            setCustomCycle(key === 'custom');
            if (key === 'custom') {
              if (!cycle)
                changeTiming({
                  ...base,
                  cycle: { unit: 'days', on: 5, off: 2, anchor: anchorDate },
                });
              return;
            }
            const [on, off, unit] = key.split(':');
            changeTiming({
              ...base,
              cycle: {
                unit: unit as 'days' | 'weeks',
                on: Number(on),
                off: Number(off),
                anchor: cycle?.anchor ?? anchorDate,
              },
            });
          }}
        />
        {cycle && (
          <>
            {customCycle && (
              <>
                <Choice
                  label="Cycle unit"
                  value={cycle.unit}
                  options={[
                    ['days', 'Days'],
                    ['weeks', 'Weeks'],
                  ]}
                  onChange={(unit) =>
                    changeTiming({
                      ...timing,
                      cycle: { ...cycle, unit: unit as 'days' | 'weeks' },
                    })
                  }
                />
                <div className="field-row">
                  {numberField('On', cycle.on, (on) =>
                    changeTiming({ ...timing, cycle: { ...cycle, on } }),
                  )}
                  {numberField('Off', cycle.off, (off) =>
                    changeTiming({ ...timing, cycle: { ...cycle, off } }),
                  )}
                </div>
              </>
            )}
            <label className="field small">
              <span className="field-label">
                Cycle starts on · first day of an on period
              </span>
              <input
                type="date"
                className="text-input"
                value={cycle.anchor}
                onChange={(event) =>
                  changeTiming({
                    ...timing,
                    cycle: { ...cycle, anchor: event.target.value },
                  })
                }
              />
            </label>
          </>
        )}
      </Section>

      <Section title="Applies from" summary={dateLabel(from, today)}>
        <label className="field small">
          <span className="field-label">Apply from</span>
          <input
            type="date"
            className="text-input"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setDateEdited(true);
            }}
          />
        </label>
        {!!period && !existing && !creating && (
          <div className="chips">
            <button
              type="button"
              disabled={!validPeriod(period)}
              onClick={() => {
                setFrom(nextPeriodStart(period, today));
                setDateEdited(true);
              }}
            >
              Next period
            </button>
            <button
              type="button"
              onClick={() => {
                setFrom(today);
                setDateEdited(true);
                setTiming((previous) => ({
                  ...previous,
                  period: { ...previous.period!, unit: 'days', anchor: today },
                }));
              }}
            >
              New period today
            </button>
          </div>
        )}
        {!!period && Number.isFinite(ordinal(from)) && validPeriod(period) && (
          <p className="hint">
            First period: {from} – {timingDate(periodWindow(period, from).end)}
            {periodWindow(period, from).start < ordinal(from)
              ? ' · partial, not scored'
              : ''}
          </p>
        )}
        {from < today && (
          <p className="hint">
            Earlier results in this period will be updated.
          </p>
        )}
      </Section>

      {issue && (
        <p className="hint error" role="alert">
          {issue}
        </p>
      )}
      <div className="goal-actions">
        {existing && (
          <button
            type="button"
            className="text-button danger"
            disabled={!editable}
            onClick={onRemove}
          >
            Remove this goal
          </button>
        )}
        <span className="spacer" />
        <button
          type="submit"
          className="done-button"
          disabled={!!issue || !editable}
        >
          Done
        </button>
      </div>
      <p className="hint">
        New goals start on the selected date and keep earlier goals. Editing an
        earlier goal changes results only until the next goal starts. Recorded
        values stay saved, and every applied change can be undone in History.
      </p>
    </form>
  );
}

function Section({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="goal-section">
      <legend>
        {title}
        <span className="muted"> · {summary}</span>
      </legend>
      {children}
    </fieldset>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented wrap" role="radiogroup" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
