import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import type { StoreSnapshot } from '@onpurpose/core/storage/store';
import type {
  DataSummary,
  SyncChoice,
  SyncStatus,
} from '@onpurpose/core/sync/engine';
import type { SyncController } from './controller.ts';
import { syncAvailable } from './config.ts';

/**
 * Settings → Sync (docs/SYNC.md): sign in, unlock or set up sync, see
 * status and choose what to keep on first sync. Everything works without it.
 */
export function SyncSettings({
  sync,
  snapshot,
  onReviewConflicts,
}: {
  sync: SyncController;
  snapshot: StoreSnapshot;
  onReviewConflicts: () => void;
}) {
  const state = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const { view, busy, notice } = state;
  return (
    <div className="sync-settings">
      {view.stage === 'unavailable' && (
        <p className="muted">Sync is not available in this build yet.</p>
      )}
      {view.stage === 'loading' && (
        <p className="muted">Checking your account…</p>
      )}
      {view.stage === 'offline' && (
        <Group title="Sync">
          <p className="hint">
            The sync server could not be reached. Your habits are saved in this
            browser as usual.
          </p>
          <div className="sync-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => void sync.init()}
            >
              Try again
            </button>
          </div>
        </Group>
      )}
      {view.stage === 'signedOut' && <SignIn sync={sync} busy={busy} />}
      {view.stage === 'needsKey' && (
        <Group title="Set up sync">
          <p className="hint">
            Your habits are encrypted on this device before they are sent, so
            the server cannot read them. Your other devices unlock them with
            your passkey or by approving each other. An emergency recovery code
            is the way back if you ever lose every device; keep it somewhere
            safe.
          </p>
          <div className="sync-actions">
            <button
              type="button"
              className="done-button"
              disabled={busy}
              onClick={() => void sync.createKey()}
            >
              Set up sync
            </button>
          </div>
        </Group>
      )}
      {view.stage === 'waiting' && (
        <Waiting code={view.code} busy={busy} sync={sync} />
      )}
      {view.stage === 'showCode' && (
        <RecoveryCode
          code={view.code}
          replacing={view.replacing}
          busy={busy}
          onDone={() => void sync.confirmCode()}
        />
      )}
      {view.stage === 'needsCode' && <EnterCode sync={sync} busy={busy} />}
      {view.stage === 'ready' && (
        <Ready
          sync={sync}
          busy={busy}
          email={view.user.email}
          status={view.status}
          conflicts={snapshot.conflicts.length}
          onReviewConflicts={onReviewConflicts}
        />
      )}
      {notice && (
        <p className={notice.error ? 'hint error' : 'hint'} role="status">
          {notice.text}
        </p>
      )}
      {syncAvailable && (
        <p className="hint">
          Sync is optional. Without an account, everything stays in this
          browser. Sync keeps the same habits, History and notes on each device,
          while text size, grid sizes and similar settings stay with each
          device.
        </p>
      )}
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="setting-group">
      <legend>{title}</legend>
      <div className="setting-rows sync-group">{children}</div>
    </fieldset>
  );
}

function SignIn({ sync, busy }: { sync: SyncController; busy: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submit = (event: FormEvent, create: boolean) => {
    event.preventDefault();
    void (create ? sync.signUp(email, password) : sync.signIn(email, password));
  };
  return (
    <>
      <Group title="Sync between devices">
        <p className="hint">
          Sign in to keep your habits the same on your phone and in the browser.
          They are encrypted before they leave this device.
        </p>
        <div className="sync-actions">
          <button
            type="button"
            className="done-button"
            disabled={busy}
            onClick={() => void sync.signInWithPasskey()}
          >
            Sign in with a passkey
          </button>
        </div>
      </Group>
      {import.meta.env.DEV && (
        <Group title="Development sign-in">
          <form
            className="sync-form"
            onSubmit={(event) => submit(event, false)}
          >
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                minLength={12}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className="sync-actions">
              <button
                type="submit"
                className="secondary-button"
                disabled={busy}
              >
                Sign in
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy || !email || password.length < 12}
                onClick={(event) => submit(event, true)}
              >
                Create account
              </button>
            </div>
          </form>
          <p className="hint">
            Email and password work only on the development server, and only for
            allowed addresses. Apple, Google and emailed codes come later.
          </p>
        </Group>
      )}
    </>
  );
}

