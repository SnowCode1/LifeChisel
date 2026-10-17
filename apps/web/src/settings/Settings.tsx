import { useId, useRef, useState, type ReactNode } from 'react';
import {
  displayDefaults,
  effectiveColumnSpacing,
  weekStartOptions,
  type CellLook,
} from '@onpurpose/core/displayPreferences';
import {
  backgroundName,
  backgroundPresets,
  fitBackground,
  themeModeOptions,
  type Theme,
  type ThemeScheme,
} from '@onpurpose/core/theme';
import { normalizeHex } from '@onpurpose/core/colors';
import {
  gridSizeRanges,
  gridSizing,
  snapGridSize,
  type GridSize,
  type GridSizeKind,
} from '@onpurpose/core/gridSizing';
import {
  applyGridSizes,
  automaticSizes,
  webGridSizes,
  type WebGridSizes,
} from '../grid/gridSizes.ts';
import type { Habit } from '@onpurpose/core/habits';
import {
  archivedHabitDetails,
  archivedRecordRange,
} from '@onpurpose/core/archivedHabitDetails';
import type { EntryValues } from '@onpurpose/core/entries';
import type { StoredState } from '@onpurpose/core/storage/model';
import type { ChangeStore, StoreSnapshot } from '@onpurpose/core/storage/store';
import { createGridPalette } from '@onpurpose/core/gridAppearance';
import { ordinal } from '@onpurpose/core/goalTiming';
import { Modal } from '../ui/Modal.tsx';
import { Icon } from '../ui/Icon.tsx';
import { HabitRow } from '../grid/HabitRow.tsx';
import { gridDays } from '../grid/HabitGrid.tsx';
import type { CellLookStyle, GridHandlers } from '../grid/types.ts';
import type { HabitActions, WebPreference } from '../actions.ts';
import { exportBackup, readBackup } from '../storage/backups.ts';

export type SettingsPage =
  'appearance' | 'tracking' | 'backups' | 'archived' | 'about';
type Page = SettingsPage;
const PAGES: { id: Page; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'tracking', label: 'Daily tracking' },
  { id: 'backups', label: 'Backups' },
  { id: 'archived', label: 'Archived habits' },
  { id: 'about', label: 'About' },
];
type Shape = 'squares' | 'circles' | 'marks';

