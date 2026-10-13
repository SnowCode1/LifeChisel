import { nextPeriodStart } from '@onpurpose/core/goalTiming';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import { useCallback, useRef, useState, type ComponentType } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  type TextProps,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { Text } from './Typography';
import { InfoNote } from './InfoNote';
import { Icon } from './Icon';
import { GoalVersionForm } from './GoalVersionForm';
import type { Habit } from '@onpurpose/core/habits';
import {
  allWeekdays,
  defaultSuccessRule,
  goalAt,
  replaceGoal,
  resolveGoalDraft,
  ruleSummary,
  timingSummary,
  validGoalTimeline,
  type HabitGoal,
} from '@onpurpose/core/habitGoals';
import { calendarDay, localDateKey } from '@onpurpose/core/calendar';
import { sameValue } from '@onpurpose/core/storage/model';
import { appear } from './motion';
import { themedStyles, useTheme } from './ThemeContext';

const dateLabel = (date: string, today: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
  });
function confirmAction(
  title: string,
  message: string,
  action: () => void,
  label = 'Apply',
  destructive = false,
) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm(`${title}\n\n${message}`)) action();
  } else
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: label,
        style: destructive ? 'destructive' : 'default',
        onPress: action,
      },
    ]);
}

export function HabitGoalsEditor({
  habit,
  today,
  initialDate = today,
  weekStart = 'monday',
  creating = false,
  parentLabel,
  editable,
  Heading,
  onClose,
  onApply,
}: {
  habit: Habit;
  today: string;
  initialDate?: string;
  weekStart?: WeekStart;
  creating?: boolean;
  parentLabel?: string;
  editable: boolean;
  Heading: ComponentType<TextProps>;
  onClose: () => void;
  onApply: (goals: HabitGoal[] | undefined) => boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const colour = theme.colour(habit.color);
  function newDraft(): HabitGoal {
    const current = goalAt(habit, initialDate);
    return {
      id: randomUUID(),
      from:
        current?.period && !creating
          ? nextPeriodStart(current.period, initialDate)
          : initialDate,
      ...(current?.period ? { period: current.period } : {}),
      ...(current?.cycle ? { cycle: current.cycle } : {}),
      ...(current?.defaultChecked !== undefined
        ? { defaultChecked: current.defaultChecked }
        : {}),
      rule: current?.rule ?? defaultSuccessRule(habit),
      weekdays: [...(current?.weekdays ?? allWeekdays)],
    };
  }
  const [draft, setDraft] = useState<HabitGoal>(newDraft);
  const [originalId, setOriginalId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState(false);
  const dirty = useRef(false);
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  function selectDraft(next: HabitGoal, id: string | null) {
    const select = () => {
      dirty.current = false;
      setDraft(next);
      setOriginalId(id);
      setTimeline(false);
    };
    if (dirty.current)
      confirmAction(
        'Discard this draft?',
        'Your unapplied goal changes will be discarded.',
        select,
        'Discard',
        true,
      );
    else select();
  }
  function apply(goals: HabitGoal[] | undefined) {
    if (onApply(goals)) onClose();
  }
  function save(next: HabitGoal) {
    const goals = replaceGoal(habit.goals, next);
    if (!validGoalTimeline(goals, habit)) return;
    // Opening and closing a default checkbox goal must not manufacture a new
    // historical version. Only a changed condition, schedule or date is saved.
    if (
      sameValue(next, resolveGoalDraft(habit.goals, draft, !!originalId)) ||
      sameValue(goals, habit.goals)
    ) {
      onClose();
      return;
    }
    const previousDate = habit.goals?.find(
      (goal) => goal.id === originalId,
    )?.from;
    if (
      !creating &&
      (next.from < today || (previousDate && previousDate < today))
    )
      confirmAction(
        'Update earlier results?',
        'This changes the goal for its date period. Recorded values stay saved, and you can undo the change in History.',
        () => apply(goals),
      );
    else apply(goals);
  }
  function remove() {
    if (!originalId) return;
    confirmAction(
      'Remove this goal?',
      'The preceding goal, or the original default, will apply through this period. Recorded values stay saved. You can undo this in History.',
      () => {
        const remaining = habit.goals!.filter((goal) => goal.id !== originalId);
        apply(remaining.length ? remaining : undefined);
      },
      'Remove',
      true,
    );
  }
  const active = goalAt(habit, today);
  const goals = habit.goals ?? [];
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen}>
          {!editable && (
            <Text accessibilityRole="alert" style={styles.error}>
              Saving is blocked. Close this sheet to see the save status and
              Retry.
            </Text>
          )}
          <View
            style={{ flex: 1, display: timeline ? 'none' : 'flex' }}
            accessibilityElementsHidden={timeline}
            importantForAccessibility={
              timeline ? 'no-hide-descendants' : 'auto'
            }
          >
            <GoalVersionForm
              key={`${draft.id}:${originalId ?? 'new'}`}
              weekStart={weekStart}
              creating={creating}
              parentLabel={parentLabel}
              habit={habit}
              initial={draft}
              existing={!!originalId}
              today={today}
              editable={editable}
              Heading={Heading}
              onClose={onClose}
              onSave={save}
              onRemove={remove}
              onDirtyChange={onDirtyChange}
              onTimeline={() => {
                Keyboard.dismiss();
                setTimeline(true);
              }}
            />
          </View>
          {timeline && (
            <Animated.View entering={appear} style={{ flex: 1 }}>
              <View style={styles.header}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to goal draft"
                  onPress={() => setTimeline(false)}
                  style={styles.action}
                >
                  <Text style={styles.control}>‹ Goal</Text>
                </Pressable>
                <Heading style={styles.title}>Goal timeline</Heading>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close goal timeline"
                  onPress={onClose}
                  style={[styles.action, { alignItems: 'flex-end' }]}
                >
                  <Icon name="close" size={20} />
                </Pressable>
              </View>
              <ScrollView
                contentContainerStyle={styles.body}
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.habit, { color: colour }]}>
                  {habit.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change goal from today"
                  disabled={!editable}
                  onPress={() => selectDraft(newDraft(), null)}
                  style={({ pressed }) => [
                    styles.newGoal,
                    { opacity: !editable ? 0.4 : pressed ? 0.65 : 1 },
                  ]}
                >
                  <Icon name="plus" size={20} color={colour} />
                  <Text style={[styles.control, { color: colour, flex: 1 }]}>
                    New goal
                  </Text>
                </Pressable>
                <View style={styles.timeline}>
                  {[...goals].reverse().map((goal) => {
                    const index = goals.findIndex(
                      (item) => item.id === goal.id,
                    );
                    const end = goals[index + 1]?.from;
                    const status =
                      goal.from > today
                        ? 'Upcoming'
                        : goal.id === active?.id
                          ? 'Current'
                          : null;
                    const current = status === 'Current';
                    return (
                      <Pressable
                        key={goal.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit goal from ${goal.from}, ${ruleSummary(habit, goal.rule)}`}
                        disabled={!editable}
                        onPress={() => selectDraft(goal, goal.id)}
                        style={({ pressed }) => [
                          styles.version,
                          { opacity: !editable ? 0.4 : pressed ? 0.6 : 1 },
                        ]}
                      >
                        <View style={styles.rail}>
                          <View
                            style={[
                              styles.dot,
                              {
                                backgroundColor: current
                                  ? colour
                                  : theme.ink(0x62),
                              },
                            ]}
                          />
                          <View style={styles.line} />
                        </View>
                        <View style={styles.versionBody}>
                          <View style={styles.dateRow}>
                            <Text style={styles.date}>
                              {dateLabel(goal.from, today)}
                              {end
                                ? ` – ${dateLabel(localDateKey(calendarDay(end, 1)), today)}`
                                : ' onwards'}
                            </Text>
                            {!!status && (
                              <Text
                                style={[
                                  styles.badge,
                                  current && {
                                    color: colour,
                                    backgroundColor: theme.mix(colour, 0.1),
                                  },
                                ]}
                              >
                                {status}
                              </Text>
                            )}
                          </View>
                          <Text numberOfLines={2} style={styles.rule}>
                            {ruleSummary(habit, goal.rule)}
                            {goal.defaultChecked ? ' · default On' : ''}
                          </Text>
                          <View style={styles.dateRow}>
                            <Text style={[styles.note, { flex: 1 }]}>
                              {timingSummary(goal)}
                            </Text>
                            <Icon
                              name="edit"
                              size={15}
                              color={theme.ink(0x77)}
                            />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                  {(!goals.length ||
                    !habit.startDate ||
                    goals[0].from > habit.startDate) && (
                    <View style={styles.version}>
                      <View style={styles.rail}>
                        <View style={styles.originalDot} />
                      </View>
                      <View style={styles.versionBody}>
                        <Text style={styles.date}>
                          {goals.length
                            ? `Before ${dateLabel(goals[0].from, today)}`
                            : 'Original goal'}
                        </Text>
                        <Text style={styles.rule}>
                          {ruleSummary(habit, defaultSuccessRule(habit))}
                        </Text>
                        <Text style={styles.note}>Every day</Text>
                      </View>
                    </View>
                  )}
                </View>
                <InfoNote
                  label="About goal history"
                  text="Tap a dated goal to edit that period. A new goal starts on its selected date and preserves earlier goals. Correcting or removing an earlier goal asks for confirmation. Recorded values stay saved, and all applied changes support Undo in History."
                />
              </ScrollView>
            </Animated.View>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.ink(0x0b) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 12,
    minHeight: 56,
  },
  title: {
    fontSize: 17,
    color: t.ink(0xe5),
    fontWeight: '600',
    flexShrink: 1,
  },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  control: { color: t.ink(0xda), fontSize: 14 },
  body: {
    padding: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 18,
    maxWidth: 660,
    width: '100%',
    alignSelf: 'center',
  },
  habit: { fontSize: 16, fontWeight: '500' },
  note: { color: t.ink(0x99), fontSize: 12, lineHeight: 17 },
  error: { padding: 16, color: t.danger, fontSize: 13 },
  newGoal: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: t.ink(0x18),
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  timeline: { paddingHorizontal: 2 },
  version: { flexDirection: 'row', gap: 12 },
  rail: { width: 12, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  originalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
    borderWidth: 1,
    borderColor: t.ink(0x62),
  },
  line: {
    width: 1,
    backgroundColor: t.ink(0x30),
    flex: 1,
    marginTop: 6,
    marginBottom: 6,
  },
  versionBody: { flex: 1, paddingBottom: 24, gap: 7 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  date: { fontSize: 12, color: t.ink(0x99), flexShrink: 1 },
  badge: {
    fontSize: 11,
    color: t.ink(0xbb),
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: t.ink(0x22),
    borderRadius: 5,
  },
  rule: { fontSize: 15, color: t.ink(0xdd) },
}));
