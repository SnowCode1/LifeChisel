import { useId, useSyncExternalStore } from 'react';
import { Modal } from '../ui/Modal.tsx';
import { Icon } from '../ui/Icon.tsx';
import type { SyncController } from './controller.ts';

/**
 * Another device asks to sync (docs/SYNC.md, Unlocking a new device). It
 * shows wherever the person is: the code must match the one on the new
 * device before Approve sends it the account key. Closing it declines.
 */
export function ApprovalPrompt({ sync }: { sync: SyncController }) {
  const titleId = useId();
  const { approval, busy, notice } = useSyncExternalStore(
    sync.subscribe,
    sync.getSnapshot,
  );
  if (!approval) return null;
  return (
    <Modal
      titleId={titleId}
      title="Sync a new device?"
      className="approval"
      leading={
        <button
          type="button"
          className="icon-button"
          aria-label="Decline"
          onClick={() => void sync.decline()}
        >
          <Icon name="close" size={18} />
        </button>
      }
      onClose={() => void sync.decline()}
    >
      <div className="approval-body">
        <p>
          <strong>{approval.label}</strong> wants to sync with your account.
        </p>
        <p className="hint">
          Check that this code is on that device’s screen. Approve only if you
          are setting it up yourself right now.
        </p>
        <output className="approval-code" aria-label="Code to compare">
          {approval.code}
        </output>
        <div className="sync-actions">
          <button
            type="button"
            className="done-button"
            data-autofocus
            disabled={busy}
            onClick={() => void sync.approve()}
          >
            The codes match: approve
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void sync.decline()}
          >
            Decline
          </button>
        </div>
        {notice?.error && (
          <p className="hint error" role="status">
            {notice.text}
          </p>
        )}
      </div>
    </Modal>
  );
}