// Settings apply immediately (the grid and the preview update together) and
// stay outside History and Undo, as on the phone.
export function Settings({
  initialPage = 'appearance',
  sampleData = false,
  store,
  snapshot,
  theme,
  look,
  cellLook,
  today,
  editable,
  actions,
  onClose,
}: {
  initialPage?: Page;
  sampleData?: boolean;
  store: ChangeStore;
  snapshot: StoreSnapshot;
  theme: Theme;
  look: CellLookStyle;
  cellLook: CellLook;
  today: string;
  editable: boolean;
  actions: HabitActions;
  onClose: () => void;
}) {
  const titleId = useId();
  const [page, setPage] = useState<Page>(initialPage);
  const state = snapshot.replay.state;
  const set = <K extends WebPreference>(kind: K, value: StoredState[K]) =>
    actions.setPreference(kind, value);
  return (
    <Modal
      titleId={titleId}
      title="Settings"
      className="settings"
      leading={
        <button
          type="button"
          className="icon-button"
          aria-label="Close settings"
          onClick={onClose}
        >
          <Icon name="close" size={18} />
        </button>
      }
      onClose={onClose}
    >
      <div className="settings-layout">
        <nav aria-label="Settings sections" className="settings-nav">
          {PAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-main">
          {page === 'appearance' && (
            <PinnedPreview
              theme={theme}
              look={look}
              today={today}
              weekStart={state.weekStart ?? displayDefaults.weekStart}
              weekDividers={state.weekDividers ?? displayDefaults.weekDividers}
            />
          )}
          <section
            className="settings-page"
            aria-label={PAGES.find((item) => item.id === page)?.label}
          >
            {page === 'appearance' && (
              <Appearance
                state={state}
                theme={theme}
                look={look}
                cellLook={cellLook}
                today={today}
                editable={editable}
                set={set}
              />
            )}
            {page === 'tracking' && (
              <>
                <Group title="Grid">
                  <Toggle
                    label="Hide completed today"
                    detail="Rows that met today’s goal leave the grid until tomorrow. Other dates always show every habit."
                    value={state.hideCompleted ?? displayDefaults.hideCompleted}
                    disabled={!editable}
                    onChange={(value) => set('hideCompleted', value)}
                  />
                  <label className="setting-row">
                    <span>Week starts on</span>
                    <select
                      value={state.weekStart ?? displayDefaults.weekStart}
                      disabled={!editable}
                      onChange={(event) =>
                        set(
                          'weekStart',
                          event.target.value as 'monday' | 'sunday',
                        )
                      }
                    >
                      {weekStartOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </Group>
                <p className="hint">
                  Completion uses each habit’s goal for today; habits set to
                  Track only stay visible.
                </p>
              </>
            )}
            {page === 'backups' && (
              <Backups
                store={store}
                snapshot={snapshot}
                editable={editable && !sampleData}
                sampleData={sampleData}
              />
            )}
            {page === 'archived' && (
              <Archived
                habits={state.habits}
                values={state.values}
                theme={theme}
                editable={editable}
                actions={actions}
                store={store}
              />
            )}
            {page === 'about' && <About />}
          </section>
        </div>
      </div>
    </Modal>
  );
}

function Appearance({
  state,
  theme,
  look,
  cellLook,
  today,
  editable,
  set,
}: {
  state: StoredState;
  theme: Theme;
  look: CellLookStyle;
  cellLook: CellLook;
  today: string;
  editable: boolean;
  set: <K extends WebPreference>(kind: K, value: StoredState[K]) => boolean;
}) {
  const mode = state.themeMode ?? displayDefaults.themeMode;
  const sizes = webGridSizes(gridSizing(state, effectiveColumnSpacing(state)));
  const style = state.checkboxStyle ?? displayDefaults.checkboxStyle;
  const shape: Shape =
    style === 'marks'
      ? 'marks'
      : cellLook.roundCheckboxes
        ? 'circles'
        : 'squares';
  const changeShape = (next: Shape) => {
    if (next === 'marks') return set('checkboxStyle', 'marks');
    if (style !== 'boxes') set('checkboxStyle', 'boxes');
    if ((next === 'circles') !== cellLook.roundCheckboxes)
      set('roundCheckboxes', next === 'circles');
  };
  return (
    <>
      <Group title="Theme">
        <div className="setting-row">
          <span>Theme</span>
          <Segmented
            label="Theme"
            value={mode}
            options={themeModeOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            disabled={!editable}
            onChange={(value) => set('themeMode', value as typeof mode)}
          />
        </div>
        {(['dark', 'light'] as const).map((scheme) => (
          <Backgrounds
            key={scheme}
            scheme={scheme}
            saved={
              scheme === 'dark'
                ? (state.darkBackground ?? displayDefaults.darkBackground)
                : (state.lightBackground ?? displayDefaults.lightBackground)
            }
            disabled={!editable}
            onChange={(value) =>
              set(
                scheme === 'dark' ? 'darkBackground' : 'lightBackground',
                value,
              )
            }
          />
        ))}
      </Group>
      <Group title="Checkboxes">
        <div className="setting-row">
          <span>Style</span>
          <Segmented
            label="Checkbox style"
            value={shape}
            options={[
              { value: 'squares', label: 'Squares' },
              { value: 'circles', label: 'Circles' },
              { value: 'marks', label: 'Ticks & crosses' },
            ]}
            disabled={!editable}
            onChange={(value) => changeShape(value as Shape)}
          />
        </div>
        {style === 'boxes' && (
          <>
            <Toggle
              label="Streak numbers"
              value={cellLook.streakNumbers}
              disabled={!editable}
              onChange={(value) => set('streakNumbers', value)}
            />
            <Toggle
              label="Joined checkboxes"
              value={cellLook.joinedCheckboxes}
              disabled={!editable}
              onChange={(value) => set('joinedCheckboxes', value)}
            />
            {cellLook.joinedCheckboxes && (
              <>
                <Toggle
                  label="Streak ends only"
                  detail="Boxes only on a streak’s first and last days, with one bar between."
                  value={cellLook.joinedEndsOnly}
                  disabled={!editable}
                  onChange={(value) => set('joinedEndsOnly', value)}
                />
                <Thickness
                  value={cellLook.connectorThickness}
                  disabled={!editable}
                  onChange={(value) => set('connectorThickness', value)}
                />
              </>
            )}
          </>
        )}
      </Group>
      <Group title="Days">
        <Toggle
          label="Missed day crosses"
          value={cellLook.missedDays}
          disabled={!editable}
          onChange={(value) => set('missedDays', value)}
        />
        <Toggle
          label="Week dividers"
          value={state.weekDividers ?? displayDefaults.weekDividers}
          disabled={!editable}
          onChange={(value) => set('weekDividers', value)}
        />
        <Toggle
          label="Tap animations"
          detail="A short pulse when you tick a box, joins that grow between neighbours, and a background fade. Your system’s Reduce motion setting turns off the movement but keeps the fade."
          value={state.tapAnimations ?? displayDefaults.tapAnimations}
          disabled={!editable}
          onChange={(value) => set('tapAnimations', value)}
        />
      </Group>
      <Group title="Grid size">
        {GRID_SIZES.map(({ kind, label }) => (
          <GridSizeRow
            key={kind}
            kind={kind}
            label={label}
            sizes={sizes}
            disabled={!editable}
            onChange={(value) => set(kind, value)}
          />
        ))}
      </Group>
      <p className="hint">
        System follows your device’s light or dark mode. Text, controls and
        habit colours adjust to each background; saved habit colours never
        change. Streak numbers show each checked day’s place in its streak;
        missed day crosses mark past scheduled days that missed their goal. Grid
        sizes are shared with the phone app when you move a backup between them.
      </p>
    </>
  );
}

// Three fictional habits drawn by the grid's own row component.
const PREVIEW: Habit[] = [
  { id: 'preview-walk', name: 'Go for a walk', color: '#82E6BC' },
  { id: 'preview-stretch', name: 'Stretch', color: '#FFB38A' },
  {
    id: 'preview-read',
    name: 'Read',
    color: '#BDA5FF',
    type: 'number',
    unit: 'minutes',
  },
];
const PATTERNS = ['1101110111', '0111011100', '1011101110'];
// Like the grid, a preview too wide for its box keeps Today in view. It
// mounts before the dialog is shown, so it scrolls on the next frame.
const endOnToday = (element: HTMLElement | null) => {
  if (element)
    requestAnimationFrame(() => {
      element.scrollLeft = element.scrollWidth;
    });
};
const noop = () => {};
const NO_HANDLERS: GridHandlers = {
  toggle: () => false,
  saveValue: () => false,
  openEntry: noop,
  closeEntry: noop,
  fillChecks: () => null,
  openFill: noop,
  openMenu: noop,
  openHabit: noop,
  reorder: noop,
  add: noop,
};
// Whether the pinned Appearance preview is collapsed, remembered while the
// app stays open (as on the phone).
let previewCollapsed = false;
// The preview stays above the Appearance controls while they scroll, so
// every change shows at once; it collapses to its heading.
function PinnedPreview(props: Parameters<typeof Preview>[0]) {
  const [collapsed, setCollapsed] = useState(previewCollapsed);
  const previewId = useId();
  return (
    <div className="settings-pinned">
      <button
        type="button"
        className="preview-toggle"
        aria-expanded={!collapsed}
        aria-controls={previewId}
        onClick={() => {
          previewCollapsed = !collapsed;
          setCollapsed(!collapsed);
        }}
      >
        <span className="field-label">Preview</span>
        <Icon name="chevron" size={16} />
      </button>
      <div id={previewId} hidden={collapsed}>
        {!collapsed && <Preview {...props} />}
      </div>
    </div>
  );
}
function Preview({
  theme,
  look,
  today,
  weekStart,
  weekDividers,
}: {
  theme: Theme;
  look: CellLookStyle;
  today: string;
  weekStart: 'monday' | 'sunday';
  weekDividers: boolean;
}) {
  const days = gridDays(today, weekStart, weekDividers, 10);
  const values: EntryValues = {};
  PREVIEW.forEach((habit, index) =>
    days.forEach((day, col) => {
      if (day.ago === 0 || PATTERNS[index][col] !== '1') return;
      values[`${habit.id}:${day.key}`] =
        habit.type === 'number' ? 10 + ((col * 7) % 30) : 1;
    }),
  );
  return (
    <figure
      ref={endOnToday}
      className="settings-preview"
      aria-label="Preview of the grid"
    >
      <table className="grid preview-grid" aria-hidden="true">
        <thead>
          <tr>
            <th className="corner" />
            {days.map((day) => (
              <th
                key={day.key}
                className={
                  day.ago === 0
                    ? 'day today'
                    : day.shaded
                      ? 'day shaded'
                      : 'day'
                }
              >
                <span className="weekday">
                  {day.ago === 0 ? 'Today' : day.weekday}
                </span>
                <span className="number">{day.number}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PREVIEW.map((habit, row) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              row={row}
              days={days}
              values={values}
              today={today}
              todayOrdinal={ordinal(today)}
              palette={createGridPalette(habit.color, theme)}
              look={look}
              editable={false}
              signature=""
              focusAgo={-1}
              on={NO_HANDLERS}
              dragging={false}
              onHandleDown={noop}
            />
          ))}
        </tbody>
      </table>
    </figure>
  );
}

const GRID_SIZES: { kind: GridSizeKind; label: string }[] = [
  { kind: 'gridNameWidth', label: 'Name column' },
  { kind: 'gridColumnWidth', label: 'Day columns' },
  { kind: 'gridRowHeight', label: 'Rows' },
];
// A size slider with Automatic. The grid and preview follow the slider while
// it moves; the size is saved when it is released.
function GridSizeRow({
  kind,
  label,
  sizes,
  disabled,
  onChange,
}: {
  kind: GridSizeKind;
  label: string;
  sizes: WebGridSizes;
  disabled: boolean;
  onChange: (value: GridSize) => void;
}) {
  const { min, max, step } = gridSizeRanges[kind];
  const saved = sizes[kind];
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? saved ?? snapGridSize(kind, automaticSizes[kind]);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft !== saved) onChange(draft);
    else applyGridSizes(sizes);
  };
  return (
    <div className="setting-row grid-size">
      <span>
        {label}
        <span className="hint">
          {saved === null ? 'Automatic' : `${saved} px`}
        </span>
      </span>
      <span className="slider-value">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={shown}
          disabled={disabled}
          onChange={(event) => {
            const value = Number(event.target.value);
            setDraft(value);
            applyGridSizes({ ...sizes, [kind]: value });
          }}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
        <label className="auto-check">
          <input
            type="checkbox"
            checked={saved === null}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? 'auto'
                  : snapGridSize(kind, automaticSizes[kind]),
              )
            }
          />
          Auto
        </label>
      </span>
    </div>
  );
}

