import { CheckboxDefaultField } from './CheckboxDefaultField';
import {
  checkboxChecked,
  withCheckboxDefault,
} from '@onpurpose/core/habitGoals';
import { randomUUID } from 'expo-crypto';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import { CategoryEditor } from './CategoryEditor';
import { HabitGoalsEditor } from './HabitGoalsEditor';
import { GoalSummary } from './GoalSummary';
import { validGoalTimeline, type HabitGoal } from '@onpurpose/core/habitGoals';
import { TextInput, Text, useAppWindowDimensions } from './Typography';
import { completeDescriptionDraft } from '@onpurpose/core/storage/descriptionBookmarks';
import { DescriptionEditor } from './DescriptionEditor';
import { descriptionExcerpt } from '@onpurpose/core/descriptionReading';
import { draftsFor, descriptionDraftKey } from './descriptionDrafts';
import { StartDateField } from './StartDateField';
import { useKeyboardFocus } from './useKeyboardFocus';
import { validDate } from '@onpurpose/core/storage/model';
import { useMemo, useState, type ComponentType } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  type TextProps,
  type TextInput as NativeTextInput,
} from 'react-native';
import { ColourPicker } from './ColourPicker';
import { normalizeHex } from '@onpurpose/core/colors';
import { themedStyles, useTheme } from './ThemeContext';
import {
  habitType,
  habitTypeLabel,
  type Habit,
  type HabitType,
} from '@onpurpose/core/habits';
import { Icon } from './Icon';
import { HabitIconPicker } from './HabitIconPicker';
import { HabitSymbol } from './HabitSymbol';
import { habitIconLabel, type HabitIcon } from '@onpurpose/core/habitIcons';

