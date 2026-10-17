import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MAX_NOTES, noteHint, type HabitNote } from '@onpurpose/core/notes';
import { DescriptionReader } from './DescriptionReader';
import { Icon } from './Icon';
import { themedStyles, useTheme } from './ThemeContext';
import { Text } from './Typography';

// The Notes page: a wrapping row of note names above the chosen note. The
// row wraps rather than scrolling sideways, so it never competes with the
// Notes/Statistics pager. Every action also has a visible control.
export const HabitNotes = memo(function HabitNotes({
  notes,
  selected,
  colour,
  editable,
  onSelect,
  onAdd,
  onEdit,
  onVersions,
  onActions,
  bottomInset,
}: {
  notes: readonly HabitNote[];
  /** The shown note, or undefined when the habit has none. */
  selected: HabitNote | undefined;
  colour: string;
  editable: boolean;
  onSelect: (note: HabitNote) => void;
  onAdd: () => void;
  onEdit: (note: HabitNote) => void;
  onVersions?: (note: HabitNote) => void;
  onActions: (note: HabitNote) => void;
  bottomInset: number;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const header = notes.length ? (
    <View style={styles.header}>
      <View accessibilityRole="tablist" style={styles.chips}>
        {notes.map((note) => {
          const active = note.id === selected?.id;
          return (
            <Pressable
              key={note.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              aria-selected={active}
              accessibilityLabel={`${note.title} note`}
              accessibilityHint="Hold for note actions"
              onPress={() => onSelect(note)}
              onLongPress={editable ? () => onActions(note) : undefined}
              style={[
                styles.chip,
                active
                  ? { backgroundColor: theme.mix(colour, 0.16) }
                  : { borderColor: theme.ink(0x30) },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.chipText,
                  { color: active ? colour : theme.ink(0xb0) },
                ]}
              >
                {note.title}
              </Text>
            </Pressable>
          );
        })}
        {editable && notes.length < MAX_NOTES && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a note"
            onPress={onAdd}
            style={[styles.chip, styles.add]}
          >
            <Icon name="plus" size={16} color={theme.ink(0xa0)} />
          </Pressable>
        )}
      </View>
      {selected && (
        <View style={styles.actions}>
          {onVersions && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Previous versions of ${selected.title}`}
              onPress={() => onVersions(selected)}
              style={styles.action}
            >
              <Text style={styles.actionText}>Versions</Text>
            </Pressable>
          )}
          {editable && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${selected.title} note actions`}
              onPress={() => onActions(selected)}
              style={styles.action}
            >
              <Text style={styles.actionText}>Rename or move</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  ) : undefined;
  return (
    <DescriptionReader
      // A fresh list per note keeps each note's passages and scroll apart.
      key={selected?.id ?? 'none'}
      description={selected?.text}
      colour={colour}
      editable={editable}
      header={header}
      emptyText={selected ? noteHint(selected.title) : 'No notes yet.'}
      emptyAction={selected ? 'Write' : 'Add a note'}
      onEdit={selected ? () => onEdit(selected) : onAdd}
      bottomInset={bottomInset}
    />
  );
});

const useStyles = themedStyles((t) => ({
  header: { gap: 2, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 36,
    maxWidth: '100%',
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  add: { borderColor: t.ink(0x3a), borderStyle: 'dashed', minWidth: 44 },
  chipText: { fontSize: 14, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    columnGap: 16,
  },
  action: { minHeight: 44, justifyContent: 'center' },
  actionText: { color: t.ink(0xbb), fontSize: 13 },
}));