function Backgrounds({
  scheme,
  saved,
  disabled,
  onChange,
}: {
  scheme: ThemeScheme;
  saved: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [custom, setCustom] = useState(saved);
  const current = fitBackground(scheme, saved);
  return (
    <div className="setting-row backgrounds">
      <span>
        {scheme === 'dark' ? 'Dark background' : 'Light background'}
        <span className="hint">{backgroundName(scheme, saved)}</span>
      </span>
      <div
        className="background-choices"
        role="radiogroup"
        aria-label={`${scheme === 'dark' ? 'Dark' : 'Light'} background`}
      >
        {backgroundPresets[scheme].map((preset) => (
          <button
            key={preset.value}
            type="button"
            role="radio"
            aria-checked={current === preset.value}
            aria-label={preset.name}
            title={preset.name}
            className="swatch"
            disabled={disabled}
            onClick={() => {
              setCustom(preset.value);
              onChange(preset.value);
            }}
            style={{ backgroundColor: preset.value }}
          />
        ))}
        <input
          className="hex-input"
          aria-label={`Custom ${scheme} background, hex`}
          value={custom}
          maxLength={7}
          disabled={disabled}
          onChange={(event) => {
            setCustom(event.target.value);
            const normalized = normalizeHex(event.target.value);
            // Backgrounds are fitted to a readable range when shown.
            if (normalized) onChange(normalized);
          }}
        />
      </div>
    </div>
  );
}

// Saved when the slider is released, so dragging does not log every step.
function Thickness({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft !== value) onChange(draft);
  };
  return (
    <label className="setting-row">
      <span>Connector thickness</span>
      <span className="slider-value">
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(Number(event.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
        <span className="value">{draft}%</span>
      </span>
    </label>
  );
}

function Backups({
  store,
  snapshot,
  editable,
  sampleData,
}: {
  store: ChangeStore;
  snapshot: StoreSnapshot;
  editable: boolean;
  sampleData: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const running = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  // One backup action at a time; errors are shown and nothing is reset.
  const run = async (task: () => Promise<string | null>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const done = await task();
      if (done) setMessage({ text: done, error: false });
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : 'Your saved data has been kept. Please try again.',
        error: true,
      });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const restore = (file: File) =>
    run(async () => {
      const archive = await readBackup(file);
      const confirmed = window.confirm(
        `Restore this backup?\n\nIt has ${archive.replay.state.habits.length} habits and ${archive.events.length - 1} changes. It will replace your current entries, colours and settings in this browser. A copy of the current data will be kept here.`,
      );
      if (!confirmed) return null;
      await store.exclusive(() => store.replace(archive.events));
      return 'Backup restored. The data it replaced is kept as a copy.';
    });
  const recover = () =>
    run(async () => {
      if (
        !window.confirm(
          'Return to the pre-restore copy?\n\nThis replaces the current data. A copy of the current data will also be kept.',
        )
      )
        return null;
      await store.exclusive(async () =>
        store.replace(await store.recoveryEvents()),
      );
      return 'Previous data restored.';
    });
  return (
    <>
      <Group title="Your data">
        <div className="setting-row">
          <span>
            Export backup
            <span className="hint">
              {snapshot.events.length.toLocaleString()} changes · saves a file
              you can keep or open on the phone
            </span>
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !editable}
            onClick={() =>
              run(async () => {
                await exportBackup(store);
                return 'Backup saved to your downloads.';
              })
            }
          >
            Export
          </button>
        </div>
        <div className="setting-row">
          <span>
            Restore backup
            <span className="hint">
              Replaces this browser’s data after you confirm
            </span>
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !editable}
            onClick={() => picker.current?.click()}
          >
            Choose file…
          </button>
          <input
            ref={picker}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void restore(file);
            }}
          />
        </div>
        {snapshot.hasRecovery && (
          <div className="setting-row">
            <span>
              Restore previous data
              <span className="hint">
                The copy kept from before the last restore
              </span>
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={busy || !editable}
              onClick={recover}
            >
              Restore copy…
            </button>
          </div>
        )}
      </Group>
      {sampleData && (
        <p className="hint">
          Backups are off while sample data is shown. Turn off Sample data in
          the sidebar to back up or restore your own habits.
        </p>
      )}
      {message && (
        <p className={message.error ? 'hint error' : 'hint'} role="status">
          {message.text}
        </p>
      )}
      <p className="hint">
        Backups include your records and change history, in the same format as
        the phone app. Data in this browser stays on this device; export a copy
        now and then.
      </p>
    </>
  );
}

