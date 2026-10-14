import { Icon, type WebIconName } from './ui/Icon.tsx';

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
  sampleData,
  onSampleData,
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
  sampleData: boolean;
  onSampleData?: (value: boolean) => void;
  onToggleCollapsed: () => void;
  onAdd: () => void;
  onHistory: () => void;
  onArchived: () => void;
  onSettings: () => void;
  onBackups: () => void;
  onShortcuts: () => void;
}) {
  return (
    <aside
      className={collapsed ? 'sidebar collapsed' : 'sidebar'}
      aria-label="OnPurpose"
    >
      <div className="sidebar-brand">
        <svg
          className="brand-mark"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect width="24" height="24" rx="7" fill="var(--accent)" />
          <path
            d="m7 12.5 3.2 3.2L17 9"
            fill="none"
            stroke="var(--background)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="sidebar-label wordmark">OnPurpose</span>
      </div>
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
        <button
          type="button"
          className={
            saveError ? 'sidebar-item storage error' : 'sidebar-item storage'
          }
          title={
            sampleData
              ? 'Sample data lives only in this tab'
              : 'Your habits are saved in this browser. Back them up from Settings.'
          }
          onClick={onBackups}
        >
          <Icon name="device" size={18} />
          <span className="sidebar-label">
            {sampleData
              ? 'Sample data, not saved'
              : saveError
                ? 'Not saved yet'
                : 'Saved in this browser'}
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
