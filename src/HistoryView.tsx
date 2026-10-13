import { Text } from './Typography';
import { DescriptionHistory } from './DescriptionHistory';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  Pressable,
  SectionList,
  StyleSheet,
  View,
  type TextProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icon';
import { FilterBar, HabitFilterMenu, JumpCalendar } from './HistoryFilters';
import { calendarDay, localDateKey } from '@onpurpose/core/calendar';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import {
  allHistory,
  burstMemberLabel,
  historyCountLabel,
  historyDayIndex,
  historyDayLabel,
  historyDays,
  historyDisplayState,
  historyPresentation,
  historyRows,
  type HistoryCounts,
  type HistoryFilter,
  type HistoryKind,
  type HistoryRowItem,
} from '@onpurpose/core/history';
import type { HistoryAction, StoredState } from '@onpurpose/core/storage/model';
import type { StoreSnapshot } from '@onpurpose/core/storage/store';
import { useLocalToday } from './useLocalToday';
import { useSheetScroll } from './SheetModal';
import { themedStyles, useTheme } from './ThemeContext';

// Days grouped per page; folded days are short, so a page fills several screens.
const dayPage = 40;

const emptyFilter: Record<HistoryKind | 'all', string> = {
  all: 'No changes for this habit yet.',
  entries: 'Checks, numbers and other daily records appear here.',
  edits:
    'New habits, renames, colours, goals, archiving and order changes appear here.',
  notes: 'Description edits appear here.',
};

function timeLabel(recordedAt: string) {
  return new Date(recordedAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Short entry date, with a year only when it differs from the reference date.
function entryDateLabel(date: string, reference: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(date.slice(0, 4) !== reference.slice(0, 4) ? { year: 'numeric' } : {}),
  });
}

const HistoryRow = memo(function HistoryRow({
  event,
  state,
  pending,
  nested,
  onDescriptionPress,
}: {
  event: HistoryAction;
  state: StoredState;
  pending: boolean;
  nested?: 'middle' | 'last';
  onDescriptionPress: (event: HistoryAction) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const row = historyPresentation(event, state);
  const accent = theme.colour(row.color);
  const time = timeLabel(event.recordedAt);
  const date = row.effectiveDate
    ? entryDateLabel(
        row.effectiveDate,
        String(new Date(event.recordedAt).getFullYear()),
      )
    : null;
  const colourDescription =
    event.change.kind === 'colour'
      ? `, ${event.change.before} to ${event.change.after}`
      : '';
  const descriptionChanged =
    event.change.kind === 'habit' &&
    event.change.before?.description !== event.change.after?.description;
  return (
    <Pressable
      onPress={descriptionChanged ? () => onDescriptionPress(event) : undefined}
      accessibilityRole={descriptionChanged ? 'button' : undefined}
      accessibilityHint={
        descriptionChanged
          ? 'Compare description versions and restore'
          : undefined
      }
      accessible
      accessibilityLabel={`${row.title}, ${row.summary}${colourDescription}${date ? `, entry for ${date}` : ''}, ${time}${pending ? ', saving' : ''}`}
      style={[
        styles.row,
        nested && styles.card,
        nested === 'last' && styles.cardBottom,
      ]}
    >
      <View style={styles.actionIcon}>
        <Icon name={row.icon} size={19} color={accent} />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowHeading}>
          <Text style={styles.habitName}>{row.title}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        <View style={styles.detailLine}>
          <Text style={styles.detail}>
            {row.summary}
            {date ? ` · For ${date}` : ''}
          </Text>
          {event.change.kind === 'colour' && (
            <View accessible={false} style={styles.swatches}>
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: theme.colour(event.change.before) },
                ]}
              />
              <Text allowFontScaling={false} style={styles.swatchArrow}>
                →
              </Text>
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: theme.colour(event.change.after) },
                ]}
              />
            </View>
          )}
          {pending && <Text style={styles.pending}>Saving…</Text>}
        </View>
      </View>
    </Pressable>
  );
});

