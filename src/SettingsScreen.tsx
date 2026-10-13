import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text, useAppWindowDimensions } from './Typography';
import { TextSizeSetting } from './TextSizeSetting';
import { Icon, type IconName } from './Icon';
import { InfoNote } from './InfoNote';
import Slider from '@react-native-community/slider';
import { useState } from 'react';
import {
  type CellLook,
  type CellLookKind,
  type CheckboxStyle,
  weekStartOptions,
  type WeekStart,
} from '@onpurpose/core/displayPreferences';
import type {
  GridSize,
  GridSizeKind,
  GridSizing,
} from '@onpurpose/core/gridSizing';
import {
  GridLivePreview,
  GridSizeSettings,
  type PreviewAppearance,
} from './GridSizeSettings';
import type { StoreSnapshot } from '@onpurpose/core/storage/store';
import { useSheetScroll } from './SheetModal';
import { BackgroundSettings, type ThemePreference } from './BackgroundSettings';
import {
  backgroundName,
  fitBackground,
  themeModeOptions,
  type ThemeMode,
} from '@onpurpose/core/theme';
import { themedStyles, useTheme } from './ThemeContext';

// Checkbox style and round checkboxes, chosen together as one shape.
const checkboxShapeOptions = [
  { value: 'squares', label: 'Squares' },
  { value: 'circles', label: 'Circles' },
  { value: 'marks', label: 'Ticks & crosses' },
] as const;
type CheckboxShape = (typeof checkboxShapeOptions)[number]['value'];

// Whether the pinned Appearance preview is collapsed, remembered for this app
// session (it starts open).
let previewCollapsed = false;

