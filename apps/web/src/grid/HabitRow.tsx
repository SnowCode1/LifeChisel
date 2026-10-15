import { memo, type CSSProperties, type PointerEvent } from 'react';
import {
  cellAccessibility,
  cellState,
  checkedStreak,
  type CellState,
} from '@onpurpose/core/cellAccessibility';
import type { EntryValues } from '@onpurpose/core/entries';
import type { Habit } from '@onpurpose/core/habits';
import { habitSummary } from '@onpurpose/core/habitSummary';
import type { GridPalette } from '@onpurpose/core/gridAppearance';
import { HabitSymbol } from '../ui/HabitSymbol.tsx';
import type { CellLookStyle, Day, GridHandlers, Pulse } from './types.ts';

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
  /** Days ago of the focusable cell in this row, or -1. */
  focusAgo: number;
  on: GridHandlers;
  dragStyle?: CSSProperties;
  dragging: boolean;
  onHandleDown: (row: number, event: PointerEvent<HTMLElement>) => void;
  /** The tap this row is animating, if any. */
  pulse?: Pulse;
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
  focusAgo,
  on,
  dragStyle,
  dragging,
  onHandleDown,
  pulse,
}: RowProps) {
  const states = days.map((day) =>
    cellState(habit, values[`${habit.id}:${day.key}`], day.key),
  );
  const memo = new Map<string, number>();
  const box = look.boxes;
  const joins = box && look.joined;
  // The column of the tap being animated (joins reach its neighbours too).
  const pulseCol =
    pulse && look.animate
      ? days.findIndex((day) => day.key === pulse.date)
      : -1;
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
        const empty =
          state.kind === 'checkbox' ? !state.checked : !state.recorded;
        // Missed-day marks replace empty past cells: a cross on a due day,
        // nothing on an unscheduled one.
        const missedMark =
          look.missed && empty && day.ago > 0 && !state.met
            ? state.schedule === 'due'
              ? 'cross'
              : state.schedule === 'off'
                ? 'blank'
                : null
            : null;
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
        const tapped = pulseCol === col;
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
          middle &&
          pulseCol >= 0 &&
          pulse!.checked &&
          Math.abs(col - pulseCol) <= 1;
        const cross = (
          <Glyph
            path={CROSS}
            colour={`${palette.colour}66`}
            size={16}
            width={1.8}
          />
        );
        return (
          <td
            key={day.key}
            data-ago={day.ago}
            className={day.ago === 0 ? 'cell today' : 'cell'}
            style={{ backgroundColor: background }}
          >
            {joins && (
              <Joins
                col={col}
                pulseCol={pulseCol}
                pulse={pulse}
                state={state}
                older={older}
                newer={newer}
                fill={fill}
                olderFill={older && fillOf(palette, older)}
                newerFill={newer && fillOf(palette, newer)}
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
                {missedMark === 'cross' ? (
                  cross
                ) : missedMark === 'blank' ||
                  (middle && !absorbed) ? null : box ? (
                  <span
                    key={tapped || absorbed ? pulse!.n : 0}
                    className={
                      absorbed
                        ? 'box absorb'
                        : tapped
                          ? pulse!.checked &&
                            joins &&
                            (older?.checked || newer?.checked)
                            ? 'box pulse reached'
                            : 'box pulse'
                          : 'box'
                    }
                    style={{
                      borderRadius: look.round ? '50%' : '7px',
                      backgroundColor: state.checked ? fill : 'transparent',
                      borderColor: state.checked
                        ? fill
                        : state.met
                          ? palette.colour
                          : palette.checkbox,
                      color: palette.checkmark,
                      fontSize: String(streak).length > 2 ? '11px' : '14px',
                    }}
                  >
                    {streak > 0 ? (
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
                    key={tapped ? pulse!.n : 0}
                    className={tapped ? 'glyph pulse' : 'glyph'}
                  >
                    <Glyph
                      path={state.checked ? TICK : CROSS}
                      colour={state.met ? palette.colour : palette.checkbox}
                      size={24}
                      width={state.checked ? 2.3 : 1.8}
                    />
                  </span>
                )}
              </button>
            ) : (
              // Number, text and category cells open the entry popover.
              <button
                {...shared}
                aria-haspopup="dialog"
                disabled={!editable}
                title={state.recorded ? a11y.label : undefined}
                onClick={(event) =>
                  on.openEntry(habit, day.key, day.label, event.currentTarget)
                }
                className={state.kind === 'number' ? 'mark value' : 'mark text'}
                style={{
                  color: state.recorded ? palette.colour : palette.number,
                }}
              >
                {missedMark === 'cross' ? (
                  cross
                ) : missedMark === 'blank' ? null : state.kind === 'number' ? (
                  // Long numbers shrink to fit the column, down to 65%.
                  <span
                    style={{ '--chars': state.label.length } as CSSProperties}
                  >
                    {state.label}
                  </span>
                ) : (
                  <span>{state.label}</span>
                )}
              </button>
            )}
          </td>
        );
      })}
    </tr>
  );
}