// Neighbouring entries for one date, collapsed until tapped.
const BurstRow = memo(function BurstRow({
  burstKey,
  actions,
  expanded,
  state,
  pending,
  onToggle,
}: {
  burstKey: string;
  actions: HistoryAction[];
  expanded: boolean;
  state: StoredState;
  pending: boolean;
  onToggle: (key: string) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const newest = actions[0];
  const oldest = actions.at(-1)!;
  const members = actions.map((action) => burstMemberLabel(action, state));
  const icons = new Set(
    actions.map((action) => historyPresentation(action, state).icon),
  );
  const [icon] = icons.size === 1 ? icons : ['tick' as const];
  const first = timeLabel(oldest.recordedAt);
  const last = timeLabel(newest.recordedAt);
  const time = first === last ? last : `${first}–${last}`;
  // Members share one entry date and edit day, so the newest speaks for all.
  const effectiveDate = historyPresentation(newest, state).effectiveDate;
  const date = effectiveDate
    ? entryDateLabel(
        effectiveDate,
        String(new Date(newest.recordedAt).getFullYear()),
      )
    : null;
  return (
    <Pressable
      onPress={() => onToggle(burstKey)}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityHint={
        expanded ? 'Hides each entry' : 'Shows each entry separately'
      }
      accessibilityLabel={`${actions.length} entries, ${members
        .map((member) => member.spoken)
        .join(
          ', ',
        )}${date ? `, entries for ${date}` : ''}, ${first === last ? last : `${first} to ${last}`}${pending ? ', saving' : ''}`}
      style={({ pressed }) => [
        styles.row,
        expanded && [styles.card, styles.cardTop],
        pressed && { opacity: 0.6 },
      ]}
    >
      <View style={styles.actionIcon}>
        <Icon name={icon} size={19} color={theme.ink(0xb8)} />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowHeading}>
          <Text style={styles.habitName}>
            {actions.length} entries
            {date ? <Text style={styles.detail}>{` · For ${date}`}</Text> : ''}
          </Text>
          <Text style={styles.time}>{time}</Text>
          <View
            style={{
              alignSelf: 'center',
              transform: [{ rotate: expanded ? '0deg' : '-90deg' }],
            }}
          >
            <Icon name="chevron" size={14} color={theme.ink(0x80)} />
          </View>
        </View>
        {!expanded && (
          <View style={styles.detailLine}>
            <Text numberOfLines={2} style={styles.detail}>
              {members.map((member, index) => (
                <Text key={actions[index].id}>
                  {index > 0 ? ' · ' : ''}
                  <Text
                    style={[
                      { color: theme.colour(member.color) },
                      member.removed && styles.removed,
                    ]}
                  >
                    {member.name}
                  </Text>
                  {member.value ? ` ${member.value}` : ''}
                </Text>
              ))}
            </Text>
            {pending && <Text style={styles.pending}>Saving…</Text>}
          </View>
        )}
      </View>
    </Pressable>
  );
});

