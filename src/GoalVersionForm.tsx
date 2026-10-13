import { CheckboxDefaultField } from './CheckboxDefaultField';
import { GoalSection, GoalChoice as Choices } from './GoalEditorControls';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type TextProps,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, TextInput } from './Typography';
import { Icon } from './Icon';
import { HabitSymbol } from './HabitSymbol';
import { StartDateField } from './StartDateField';
import { InfoNote } from './InfoNote';
import { habitType, type Habit } from '@onpurpose/core/habits';
import {
  resolveGoalDraft,
  ruleSummary,
  validSuccessRule,
  scheduleSummary,
  type HabitGoal,
  type SuccessRule,
} from '@onpurpose/core/habitGoals';
import { goalDraftIssue, parseGoalAmount } from '@onpurpose/core/goalEditing';
import { sameValue } from '@onpurpose/core/storage/model';
import { appear } from './motion';
import { GoalTimingFields } from './GoalTimingFields';
import {
  nextPeriodStart,
  periodSummary,
  cycleSummary,
  validPeriod,
  validCycle,
  validTimingDate,
  periodWindow,
  timingDate,
  ordinal,
  type GoalTiming,
} from '@onpurpose/core/goalTiming';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import { themedStyles, useTheme } from './ThemeContext';

function Disclosure({
  label,
  detail,
  expanded,
  onPress,
  children,
}: {
  label: string;
  detail?: string;
  expanded: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={{ gap: expanded ? 12 : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.disclosure,
          { opacity: pressed ? 0.65 : 1 },
        ]}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.control}>{label}</Text>
          {!!detail && (
            <Text numberOfLines={2} style={styles.note}>
              {detail}
            </Text>
          )}
        </View>
        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
          <Icon name="chevron" size={16} color={theme.ink(0x88)} />
        </View>
      </Pressable>
      {expanded && (
        <Animated.View entering={appear} style={styles.group}>
          {children}
        </Animated.View>
      )}
    </View>
  );
}

