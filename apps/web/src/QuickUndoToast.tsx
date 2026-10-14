import { useSyncExternalStore } from 'react';
import type { QuickUndo } from '@onpurpose/core/quickUndo';

// The shared four-second receipt for the latest entry or archive. Undo
// appends an ordinary correcting edit; it never rewinds unrelated changes.
export function QuickUndoToast({
  quickUndo,
  editable,
}: {
  quickUndo: QuickUndo;
  editable: boolean;
}) {
  const receipt = useSyncExternalStore(
    quickUndo.subscribe,
    quickUndo.getSnapshot,
  );
  if (!receipt) return null;
  return (
    <div className="toast" role="status">
      <span>
        {receipt.action === 'archive'
          ? `${receipt.label} archived`
          : `${receipt.label} saved`}
      </span>
      <button
        disabled={!editable}
        aria-label={
          receipt.action === 'archive'
            ? `Undo archiving ${receipt.label}`
            : `Undo entry for ${receipt.label}`
        }
        onClick={() => quickUndo.undo()}
      >
        Undo
      </button>
    </div>
  );
}