// Tap to fold or open the day; the heading stays a VoiceOver heading.
const DayHeading = memo(function DayHeading({
  sectionKey,
  date,
  today,
  counts,
  open,
  onToggle,
}: {
  sectionKey: string;
  date: string;
  today: string;
  counts: HistoryCounts;
  open: boolean;
  onToggle: (key: string, date: string, heading: View | null) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const heading = useRef<View>(null);
  const day = historyDayLabel(date, today);
  const summary = historyCountLabel(counts);
  return (
    <Pressable
      ref={heading}
      accessibilityRole="header"
      accessibilityLabel={`${day}, ${summary}`}
      accessibilityState={{ expanded: open }}
      accessibilityHint={open ? 'Folds this day' : 'Shows the changes'}
      onPress={() => onToggle(sectionKey, date, heading.current)}
      style={({ pressed }) => [
        styles.dayHeading,
        pressed && styles.dayHeadingPressed,
      ]}
    >
      <Text style={[styles.dayTitle, !open && styles.dayTitleFolded]}>
        {day}
      </Text>
      <View style={styles.dayRule} />
      <Text style={styles.dayCounts}>{summary}</Text>
      <View style={{ transform: [{ rotate: open ? '0deg' : '-90deg' }] }}>
        <Icon name="chevron" size={13} color={theme.ink(0x80)} />
      </View>
    </Pressable>
  );
});

function UndoBar({
  undoLabel,
  redoLabel,
  undoDisabled,
  redoDisabled,
  onUndo,
  onRedo,
  onHeight,
}: {
  undoLabel: string | null;
  redoLabel: string | null;
  undoDisabled: boolean;
  redoDisabled: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onHeight: (height: number) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.barFrame} pointerEvents="box-none">
      <View
        style={styles.bar}
        onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            undoLabel ? `Undo ${undoLabel}` : 'Nothing to undo'
          }
          accessibilityState={{ disabled: undoDisabled }}
          disabled={undoDisabled}
          onPress={onUndo}
          style={({ pressed }) => [
            styles.undo,
            pressed && { backgroundColor: theme.ink(0x29) },
          ]}
        >
          <View style={{ opacity: undoDisabled ? 0.35 : 1 }}>
            <Icon name="undo" size={18} color={theme.ink(0xdd)} />
          </View>
          <View style={styles.undoText}>
            <Text style={[styles.undoTitle, undoDisabled && { opacity: 0.45 }]}>
              Undo
            </Text>
            <Text
              numberOfLines={1}
              accessibilityLiveRegion="polite"
              style={styles.undoTarget}
            >
              {undoLabel ?? 'Nothing to undo'}
            </Text>
          </View>
        </Pressable>
        <View style={styles.barDivider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            redoLabel ? `Redo ${redoLabel}` : 'Nothing to redo'
          }
          accessibilityState={{ disabled: redoDisabled }}
          disabled={redoDisabled}
          onPress={onRedo}
          style={({ pressed }) => [
            styles.redo,
            pressed && { backgroundColor: theme.ink(0x29) },
            { opacity: redoDisabled ? 0.35 : 1 },
          ]}
        >
          <Icon name="redo" size={18} color={theme.ink(0xdd)} />
        </Pressable>
      </View>
    </View>
  );
}

type DaySection = {
  key: string;
  date: string;
  counts: HistoryCounts;
  open: boolean;
};
// A day to bring to the top of the list once it has rendered and been measured.
type ScrollTarget = {
  key: string;
  attempts: number;
  failed: boolean;
  // The previous attempt reached the day without falling back to estimates.
  settled: boolean;
};

