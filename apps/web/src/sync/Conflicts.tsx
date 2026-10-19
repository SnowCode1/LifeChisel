import { useState } from 'react';
import type { ChangeStore, StoreSnapshot } from '@onpurpose/core/storage/store';
import {
  conflictAlternative,
  conflictText,
  type SyncConflict,
} from '@onpurpose/core/sync/conflicts';

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/**
 * Sync conflicts at the top of History (docs/SYNC.md): what was kept, and
 * one button for the other value. Switching is an ordinary undoable edit;
 * OK just clears the notice. The grid never waits on these.
 */
export function Conflicts({
  store,
  snapshot,
  editable,
}: {
  store: ChangeStore;
  snapshot: StoreSnapshot;
  editable: boolean;
}) {
  const [open, setOpen] = useState(true);
  const conflicts = snapshot.conflicts as SyncConflict[];
  if (!conflicts.length) return null;
  const state = snapshot.replay.state;
  const dismiss = (ids: string[]) => void store.removeConflicts(ids);
  const switchTo = (conflict: SyncConflict) => {
    if (conflict.kind === 'deleteKept' && conflict.habitId) {
      if (store.deleteArchivedHabit(conflict.habitId)) dismiss([conflict.id]);
      return;
    }
    const change = conflictAlternative(state, conflict);
    if (change && store.change(change)) dismiss([conflict.id]);
  };
  return (
    <section className="conflicts" aria-label="Sync conflicts">
      <header>
        <button
          type="button"
          className="text-button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {conflicts.length} sync{' '}
          {conflicts.length === 1 ? 'conflict' : 'conflicts'}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => dismiss(conflicts.map((conflict) => conflict.id))}
        >
          Clear all
        </button>
      </header>
      {open && (
        <ul>
          {conflicts.map((conflict) => {
            const text = conflictText(conflict, state, dateLabel);
            return (
              <li key={conflict.id}>
                <span>
                  <span className="row-title">{text.title}</span>
                  <span className="hint">{text.detail}</span>
                </span>
                <span className="conflict-actions">
                  {text.canSwitch && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!editable}
                      onClick={() => switchTo(conflict)}
                    >
                      {text.switchLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => dismiss([conflict.id])}
                  >
                    OK
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