function Archived({
  habits,
  values,
  theme,
  editable,
  actions,
  store,
}: {
  habits: Habit[];
  values: EntryValues;
  theme: Theme;
  editable: boolean;
  actions: HabitActions;
  store: ChangeStore;
}) {
  const rows = archivedHabitDetails(habits, values);
  if (!rows.length)
    return (
      <p className="muted">
        No archived habits. Archive a habit from its ⋯ menu to hide it from the
        grid.
      </p>
    );
  return (
    <ul className="archived-list">
      {rows.map(({ habit, count, firstDate, lastDate }) => (
        <li key={habit.id}>
          <span>
            <span
              className="row-title"
              style={{ color: theme.colour(habit.color) }}
            >
              {habit.name}
            </span>
            <span className="hint">
              {count
                ? `${count} recorded ${count === 1 ? 'day' : 'days'} · ${archivedRecordRange(firstDate!, lastDate!)}`
                : 'No records'}
            </span>
          </span>
          <span className="archived-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={!editable}
              onClick={() => actions.saveHabit({ ...habit, archived: false })}
            >
              Restore
            </button>
            <button
              type="button"
              className="text-button danger"
              disabled={!editable}
              aria-label={`Delete ${habit.name}`}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete “${habit.name}”?\n\nThis will remove the habit, its notes and ${count} recorded ${count === 1 ? 'day' : 'days'}. You can undo this in History. Earlier changes remain in backups.`,
                  )
                )
                  store.deleteArchivedHabit(habit.id);
              }}
            >
              Delete
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function About() {
  return (
    <div className="about">
      <p>
        <strong>OnPurpose</strong> keeps your habits in this browser’s private
        storage. Nothing is sent to a server, and there is no account.
      </p>
      <p className="hint">
        The web app shares its rules and backup format with the phone app. It is
        free software under the GNU GPL version 3 or later.
      </p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="setting-group">
      <legend>{title}</legend>
      <div className="setting-rows">{children}</div>
    </fieldset>
  );
}

function Toggle({
  label,
  detail,
  value,
  disabled,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <span>
        {label}
        {detail && <span className="hint">{detail}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function Segmented({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
