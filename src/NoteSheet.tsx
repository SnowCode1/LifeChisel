import { useEffect, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type TextInput as NativeTextInput,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  availablePresets,
  MAX_NOTE_TITLE,
  normalizeNoteTitle,
  noteTitleProblem,
  type HabitNote,
} from '@onpurpose/core/notes';
import { Icon } from './Icon';
import { themedStyles, useTheme } from './ThemeContext';
import { Text, TextInput } from './Typography';
import { useKeyboardFocus } from './useKeyboardFocus';

export type NoteSheetMode =
  | { kind: 'add' }
  | { kind: 'rename'; note: HabitNote }
  | { kind: 'actions'; note: HabitNote };

// One small sheet for a habit's notes: name a new note (a preset or your own
// name), rename one, or act on one. Presets are only suggested names. It is
// an overlay inside the habit sheet rather than another native modal, so the
// note editor can present the moment it closes.
export function NoteSheet({
  mode,
  notes,
  colour,
  onPick,
  onRename,
  onMove,
  onRemove,
  onClose,
}: {
  mode: NoteSheetMode;
  notes: readonly HabitNote[];
  colour: string;
  /** A title chosen for a new note, or the new title of a renamed one. */
  onPick: (title: string) => void;
  onRename: (note: HabitNote) => void;
  onMove: (note: HabitNote, direction: -1 | 1) => void;
  onRemove: (note: HabitNote) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const renaming = mode.kind === 'rename' ? mode.note : null;
  const [name, setName] = useState(renaming?.title ?? '');
  const focus = useKeyboardFocus<NativeTextInput>(mode.kind === 'rename');
  const problem = name.trim()
    ? noteTitleProblem(notes, name, renaming?.id)
    : null;
  const unchanged =
    renaming !== null && normalizeNoteTitle(name) === renaming.title;
  const canSave = !!name.trim() && !problem && !unchanged;
  const save = () => {
    if (canSave) onPick(normalizeNoteTitle(name));
  };
  const index =
    mode.kind === 'actions'
      ? notes.findIndex((note) => note.id === mode.note.id)
      : -1;
  const presets = mode.kind === 'actions' ? [] : availablePresets(notes);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => back.remove();
  }, [onClose]);
  const heading =
    mode.kind === 'add'
      ? 'New note'
      : mode.kind === 'rename'
        ? 'Rename note'
        : mode.note.title;

  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      style={StyleSheet.absoluteFill}
    >
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, styles.backdrop]}
      />
      <KeyboardAvoidingView
        pointerEvents="box-none"
        behavior="padding"
        style={styles.overlay}
      >
        <SafeAreaView
          edges={['bottom', 'left', 'right']}
          style={styles.sheet}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={styles.action}
            >
              <Icon name="close" />
            </Pressable>
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={styles.heading}
            >
              {heading}
            </Text>
            <View style={styles.action} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.body}
          >
            {mode.kind === 'actions' ? (
              <>
                <SheetRow
                  label="Rename"
                  icon="edit"
                  onPress={() => onRename(mode.note)}
                />
                <SheetRow
                  label="Move earlier"
                  disabled={index <= 0}
                  onPress={() => onMove(mode.note, -1)}
                />
                <SheetRow
                  label="Move later"
                  disabled={index < 0 || index >= notes.length - 1}
                  onPress={() => onMove(mode.note, 1)}
                />
                <SheetRow
                  label="Remove note"
                  icon="erase"
                  danger
                  onPress={() => onRemove(mode.note)}
                />
              </>
            ) : (
              <>
                <View style={styles.custom}>
                  <TextInput
                    {...focus}
                    value={name}
                    onChangeText={setName}
                    onSubmitEditing={save}
                    returnKeyType="done"
                    maxLength={MAX_NOTE_TITLE}
                    placeholder={
                      mode.kind === 'add' ? 'Your own name' : 'Note name'
                    }
                    placeholderTextColor={theme.ink(0x70)}
                    accessibilityLabel="Note name"
                    style={styles.input}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      mode.kind === 'add' ? 'Add note' : 'Save name'
                    }
                    accessibilityState={{ disabled: !canSave }}
                    disabled={!canSave}
                    onPress={save}
                    style={[styles.save, { opacity: canSave ? 1 : 0.35 }]}
                  >
                    <Text style={{ color: colour, fontSize: 15 }}>
                      {mode.kind === 'add' ? 'Add' : 'Save'}
                    </Text>
                  </Pressable>
                </View>
                {problem && (
                  <Text accessibilityLiveRegion="polite" style={styles.problem}>
                    {problem}
                  </Text>
                )}
                {presets.length > 0 && (
                  <Text style={styles.section}>
                    {mode.kind === 'add' ? 'Suggestions' : 'Or choose'}
                  </Text>
                )}
                {presets.map((preset) => (
                  <Pressable
                    key={preset.title}
                    accessibilityRole="button"
                    accessibilityLabel={`${preset.title}. ${preset.hint}`}
                    onPress={() => onPick(preset.title)}
                    style={({ pressed }) => [
                      styles.preset,
                      pressed && { backgroundColor: theme.ink(0x1f) },
                    ]}
                  >
                    <Text style={styles.presetTitle}>{preset.title}</Text>
                    <Text style={styles.presetHint}>{preset.hint}</Text>
                  </Pressable>
                ))}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

function SheetRow({
  label,
  icon,
  danger,
  disabled,
  onPress,
}: {
  label: string;
  icon?: 'edit' | 'erase';
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const colour = danger ? theme.danger : theme.ink(0xdd);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { opacity: disabled ? 0.35 : 1 },
        pressed && { backgroundColor: theme.ink(0x1f) },
      ]}
    >
      <Text style={[styles.rowLabel, { color: colour }]}>{label}</Text>
      {icon && <Icon name={icon} color={colour} />}
    </Pressable>
  );
}

const useStyles = themedStyles((t) => ({
  backdrop: { backgroundColor: t.scrim(0x99) },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '85%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    backgroundColor: t.ink(0x10),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  action: { minHeight: 48, minWidth: 44, justifyContent: 'center' },
  heading: {
    flex: 1,
    textAlign: 'center',
    color: t.ink(0xdd),
    fontSize: 17,
    fontWeight: '600',
  },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 4 },
  custom: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: {
    flex: 1,
    color: t.ink(0xdd),
    backgroundColor: t.ink(0x19),
    borderRadius: 13,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 15,
  },
  save: {
    minHeight: 48,
    minWidth: 52,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  problem: { color: t.danger, fontSize: 13, paddingHorizontal: 4 },
  section: {
    color: t.ink(0x88),
    fontSize: 12,
    marginTop: 14,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  preset: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 2,
    minHeight: 48,
    justifyContent: 'center',
  },
  presetTitle: { color: t.ink(0xdd), fontSize: 15, fontWeight: '600' },
  presetHint: { color: t.ink(0x92), fontSize: 13, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  rowLabel: { fontSize: 16 },
}));
