import type { CSSProperties, PointerEvent } from 'react';
import {
  cellAccessibility,
  cellState,
  checkedStreak,
} from '@onpurpose/core/cellAccessibility';
import type { EntryValues } from '@onpurpose/core/entries';
import type { Habit } from '@onpurpose/core/habits';
import { habitSummary } from '@onpurpose/core/habitSummary';
import type { GridPalette } from '@onpurpose/core/gridAppearance';
import { HabitSymbol } from '../ui/HabitSymbol.tsx';
import type { CellLookStyle, Day, GridHandlers } from './types.ts';

// One habit: its name cell (handle, icon, name, summary, ⋯) and day cells.
export function HabitRow({
  habit,
  row,
  days,
  values,
  today,
  todayOrdinal,
  palette,
  look,
  editable,
  focusCol,
  on,
  dragStyle,
  dragging,
  onHandleDown,
}: {
  habit: Habit;
  row: number;
  days: Day[];
  values: EntryValues;
  today: string;
  todayOrdinal: number;
  palette: GridPalette;
  look: CellLookStyle;
  editable: boolean;
  focusCol: number;
  on: GridHandlers;
  dragStyle?: CSSProperties;
  dragging: boolean;
  onHandleDown: (event: PointerEvent<HTMLElement>) => void;
}) {
  const states = days.map((day) =>
    cellState(habit, values[`${habit.id}:${day.key}`], day.key),
  );
  const memo = new Map<string, number>();
  const box = look.boxes;
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
              onPointerDown={onHandleDown}
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
          'data-cell': `${row}:${col}`,
          tabIndex: col === focusCol ? 0 : -1,
          'aria-label': a11y.label,
        };
        const fill = state.met ? palette.colour : palette.checkbox;
        const joinOlder =
          box &&
          look.joined &&
          state.checked &&
          col > 0 &&
          states[col - 1].checked;
        const joinNewer =
          box &&
          look.joined &&
          state.checked &&
          col < days.length - 1 &&
          states[col + 1].checked;
        const streak =
          box && look.streaks && state.checked
            ? checkedStreak(habit, day.ago, values, todayOrdinal, memo)
            : 0;
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
            className={day.ago === 0 ? 'cell today' : 'cell'}
            style={{ backgroundColor: background }}
          >
            {joinOlder && <Join side="older" colour={fill} look={look} />}
            {joinNewer && <Join side="newer" colour={fill} look={look} />}
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
                ) : missedMark === 'blank' ? null : box ? (
                  <span
                    className="box"
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
                  <Glyph
                    path={state.checked ? TICK : CROSS}
                    colour={state.met ? palette.colour : palette.checkbox}
                    size={24}
                    width={state.checked ? 2.3 : 1.8}
                  />
                )}
              </button>
            ) : (
              // Number, text and category cells open the entry popover.
              <button
                {...shared}
                aria-haspopup="dialog"
                disabled={!editable}
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
                ) : missedMark === 'blank' ? null : (
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

// Each cell draws its own half of a join, so backgrounds never cover it.
function Join({
  side,
  colour,
  look,
}: {
  side: 'older' | 'newer';
  colour: string;
  look: CellLookStyle;
}) {
  return (
    <span
      className={`join ${side}`}
      style={{
        backgroundColor: colour,
        height: `calc(var(--box) * ${look.connector})`,
      }}
    />
  );
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