export const settingsTitles = {
  index: 'Settings',
  appearance: 'Appearance',
  darkBackground: 'Dark background',
  lightBackground: 'Light background',
  tracking: 'Daily tracking',
  backup: 'Backups',
  development: 'Development',
};
export type SettingsPage = keyof typeof settingsTitles;
// Pages below the index return to their parent page.
export const settingsParents: Partial<Record<SettingsPage, SettingsPage>> = {
  darkBackground: 'appearance',
  lightBackground: 'appearance',
};
type Props = {
  page: SettingsPage;
  onPage: (page: SettingsPage) => void;
  sampleData: boolean;
  developmentControls?: ReactNode;
  snapshot: StoreSnapshot;
  backupBusy: boolean;
  textScale: number;
  onTextScaleChange: (value: number) => void;
  gridWidth: number;
  sizing: GridSizing;
  onGridSizeChange: (kind: GridSizeKind, value: GridSize) => void;
  weekStart: WeekStart;
  onWeekStartChange: (value: WeekStart) => void;
  weekDividers: boolean;
  onWeekDividersChange: (value: boolean) => void;
  tapAnimations: boolean;
  onTapAnimationsChange: (value: boolean) => void;
  checkboxStyle: CheckboxStyle;
  onCheckboxStyleChange: (value: CheckboxStyle) => void;
  cellLook: CellLook;
  onCellLookChange: <K extends CellLookKind>(
    kind: K,
    value: CellLook[K],
  ) => void;
  hideCompleted: boolean;
  onHideCompletedChange: (value: boolean) => void;
  hapticsEnabled: boolean;
  onHapticsChange: (value: boolean) => void;
  themeMode: ThemeMode;
  darkBackground: string;
  lightBackground: string;
  onThemeChange: (preference: ThemePreference) => void;
  onArchive: () => void;
  onRetry: () => void;
  onExport: () => void;
  onRestore: () => void;
  onRecover: () => void;
};
function Group({ title, children }: { title?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={{ gap: 8 }}>
      {title && <Text style={styles.groupTitle}>{title}</Text>}
      <View style={styles.group}>{children}</View>
    </View>
  );
}
function Row({
  label,
  detail,
  value,
  icon,
  swatch,
  onPress,
  disabled = false,
}: {
  label: string;
  detail?: string;
  value?: string;
  icon?: IconName;
  swatch?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, value, detail].filter(Boolean).join(', ')}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
      ]}
    >
      {icon && <Icon name={icon} size={20} color={theme.ink(0x99)} />}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.label}>{label}</Text>
        {detail && <Text style={styles.note}>{detail}</Text>}
      </View>
      {value && <Text style={styles.value}>{value}</Text>}
      {swatch && <View style={[styles.swatch, { backgroundColor: swatch }]} />}
      <View style={{ transform: [{ rotate: '-90deg' }] }}>
        <Icon name="chevron" size={16} color={theme.ink(0x77)} />
      </View>
    </Pressable>
  );
}
function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { flex: 1 }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.ink(0x30), true: theme.accent }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={theme.ink(0x30)}
      />
    </View>
  );
}
// Saved on release, like the grid size sliders.
function ConnectorThickness({
  value,
  onDraft,
  onChange,
  disabled,
}: {
  value: number;
  onDraft: (value: number | null) => void;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const [draft, setDraft] = useState(value);
  return (
    <View style={styles.control}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[styles.label, { flex: 1 }]}>Connector thickness</Text>
        <Text style={styles.value}>{draft}%</Text>
      </View>
      <Slider
        style={{ minHeight: 44 }}
        minimumValue={20}
        maximumValue={100}
        step={5}
        value={value}
        disabled={disabled}
        minimumTrackTintColor={theme.accent}
        maximumTrackTintColor={theme.ink(0x30)}
        thumbTintColor={theme.ink(0xee)}
        accessibilityLabel="Connector thickness"
        accessibilityValue={{ text: `${draft} percent of the checkbox` }}
        onValueChange={(next) => {
          setDraft(Math.round(next / 5) * 5);
          onDraft(Math.round(next / 5) * 5);
        }}
        onSlidingComplete={(next) => {
          onDraft(null);
          onChange(Math.round(next / 5) * 5);
        }}
      />
    </View>
  );
}
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  const { fontScale } = useAppWindowDimensions();
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.control}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${option.label}`}
            accessibilityState={{ selected: value === option.value, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              flexGrow: 1,
              flexBasis: 74 * Math.max(1, fontScale),
              minHeight: 44,
              paddingHorizontal: 8,
              paddingVertical: 8,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor:
                value === option.value ? `${theme.accent}20` : theme.ink(0x1b),
              opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 14,
                color:
                  value === option.value ? theme.accentText : theme.ink(0xaa),
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function SettingsScreen(p: Props) {
  const disabled = !!p.snapshot.error || p.snapshot.busy || p.backupBusy;
  const count = p.snapshot.replay.state.habits.filter((h) => h.archived).length;
  const sheetScroll = useSheetScroll();
  const styles = useStyles();
  const window = useAppWindowDimensions();
  const backgroundScheme =
    p.page === 'darkBackground'
      ? 'dark'
      : p.page === 'lightBackground'
        ? 'light'
        : null;
  // Slider drafts show in the preview while dragging; each saves on release.
  const [sizeDrafts, setSizeDrafts] = useState<
    Partial<Record<GridSizeKind, number>>
  >({});
  const [connectorDraft, setConnectorDraft] = useState<number | null>(null);
  const activeHabits = p.snapshot.replay.state.habits.filter(
    (habit) => !habit.archived,
  );
  const appearance: PreviewAppearance = {
    checkboxStyle: p.checkboxStyle,
    cellLook:
      connectorDraft === null
        ? p.cellLook
        : { ...p.cellLook, connectorThickness: connectorDraft },
    weekDividers: p.weekDividers,
    weekStart: p.weekStart,
  };
  const preview = (
    <GridLivePreview
      sizing={p.sizing}
      drafts={sizeDrafts}
      gridWidth={p.gridWidth}
      habits={activeHabits}
      appearance={appearance}
      caption
    />
  );
  // On portrait phones the preview stays pinned above the Appearance controls,
  // so every grid setting below it changes something visible.
  const [collapsed, setCollapsed] = useState(previewCollapsed);
  const toggleCollapsed = () => {
    previewCollapsed = !collapsed;
    setCollapsed(!collapsed);
  };
  const pinPreview =
    p.page === 'appearance' &&
    window.height >= 640 &&
    window.height > window.width;
  const shape: CheckboxShape =
    p.checkboxStyle === 'marks'
      ? 'marks'
      : p.cellLook.roundCheckboxes
        ? 'circles'
        : 'squares';
  const changeShape = (next: CheckboxShape) => {
    if (next === 'marks') {
      p.onCheckboxStyleChange('marks');
      return;
    }
    if (p.checkboxStyle !== 'boxes') p.onCheckboxStyleChange('boxes');
    const round = next === 'circles';
    if (round !== p.cellLook.roundCheckboxes)
      p.onCellLookChange('roundCheckboxes', round);
  };
  const scroll = (
    <ScrollView
      {...sheetScroll}
      key={p.page}
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
    >
      {p.snapshot.error && (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="alert" style={styles.note}>
            {p.snapshot.error}
          </Text>
          <Row label="Retry saving" onPress={p.onRetry} />
        </View>
      )}
      {p.page === 'index' && (
        <>
          <Group title="Preferences">
            <Row
              icon="palette"
              label="Appearance"
              detail="Theme, text size and grid spacing"
              onPress={() => p.onPage('appearance')}
            />
            <Row
              icon="checked"
              label="Daily tracking"
              detail="Completed habits, calendar and feedback"
              onPress={() => p.onPage('tracking')}
            />
          </Group>
          <Group title="Your data">
            <Row
              icon="archive"
              label="Archived habits"
              value={String(count)}
              onPress={p.onArchive}
            />
            <Row
              icon="history"
              label="Backups"
              detail={
                p.sampleData
                  ? 'Available with your saved data'
                  : 'Export and restore your records'
              }
              onPress={() => p.onPage('backup')}
            />
          </Group>
          {p.developmentControls && (
            <Group>
              <Row
                icon="settings"
                label="Development"
                detail="Sample data and previews"
                onPress={() => p.onPage('development')}
              />
            </Group>
          )}
          <Text style={styles.footer}>OnPurpose</Text>
        </>
      )}
      {p.page === 'appearance' && (
        <>
          {!pinPreview && <Group>{preview}</Group>}
          <Group title="Theme">
            <Choice
              label="Theme"
              value={p.themeMode}
              options={themeModeOptions}
              onChange={(value) =>
                p.onThemeChange({ kind: 'themeMode', value })
              }
              disabled={disabled}
            />
            <Row
              label="Dark background"
              value={backgroundName('dark', p.darkBackground)}
              swatch={fitBackground('dark', p.darkBackground)}
              onPress={() => p.onPage('darkBackground')}
            />
            <Row
              label="Light background"
              value={backgroundName('light', p.lightBackground)}
              swatch={fitBackground('light', p.lightBackground)}
              onPress={() => p.onPage('lightBackground')}
            />
          </Group>
          <Group title="Size">
            <GridSizeSettings
              sizing={p.sizing}
              gridWidth={p.gridWidth}
              drafts={sizeDrafts}
              onDrafts={setSizeDrafts}
              editable={!disabled}
              onChange={p.onGridSizeChange}
            />
            <View style={styles.control}>
              <TextSizeSetting
                compact
                key={p.textScale}
                value={p.textScale}
                editable={!disabled}
                onChange={p.onTextScaleChange}
              />
            </View>
          </Group>
          <Group title="Checkboxes">
            <Choice
              label="Style"
              value={shape}
              options={checkboxShapeOptions}
              onChange={changeShape}
              disabled={disabled}
            />
            {p.checkboxStyle === 'boxes' && (
              <>
                <Toggle
                  label="Streak numbers"
                  value={p.cellLook.streakNumbers}
                  onChange={(value) =>
                    p.onCellLookChange('streakNumbers', value)
                  }
                  disabled={disabled}
                />
                <Toggle
                  label="Joined checkboxes"
                  value={p.cellLook.joinedCheckboxes}
                  onChange={(value) =>
                    p.onCellLookChange('joinedCheckboxes', value)
                  }
                  disabled={disabled}
                />
                {p.cellLook.joinedCheckboxes && (
                  <ConnectorThickness
                    key={p.cellLook.connectorThickness}
                    value={p.cellLook.connectorThickness}
                    onDraft={setConnectorDraft}
                    onChange={(value) =>
                      p.onCellLookChange('connectorThickness', value)
                    }
                    disabled={disabled}
                  />
                )}
              </>
            )}
            <Toggle
              label="Tap animations"
              value={p.tapAnimations}
              onChange={p.onTapAnimationsChange}
              disabled={disabled}
            />
          </Group>
          <Group title="Days">
            <Toggle
              label="Missed day crosses"
              value={p.cellLook.missedDays}
              onChange={(value) => p.onCellLookChange('missedDays', value)}
              disabled={disabled}
            />
            <Toggle
              label="Week dividers"
              value={p.weekDividers}
              onChange={p.onWeekDividersChange}
              disabled={disabled}
            />
          </Group>
          <InfoNote
            label="About appearance"
            text="System follows your phone’s light or dark mode. Text, controls and habit colours adjust to each background; your saved habit colours never change. Automatic sizes adapt to this screen; moving a slider sets an exact size, and Reset returns to automatic. Text size applies everywhere and follows your phone’s text size too. Streak numbers show each checked day’s place in its streak, and Joined checkboxes connect checked neighbours. Missed day crosses mark past scheduled days that missed their goal and leave unscheduled days blank. The grid shows changes when Settings closes; the preview shows them straight away."
          />
        </>
      )}
      {backgroundScheme && (
        <BackgroundSettings
          key={backgroundScheme}
          scheme={backgroundScheme}
          saved={
            backgroundScheme === 'dark' ? p.darkBackground : p.lightBackground
          }
          mode={p.themeMode}
          editable={!disabled}
          onChange={(value) =>
            p.onThemeChange({
              kind:
                backgroundScheme === 'dark'
                  ? 'darkBackground'
                  : 'lightBackground',
              value,
            })
          }
          preview={
            <GridLivePreview
              sizing={p.sizing}
              gridWidth={p.gridWidth}
              habits={activeHabits}
              appearance={appearance}
            />
          }
        />
      )}
      {p.page === 'tracking' && (
        <>
          <Group>
            <Toggle
              label="Hide completed today"
              value={p.hideCompleted}
              onChange={p.onHideCompletedChange}
              disabled={disabled}
            />
            <Toggle
              label="Haptic feedback"
              value={p.hapticsEnabled}
              onChange={p.onHapticsChange}
              disabled={disabled}
            />
            <Choice
              label="Week starts on"
              value={p.weekStart}
              options={weekStartOptions}
              onChange={p.onWeekStartChange}
              disabled={disabled}
            />
          </Group>
          <InfoNote
            label="About daily tracking"
            text="Hidden habits can be shown again on the grid. Past and future dates show the full list. Completion uses each habit’s goal for Today; habits set to Track only stay visible."
          />
        </>
      )}
      {p.page === 'backup' && (
        <>
          {p.sampleData ? (
            <Text style={styles.note}>
              Switch off Sample data in Development to use backups of your saved
              habits.
            </Text>
          ) : (
            <>
              <Text accessibilityLiveRegion="polite" style={styles.note}>
                {p.snapshot.error ??
                  (p.snapshot.pending
                    ? 'Saving your changes…'
                    : 'Saved on this device')}
              </Text>
              <Group>
                <Row
                  label={p.backupBusy ? 'Working…' : 'Export backup'}
                  onPress={p.onExport}
                  disabled={disabled}
                />
                <Row
                  label="Restore backup…"
                  onPress={p.onRestore}
                  disabled={disabled}
                />
                {p.snapshot.hasRecovery && (
                  <Row
                    label="Restore previous data…"
                    onPress={p.onRecover}
                    disabled={disabled}
                  />
                )}
              </Group>
              <InfoNote
                label="About backups"
                text="Backups include your records and change history. Save a copy outside the app. Restoring asks for confirmation and keeps a copy of the data it replaces."
              />
            </>
          )}
        </>
      )}
      {p.page === 'development' && (
        <View
          pointerEvents={p.backupBusy || p.snapshot.busy ? 'none' : 'auto'}
          accessibilityElementsHidden={p.backupBusy || p.snapshot.busy}
        >
          {p.developmentControls}
        </View>
      )}
    </ScrollView>
  );
  if (!pinPreview) return scroll;
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.pinned}>
        <View style={styles.group}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              collapsed ? 'Show grid preview' : 'Hide grid preview'
            }
            accessibilityState={{ expanded: !collapsed }}
            onPress={toggleCollapsed}
            style={({ pressed }) => [
              styles.previewToggle,
              { opacity: pressed ? 0.55 : 1 },
            ]}
          >
            <Text style={styles.previewToggleText}>Preview</Text>
            <View
              style={{
                transform: [{ rotate: collapsed ? '0deg' : '180deg' }],
              }}
            >
              <Icon name="chevron" size={18} />
            </View>
          </Pressable>
          {!collapsed && preview}
        </View>
      </View>
      {scroll}
    </View>
  );
}
const useStyles = themedStyles((t) => ({
  previewToggle: {
    minHeight: 40,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewToggleText: { color: t.ink(0x88), fontSize: 13 },
  pinned: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    width: '100%',
    maxWidth: 660,
    alignSelf: 'center',
  },
  body: {
    padding: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 24,
    width: '100%',
    maxWidth: 660,
    alignSelf: 'center',
  },
  groupTitle: { color: t.ink(0x88), fontSize: 13, paddingHorizontal: 4 },
  group: { backgroundColor: t.ink(0x11), borderRadius: 14, overflow: 'hidden' },
  row: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.ink(0x24),
  },
  control: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.ink(0x24),
  },
  label: { color: t.ink(0xde), fontSize: 17 },
  value: {
    color: t.ink(0x99),
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  note: { color: t.ink(0x92), fontSize: 13, lineHeight: 19 },
  footer: { color: t.ink(0x66), fontSize: 12, paddingHorizontal: 4 },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: t.ink(0x44),
  },
}));