/** The colour a checked box (and its half of a join) is filled with. */
function fillOf(palette: GridPalette, state: CellState) {
  return state.met ? palette.colour : palette.checkbox;
}

/**
 * Each cell draws its own halves of joins to checked neighbours, so
 * neighbouring backgrounds never cover them. A tapped join grows out of the
 * neighbour into the tapped box, or retracts back into the neighbour, over
 * 220 ms: the half nearer the neighbour moves first, then the other.
 */
function Joins({
  col,
  pulseCol,
  pulse,
  state,
  older,
  newer,
  fill,
  olderFill,
  newerFill,
  look,
}: {
  col: number;
  pulseCol: number;
  pulse?: Pulse;
  state: CellState;
  older?: CellState;
  newer?: CellState;
  fill: string;
  olderFill?: string;
  newerFill?: string;
  look: CellLookStyle;
}) {
  const halves: {
    side: 'older' | 'newer';
    colour: string;
    motion?: string;
  }[] = [];
  const near = pulseCol >= 0 && Math.abs(col - pulseCol) <= 1;
  const grow = near && pulse!.checked;
  const shrink = near && !pulse!.checked;
  if (state.checked && older?.checked)
    halves.push({
      side: 'older',
      colour: fill,
      // From the older neighbour: second in this (tapped) cell. From the
      // newer one, this cell is that neighbour: its half goes first.
      motion: grow
        ? col === pulseCol
          ? 'grow from-older second'
          : col === pulseCol + 1
            ? 'grow from-newer first'
            : undefined
        : undefined,
    });
  if (state.checked && newer?.checked)
    halves.push({
      side: 'newer',
      colour: fill,
      motion: grow
        ? col === pulseCol
          ? 'grow from-newer second'
          : col === pulseCol - 1
            ? 'grow from-older first'
            : undefined
        : undefined,
    });
  // A cleared box keeps its joins briefly so they can retract.
  if (shrink) {
    if (col === pulseCol) {
      if (older?.checked)
        halves.push({
          side: 'older',
          colour: olderFill!,
          motion: 'shrink from-older first',
        });
      if (newer?.checked)
        halves.push({
          side: 'newer',
          colour: newerFill!,
          motion: 'shrink from-newer first',
        });
    } else if (col === pulseCol - 1 && state.checked)
      halves.push({
        side: 'newer',
        colour: fill,
        motion: 'shrink from-older second',
      });
    else if (col === pulseCol + 1 && state.checked)
      halves.push({
        side: 'older',
        colour: fill,
        motion: 'shrink from-newer second',
      });
  }
  return halves.map((half) => (
    <span
      key={`${half.side}${half.motion ? `-${pulse!.n}` : ''}`}
      className={`join ${half.side}${half.motion ? ` ${half.motion}` : ''}`}
      style={{
        backgroundColor: half.colour,
        height: `calc(var(--box) * ${look.connector})`,
      }}
    />
  ));
}

const TICK = 'M5 12.5l4.5 4.5L19 7.5';
const CROSS = 'M6 6l12 12M18 6L6 18';
function Glyph({
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
