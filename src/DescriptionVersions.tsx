import { Text } from './Typography';
import { Icon } from './Icon';
import { useState, type ComponentType } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type TextProps,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DescriptionHistory } from './DescriptionHistory';
import { descriptionExcerpt } from '@onpurpose/core/descriptionReading';
import type { Habit } from '@onpurpose/core/habits';
import type { HistoryAction, StoredState } from '@onpurpose/core/storage/model';
import { themedStyles, useTheme } from './ThemeContext';

export function DescriptionVersions({
  habit,
  actions,
  state,
  editable,
  Heading,
  onRestore,
  onClose,
}: {
  habit: Habit;
  actions: HistoryAction[];
  state: StoredState;
  editable: boolean;
  Heading: ComponentType<TextProps>;
  onRestore: (id: string, text: string | undefined) => boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const [selected, setSelected] = useState<HistoryAction | null>(null);
  const currentVersion = actions.find(
    (action) =>
      action.change.kind === 'habit' &&
      action.change.after?.description === habit.description,
  );
  const accent = theme.colour(habit.color);
  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType="slide"
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={styles.close}
            >
              <Icon name="close" />
            </Pressable>
            <View style={styles.title}>
              <Heading
                accessibilityRole="header"
                numberOfLines={1}
                style={styles.heading}
              >
                {habit.name}
              </Heading>
              <Text style={styles.subtitle}>Previous versions</Text>
            </View>
            <View style={{ width: 60 }} />
          </View>
          <FlatList
            data={actions}
            keyExtractor={(action) => action.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            ListEmptyComponent={
              <Text style={styles.empty}>No description changes yet.</Text>
            }
            renderItem={({ item }) => {
              if (item.change.kind !== 'habit') return null;
              const text = item.change.after?.description;
              const current = item.id === currentVersion?.id;
              const summary = text
                ? descriptionExcerpt(text)
                : 'Description cleared';
              const date = new Date(item.recordedAt).toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              });
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${summary}, ${date}${current ? ', current version' : ''}`}
                  onPress={() => setSelected(item)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <View style={styles.rowHeader}>
                    <Text style={styles.date}>{date}</Text>
                    {current && (
                      <Text style={[styles.current, { color: accent }]}>
                        Current
                      </Text>
                    )}
                  </View>
                  <Text numberOfLines={2} style={styles.summary}>
                    {summary}
                  </Text>
                </Pressable>
              );
            }}
          />
          {selected && (
            <DescriptionHistory
              key={selected.id}
              action={selected}
              state={state}
              editable={editable}
              Heading={Heading}
              onRestore={onRestore}
              onClose={() => setSelected(null)}
            />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  close: { minWidth: 60, minHeight: 48, justifyContent: 'center' },
  title: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  heading: { color: t.ink(0xdd), fontSize: 15, fontWeight: '600' },
  subtitle: { color: t.ink(0x77), fontSize: 12, marginTop: 3 },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.ink(0x24),
  },
  rowHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  date: { color: t.ink(0x92), fontSize: 12 },
  current: { fontSize: 12 },
  summary: { color: t.ink(0xcc), fontSize: 15, lineHeight: 21 },
  empty: { color: t.ink(0x88), fontSize: 15, paddingVertical: 24 },
}));
