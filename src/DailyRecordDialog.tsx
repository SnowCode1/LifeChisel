import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type TextProps,
  type TextInput as NativeTextInput,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { randomUUID } from 'expo-crypto';
import {
  SheetScrollProvider,
  SheetScrollView,
  useSwipeDismiss,
} from './SheetModal';
import { Text, TextInput } from './Typography';
import { useKeyboardFocus } from './useKeyboardFocus';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { themedStyles, useTheme } from './ThemeContext';
import type { Habit, HabitCategory } from '@onpurpose/core/habits';
import type { EntryDay } from '@onpurpose/core/calendar';
import {
  categorySelection,
  textEntry,
  MAX_CATEGORIES,
  MAX_CATEGORY_LABEL,
  MAX_ENTRY_TEXT,
  type EntryValue,
} from '@onpurpose/core/entries';
import { feedback } from './haptics';

const motion = {
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};

// A bottom sheet: the backdrop fades while the sheet slides; tapping the
// backdrop or swiping the sheet down closes it like Close (nothing applied). New categories stay drafts
// until Done, which adds them to the habit before saving the entry.
export function DailyRecordDialog({
  habit,
  day,
  value,
  editable,
  Heading,
  onClose,
  onSave,
  onAddCategories,
}: {
  habit: Habit;
  day: EntryDay;
  value: EntryValue | undefined;
  editable: boolean;
  Heading: ComponentType<TextProps>;
  onClose: () => void;
  onSave: (value: EntryValue | null) => boolean;
  onAddCategories?: (categories: HabitCategory[]) => boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [text, setText] = useState(typeof value === 'string' ? value : '');
  const textFocus = useKeyboardFocus<NativeTextInput>();
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(value) ? value : [],
  );
  const [added, setAdded] = useState<HabitCategory[]>([]);
  const [newLabel, setNewLabel] = useState<string | null>(null);
  const newFocus = useKeyboardFocus<NativeTextInput>(newLabel !== null);
  const categorical = habit.type === 'categorical';
  const accent = theme.colour(habit.color);
  const options = [
    ...(habit.categories ?? []).filter(
      (option) =>
        !option.archived || (Array.isArray(value) && value.includes(option.id)),
    ),
    ...added,
  ];
  const canAdd =
    editable &&
    !!onAddCategories &&
    (habit.categories?.length ?? 0) + added.length < MAX_CATEGORIES;

  const progress = useSharedValue(0);
  const leaving = useRef(false);
  useEffect(() => {
    progress.set(withTiming(1, { ...motion, duration: 240 }));
  }, [progress]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  function dismiss() {
    if (leaving.current) return;
    leaving.current = true;
    progress.set(
      withTiming(0, { ...motion, duration: 180 }, (done) => {
        if (done) runOnJS(onClose)();
      }),
    );
  }
  const swipe = useSwipeDismiss(dismiss, 120);
  const { drag } = swipe;
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * height + drag.get() }],
  }));

  function addCategory() {
    const label = (newLabel ?? '').trim();
    if (!label) return;
    const existing = options.find(
      (option) =>
        !option.archived && option.label.toLowerCase() === label.toLowerCase(),
    );
    const id = existing?.id ?? randomUUID();
    if (!existing) setAdded((previous) => [...previous, { id, label }]);
    setSelected((previous) =>
      previous.includes(id) ? previous : [...previous, id],
    );
    setNewLabel(null);
    feedback('selection');
  }
  function done() {
    // Keep only drafts that are still selected; unused ones are discarded.
    const used = added.filter((option) => selected.includes(option.id));
    if (used.length && !onAddCategories?.(used)) return;
    const kept = selected.filter(
      (id) =>
        !added.some((option) => option.id === id) ||
        used.some((option) => option.id === id),
    );
    if (onSave(categorical ? categorySelection(kept) : textEntry(text)))
      dismiss();
  }

  return (
    <Modal
      visible
      animationType="none"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismiss}
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
    >
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.root}>
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <Pressable
              accessible={false}
              importantForAccessibility="no"
              onPress={dismiss}
              style={styles.backdrop}
            />
          </Animated.View>
          <KeyboardAvoidingView
            pointerEvents="box-none"
            style={styles.overlay}
            // The edge-to-edge Android window does not resize for the keyboard.
            behavior="padding"
          >
            <GestureDetector gesture={swipe.gesture}>
              <Animated.View
                style={[styles.sheetFrame, sheetStyle]}
                onTouchStart={swipe.onTouchStart}
              >
                <SafeAreaView
                  edges={['bottom', 'left', 'right']}
                  style={styles.sheet}
                  accessibilityViewIsModal
                >
                  <View
                    importantForAccessibility="no-hide-descendants"
                    style={styles.handleArea}
                  >
                    <View style={styles.handle} />
                  </View>
                  <View style={styles.header}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close entry without applying changes"
                      onPress={dismiss}
                      style={styles.action}
                    >
                      <Icon name="close" />
                    </Pressable>
                    <View style={styles.title}>
                      <Heading
                        numberOfLines={1}
                        style={[styles.name, { color: accent }]}
                      >
                        {habit.name}
                      </Heading>
                      <Text style={styles.date}>{day.fullLabel}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!editable}
                      accessibilityState={{ disabled: !editable }}
                      onPress={done}
                      style={styles.action}
                    >
                      <Text
                        style={[
                          styles.control,
                          { color: accent, opacity: editable ? 1 : 0.35 },
                        ]}
                      >
                        Done
                      </Text>
                    </Pressable>
                  </View>
                  <SheetScrollProvider value={swipe.scroll}>
                    <SheetScrollView
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.body}
                    >
                      {categorical ? (
                        <View style={styles.options}>
                          {options.map((option) => {
                            const checked = selected.includes(option.id);
                            return (
                              <Pressable
                                key={option.id}
                                accessibilityRole="checkbox"
                                aria-checked={checked}
                                accessibilityState={{
                                  checked,
                                  disabled: !editable,
                                }}
                                accessibilityLabel={`${option.label}${option.archived ? ', archived category' : ''}`}
                                disabled={!editable}
                                onPress={() => {
                                  setSelected((previous) =>
                                    previous.includes(option.id)
                                      ? previous.filter(
                                          (id) => id !== option.id,
                                        )
                                      : [...previous, option.id],
                                  );
                                  feedback('selection');
                                }}
                                style={[
                                  styles.option,
                                  {
                                    borderColor: checked
                                      ? `${accent}66`
                                      : theme.ink(0x30),
                                    backgroundColor: checked
                                      ? theme.mix(accent, 0.15)
                                      : theme.ink(0x19),
                                  },
                                ]}
                              >
                                <Icon
                                  name={checked ? 'checked' : 'unchecked'}
                                  color={checked ? accent : theme.ink(0x77)}
                                  size={18}
                                />
                                <Text
                                  style={[
                                    styles.optionLabel,
                                    {
                                      color: checked ? accent : theme.ink(0xc0),
                                    },
                                  ]}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                          {canAdd && newLabel === null && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Add a new category"
                              onPress={() => setNewLabel('')}
                              style={[styles.option, styles.addOption]}
                            >
                              <Icon
                                name="plus"
                                color={theme.ink(0x90)}
                                size={18}
                              />
                              <Text
                                style={[styles.optionLabel, styles.addLabel]}
                              >
                                New category
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      ) : (
                        <TextInput
                          {...textFocus}
                          editable={editable}
                          multiline
                          scrollEnabled
                          accessibilityLabel={`Daily text for ${habit.name}`}
                          value={text}
                          onChangeText={setText}
                          maxLength={MAX_ENTRY_TEXT}
                          selectionColor={accent}
                          placeholder="Write an entry…"
                          placeholderTextColor={theme.ink(0x66)}
                          style={styles.input}
                          textAlignVertical="top"
                        />
                      )}
                      {categorical && newLabel !== null && (
                        <View style={styles.newRow}>
                          <TextInput
                            {...newFocus}
                            accessibilityLabel="New category name"
                            value={newLabel}
                            onChangeText={setNewLabel}
                            onSubmitEditing={addCategory}
                            submitBehavior="submit"
                            returnKeyType="done"
                            maxLength={MAX_CATEGORY_LABEL}
                            selectionColor={accent}
                            placeholder="Category name"
                            placeholderTextColor={theme.ink(0x66)}
                            style={styles.newInput}
                          />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Cancel new category"
                            onPress={() => setNewLabel(null)}
                            style={styles.newAction}
                          >
                            <Text style={styles.control}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Add category"
                            disabled={!newLabel.trim()}
                            accessibilityState={{ disabled: !newLabel.trim() }}
                            onPress={addCategory}
                            style={styles.newAction}
                          >
                            <Text
                              style={[
                                styles.control,
                                {
                                  color: accent,
                                  opacity: newLabel.trim() ? 1 : 0.35,
                                },
                              ]}
                            >
                              Add
                            </Text>
                          </Pressable>
                        </View>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Clear daily entry"
                        disabled={
                          !editable ||
                          (categorical ? !selected.length : !text.length)
                        }
                        onPress={() => {
                          setText('');
                          setSelected([]);
                        }}
                        style={styles.clear}
                      >
                        <Icon name="erase" size={17} color={theme.ink(0x90)} />
                        <Text style={styles.clearLabel}>Clear entry</Text>
                      </Pressable>
                    </SheetScrollView>
                  </SheetScrollProvider>
                </SafeAreaView>
              </Animated.View>
            </GestureDetector>
          </KeyboardAvoidingView>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
}
const useStyles = themedStyles((t) => ({
  root: { flex: 1 },
  handleArea: { height: 14, alignItems: 'center', justifyContent: 'center' },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.ink(0x3a),
  },
  backdrop: { flex: 1, backgroundColor: t.scrim(0x99) },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheetFrame: {
    maxHeight: '85%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  sheet: {
    backgroundColor: t.ink(0x10),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 4,
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  action: { minHeight: 48, minWidth: 44, justifyContent: 'center' },
  control: { color: t.ink(0xb8), fontSize: 15 },
  title: { flex: 1, gap: 3, alignItems: 'center' },
  name: { fontSize: 17, fontWeight: '600' },
  date: { fontSize: 11, color: t.ink(0x81), textAlign: 'center' },
  body: { padding: 20, paddingBottom: 24, gap: 12 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  optionLabel: { fontSize: 15, flexShrink: 1 },
  addOption: {
    borderColor: t.ink(0x3a),
    borderStyle: 'dashed',
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  addLabel: { color: t.ink(0xa0) },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  newInput: {
    flex: 1,
    color: t.ink(0xdd),
    backgroundColor: t.ink(0x19),
    borderRadius: 13,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 15,
  },
  newAction: {
    minHeight: 48,
    minWidth: 52,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    color: t.ink(0xdd),
    backgroundColor: t.ink(0x19),
    borderRadius: 14,
    padding: 14,
    fontSize: 17,
    minHeight: 160,
    maxHeight: 320,
  },
  clear: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center' },
  clearLabel: { color: t.ink(0x90), fontSize: 13 },
}));
