import { useSyncExternalStore } from 'react';
import { Icon, type WebIconName } from './ui/Icon.tsx';
import { LANDING_URL } from './config.ts';
import type { SamplePresetInfo } from '@onpurpose/core/dev/samplePresets';
import type { SyncController, SyncSnapshot } from './sync/controller.ts';

const noSync: SyncSnapshot = {
  view: { stage: 'unavailable' },
  busy: false,
  notice: null,
};
const subscribeNothing = () => () => {};

// Where the data is kept, in a few words (docs/SYNC.md for sync states).
function useStorageLine(
  sync: SyncController | null,
  conflicts: number,
): { label: string; title: string; attention: boolean } | null {
  const snapshot = useSyncExternalStore(
    sync?.subscribe ?? subscribeNothing,
    sync?.getSnapshot ?? (() => noSync),
  );
  const view = snapshot.view;
  if (view.stage !== 'ready') return null;
  const status = view.status;
  const title =
    'Your habits are saved in this browser and synced. Open Sync settings.';
  if (conflicts)
    return {
      label: `Synced · ${conflicts} to review`,
      title,
      attention: true,
    };
  switch (status.state) {
    case 'idle':
      return { label: 'Saved and synced', title, attention: false };
    case 'syncing':
      return { label: 'Syncing…', title, attention: false };
    case 'offline':
      return { label: 'Saved · sync offline', title, attention: false };
    default:
      return { label: 'Sync needs attention', title, attention: true };
  }
}

/** Development only: which fictional history the sample store holds. */
export type SamplePresetChoice = {
  /** '' is the development set, otherwise a preset id. */
  value: string;
  options: SamplePresetInfo[];
  onChange: (value: string) => void;
};

/**
 * The quiet left sidebar on wide screens: the habit list stays the only
 * view, and the sidebar holds what surrounds it (new habit, History,
 * archive, Settings, where data is kept, shortcuts). It narrows to icons on
 * medium widths or when collapsed; phones keep the compact top bar instead.
 */
export function Sidebar({
  collapsed,
  habitCount,
  archivedCount,
  historyOpen,
  canAdd,
  saveError,
  sync,
  conflicts,
  sampleData,
  onSampleData,
  samplePreset,
  onToggleCollapsed,
  onAdd,
  onHistory,
  onArchived,
  onSettings,
  onBackups,
  onShortcuts,
}: {
  collapsed: boolean;
  habitCount: number;
  archivedCount: number;
  historyOpen: boolean;
  canAdd: boolean;
  saveError: boolean;
  sync: SyncController | null;
  conflicts: number;
  sampleData: boolean;
  onSampleData?: (value: boolean) => void;
  samplePreset?: SamplePresetChoice;
  onToggleCollapsed: () => void;
  onAdd: () => void;
  onHistory: () => void;
  onArchived: () => void;
  onSettings: () => void;
  onBackups: () => void;
  onShortcuts: () => void;
}) {
  const synced = useStorageLine(sync, conflicts);
  return (
    <aside
      className={collapsed ? 'sidebar collapsed' : 'sidebar'}
      aria-label="OnPurpose"
    >
      <a
        className="sidebar-brand"
        href={LANDING_URL}
        title="OnPurpose home page"
      >
        <img
          className="brand-mark"
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          width="24"
          height="24"
          alt=""
        />
        <span className="sidebar-label wordmark">OnPurpose</span>
      </a>
      <button
        type="button"
        className="sidebar-new"
        disabled={!canAdd}
        title="New habit"
        onClick={onAdd}
      >
        <Icon name="plus" size={18} />
        <span className="sidebar-label">New habit</span>
      </button>
      <nav className="sidebar-nav" aria-label="Main">
        <Item icon="grid" label="Habits" current count={habitCount} />
        <Item
          icon="history"
          label="History"
          pressed={historyOpen}
          onClick={onHistory}
        />
        <Item
          icon="archive"
          label="Archived"
          count={archivedCount || undefined}
          onClick={onArchived}
        />
        <Item icon="settings" label="Settings" onClick={onSettings} />
      </nav>
      <div className="sidebar-foot">
        {onSampleData && (
          <label
            className="sidebar-item sample-switch"
            title="Development only: fictional history kept in memory"
          >
            <Icon name="flask" size={18} />
            <span className="sidebar-label">Sample data</span>
            <input
              type="checkbox"
              role="switch"
              checked={sampleData}
              onChange={(event) => onSampleData(event.target.checked)}
            />
          </label>
        )}
        {sampleData && samplePreset && (
          <select
            className="sidebar-label sample-preset"
            aria-label="Sample history"
            title={
              samplePreset.options.find(
                (option) => option.id === samplePreset.value,
              )?.summary ?? 'Every habit type, long notes and goals for testing'
            }
            value={samplePreset.value}
            onChange={(event) => samplePreset.onChange(event.target.value)}
          >
            <option value="">Development set</option>
            {samplePreset.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className={
            saveError || (synced?.attention && !sampleData)
              ? 'sidebar-item storage error'
              : 'sidebar-item storage'
          }
          title={
            sampleData
              ? 'Sample data lives only in this tab'
              : (synced?.title ??
                'Your habits are saved in this browser. Back them up or sync them from Settings.')
          }
          onClick={onBackups}
        >
          <Icon name={synced && !sampleData ? 'cloud' : 'device'} size={18} />
          <span className="sidebar-label">
            {sampleData
              ? 'Sample data, not saved'
              : saveError
                ? 'Not saved yet'
                : (synced?.label ?? 'Saved in this browser')}
          </span>
        </button>
        <Item
          icon="keyboard"
          label="Keyboard shortcuts"
          hint="?"
          onClick={onShortcuts}
        />
        <button
          type="button"
          className="sidebar-item collapse-toggle"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleCollapsed}
        >
          <Icon name="sidebar" size={18} />
          <span className="sidebar-label">Collapse</span>
        </button>
      </div>
    </aside>
  );
}

function Item({
  icon,
  label,
  current,
  pressed,
  count,
  hint,
  onClick,
}: {
  icon: WebIconName;
  label: string;
  current?: boolean;
  pressed?: boolean;
  count?: number;
  hint?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <Icon name={icon} size={18} />
      <span className="sidebar-label">{label}</span>
      {count !== undefined && (
        <span className="sidebar-count sidebar-label">{count}</span>
      )}
      {hint && (
        <kbd className="sidebar-label" aria-hidden="true">
          {hint}
        </kbd>
      )}
    </>
  );
  // The habit grid is the only page; it is marked, not linked.
  if (current)
    return (
      <span className="sidebar-item current" aria-current="page" title={label}>
        {content}
      </span>
    );
  return (
    <button
      type="button"
      className="sidebar-item"
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