export type HabitDialogMode = 'colour' | 'edit' | 'create';
export function HabitDialog({
  temporary,
  habit,
  initialStartDate,
  weekStart,
  today,
  mode,
  Heading,
  onClose,
  onSave,
  onColour,
  editable,
}: {
  temporary: boolean;
  habit: Habit;
  initialStartDate: string;
  weekStart: WeekStart;
  today: string;
  mode: HabitDialogMode;
  Heading: ComponentType<TextProps>;
  onClose: () => void;
  onSave: (habit: Habit) => boolean;
  onColour: (colour: string) => boolean;
  editable: boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const [description, setDescription] = useState(habit.description);
  const descriptionText = useMemo(
    () => descriptionExcerpt(description ?? ''),
    [description],
  );
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const draftKey = descriptionDraftKey(
    mode === 'create' ? undefined : habit.id,
  );
  function discard() {
    if (mode !== 'colour')
      void draftsFor(temporary)
        .remove(draftKey)
        .catch(() => {});
    onClose();
  }
  const { fontScale } = useAppWindowDimensions();
  const [startDate, setStartDate] = useState(
    habit.startDate ?? initialStartDate,
  );
  const nameFocus = useKeyboardFocus<NativeTextInput>(mode === 'create');
  const [name, setName] = useState(habit.name),
    [unit, setUnit] = useState(habit.unit ?? ''),
    [type, setType] = useState<HabitType>(habitType(habit));
  const numeric = type === 'number';
  const [categories, setCategories] = useState(habit.categories ?? []);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [goals, setGoals] = useState<HabitGoal[] | undefined>(habit.goals);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [colour, setColour] = useState(habit.color),
    [picker, setPicker] = useState(false),
    [pickerDraft, setPickerDraft] = useState(habit.color);
  // Display only: drafts and saves keep the raw choice. An incomplete hex
  // typed in colour mode passes through unchanged, as before.
  const displayColour = normalizeHex(colour) ? theme.colour(colour) : colour;
  const [icon, setIcon] = useState(habit.icon);
  const [iconPicker, setIconPicker] = useState(false);
  const [iconDraft, setIconDraft] = useState<HabitIcon | undefined | null>(
    habit.icon,
  );
  const goalHabit: Habit = {
    ...habit,
    name: name.trim() || 'New habit',
    color: colour,
    icon,
    startDate,
    type,
    unit: numeric ? unit : undefined,
    categories: type === 'categorical' ? categories : undefined,
    goals,
  };
  const valid =
    validDate(startDate) &&
    !!name.trim() &&
    name.trim().length <= 200 &&
    unit.trim().length <= 80 &&
    (!goals || validGoalTimeline(goals, goalHabit)) &&
    (type !== 'categorical' ||
      (categories.length > 0 && categories.some((option) => !option.archived)));
  const editing = mode === 'edit' || mode === 'create';
  function save() {
    const {
      unit: _unit,
      icon: _icon,
      description: _description,
      categories: _categories,
      goals: _goals,
      ...base
    } = habit;
    const after: Habit = {
      ...base,
      name: name.trim(),
      ...(startDate !== initialStartDate || habit.startDate || mode === 'create'
        ? { startDate }
        : {}),
      ...(description ? { description } : {}),
      color: colour,
      ...(icon ? { icon } : {}),
      ...(numeric && unit.trim() ? { unit: unit.trim() } : {}),
      type,
      ...(type === 'categorical' ? { categories } : {}),
      ...(goals ? { goals } : {}),
    };
    if (onSave(after)) {
      void completeDescriptionDraft(
        draftsFor(temporary),
        draftKey,
        description ?? '',
        descriptionDraftKey(habit.id),
      ).catch(() => {});
      onClose();
    }
  }
  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { opacity: disabled ? 0.35 : 1 }]}
    >
      <Text
        style={[styles.buttonText, { color: displayColour, fontWeight: '600' }]}
      >
        {label}
      </Text>
    </Pressable>
  );
  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType="slide"
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      onRequestClose={discard}
    >
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
          <KeyboardAvoidingView
            style={styles.overlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.dialog} accessibilityViewIsModal>
              <View style={styles.header}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close without applying changes"
                  onPress={() => {
                    if (iconPicker) setIconPicker(false);
                    else if (picker) setPicker(false);
                    else discard();
                  }}
                  style={styles.headerAction}
                >
                  {iconPicker || picker ? (
                    <Text style={styles.buttonText}>
                      ‹ {mode === 'create' ? 'New habit' : 'Edit habit'}
                    </Text>
                  ) : (
                    <Icon name="close" />
                  )}
                </Pressable>
                <Heading style={styles.eyebrow}>
                  {iconPicker
                    ? 'Icon'
                    : picker || mode === 'colour'
                      ? 'Colour'
                      : mode === 'create'
                        ? 'New habit'
                        : 'Edit habit'}
                </Heading>
                {(editing || mode === 'colour' || picker) && (
                  <View style={styles.headerDone}>
                    {button(
                      'Done',
                      () => {
                        if (iconPicker) {
                          if (iconDraft !== null) {
                            setIcon(iconDraft);
                            setIconPicker(false);
                          }
                        } else if (picker) {
                          setColour(pickerDraft);
                          setPicker(false);
                        } else if (mode === 'colour') {
                          if (onColour(colour)) onClose();
                        } else save();
                      },
                      !editable ||
                        (iconPicker && iconDraft === null) ||
                        ((picker || mode === 'colour') &&
                          !/^#[0-9a-f]{6}$/i.test(
                            picker ? pickerDraft : colour,
                          )) ||
                        (editing && !picker && !iconPicker && !valid),
                    )}
                  </View>
                )}
              </View>
              {(mode === 'colour' || picker || iconPicker) && (
                <Heading
                  style={[styles.title, { color: theme.colour(habit.color) }]}
                >
                  {habit.name}
                </Heading>
              )}
              {iconPicker ? (
                <HabitIconPicker
                  icon={icon}
                  colour={displayColour}
                  onChange={setIconDraft}
                />
              ) : (
                <ScrollView
                  key={picker ? 'colour' : 'form'}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 24 }}
                >
                  {mode === 'colour' || picker ? (
                    <ColourPicker
                      color={picker ? colour : habit.color}
                      onChange={(value) => {
                        if (picker) setPickerDraft(value ?? '');
                        else setColour(value ?? '');
                      }}
                    />
                  ) : editing ? (
                    <View style={{ gap: 18 }}>
                      <View>
                        <Text style={styles.label}>Name</Text>
                        <TextInput
                          {...nameFocus}
                          accessibilityLabel="Habit name"
                          maxLength={200}
                          value={name}
                          onChangeText={setName}
                          style={styles.input}
                          selectionColor={displayColour}
                          placeholder="Read a little"
                          placeholderTextColor={theme.ink(0x66)}
                        />
                      </View>
                      {mode === 'create' ? (
                        <View>
                          <Text style={styles.label}>Record as</Text>
                          <View style={styles.types}>
                            {(
                              [
                                'checkbox',
                                'number',
                                'categorical',
                                'text',
                              ] as const
                            ).map((value) => (
                              <Pressable
                                key={value}
                                accessibilityRole="button"
                                accessibilityState={{
                                  selected: type === value,
                                }}
                                onPress={() => {
                                  if (value === type) return;
                                  setType(value);
                                  setGoals(undefined);
                                }}
                                style={[
                                  styles.type,
                                  {
                                    flexBasis: 130 * Math.max(1, fontScale),
                                    flexGrow: 1,
                                  },
                                  {
                                    backgroundColor:
                                      type === value
                                        ? theme.ink(0x30)
                                        : theme.ink(0x18),
                                  },
                                ]}
                              >
                                <Icon
                                  name={
                                    value === 'number'
                                      ? 'number'
                                      : value === 'checkbox'
                                        ? 'checked'
                                        : value === 'categorical'
                                          ? 'categories'
                                          : 'text'
                                  }
                                  size={18}
                                />
                                <Text style={styles.buttonText}>
                                  {habitTypeLabel({ ...habit, type: value })}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      ) : (
                        <Text style={styles.description}>
                          {habitTypeLabel({ ...habit, type })} · Type is set
                          when creating a habit.
                        </Text>
                      )}
                      {type === 'categorical' && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Edit categories"
                          onPress={() => setCategoriesOpen(true)}
                          style={styles.descriptionControl}
                        >
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={styles.buttonText}>Categories</Text>
                            <Text numberOfLines={1} style={styles.description}>
                              {categories.length
                                ? categories
                                    .filter((option) => !option.archived)
                                    .map((option) => option.label)
                                    .join(' · ')
                                : 'Add the options you want to track'}
                            </Text>
                          </View>
                          <Icon name="edit" size={17} color={theme.ink(0x88)} />
                        </Pressable>
                      )}
                      {numeric && (
                        <View>
                          <Text style={styles.label}>Unit · optional</Text>
                          <TextInput
                            accessibilityLabel="Habit unit"
                            value={unit}
                            maxLength={80}
                            onChangeText={setUnit}
                            style={styles.input}
                            placeholder="minutes, pages, glasses…"
                            placeholderTextColor={theme.ink(0x66)}
                          />
                        </View>
                      )}
                      {type === 'checkbox' && (
                        <CheckboxDefaultField
                          checked={checkboxChecked(
                            goalHabit,
                            undefined,
                            mode === 'create' ? startDate : today,
                          )}
                          colour={displayColour}
                          detail={
                            mode === 'create'
                              ? 'From the start date'
                              : 'From today'
                          }
                          onChange={(checked) =>
                            setGoals(
                              withCheckboxDefault(
                                goalHabit,
                                mode === 'create' ? startDate : today,
                                checked,
                                randomUUID(),
                              ),
                            )
                          }
                        />
                      )}
                      <GoalSummary
                        habit={goalHabit}
                        date={mode === 'create' ? startDate : today}
                        disabled={
                          !editable ||
                          (type === 'categorical' && !categories.length)
                        }
                        onPress={() => setGoalsOpen(true)}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          description ? 'Edit description' : 'Add description'
                        }
                        onPress={() => setDescriptionOpen(true)}
                        style={({ pressed }) => [
                          styles.descriptionControl,
                          { opacity: pressed ? 0.6 : 1 },
                        ]}
                      >
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text style={styles.buttonText}>Description</Text>
                          <Text numberOfLines={2} style={styles.description}>
                            {description
                              ? descriptionText
                              : 'Notes, motivation or a link · optional'}
                          </Text>
                        </View>
                        <Icon name="edit" size={17} color={theme.ink(0x88)} />
                      </Pressable>
                      <StartDateField
                        value={startDate}
                        onChange={setStartDate}
                        colour={displayColour}
                        weekStart={weekStart}
                      />
                      <View style={styles.appearance}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Habit icon, ${habitIconLabel(icon)}`}
                          accessibilityHint="Choose an icon or emoji"
                          onPress={() => {
                            setIconDraft(icon);
                            setIconPicker(true);
                          }}
                          style={({ pressed }) => [
                            styles.appearanceButton,
                            { flexBasis: 120 * fontScale },
                            pressed && styles.appearancePressed,
                          ]}
                        >
                          <View style={styles.appearancePreview}>
                            {icon ? (
                              <HabitSymbol
                                icon={icon}
                                colour={displayColour}
                                size={23}
                              />
                            ) : (
                              <Text
                                style={[
                                  styles.noIcon,
                                  { color: displayColour },
                                ]}
                              >
                                +
                              </Text>
                            )}
                          </View>
                          <Text style={styles.buttonText}>Icon</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Habit colour, ${colour}`}
                          accessibilityHint="Choose a colour"
                          onPress={() => {
                            setPickerDraft(colour);
                            setPicker(true);
                          }}
                          style={({ pressed }) => [
                            styles.appearanceButton,
                            { flexBasis: 120 * fontScale },
                            pressed && styles.appearancePressed,
                          ]}
                        >
                          <View style={styles.appearancePreview}>
                            <View
                              style={[
                                styles.colourSwatch,
                                { backgroundColor: displayColour },
                              ]}
                            />
                          </View>
                          <Text style={styles.buttonText}>Colour</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </ScrollView>
              )}
            </View>
            {categoriesOpen && (
              <CategoryEditor
                categories={categories}
                colour={displayColour}
                onClose={() => setCategoriesOpen(false)}
                onApply={(next) => {
                  setCategories(next);
                  setCategoriesOpen(false);
                }}
              />
            )}
            {goalsOpen && (
              <HabitGoalsEditor
                weekStart={weekStart}
                creating={mode === 'create'}
                parentLabel={mode === 'create' ? 'New habit' : 'Edit habit'}
                habit={goalHabit}
                today={today}
                initialDate={mode === 'create' ? startDate : today}
                editable={editable}
                Heading={Heading}
                onClose={() => setGoalsOpen(false)}
                onApply={(next) => {
                  setGoals(next);
                  return true;
                }}
              />
            )}
            {descriptionOpen && (
              <DescriptionEditor
                title={name || 'New habit'}
                colour={displayColour}
                initialValue={description ?? ''}
                baseValue={habit.description ?? ''}
                draftKey={draftKey}
                temporary={temporary}
                keepDraftOnApply
                editable={editable}
                Heading={Heading}
                onApply={(value) => {
                  setDescription(value);
                  return true;
                }}
                onClose={() => setDescriptionOpen(false)}
              />
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const useStyles = themedStyles((t) => ({
  overlay: { flex: 1, backgroundColor: t.background },
  dialog: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 56,
  },
  headerAction: { minHeight: 44, justifyContent: 'center', flexShrink: 1 },
  headerDone: { minWidth: 55 },
  eyebrow: {
    color: t.ink(0xee),
    fontSize: 17,
    fontWeight: '600',
    flexShrink: 1,
  },
  title: { fontSize: 26, fontWeight: '600', marginBottom: 18 },
  label: { color: t.ink(0xaa), fontSize: 12, marginBottom: 8 },
  description: { color: t.ink(0x99), fontSize: 12, lineHeight: 18 },
  input: {
    backgroundColor: t.ink(0x1c),
    borderRadius: 12,
    padding: 14,
    fontSize: 17,
    color: t.ink(0xe5),
  },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
  },
  buttonText: { color: t.ink(0xdd), fontSize: 15, fontWeight: '500' },
  descriptionControl: {
    minHeight: 60,
    backgroundColor: t.ink(0x1c),
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appearance: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  appearanceButton: {
    flexGrow: 1,
    flexBasis: 120,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.ink(0x1c),
    borderRadius: 12,
  },
  appearancePressed: { backgroundColor: t.ink(0x30) },
  appearancePreview: {
    width: 26,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colourSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: t.overlay(0x30),
  },
  noIcon: { fontSize: 24, lineHeight: 28 },
  types: { flexWrap: 'wrap', flexDirection: 'row', gap: 8 },
  type: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 10,
  },
}));