function RecoveryCode({
  code,
  replacing,
  busy,
  onDone,
}: {
  code: string;
  replacing: boolean;
  busy: boolean;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const download = () => {
    const text = `OnPurpose emergency recovery code\n\n${code}\n\nKeep this somewhere safe. You only need it if you cannot sign in with your passkey or approve from another of your devices.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'OnPurpose emergency recovery code.txt';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Group
      title={
        replacing
          ? 'Your new emergency recovery code'
          : 'Your emergency recovery code'
      }
    >
      <p className="hint">
        {replacing
          ? 'The old code no longer works. Save this one instead.'
          : 'Save this in a password manager or on paper. You only need it if you lose every device and cannot use your passkey. Without it then, nobody can recover your synced habits, not even us.'}
      </p>
      <output className="recovery-code" aria-label="Emergency recovery code">
        {code}
      </output>
      <div className="sync-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            void navigator.clipboard
              ?.writeText(code)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="secondary-button" onClick={download}>
          Download
        </button>
      </div>
      <label className="setting-row">
        <span>I have saved my emergency recovery code</span>
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
        />
      </label>
      <div className="sync-actions">
        <button
          type="button"
          className="done-button"
          disabled={!saved || busy}
          onClick={onDone}
        >
          {replacing ? 'Done' : 'Turn on sync'}
        </button>
      </div>
    </Group>
  );
}

// This browser asked a device that already syncs to approve it.
function Waiting({
  code,
  busy,
  sync,
}: {
  code: string | null;
  busy: boolean;
  sync: SyncController;
}) {
  return (
    <Group title="Approve this browser">
      <p className="hint">
        Your habits are encrypted so only your devices can read them. Open
        OnPurpose on a device that already syncs; it will ask to approve this
        browser.
      </p>
      {code ? (
        <>
          <p className="hint">Approve there if it shows this code:</p>
          <output className="approval-code" aria-label="Code to compare">
            {code}
          </output>
        </>
      ) : (
        <p className="sync-status">
          {sync.isWaiting() ? 'Waiting for your other device…' : 'Not waiting.'}
        </p>
      )}
      <div className="sync-actions">
        {!sync.isWaiting() && (
          <button
            type="button"
            className="done-button"
            disabled={busy}
            onClick={() => sync.waitForApproval()}
          >
            Ask again
          </button>
        )}
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={sync.useRecoveryCode}
        >
          No other device? Use the emergency recovery code
        </button>
      </div>
    </Group>
  );
}

function EnterCode({ sync, busy }: { sync: SyncController; busy: boolean }) {
  const [code, setCode] = useState('');
  return (
    <Group title="Emergency recovery code">
      <p className="hint">
        Enter the emergency recovery code you saved when you set up sync.
        Letters and dashes can be typed in any case.
      </p>
      <form
        className="sync-form"
        onSubmit={(event) => {
          event.preventDefault();
          void sync.enterCode(code);
        }}
      >
        <label>
          Emergency recovery code
          <input
            className="recovery-input"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          />
        </label>
        <div className="sync-actions">
          <button
            type="submit"
            className="done-button"
            disabled={busy || !code}
          >
            Unlock
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => sync.waitForApproval()}
          >
            Approve from another device instead
          </button>
        </div>
      </form>
    </Group>
  );
}

function since(time: string | null): string {
  if (!time) return '';
  const minutes = Math.round((Date.now() - Date.parse(time)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(time).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function statusText(status: SyncStatus): {
  text: string;
  error: boolean;
} {
  switch (status.state) {
    case 'idle':
      return {
        text: status.lastSynced
          ? `Up to date · synced ${since(status.lastSynced)}`
          : 'Up to date',
        error: false,
      };
    case 'syncing':
      return { text: 'Syncing…', error: false };
    case 'offline':
      return {
        text: 'Offline. Changes are saved here and will sync when you are back online.',
        error: false,
      };
    case 'choice':
      return { text: 'Choose what to keep below.', error: true };
    case 'signedOut':
      return {
        text: 'Your session ended. Sign out, then sign in again.',
        error: true,
      };
    case 'unpaid':
      return {
        text: 'Sync needs a subscription for this account.',
        error: true,
      };
    case 'error':
      return { text: status.message, error: true };
  }
}

function Ready({
  sync,
  busy,
  email,
  status,
  conflicts,
  onReviewConflicts,
}: {
  sync: SyncController;
  busy: boolean;
  email: string;
  status: SyncStatus;
  conflicts: number;
  onReviewConflicts: () => void;
}) {
  const [, refresh] = useState(0);
  // Keep "synced 3 min ago" current while the page is open.
  useEffect(() => {
    const timer = setInterval(() => refresh((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const line = statusText(status);
  return (
    <>
      <Group title="Sync">
        <div className="setting-row">
          <span>
            <span className={line.error ? 'sync-status error' : 'sync-status'}>
              {line.text}
            </span>
            <span className="hint">Signed in as {email}</span>
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={
              busy || status.state === 'syncing' || status.state === 'choice'
            }
            onClick={() => void sync.syncNow()}
          >
            Sync now
          </button>
        </div>
        {conflicts > 0 && (
          <div className="setting-row">
            <span>
              {conflicts} {conflicts === 1 ? 'conflict' : 'conflicts'} to review
              <span className="hint">
                Both devices changed the same thing. The later edit was kept.
              </span>
            </span>
            <button
              type="button"
              className="secondary-button"
              onClick={onReviewConflicts}
            >
              Review
            </button>
          </div>
        )}
      </Group>
      {status.state === 'choice' && (
        <Choice
          choice={status.choice}
          reason={status.reason}
          busy={busy}
          onChoose={(option, matches) => void sync.choose(option, matches)}
        />
      )}
      <Account sync={sync} busy={busy} />
    </>
  );
}

function summary(data: DataSummary) {
  const parts = [
    `${data.habits} ${data.habits === 1 ? 'habit' : 'habits'}`,
    `${data.days} ${data.days === 1 ? 'day' : 'days'} recorded`,
  ];
  if (data.lastEdit)
    parts.push(
      `last edit ${new Date(data.lastEdit).toLocaleDateString(undefined, { dateStyle: 'medium' })}`,
    );
  return parts.join(' · ');
}

function Choice({
  choice,
  reason,
  busy,
  onChoose,
}: {
  choice: SyncChoice;
  reason: 'first' | 'reset';
  busy: boolean;
  onChoose: (
    option: 'device' | 'cloud' | 'combine',
    matches?: Record<string, string | null>,
  ) => void;
}) {
  const [matches, setMatches] = useState(choice.matches);
  const [combining, setCombining] = useState(false);
  const localHabits = Object.keys(choice.matches);
  return (
    <Group title="This browser and your account both have habits">
      <p className="hint">
        {reason === 'first'
          ? 'Choose what to keep. Whatever is replaced is kept as a copy in this browser.'
          : 'Another device replaced the cloud copy while this browser had unsent changes. Choose what to keep.'}
      </p>
      <dl className="sync-summary">
        <dt>This browser</dt>
        <dd>{summary(choice.localSummary)}</dd>
        <dt>Your account</dt>
        <dd>{summary(choice.cloudSummary)}</dd>
      </dl>
      {!combining ? (
        <div className="sync-options">
          <button
            type="button"
            className="done-button"
            disabled={busy}
            onClick={() => setCombining(true)}
          >
            Combine both…
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => onChoose('cloud')}
          >
            Use the account’s
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  'Replace the cloud copy with this browser’s habits?\n\nYour other devices will follow this browser. They keep their own copies of what is replaced.',
                )
              )
                onChoose('device');
            }}
          >
            Use this browser’s
          </button>
        </div>
      ) : (
        <>
          <p className="hint">
            Habits that are the same are merged: days recorded on only one side
            are added, and where both have a value the account’s is kept. Others
            are added as separate habits. You can undo this in History.
          </p>
          <ul className="sync-matches">
            {localHabits.map((id) => (
              <li key={id}>
                <span>{localName(choice, id)}</span>
                <select
                  aria-label={`Match for ${localName(choice, id)}`}
                  value={matches[id] ?? ''}
                  onChange={(event) =>
                    setMatches({ ...matches, [id]: event.target.value || null })
                  }
                >
                  <option value="">Keep separate</option>
                  {choice.cloudHabits.map((habit) => (
                    <option key={habit.id} value={habit.id}>
                      Same as {habit.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <div className="sync-options">
            <button
              type="button"
              className="done-button"
              disabled={busy}
              onClick={() => onChoose('combine', matches)}
            >
              Combine
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setCombining(false)}
            >
              Back
            </button>
          </div>
        </>
      )}
    </Group>
  );
}
function localName(choice: SyncChoice, id: string) {
  return choice.localHabits.find((habit) => habit.id === id)?.name ?? id;
}

function Account({ sync, busy }: { sync: SyncController; busy: boolean }) {
  return (
    <Group title="Account">
      <div className="setting-row">
        <span>
          Passkey
          <span className="hint">
            Sign in without a password; where your passkey provider allows, it
            also unlocks sync on new devices
          </span>
        </span>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void sync.addPasskey()}
        >
          Add a passkey
        </button>
      </div>
      <div className="setting-row">
        <span>
          Emergency recovery code
          <span className="hint">
            Lost it? Make a new one; the old one stops working
          </span>
        </span>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void sync.replaceCode()}
        >
          New code…
        </button>
      </div>
      <div className="setting-row">
        <span>
          Sign out
          <span className="hint">
            Habits stay in this browser; sync stops here
          </span>
        </span>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void sync.signOut()}
        >
          Sign out
        </button>
      </div>
      <div className="setting-row">
        <span>
          Delete account
          <span className="hint">
            Deletes the account and its cloud copy. Each device keeps its own
            habits.
          </span>
        </span>
        <button
          type="button"
          className="text-button danger"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                'Delete your sync account?\n\nThis permanently deletes the account and the encrypted cloud copy of your habits. Habits on this browser and your other devices stay where they are.',
              )
            )
              void sync.deleteAccount();
          }}
        >
          Delete account…
        </button>
      </div>
    </Group>
  );
}
