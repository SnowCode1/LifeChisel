import {
  memo,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  cellAccessibility,
  cellState,
  checkedStreak,
  type CellState,
} from '@onpurpose/core/cellAccessibility';
import type { EntryValue, EntryValues } from '@onpurpose/core/entries';
import type { Habit } from '@onpurpose/core/habits';
import { habitSummary } from '@onpurpose/core/habitSummary';
import type { GridPalette } from '@onpurpose/core/gridAppearance';
import {
  FADE_MS,
  JOIN_MS,
  MET_FADE_MS,
  RETRACT_MS,
} from '@onpurpose/core/tapMotion';
import { habitInitial } from '@onpurpose/core/gridModes';
import { HabitSymbol } from '../ui/HabitSymbol.tsx';
import {
  planStroke,
  planTap,
  type Stroke,
  type Wave,
  type WaveSegment,
} from './fillWave.ts';
import type {
  CellLookStyle,
  Day,
  FillRun,
  GridHandlers,
  Pulse,
} from './types.ts';

type RowProps = {
  habit: Habit;
  row: number;
  days: Day[];
  /** Every saved value; the row reads only its own habit's. */
  values: EntryValues;
  /** Changes exactly when this habit's saved values change. */
  signature: string;
  today: string;
  todayOrdinal: number;
  palette: GridPalette;
  look: CellLookStyle;
  editable: boolean;
  /** Compact mode: the icon (or initial) alone stands for the name. */
  compact?: boolean;
  /** Days ago of the focusable cell in this row, or -1. */
  focusAgo: number;
  on: GridHandlers;
  dragStyle?: CSSProperties;
  dragging: boolean;
  onHandleDown: (row: number, event: PointerEvent<HTMLElement>) => void;
  /** The tap or fill this row is animating, if any. */
  pulse?: Pulse;
  /** The fill being drawn (or awaiting its value) along this row. */
  fillRun?: FillRun;
};

// One habit: its name cell (handle, icon, name, summary, ⋯) and day cells.
// Rows re-render only when their own values or display inputs change, so an
// edit redraws one row, not the whole grid.
export const HabitRow = memo(HabitRowView, (before, after) => {
  for (const key of Object.keys(after) as (keyof RowProps)[])
    if (key !== 'values' && before[key] !== after[key]) return false;
  return true;
});