export function HistoryView({
  Heading,
  sampleData = false,
  snapshot,
  backupBusy,
  weekStart,
  calendarOpen,
  onCalendarClose,
  onRestoreDescription,
  onUndo,
  onRedo,
  onRetry,
}: {
  Heading: ComponentType<TextProps>;
  sampleData?: boolean;
  snapshot: StoreSnapshot;
  backupBusy: boolean;
  weekStart: WeekStart;
  // The jump calendar opens from the sheet header, which AppPanel owns.
  calendarOpen: boolean;
  onCalendarClose: () => void;
  onRestoreDescription: (id: string, text: string | undefined) => boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const [descriptionAction, setDescriptionAction] =
    useState<HistoryAction | null>(null);
  const today = useLocalToday();
  const [dayLimit, setDayLimit] = useState(dayPage);
  const [requested, setFilter] = useState<HistoryFilter>(allHistory);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Days the viewer opened or folded; other days follow openByDefault.
  const [folds, setFolds] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [menuOpen, setMenuOpen] = useState(false);
  const [jumpDate, setJumpDate] = useState<string | null>(null);
  const [filtersBottom, setFiltersBottom] = useState(0);
  const [barHeight, setBarHeight] = useState(64);
  const list = useRef<SectionList<HistoryRowItem, DaySection>>(null);
  const listBox = useRef<View>(null);
  const target = useRef<ScrollTarget | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const undo = snapshot.replay.undo;
  const displayState = useMemo(
    () => historyDisplayState(snapshot.replay.state, undo),
    [snapshot.replay.state, undo],
  );
  const filterHabit = requested.habitId
    ? displayState.habits.find((habit) => habit.id === requested.habitId)
    : undefined;
  // A habit whose creation was undone leaves nothing to filter by.
  const kind = requested.kind;
  const habitId = filterHabit ? requested.habitId : null;
  const filter = useMemo(() => ({ kind, habitId }), [kind, habitId]);
  const filtered = kind !== 'all' || habitId !== null;
  // Only loaded days are grouped; each action's day is cached in history.ts.
  const { days, more } = useMemo(
    () => historyDays(undo, filter, dayLimit),
    [undo, filter, dayLimit],
  );
  const yesterday = useMemo(() => localDateKey(calendarDay(today, 1)), [today]);
  // Today and Yesterday start open; filtered lists are short, so all days do.
  const openByDefault = useCallback(
    (date: string) => filtered || date === today || date === yesterday,
    [filtered, today, yesterday],
  );
  const sections = useMemo(
    () =>
      days.map((day) => {
        const open = folds.get(day.date) ?? openByDefault(day.date);
        return {
          key: day.key,
          date: day.date,
          counts: day.counts,
          open,
          data: open ? historyRows(day.actions, expanded) : [],
        };
      }),
    [days, folds, openByDefault, expanded],
  );
  const latestSections = useRef(sections);
  useLayoutEffect(() => {
    latestSections.current = sections;
  });
  // The calendar needs every day, so it scans the whole log only while open.
  const allDays = useMemo(
    () => (calendarOpen ? historyDays(undo, filter).days : null),
    [calendarOpen, undo, filter],
  );
  const marked = useMemo(
    () => new Set(allDays?.map((day) => day.date)),
    [allDays],
  );
  const editable = !snapshot.error && !snapshot.busy && !backupBusy;
  const describe = (action: HistoryAction | undefined) => {
    if (!action) return null;
    const row = historyPresentation(action, displayState);
    const date =
      action.change.kind === 'entry' && action.change.date !== today
        ? entryDateLabel(action.change.date, today)
        : null;
    return `${row.title} · ${row.summary}${date ? ` · ${date}` : ''}`;
  };
  const savedCount = snapshot.events.length - snapshot.pending;
  const sheetScroll = useSheetScroll();

  const stopScrolling = useCallback(() => {
    target.current = null;
    clearTimeout(retry.current);
  }, []);
  useEffect(() => stopScrolling, [stopScrolling]);
  // Rows have no fixed heights, so a far day must render before its exact
  // offset is known: jump near it, then repeat once it has been measured.
  const scrollToTarget = useMemo(() => {
    function attempt() {
      const current = target.current;
      if (!current) return;
      const sectionIndex = latestSections.current.findIndex(
        (section) => section.key === current.key,
      );
      if (sectionIndex < 0 || current.attempts >= 8) {
        stopScrolling();
        return;
      }
      current.attempts++;
      current.failed = false;
      list.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        viewPosition: 0,
        animated: false,
      });
      // A success may still use estimated offsets, so stop only after two
      // consecutive attempts reach the day.
      if (!current.failed && current.settled) {
        stopScrolling();
        return;
      }
      current.settled = !current.failed;
      retry.current = setTimeout(attempt, 80);
    }
    return attempt;
  }, [stopScrolling]);
  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      if (!target.current) return;
      target.current.failed = true;
      list.current?.getScrollResponder()?.scrollTo({
        y: info.averageItemLength * info.index,
        animated: false,
      });
    },
    [],
  );
  useEffect(() => {
    if (target.current?.attempts === 0) scrollToTarget();
  }, [sections, scrollToTarget]);

  const choose = (next: HistoryFilter) => {
    stopScrolling();
    setFilter(next);
    setDayLimit(dayPage);
    setMenuOpen(false);
  };
  const jump = (date: string) => {
    onCalendarClose();
    setJumpDate(date);
    if (!allDays) return;
    const index = historyDayIndex(allDays, date);
    if (index < 0) return;
    const day = allDays[index];
    stopScrolling();
    target.current = {
      key: day.key,
      attempts: 0,
      failed: false,
      settled: false,
    };
    setFolds((previous) => new Map(previous).set(day.date, true));
    setDayLimit((limit) => Math.max(limit, index + 1 + dayPage / 2));
  };
  const toggleDay = useCallback(
    (key: string, date: string, heading: View | null) => {
      const flip = () =>
        setFolds((previous) =>
          new Map(previous).set(
            date,
            !(previous.get(date) ?? openByDefault(date)),
          ),
        );
      const box = listBox.current;
      if (!(folds.get(date) ?? openByDefault(date)) || !heading || !box) {
        flip();
        return;
      }
      // Folding a pinned heading would strand it above the list; keep it on top.
      heading.measure((_x, _y, _width, _height, _pageX, headingY) =>
        box.measure((_x2, _y2, _width2, _height2, _pageX2, listY) => {
          if (headingY <= listY + 1) {
            stopScrolling();
            target.current = {
              key,
              attempts: 0,
              failed: false,
              settled: false,
            };
          }
          flip();
        }),
      );
    },
    [folds, openByDefault, stopScrolling],
  );
  const toggleBurst = useCallback(
    (key: string) =>
      setExpanded((previous) => {
        const next = new Set(previous);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
    [],
  );
  const renderItem = useCallback(
    ({ item }: { item: HistoryRowItem }) =>
      item.type === 'burst' ? (
        <BurstRow
          burstKey={item.key}
          actions={item.actions}
          expanded={item.expanded}
          state={displayState}
          pending={item.actions.some(
            (action) => action.lastChangedSequence > savedCount,
          )}
          onToggle={toggleBurst}
        />
      ) : (
        <HistoryRow
          event={item.action}
          state={displayState}
          nested={item.nested}
          onDescriptionPress={setDescriptionAction}
          pending={item.action.lastChangedSequence > savedCount}
        />
      ),
    [displayState, savedCount, toggleBurst],
  );
  const renderSectionHeader = useCallback(
    ({ section }: { section: DaySection }) => (
      <DayHeading
        sectionKey={section.key}
        date={section.date}
        today={today}
        counts={section.counts}
        open={section.open}
        onToggle={toggleDay}
      />
    ),
    [today, toggleDay],
  );
  return (
    <View style={styles.container}>
      {snapshot.error && (
        <View accessibilityLiveRegion="polite" style={styles.error}>
          <Text style={styles.errorText}>Not saved · {snapshot.error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={styles.retry}
          >
            <Text style={styles.buttonLabel}>Retry saving</Text>
          </Pressable>
        </View>
      )}
      <View
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          setFiltersBottom(y + height);
        }}
      >
        <FilterBar
          filter={filter}
          habitName={filterHabit?.name ?? null}
          habitColor={filterHabit?.color ?? null}
          menuOpen={menuOpen && !calendarOpen}
          onKind={(next) => choose({ ...filter, kind: next })}
          onHabitMenu={() => {
            onCalendarClose();
            setMenuOpen((open) => !open || calendarOpen);
          }}
        />
      </View>
      {descriptionAction && (
        <DescriptionHistory
          Heading={Heading}
          action={descriptionAction}
          state={snapshot.replay.state}
          editable={editable}
          onRestore={onRestoreDescription}
          onClose={() => setDescriptionAction(null)}
        />
      )}
      <View ref={listBox} style={styles.listBox}>
        <SectionList
          {...sheetScroll}
          ref={list}
          key={`${filter.kind}:${filter.habitId}`}
          sections={sections}
          extraData={snapshot}
          keyExtractor={(item) => item.key}
          stickySectionHeadersEnabled
          initialNumToRender={20}
          windowSize={7}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: barHeight + 36 },
          ]}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={stopScrolling}
          onScrollToIndexFailed={onScrollToIndexFailed}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (more) setDayLimit((limit) => limit + dayPage);
          }}
          ListHeaderComponent={
            sampleData ? (
              <Text style={styles.sample}>Sample data · temporary</Text>
            ) : null
          }
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          ListEmptyComponent={
            filtered ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No matching changes</Text>
                <Text style={styles.emptyDescription}>
                  {emptyFilter[filter.kind]}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => choose(allHistory)}
                  style={styles.more}
                >
                  <Text style={styles.buttonLabel}>Show all changes</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.empty}>
                <Icon name="history" size={32} color={theme.ink(0x74)} />
                <Text style={styles.emptyTitle}>No active changes</Text>
                <Text style={styles.emptyDescription}>
                  Your habit entries and edits will appear here.
                </Text>
              </View>
            )
          }
        />
      </View>
      <LinearGradient
        colors={[
          `${theme.background}00`,
          `${theme.background}D9`,
          theme.background,
        ]}
        locations={[0, 0.6, 1]}
        style={[styles.fade, { height: barHeight + 36 }]}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      />
      <UndoBar
        undoLabel={describe(undo.at(-1))}
        redoLabel={describe(snapshot.replay.redo.at(-1)?.action)}
        undoDisabled={!editable || !undo.length}
        redoDisabled={!editable || !snapshot.replay.redo.length}
        onUndo={onUndo}
        onRedo={onRedo}
        onHeight={(height) =>
          setBarHeight((previous) => (previous === height ? previous : height))
        }
      />
      {menuOpen && !calendarOpen && (
        <HabitFilterMenu
          top={filtersBottom}
          state={displayState}
          liveHabits={snapshot.replay.state.habits}
          actions={undo}
          selected={filter.habitId}
          onSelect={(next) => choose({ ...filter, habitId: next })}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {calendarOpen && (
        <JumpCalendar
          top={0}
          value={jumpDate ?? today}
          today={today}
          weekStart={weekStart}
          marked={marked}
          onChoose={jump}
          onClose={onCalendarClose}
        />
      )}
    </View>
  );
}