export function GoalVersionForm({
  habit,
  initial,
  existing,
  today,
  editable,
  Heading,
  onClose,
  onSave,
  onRemove,
  onTimeline,
  onDirtyChange,
  weekStart,
  creating,
  parentLabel,
}: {
  weekStart: WeekStart;
  creating: boolean;
  parentLabel?: string;
  habit: Habit;
  initial: HabitGoal;
  existing: boolean;
  today: string;
  editable: boolean;
  Heading: ComponentType<TextProps>;
  onClose: () => void;
  onSave: (goal: HabitGoal) => void;
  onRemove: () => void;
  onTimeline: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const colour = theme.colour(habit.color);
  const type = habitType(habit);
  const [section, setSection] = useState<
    'condition' | 'frequency' | 'cycle' | 'date' | null
  >(null);
  const toggleSection = (next: typeof section) =>
    setSection((previous) => (previous === next ? null : next));
  const [defaultChecked, setDefaultChecked] = useState(
    initial.defaultChecked ?? false,
  );
  const [from, setFrom] = useState(initial.from);
  const [kind, setKind] = useState<SuccessRule['kind']>(initial.rule.kind);
  const [operator, setOperator] = useState(
    initial.rule.kind === 'number' ? initial.rule.operator : 'atLeast',
  );
  const [target, setTarget] = useState(
    initial.rule.kind === 'number' ? String(initial.rule.target) : '',
  );
  const [upper, setUpper] = useState(
    initial.rule.kind === 'number' ? String(initial.rule.upper ?? '') : '',
  );
  const [match, setMatch] = useState<'any' | 'all' | 'count'>(
    initial.rule.kind === 'categories' || initial.rule.kind === 'text'
      ? initial.rule.match
      : 'any',
  );
  const [ids, setIds] = useState(
    initial.rule.kind === 'categories' ? initial.rule.ids : [],
  );
  const [exclude, setExclude] = useState(
    initial.rule.kind === 'categories' ? initial.rule.exclude : [],
  );
  const [count, setCount] = useState(
    initial.rule.kind === 'categories' ? String(initial.rule.count ?? 1) : '1',
  );
  const [terms, setTerms] = useState(
    initial.rule.kind === 'text' ? initial.rule.terms.join('\n') : '',
  );
  const [timing, setTiming] = useState<GoalTiming>({
    weekdays: initial.weekdays,
    ...(initial.period ? { period: initial.period } : {}),
    ...(initial.cycle ? { cycle: initial.cycle } : {}),
  });
  const [dateEdited, setDateEdited] = useState(false);
  const parse = parseGoalAmount;
  const rule: SuccessRule =
    kind === 'number'
      ? {
          kind,
          operator,
          target: parse(target),
          ...(operator === 'between' ? { upper: parse(upper) } : {}),
        }
      : kind === 'categories'
        ? {
            kind,
            match,
            ids: match === 'count' ? [] : [...ids].sort(),
            exclude: [...exclude].sort(),
            ...(match === 'count' ? { count: parse(count) } : {}),
          }
        : kind === 'text'
          ? {
              kind,
              match: match === 'all' ? 'all' : 'any',
              terms: terms
                .split('\n')
                .map((term) => term.trim())
                .filter(Boolean),
            }
          : { kind };
  const goal: HabitGoal = resolveGoalDraft(
    habit.goals,
    {
      id: initial.id,
      from,
      rule,
      ...timing,
      ...(type === 'checkbox' &&
      (defaultChecked || initial.defaultChecked !== undefined)
        ? { defaultChecked }
        : {}),
      weekdays: [...timing.weekdays].sort((a, b) => a - b),
    },
    existing,
  );
  const issue = goalDraftIssue(habit, goal);
  const valid = issue === null;
  const changed = !sameValue(
    goal,
    resolveGoalDraft(habit.goals, initial, existing),
  );
  useEffect(() => onDirtyChange(changed), [changed, onDirtyChange]);
  const [exclusionsOpen, setExclusionsOpen] = useState(false);
  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    numeric = true,
  ) => (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        multiline={!numeric}
        maxLength={numeric ? 20 : 2400}
        selectionColor={colour}
        style={styles.input}
      />
    </View>
  );
  const toggle = (items: string[], id: string) =>
    items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
  function chooseCategory(id: string, excluding = false) {
    if (excluding) {
      setExclude((previous) => toggle(previous, id));
      setIds((previous) => previous.filter((item) => item !== id));
    } else {
      setIds((previous) => toggle(previous, id));
      setExclude((previous) => previous.filter((item) => item !== id));
    }
  }
  const categoryChoices = (
    label: string,
    selected: string[],
    onToggle: (id: string) => void,
  ) => (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.wrap}>
        {habit.categories?.map((option) => (
          <Pressable
            key={option.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected.includes(option.id) }}
            aria-checked={selected.includes(option.id)}
            accessibilityLabel={`${label}, ${option.label}${option.archived ? ', archived' : ''}`}
            onPress={() => onToggle(option.id)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: selected.includes(option.id)
                  ? theme.mix(colour, 0.18)
                  : theme.ink(0x22),
                opacity: pressed ? 0.65 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.control,
                selected.includes(option.id) && { color: colour },
              ]}
            >
              {option.label}
              {option.archived ? ' · archived' : ''}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  const excludedLabels = habit.categories
    ?.filter((option) => exclude.includes(option.id))
    .map((option) => option.label)
    .join(' · ');
  const changeTiming = (next: GoalTiming) => {
    setTiming(next);
    if (
      next.period &&
      validPeriod(next.period) &&
      !existing &&
      !creating &&
      !dateEdited &&
      (!timing.period ||
        next.period.days !== timing.period.days ||
        next.period.unit !== timing.period.unit)
    )
      setFrom(nextPeriodStart(next.period, today));
  };
  const dateLabel = (date: string) =>
    validTimingDate(date)
      ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          ...(date.slice(0, 4) !== today.slice(0, 4)
            ? { year: 'numeric' }
            : {}),
        })
      : 'Choose a date';
  const title = existing
    ? initial.from < today
      ? 'Earlier goal'
      : initial.from > today
        ? 'Scheduled goal'
        : 'Edit goal'
    : 'Goal';
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close goal without applying changes"
          onPress={onClose}
          style={styles.action}
        >
          {parentLabel ? (
            <Text style={styles.control}>‹ {parentLabel}</Text>
          ) : (
            <Icon name="close" />
          )}
        </Pressable>
        <Heading style={styles.title}>{title}</Heading>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Apply goal version"
          disabled={!valid || !editable}
          onPress={() => onSave(goal)}
          style={[styles.action, { opacity: valid && editable ? 1 : 0.35 }]}
        >
          <Text style={[styles.control, { color: colour, fontWeight: '600' }]}>
            Done
          </Text>
        </Pressable>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        <View style={styles.identity}>
          <HabitSymbol icon={habit.icon} colour={colour} size={23} />
          <Text style={[styles.habit, { color: colour }]}>{habit.name}</Text>
        </View>
        <GoalSection
          label="Success condition"
          summary={
            validSuccessRule(rule, habit)
              ? `${ruleSummary(habit, rule)}${type === 'checkbox' && defaultChecked ? ' · default On' : ''}`
              : 'Finish this condition'
          }
          expanded={section === 'condition'}
          onPress={() => toggleSection('condition')}
        >
          {type === 'checkbox' ? (
            <>
              <Choices
                direct
                label="Success condition"
                colour={colour}
                value={kind}
                onChange={(value) => setKind(value as SuccessRule['kind'])}
                options={[
                  ['checked', 'Checked'],
                  ['unchecked', 'Unchecked'],
                ]}
              />
              <CheckboxDefaultField
                checked={defaultChecked}
                onChange={setDefaultChecked}
                colour={colour}
              />
            </>
          ) : (
            <Choices
              direct
              label="Success condition"
              colour={colour}
              value={kind}
              onChange={(value) => {
                setKind(value as SuccessRule['kind']);
                if (value === 'none')
                  setTiming(({ period: _period, ...rest }) => rest);
              }}
              options={[
                ['none', 'Track only'],
                [
                  'recorded',
                  type === 'text'
                    ? 'Text entered'
                    : type === 'categorical'
                      ? 'Any selection'
                      : 'Total entered',
                ],
                [
                  type === 'number'
                    ? 'number'
                    : type === 'categorical'
                      ? 'categories'
                      : 'text',
                  type === 'number'
                    ? 'Target'
                    : type === 'categorical'
                      ? 'Match'
                      : 'Match text',
                ],
              ]}
            />
          )}
          {kind === 'number' && (
            <Animated.View entering={appear} style={styles.stack}>
              <Choices
                label="Comparison"
                colour={colour}
                value={operator}
                onChange={(value) => setOperator(value as typeof operator)}
                options={[
                  ['atLeast', 'At least'],
                  ['atMost', 'At most'],
                  ['between', 'Between'],
                  ['exactly', 'Exactly'],
                ]}
              />
              <View style={styles.wrap}>
                <View style={{ flex: 1, minWidth: 100 }}>
                  {field(
                    operator === 'between'
                      ? 'Lower limit'
                      : `Target${habit.unit ? ` (${habit.unit})` : ''}`,
                    target,
                    setTarget,
                  )}
                </View>
                {operator === 'between' && (
                  <View style={{ flex: 1, minWidth: 100 }}>
                    {field('Upper limit', upper, setUpper)}
                  </View>
                )}
              </View>
            </Animated.View>
          )}
          {kind === 'categories' && (
            <Animated.View entering={appear} style={styles.stack}>
              <Choices
                label="Match"
                colour={colour}
                value={match}
                onChange={(value) => setMatch(value as typeof match)}
                options={[
                  ['any', 'Any of'],
                  ['all', 'All of'],
                  ['count', 'At least N'],
                ]}
              />
              {match === 'count'
                ? field('Number selected', count, setCount)
                : categoryChoices('Include', ids, (id) => chooseCategory(id))}
              <View style={styles.divider} />
              <Disclosure
                label="Exclude categories"
                detail={excludedLabels || undefined}
                expanded={exclusionsOpen}
                onPress={() => setExclusionsOpen((previous) => !previous)}
              >
                {categoryChoices('Must not include', exclude, (id) =>
                  chooseCategory(id, true),
                )}
              </Disclosure>
              {habit.categories?.some(
                (option) =>
                  option.archived &&
                  (ids.includes(option.id) || exclude.includes(option.id)),
              ) && (
                <Text style={styles.note}>
                  An archived category is part of this goal.
                </Text>
              )}
            </Animated.View>
          )}
          {kind === 'text' && (
            <Animated.View entering={appear} style={styles.stack}>
              <Choices
                label="Match text"
                colour={colour}
                value={match}
                onChange={(value) => setMatch(value as typeof match)}
                options={[
                  ['any', 'Any phrase'],
                  ['all', 'All phrases'],
                ]}
              />
              {field('Phrases · one per line', terms, setTerms, false)}
              <Text style={styles.note}>Ignores case and extra spaces.</Text>
            </Animated.View>
          )}
        </GoalSection>
        <GoalSection
          label="Repeat"
          summary={
            timing.period
              ? validPeriod(timing.period)
                ? periodSummary(timing.period)
                : 'Finish the period target'
              : scheduleSummary(timing.weekdays) || 'Choose days'
          }
          expanded={section === 'frequency'}
          onPress={() => toggleSection('frequency')}
        >
          <GoalTimingFields
            section="frequency"
            value={timing}
            today={today}
            from={from}
            weekStart={weekStart}
            colour={colour}
            onChange={changeTiming}
          />
        </GoalSection>
        <GoalSection
          label="Cycle"
          summary={
            timing.cycle
              ? validCycle(timing.cycle)
                ? cycleSummary(timing.cycle)
                : 'Finish the cycle'
              : 'None'
          }
          expanded={section === 'cycle'}
          onPress={() => toggleSection('cycle')}
        >
          <GoalTimingFields
            section="cycle"
            value={timing}
            today={today}
            from={from}
            weekStart={weekStart}
            colour={colour}
            onChange={changeTiming}
          />
        </GoalSection>
        <GoalSection
          label="Applies from"
          summary={dateLabel(from)}
          expanded={section === 'date'}
          onPress={() => toggleSection('date')}
        >
          <StartDateField
            label="Apply from"
            help=""
            value={from}
            onChange={(date) => {
              setFrom(date);
              setDateEdited(true);
            }}
            colour={colour}
          />
          {!!timing.period && !existing && !creating && (
            <View style={styles.wrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Apply at next period"
                disabled={!validPeriod(timing.period)}
                accessibilityState={{ disabled: !validPeriod(timing.period) }}
                style={styles.smallAction}
                onPress={() => {
                  setFrom(nextPeriodStart(timing.period!, today));
                  setDateEdited(true);
                }}
              >
                <Text style={styles.note}>Next period</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start new period today"
                style={styles.smallAction}
                onPress={() => {
                  setFrom(today);
                  setDateEdited(true);
                  setTiming((previous) => ({
                    ...previous,
                    period: {
                      ...previous.period!,
                      unit: 'days',
                      anchor: today,
                    },
                  }));
                }}
              >
                <Text style={styles.note}>New period today</Text>
              </Pressable>
            </View>
          )}
          {!!timing.period &&
            Number.isFinite(ordinal(from)) &&
            validPeriod(timing.period) && (
              <Text style={styles.note}>
                First period: {from} –{' '}
                {timingDate(periodWindow(timing.period, from).end)}
                {periodWindow(timing.period, from).start < ordinal(from)
                  ? ' · partial, not scored'
                  : ''}
              </Text>
            )}
          {from < today && (
            <Text style={styles.note}>
              Earlier results in this period will be updated.
            </Text>
          )}
        </GoalSection>
        {!!issue && (
          <Text accessibilityRole="alert" style={styles.error}>
            {issue}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open goal timeline"
          onPress={onTimeline}
          style={({ pressed }) => [
            styles.timelineButton,
            { opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <Icon name="history" size={20} color={theme.ink(0xaa)} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.control}>Goal timeline</Text>
          </View>
          <View style={{ transform: [{ rotate: '-90deg' }] }}>
            <Icon name="chevron" size={16} color={theme.ink(0x77)} />
          </View>
        </Pressable>
        {existing && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove goal version"
            disabled={!editable}
            onPress={onRemove}
            style={styles.action}
          >
            <Text style={styles.destructive}>Remove this goal</Text>
          </Pressable>
        )}
        <InfoNote
          label="How goal changes work"
          text="New goals start on the selected date and preserve earlier goals. Editing an earlier goal changes results only until the next goal starts. Recorded values stay saved. All applied changes can be undone in History."
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const useStyles = themedStyles((t) => ({
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
  smallAction: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  control: { color: t.ink(0xda), fontSize: 14 },
  body: {
    padding: 16,
    paddingTop: 10,
    paddingBottom: 32,
    gap: 12,
    maxWidth: 660,
    width: '100%',
    alignSelf: 'center',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  habit: { fontSize: 16, fontWeight: '500', flexShrink: 1 },
  group: { gap: 8 },
  stack: { gap: 14 },
  label: { color: t.ink(0x99), fontSize: 12 },
  note: { color: t.ink(0x99), fontSize: 12, lineHeight: 17 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: 10,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.ink(0x2a) },
  disclosure: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    minHeight: 44,
    color: t.ink(0xee),
    fontSize: 17,
    padding: 12,
    backgroundColor: t.ink(0x24),
    borderRadius: 10,
  },
  timelineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  error: {
    fontSize: 13,
    lineHeight: 19,
    color: t.colour('#EBAE9F'),
    paddingHorizontal: 4,
  },
  destructive: { fontSize: 14, color: t.danger },
}));
