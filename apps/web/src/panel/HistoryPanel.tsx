import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { calendarDay, localDateKey } from '@onpurpose/core/calendar';
import {
  allHistory,
  historyCountLabel,
  historyDayIndex,
  historyDayLabel,
  historyDays,
  historyDisplayState,
  historyHabits,
  historyKind,
  historyPresentation,
  historyRows,
  burstMemberLabel,
  type HistoryFilter,
  type HistoryKind,
} from '@onpurpose/core/history';
import type { HistoryAction, StoredState } from '@onpurpose/core/storage/model';
import type { StoreSnapshot } from '@onpurpose/core/storage/store';
import type { Theme } from '@onpurpose/core/theme';
import { Icon } from '../ui/Icon.tsx';

const DAY_PAGE = 40;
const KINDS: { value: HistoryKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'entries', label: 'Entries' },
  { value: 'edits', label: 'Edits' },
  { value: 'notes', label: 'Notes' },
];
const time = (recordedAt: string) =>
  new Date(recordedAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
const shortDate = (date: string, reference: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(date.slice(0, 4) !== reference.slice(0, 4) ? { year: 'numeric' } : {}),
  });

// Active habit actions, newest first in log order, grouped by the day they
// were made. Filters are view state only; the Undo bar always names the
// newest action, even when it is filtered out.
export function HistoryPanel({
  snapshot,
  today,
  theme,
  editable,
  onUndo,
  onRedo,
  onClose,
  onOpenNote,
}: {
  snapshot: StoreSnapshot;
  today: string;
  theme: Theme;
  editable: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
  onOpenNote: (action: HistoryAction) => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [requested, setFilter] = useState<HistoryFilter>(allHistory);
  const [dayLimit, setDayLimit] = useState(DAY_PAGE);
  const [folds, setFolds] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const pendingJump = useRef<string | null>(null);
  useEffect(() => panel.current?.focus(), []);

  const undo = snapshot.replay.undo;
  const state = useMemo(
    () => historyDisplayState(snapshot.replay.state, undo),
    [snapshot.replay.state, undo],
  );
  // A habit whose creation was undone leaves nothing to filter by.
  const habitId =
    requested.habitId &&
    state.habits.some((habit) => habit.id === requested.habitId)
      ? requested.habitId
      : null;
  const filter = useMemo(
    () => ({ kind: requested.kind, habitId }),
    [requested.kind, habitId],
  );
  const filtered = filter.kind !== 'all' || filter.habitId !== null;
  const { days, more } = useMemo(
    () => historyDays(undo, filter, dayLimit),
    [undo, filter, dayLimit],
  );
  const yesterday = localDateKey(calendarDay(today, 1));
  const isOpen = (date: string) =>
    folds.get(date) ?? (filtered || date === today || date === yesterday);
  const habitsInHistory = useMemo(
    () => historyHabits(state, undo),
    [state, undo],
  );
  const describe = (action: HistoryAction | undefined) => {
    if (!action) return null;
    const row = historyPresentation(action, state);
    const date =
      action.change.kind === 'entry' && action.change.date !== today
        ? shortDate(action.change.date, today)
        : null;
    return `${row.title} · ${row.summary}${date ? ` · ${date}` : ''}`;
  };
  const undoLabel = describe(undo.at(-1));
  const redoLabel = describe(snapshot.replay.redo.at(-1)?.action);

  // Jump: load every day, open the chosen one and scroll it into view once
  // it has rendered.
  const scrollToDay = (date: string) => {
    const element = list.current?.querySelector(`[data-day="${date}"]`);
    if (!element) return false;
    element.scrollIntoView({ block: 'start' });
    return true;
  };
  useEffect(() => {
    if (pendingJump.current && scrollToDay(pendingJump.current))
      pendingJump.current = null;
  }, [days, folds]);
  const jump = (date: string) => {
    if (!date) return;
    const all = historyDays(undo, filter).days;
    const target = all[historyDayIndex(all, date)];
    if (!target) return;
    const loaded = all.indexOf(target) < dayLimit;
    if (loaded && isOpen(target.date) && scrollToDay(target.date)) return;
    pendingJump.current = target.date;
    setDayLimit(Math.max(dayLimit, all.indexOf(target) + 1));
    setFolds((previous) => new Map(previous).set(target.date, true));
  };

  return (
    <aside
      ref={panel}
      className="side-panel history-panel"
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
          <h2 id={titleId}>History</h2>
        </div>
        <div className="panel-actions">
          <label className="jump" title="Jump to a day">
            <Icon name="calendar" size={18} />
            <span className="visually-hidden">Jump to a day</span>
            <input
              type="date"
              max={today}
              onChange={(event) => jump(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label="Close history"
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </header>
      <div className="history-filters">
        <div className="chips" role="tablist" aria-label="Kind of change">
          {KINDS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={filter.kind === option.value}
              onClick={() => {
                setFilter((previous) => ({ ...previous, kind: option.value }));
                setDayLimit(DAY_PAGE);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <select
          className="habit-filter"
          aria-label="Habit"
          value={habitId ?? ''}
          onChange={(event) => {
            setFilter((previous) => ({
              ...previous,
              habitId: event.target.value || null,
            }));
            setDayLimit(DAY_PAGE);
          }}
        >
          <option value="">All habits</option>
          {habitsInHistory.map((habit) => (
            <option key={habit.id} value={habit.id}>
              {habit.name}
            </option>
          ))}
        </select>
      </div>

      <div className="panel-body history-list" ref={list}>
        {!days.length &&
          (filtered ? (
            <div className="empty">
              <p className="empty-title">No matching changes</p>
              <button
                type="button"
                className="text-button"
                onClick={() => setFilter(allHistory)}
              >
                Show all changes
              </button>
            </div>
          ) : (
            <div className="empty">
              <Icon name="history" size={30} />
              <p className="empty-title">No active changes</p>
              <p className="muted">
                Your habit entries and edits will appear here.
              </p>
            </div>
          ))}
        {days.map((day) => {
          const open = isOpen(day.date);
          return (
            <section key={day.key} className="history-day" data-day={day.date}>
              <h3>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() =>
                    setFolds((previous) =>
                      new Map(previous).set(day.date, !open),
                    )
                  }
                >
                  <Icon name="chevron" size={16} />
                  <span className="day-label">
                    {historyDayLabel(day.date, today)}
                  </span>
                  <span className="muted">{historyCountLabel(day.counts)}</span>
                </button>
              </h3>
              {open && (
                <ul>
                  {historyRows(day.actions, expanded).map((row) =>
                    row.type === 'burst' ? (
                      <li key={row.key} className="history-burst">
                        <button
                          type="button"
                          aria-expanded={row.expanded}
                          onClick={() =>
                            setExpanded((previous) => {
                              const next = new Set(previous);
                              if (next.has(row.key)) next.delete(row.key);
                              else next.add(row.key);
                              return next;
                            })
                          }
                        >
                          <span className="row-icon">
                            <Icon
                              name="checked"
                              size={16}
                              color={theme.ink(0xb8)}
                            />
                          </span>
                          <span className="row-text">
                            <span>
                              {row.actions.length} entries
                              {row.expanded ? '' : ':'}
                            </span>
                            {!row.expanded && (
                              <span className="burst-members">
                                {row.actions.map((action) => {
                                  const member = burstMemberLabel(
                                    action,
                                    state,
                                  );
                                  return (
                                    <span
                                      key={action.id}
                                      style={{
                                        color: theme.colour(member.color),
                                      }}
                                      className={
                                        member.removed ? 'removed' : undefined
                                      }
                                    >
                                      {member.name}
                                      {member.value ? ` ${member.value}` : ''}
                                    </span>
                                  );
                                })}
                              </span>
                            )}
                          </span>
                          <span className="row-time">
                            {time(row.actions[0].recordedAt)}
                          </span>
                        </button>
                      </li>
                    ) : (
                      <HistoryRow
                        key={row.key}
                        action={row.action}
                        state={state}
                        theme={theme}
                        today={today}
                        nested={!!row.nested}
                        onOpenNote={onOpenNote}
                      />
                    ),
                  )}
                </ul>
              )}
            </section>
          );
        })}
        {more && (
          <button
            type="button"
            className="text-button more-days"
            onClick={() => setDayLimit((limit) => limit + DAY_PAGE)}
          >
            Show earlier days
          </button>
        )}
      </div>

      <div className="undo-bar" role="region" aria-label="Undo and redo">
        <button
          type="button"
          disabled={!editable || !undo.length}
          aria-label={undoLabel ? `Undo ${undoLabel}` : 'Nothing to undo'}
          onClick={onUndo}
        >
          <Icon name="undo" size={18} />
          <span className="undo-text">
            <strong>Undo</strong>
            <span className="muted">{undoLabel ?? 'Nothing to undo'}</span>
          </span>
        </button>
        <button
          type="button"
          className="redo"
          disabled={!editable || !snapshot.replay.redo.length}
          aria-label={redoLabel ? `Redo ${redoLabel}` : 'Nothing to redo'}
          title={redoLabel ?? undefined}
          onClick={onRedo}
        >
          <Icon name="redo" size={18} />
          Redo
        </button>
      </div>
    </aside>
  );
}

function HistoryRow({
  action,
  state,
  theme,
  today,
  nested,
  onOpenNote,
}: {
  action: HistoryAction;
  state: StoredState;
  theme: Theme;
  today: string;
  nested: boolean;
  onOpenNote: (action: HistoryAction) => void;
}) {
  const row = historyPresentation(action, state);
  // Note changes open Before/After.
  const note = historyKind(action) === 'notes';
  const colour = theme.colour(row.color);
  return (
    <li className={nested ? 'history-row nested' : 'history-row'}>
      <span
        className="row-icon"
        style={{ backgroundColor: theme.mix(colour, 0.14) }}
      >
        <Icon name={row.icon} size={16} color={colour} />
      </span>
      <span className="row-text">
        <span>
          <span className="row-title" style={{ color: colour }}>
            {row.title}
          </span>{' '}
          {note ? (
            <button
              type="button"
              className="link-button"
              onClick={() => onOpenNote(action)}
            >
              {row.summary}
            </button>
          ) : (
            row.summary
          )}
        </span>
        {row.effectiveDate && (
          <span className="muted">
            For {shortDate(row.effectiveDate, today)}
          </span>
        )}
      </span>
      <span className="row-time">{time(action.recordedAt)}</span>
    </li>
  );
}