const useStyles = themedStyles((t) => ({
  container: { flex: 1 },
  buttonLabel: {
    color: t.ink(0xcf),
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  sample: {
    marginHorizontal: 24,
    marginTop: 4,
    fontSize: 12,
    color: t.ink(0x85),
  },
  listBox: { flex: 1 },
  list: { flexGrow: 1 },
  dayHeading: {
    minHeight: 44,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: t.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dayHeadingPressed: { backgroundColor: t.ink(0x12) },
  dayTitle: {
    color: t.ink(0x90),
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  dayTitleFolded: { color: t.ink(0xb8) },
  dayRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.ink(0x24),
    flex: 1,
    minWidth: 12,
  },
  dayCounts: {
    color: t.ink(0x77),
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  row: {
    minHeight: 54,
    paddingHorizontal: 24,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  // An expanded burst and its entries share one quiet card.
  card: {
    marginHorizontal: 12,
    paddingHorizontal: 12,
    backgroundColor: t.ink(0x10),
  },
  cardTop: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  cardBottom: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    marginBottom: 6,
  },
  actionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: t.ink(0x12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: { flex: 1, gap: 3 },
  rowHeading: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  habitName: { color: t.ink(0xdd), fontSize: 14, fontWeight: '500', flex: 1 },
  time: {
    color: t.ink(0x77),
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  detailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 3,
  },
  detail: { color: t.ink(0x94), fontSize: 12, flexShrink: 1 },
  removed: { textDecorationLine: 'line-through', opacity: 0.7 },
  pending: { fontSize: 10, color: t.ink(0xa6) },
  swatches: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.ink(0x66),
  },
  swatchArrow: { fontSize: 11, color: t.ink(0x74) },
  empty: { alignItems: 'center', padding: 36, paddingTop: 60, gap: 12 },
  emptyTitle: { color: t.ink(0xdd), fontSize: 18, fontWeight: '500' },
  emptyDescription: { color: t.ink(0x96), fontSize: 13, textAlign: 'center' },
  error: {
    marginHorizontal: 24,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: t.tint('#251C16'),
  },
  errorText: { color: t.colour('#C9B5A6'), fontSize: 13 },
  retry: { minHeight: 44, justifyContent: 'center', paddingTop: 8 },
  more: {
    minHeight: 44,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: t.ink(0x14),
  },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  barFrame: { position: 'absolute', left: 16, right: 16, bottom: 12 },
  bar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.ink(0x36),
    backgroundColor: t.ink(0x18),
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  undo: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  undoText: { flex: 1, gap: 1 },
  undoTitle: { color: t.ink(0xe0), fontSize: 14, fontWeight: '600' },
  undoTarget: { color: t.ink(0x90), fontSize: 12 },
  barDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 8,
    backgroundColor: t.ink(0x36),
  },
  redo: {
    width: 56,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
