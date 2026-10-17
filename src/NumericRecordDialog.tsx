import { useEffect, useMemo, useState, type ComponentType } from 'react';
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
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text, TextInput } from './Typography';
import { Icon } from './Icon';
import { useKeyboardFocus } from './useKeyboardFocus';
import { dateRangeLabel, type EntryDay } from '@onpurpose/core/calendar';
import { parseDailyTotal, type EntryValues } from '@onpurpose/core/entries';
import type { Habit } from '@onpurpose/core/habits';
import { checkmarkColor } from '@onpurpose/core/colors';
import { themedStyles, useTheme } from './ThemeContext';
import { feedback } from './haptics';
import { recentNumericTotals } from '@onpurpose/core/numericSuggestions';

// Key the dialog by habit/date. Typing stays local; Done reads the latest store
// precondition through onSave, and Close discards this uncommitted draft.
// Close (top right) and Done (beside the field) stay above the keyboard; the
// iOS decimal pad has no return key of its own.
export function NumericRecordDialog({
  habit,
  day,
  initialValue,
  values,
  fillDates,
  editable,
  Heading,
  onClose,
  onSave,
}: {
  habit: Habit;
  day: EntryDay;
  initialValue: number | null;
  values: EntryValues;
  /** A fill: Done sets every one of these dates (drawn along the grid). */
  fillDates?: string[];
  editable: boolean;
  Heading: ComponentType<TextProps>;
  onClose: () => void;
  onSave: (value: number | null) => boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const inputFocus = useKeyboardFocus<NativeTextInput>();
  const [input, setInput] = useState(
    initialValue === null ? '' : String(initialValue),
  );
  const parsed = parseDailyTotal(input);
  const valid = parsed.valid;
  const current = parsed.valid ? parsed.value : null;
  const suggestedTotals = useMemo(
    () => recentNumericTotals(values, habit.id, day.key),
    [values, habit.id, day.key],
  );
  const accent = theme.colour(habit.color);
  // Number cells open shortly after a tap (so a second press can draw a
  // fill); the card eases in as the backdrop fades rather than appearing.
  const reducedMotion = useReducedMotion();
  const entrance = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    entrance.set(
      withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
    );
  }, [entrance]);
  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.get(),
    transform: [
      { translateY: (1 - entrance.get()) * 12 },
      { scale: 0.96 + entrance.get() * 0.04 },
    ],
  }));
  function saveNumber() {
    if (!valid || !editable) return;
    if (onSave(current)) onClose();
  }
  return (
    <Modal
      visible
      animationType="fade"
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View
          accessibilityViewIsModal
          style={[styles.dialog, entranceStyle]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>DAILY TOTAL</Text>
                <Heading style={[styles.dialogTitle, { color: accent }]}>
                  {habit.name}
                </Heading>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                accessibilityHint="Closes without saving this total"
                onPress={onClose}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.close,
                  { opacity: pressed ? 0.5 : 1 },
                ]}
              >
                <Icon name="close" />
              </Pressable>
            </View>
            <>
              <Text style={styles.secondary}>
                {fillDates ? dateRangeLabel(fillDates) : day.fullLabel}
              </Text>
              <View style={styles.inputRow}>
                <View style={styles.field}>
                  <TextInput
                    {...inputFocus}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    accessibilityLabel={`Daily total${habit.unit ? ` in ${habit.unit}` : ''}`}
                    value={input}
                    onChangeText={setInput}
                    onSubmitEditing={saveNumber}
                    selectionColor={accent}
                    placeholder="0"
                    placeholderTextColor={theme.ink(0x55)}
                    style={[
                      styles.input,
                      { color: accent, borderColor: `${accent}66` },
                    ]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !valid || !editable }}
                    disabled={!valid || !editable}
                    onPress={saveNumber}
                    style={({ pressed }) => [
                      styles.done,
                      {
                        backgroundColor: accent,
                        opacity: !valid || !editable ? 0.4 : pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.doneText,
                        { color: checkmarkColor(accent) },
                      ]}
                    >
                      Done
                    </Text>
                  </Pressable>
                </View>
                <Text style={[styles.inputUnit, { color: accent }]}>
                  {habit.unit}
                </Text>
              </View>
              {!!suggestedTotals.length && (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  {suggestedTotals.map((total) => (
                    <Pressable
                      key={total}
                      accessibilityRole="button"
                      accessibilityLabel={`Use recent total ${total}${habit.unit ? ` ${habit.unit}` : ''}`}
                      accessibilityState={{
                        selected: current === total,
                      }}
                      onPress={() => {
                        setInput(String(total));
                        feedback('selection');
                      }}
                      style={{
                        minHeight: 44,
                        minWidth: 52,
                        paddingHorizontal: 14,
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderRadius: 10,
                        backgroundColor:
                          current === total ? `${accent}22` : theme.ink(0x1c),
                      }}
                    >
                      <Text
                        style={{
                          color: accent,
                          fontSize: 16,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {total}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <Text style={styles.secondary}>
                {!valid
                  ? 'Enter a number of zero or more.'
                  : fillDates
                    ? 'Leave blank to clear these days.'
                    : 'Leave blank to clear this entry.'}
              </Text>
            </>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = themedStyles((t) => ({
  overlay: {
    flex: 1,
    backgroundColor: t.scrim(0xbb),
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: t.ink(0x10),
    borderColor: t.ink(0x2a),
    borderWidth: 1,
    padding: 24,
    borderRadius: 24,
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    alignSelf: 'center',
  },
  eyebrow: {
    color: t.ink(0x92),
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  dialogTitle: { fontSize: 26, fontWeight: '600', marginBottom: 12 },
  secondary: { color: t.ink(0xa1), fontSize: 13, lineHeight: 21 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  close: {
    width: 44,
    height: 44,
    marginTop: -10,
    marginRight: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: { marginVertical: 20 },
  field: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 14,
    fontSize: 36,
    padding: 16,
  },
  done: {
    minWidth: 84,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontSize: 17, fontWeight: '600' },
  inputUnit: { fontSize: 12, marginTop: 8 },
}));