function HabitRowView({
  habit,
  row,
  days,
  values,
  today,
  todayOrdinal,
  palette,
  look,
  editable,
  compact = false,
  focusAgo,
  on,
  dragStyle,
  dragging,
  onHandleDown,
  pulse,
  fillRun,
}: RowProps) {
  const states = days.map((day) =>
    cellState(habit, values[`${habit.id}:${day.key}`], day.key),
  );
  const memo = new Map<string, number>();
  // A checkbox fill also renumbers streaks: each box keeps its old number
  // until the stroke reaches it (days past the run, until it ends). The
  // values before the fill are read through an overlay, not a copy.
  let earlierValues: EntryValues | undefined;
  const earlierMemo = new Map<string, number>();
  if (pulse && look.animate && pulse.kind === 'checks' && look.streaks) {
    earlierValues = Object.create(values) as EntryValues;
    for (const [date, value] of Object.entries(pulse.before))
      (earlierValues as Record<string, EntryValue | undefined>)[
        `${habit.id}:${date}`
      ] = value ?? undefined;
  }
  const box = look.boxes;
  const joins = box && look.joined;
  // The tap or fill being animated (fillWave.ts): a tap moves the joins to
  // its neighbours; a fill runs as one stroke along its run in drag order.
  const motion = pulse && look.animate ? pulse : undefined;
  // A changed day's state before the tap or fill (others are unchanged).
  const earlier = (col: number): CellState =>
    motion && days[col].key in motion.before
      ? cellState(
          habit,
          motion.before[days[col].key] ?? undefined,
          days[col].key,
        )
      : states[col];
  const wasChecked = (col: number) =>
    col >= 0 && col < days.length && earlier(col).checked;
  let tap: Wave | undefined;
  let stroke: Stroke | undefined;
  let tapCol = -1;
  if (motion) {
    const index = new Map(days.map((day, col) => [day.key, col]));
    const cols = motion.dates
      .map((date) => index.get(date) ?? -1)
      .filter((col) => col >= 0);
    if (motion.kind === 'tap' && cols.length) {
      tapCol = cols[0];
      tap = planTap({
        col: tapCol,
        checked: motion.checked,
        isChecked: (col) => states[col].checked,
        columns: days.length,
        contactMs: motion.contactMs,
      });
    } else if (cols.length)
      stroke = planStroke({
        cols,
        checked: motion.kind === 'values' ? null : motion.checked,
        changed: (col) => days[col].key in motion.before,
        wasChecked,
        isChecked: (col) => states[col].checked,
        columns: days.length,
        reach: motion.reach,
        contactMs: motion.contactMs,
      });
  }
  // Streak ends only: a checked box between two checked neighbours.
  const wasMiddle = (col: number) =>
    wasChecked(col - 1) && wasChecked(col) && wasChecked(col + 1);
  const missedOf = (state: CellState, day: Day) => {
    const empty = state.kind === 'checkbox' ? !state.checked : !state.recorded;
    // Missed-day marks replace empty past cells: a cross on a due day,
    // nothing on an unscheduled one.
    return look.missed && empty && day.ago > 0 && !state.met
      ? state.schedule === 'due'
        ? 'cross'
        : state.schedule === 'off'
          ? 'blank'
          : null
      : null;
  };
  return (
    <tr className={dragging ? 'dragging' : undefined} style={dragStyle}>
      <th
        scope="row"
        className="name"
        onContextMenu={(event) => {
          event.preventDefault();
          on.openMenu(habit, event.currentTarget);
        }}
      >
        {compact ? (
          <div className="name-inner">
            <button
              type="button"
              className="name-button compact-name"
              tabIndex={-1}
              title={habit.name}
              aria-label={`Notes and statistics for ${habit.name}`}
              data-row-menu={row}
              onClick={() => on.openHabit(habit)}
            >
              {habit.icon ? (
                <HabitSymbol
                  icon={habit.icon}
                  colour={palette.colour}
                  size={22}
                />
              ) : (
                <span
                  className="habit-initial"
                  style={{ color: palette.colour }}
                >
                  {habitInitial(habit.name)}
                </span>
              )}
            </button>
          </div>
        ) : (
          <div className="name-inner">
            {editable && (
              <span
                className="drag-handle"
                aria-hidden="true"
                title="Drag to reorder"
                onPointerDown={(event) => onHandleDown(row, event)}
              >
                <svg
                  width="10"
                  height="16"
                  viewBox="0 0 10 16"
                  fill="currentColor"
                >
                  <circle cx="2.5" cy="3" r="1.4" />
                  <circle cx="7.5" cy="3" r="1.4" />
                  <circle cx="2.5" cy="8" r="1.4" />
                  <circle cx="7.5" cy="8" r="1.4" />
                  <circle cx="2.5" cy="13" r="1.4" />
                  <circle cx="7.5" cy="13" r="1.4" />
                </svg>
              </span>
            )}
            <HabitSymbol icon={habit.icon} colour={palette.colour} size={20} />
            <button
              type="button"
              className="name-text name-button"
              tabIndex={-1}
              title={`Notes and statistics for ${habit.name}`}
              onClick={() => on.openHabit(habit)}
            >
              <span className="habit-name" style={{ color: palette.colour }}>
                {habit.name}
              </span>
              <span className="summary">
                {habitSummary(habit, values, today)}
              </span>
            </button>
            <button
              type="button"
              className="row-menu"
              tabIndex={-1}
              aria-haspopup="menu"
              aria-label={`Actions for ${habit.name}`}
              data-row-menu={row}
              onClick={(event) => on.openMenu(habit, event.currentTarget)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="5" cy="12" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="19" cy="12" r="1.7" />
              </svg>
            </button>
          </div>
        )}
      </th>
      {days.map((day, col) => {
        const state = states[col];
        const value = values[`${habit.id}:${day.key}`];
        // Background precedence: goal met > Today > plain.
        const background = state.met
          ? palette.completedBackground
          : day.ago === 0
            ? palette.todayBackground
            : undefined;
        const missedMark = missedOf(state, day);
        const a11y = cellAccessibility(habit, value, day.key, day.label);
        const shared = {
          'data-cell': `${row}:${day.ago}`,
          tabIndex: day.ago === focusAgo ? 0 : -1,
          'aria-label': a11y.label,
        };
        const fill = fillOf(palette, state);
        const older = col > 0 ? states[col - 1] : undefined;
        const newer = col < days.length - 1 ? states[col + 1] : undefined;
        const streak =
          box && look.streaks && state.checked
            ? checkedStreak(habit, day.ago, values, todayOrdinal, memo)
            : 0;
        // When this run cell's own animations start, and whether the tap
        // or fill changed it (it then fades, pulses and shows its new
        // content at that moment).
        const start = tap
          ? col === tapCol
            ? 0
            : undefined
          : stroke?.at.get(col);
        const tapped = start !== undefined && day.key in motion!.before;
        const delayed = tapped && start > 0;
        const earlierStreak =
          earlierValues && box && earlier(col).checked
            ? checkedStreak(
                habit,
                day.ago,
                earlierValues,
                todayOrdinal,
                earlierMemo,
              )
            : 0;
        // An unchanged box whose number changes switches when the stroke
        // reaches it (or touches it, just beyond the run), else at its end.
        const renumberAt =
          stroke &&
          !tapped &&
          streak > 0 &&
          earlierStreak > 0 &&
          earlierStreak !== streak
            ? (stroke.at.get(col) ?? stroke.bumps.get(col) ?? stroke.ms)
            : undefined;
        // A box a moving bar touches bumps then; a ticking stroke fills each
        // box with that bump rather than the tap's press.
        const bump = tap
          ? joins
            ? tap.bumps.get(col)
            : undefined
          : box
            ? stroke?.bumps.get(col)
            : undefined;
        const pulsing = tapped && !(stroke && motion!.checked);
        const arrival = tap
          ? tap.arrivals.has(col)
            ? 0
            : undefined
          : stroke && motion!.checked
            ? start
            : undefined;
        // Streak ends only: a box between two checked neighbours is hidden,
        // so one bar runs from first to last. Boxes a growing join turns into
        // middles shrink into the bar as it reaches them.
        const middle =
          joins &&
          look.endsOnly &&
          state.checked &&
          older?.checked === true &&
          newer?.checked === true;
        const absorbed =
          middle && arrival !== undefined && motion!.checked && !wasMiddle(col);
        // The box a moving join reaches bumps when the bar touches it.
        const reached = bump !== undefined;
        const animated = pulsing || reached || absorbed;
        const cross = (
          <Glyph path={CROSS} colour={palette.missed} size={16} width={1.8} />
        );
        const fading = start !== undefined && motion!.kind !== 'tap';
        const filling =
          fillRun && day.ago >= fillRun.lo && day.ago <= fillRun.hi;
        // Until the stroke reaches it, a changed cell still shows what it showed
        // before; its new content takes over when its turn comes.
        const held = (now: ReactNode, before: ReactNode) =>
          delayed ? (
            <>
              <span className="was" aria-hidden="true">
                {before}
              </span>
              <span className="later">{now}</span>
            </>
          ) : (
            now
          );
        const previous = delayed ? earlier(col) : state;
        const previousMissed = delayed ? missedOf(previous, day) : null;
        return (
          <td
            key={day.key}
            data-ago={day.ago}
            className={`cell${day.ago === 0 ? ' today' : ''}${tapped ? ' fade' : ''}${filling ? ' filling' : fading ? ' unfill' : ''}`}
            style={
              tapped || fading
                ? ({
                    backgroundColor: background,
                    '--fade-ms': `${state.met ? MET_FADE_MS : FADE_MS}ms`,
                    '--delay': `${start}ms`,
                    transitionDelay: `${start}ms`,
                  } as CSSProperties)
                : { backgroundColor: background }
            }
          >
            {joins && (
              <Joins
                col={col}
                segments={tap?.segments ?? stroke?.segments}
                stroke={stroke}
                n={motion?.n ?? 0}
                state={state}
                older={older}
                newer={newer}
                fill={fill}
                olderFill={older && fillOf(palette, older)}
                newerFill={newer && fillOf(palette, newer)}
                previousFill={fillOf(palette, earlier(col))}
                look={look}
              />
            )}
            {state.kind === 'checkbox' ? (
              <button
                {...shared}
                role="checkbox"
                aria-checked={state.checked}
                disabled={!editable}
                className="mark"
                onClick={() => on.toggle(habit, day.key)}
              >
                {held(
                  missedMark === 'cross' ? (
                    cross
                  ) : missedMark === 'blank' ||
                    (middle && !absorbed) ? null : box ? (
                    <span
                      key={animated ? motion!.n : 0}
                      className={
                        absorbed
                          ? 'box absorb'
                          : `box${pulsing ? ' pulse' : ''}${reached ? ' reached' : ''}`
                      }
                      style={
                        {
                          ...(reached && { '--contact': `${bump}ms` }),
                          ...(absorbed && { '--delay': `${arrival}ms` }),
                          ...(renumberAt !== undefined && {
                            '--delay': `${renumberAt}ms`,
                          }),
                          borderRadius: look.round ? '50%' : '7px',
                          backgroundColor: state.checked ? fill : 'transparent',
                          borderColor: state.checked
                            ? fill
                            : state.met
                              ? palette.colour
                              : palette.empty,
                          color: palette.checkmark,
                          fontSize: String(streak).length > 2 ? '11px' : '14px',
                        } as CSSProperties
                      }
                    >
                      {renumberAt !== undefined ? (
                        <>
                          <span className="was" aria-hidden="true">
                            {earlierStreak}
                          </span>
                          <span className="later">{streak}</span>
                        </>
                      ) : streak > 0 ? (
                        streak
                      ) : state.checked ? (
                        <Glyph
                          path={TICK}
                          colour={palette.checkmark}
                          size={22}
                          width={2.5}
                        />
                      ) : null}
                    </span>
                  ) : (
                    <span
                      key={tapped ? motion!.n : 0}
                      className={tapped ? 'glyph pulse' : 'glyph'}
                    >
                      <Glyph
                        path={state.checked ? TICK : CROSS}
                        colour={markOf(palette, state)}
                        size={24}
                        width={state.checked ? 2.3 : 1.8}
                      />
                    </span>
                  ),
                  delayed &&
                    (previousMissed === 'cross' ? (
                      cross
                    ) : previousMissed === 'blank' ||
                      (joins &&
                        look.endsOnly &&
                        wasMiddle(col)) ? null : box ? (
                      <span
                        className="box"
                        style={{
                          borderRadius: look.round ? '50%' : '7px',
                          backgroundColor: previous.checked
                            ? fillOf(palette, previous)
                            : 'transparent',
                          borderColor: previous.checked
                            ? fillOf(palette, previous)
                            : previous.met
                              ? palette.colour
                              : palette.empty,
                          color: palette.checkmark,
                          fontSize:
                            String(earlierStreak).length > 2 ? '11px' : '14px',
                        }}
                      >
                        {previous.checked &&
                          (earlierStreak > 0 ? (
                            earlierStreak
                          ) : (
                            <Glyph
                              path={TICK}
                              colour={palette.checkmark}
                              size={22}
                              width={2.5}
                            />
                          ))}
                      </span>
                    ) : (
                      <span className="glyph">
                        <Glyph
                          path={previous.checked ? TICK : CROSS}
                          colour={markOf(palette, previous)}
                          size={24}
                          width={previous.checked ? 2.3 : 1.8}
                        />
                      </span>
                    )),
                )}
              </button>
            ) : (
              // Number, text and category cells open the entry popover (a
              // pointer click after a short wait, so a second press can
              // start a fill).
              <button
                {...shared}
                aria-haspopup="dialog"
                disabled={!editable}
                title={state.recorded ? a11y.label : undefined}
                onClick={(event) =>
                  on.openEntry(
                    habit,
                    day.key,
                    day.label,
                    event.currentTarget,
                    event.detail > 0,
                  )
                }
                className={state.kind === 'number' ? 'mark value' : 'mark text'}
                style={{
                  color: state.recorded ? palette.colour : palette.number,
                }}
              >
                {held(
                  valueContent(state, missedMark, cross),
                  delayed && (
                    <span
                      style={{
                        color: previous.recorded
                          ? palette.colour
                          : palette.number,
                      }}
                    >
                      {valueContent(previous, previousMissed, cross)}
                    </span>
                  ),
                )}
              </button>
            )}
          </td>
        );
      })}
    </tr>
  );
}

/** The fill of a checked box: the habit colour when its goal is met. */
export function fillOf(palette: GridPalette, state: CellState) {
  return state.met ? palette.colour : palette.checkbox;
}

/** A Ticks & crosses mark: coloured when met, grey for an empty cross. */
export function markOf(palette: GridPalette, state: CellState) {
  return state.met
    ? palette.colour
    : state.checked
      ? palette.checkbox
      : palette.empty;
}

/** A number, text or category cell's content (or its missed-day mark). */
function valueContent(
  state: CellState,
  missed: 'cross' | 'blank' | null,
  cross: ReactNode,
) {
  if (missed === 'cross') return cross;
  if (missed === 'blank') return null;
  return state.kind === 'number' ? (
    // Long numbers shrink to fit the column, down to 65%.
    <span
      className="label"
      style={{ '--chars': state.label.length } as CSSProperties}
    >
      {state.label}
    </span>
  ) : (
    <span className="label">{state.label}</span>
  );
}

/**
 * Each cell draws its own halves of joins to checked neighbours, so
 * neighbouring backgrounds never cover them. A moving join (fillWave.ts)
 * grows out of its anchor into its target, or retracts from the target back
 * into the anchor. Both halves follow one eased progress (tapMotion): the
 * half in the anchor's cell covers its first half, the half in the target's
 * the second. Retracting halves stay drawn until their animation ends, even
 * though the saved data has already cleared them.
 */
function Joins({
  col,
  segments,
  stroke,
  n,
  state,
  older,
  newer,
  fill,
  olderFill,
  newerFill,
  previousFill,
  look,
}: {
  col: number;
  segments?: WaveSegment[];
  stroke?: Stroke;
  n: number;
  state: CellState;
  older?: CellState;
  newer?: CellState;
  fill: string;
  olderFill?: string;
  newerFill?: string;
  /** This cell's fill before the tap or fill. */
  previousFill: string;
  look: CellLookStyle;
}) {
  const halves: {
    side: 'older' | 'newer';
    colour: string;
    motion?: string;
    style?: CSSProperties;
  }[] = [];
  for (const side of ['older', 'newer'] as const) {
    const other = side === 'older' ? col - 1 : col + 1;
    const neighbour = side === 'older' ? older : newer;
    // A fill's stroke: this half follows the one stroke position, drawn
    // behind it (growing) or erased ahead of it (clearing).
    const part = stroke?.halves.get(col)?.find((item) => item.side === side);
    if (stroke && part) {
      const behind = stroke.direction > 0 ? 'older' : 'newer';
      const ahead = stroke.direction > 0 ? 'newer' : 'older';
      halves.push({
        side,
        colour: stroke.grow || state.checked ? fill : previousFill,
        motion: `stroke ${stroke.grow ? `stroke-grow from-${behind}` : `stroke-erase from-${ahead}`}`,
        style: {
          '--start': part.start,
          '--len': stroke.length,
          animationDuration: `${stroke.ms}ms`,
        } as CSSProperties,
      });
      continue;
    }
    const segment = segments?.find(
      (item) =>
        (item.anchor === col && item.target === other) ||
        (item.target === col && item.anchor === other),
    );
    if (!segment) {
      if (state.checked && neighbour?.checked)
        halves.push({ side, colour: fill });
      continue;
    }
    const from = segment.anchor < segment.target ? 'from-older' : 'from-newer';
    const role = segment.anchor === col ? 'in-neighbour' : 'in-tapped';
    halves.push({
      side,
      // A retracting half takes the colour of whichever end is still
      // checked, else this cell's earlier fill.
      colour: state.checked
        ? fill
        : neighbour?.checked
          ? (side === 'older' ? olderFill : newerFill)!
          : previousFill,
      motion: `${segment.grow ? 'grow' : 'shrink'} ${from} ${role}`,
      style: {
        animationDuration: `${segment.grow ? JOIN_MS : RETRACT_MS}ms`,
      },
    });
  }
  return halves.map((half) => (
    <span
      key={`${half.side}${half.motion ? `-${n}` : ''}`}
      className={`join ${half.side}${half.motion ? ` ${half.motion}` : ''}`}
      style={{
        backgroundColor: half.colour,
        height: `calc(var(--box) * ${look.connector})`,
        ...half.style,
      }}
    />
  ));
}

export const TICK = 'M5 12.5l4.5 4.5L19 7.5';
export const CROSS = 'M6 6l12 12M18 6L6 18';
export function Glyph({
  path,
  colour,
  size,
  width,
}: {
  path: string;
  colour: string;
  size: number;
  width: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colour}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
