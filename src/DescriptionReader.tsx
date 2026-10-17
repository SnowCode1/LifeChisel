import { memo, useCallback, useMemo, type ReactNode } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Text } from './Typography';
import { DescriptionText } from './DescriptionText';
import {
  descriptionReadingPassages,
  type ReadingPassage,
} from '@onpurpose/core/descriptionReading';
import { useSheetScroll } from './SheetModal';
import { themedStyles } from './ThemeContext';

// Reading content lives in the habit sheet, without another presentation step.
export const DescriptionReader = memo(function DescriptionReader({
  description,
  colour,
  editable,
  onEdit,
  onVersions,
  header,
  emptyText = 'No note yet.',
  emptyAction = 'Add a note',
  bottomInset = 40,
}: {
  description?: string;
  colour: string;
  editable: boolean;
  onEdit: () => void;
  onVersions?: () => void;
  /** Above the note, scrolling with it (the note switcher). */
  header?: ReactNode;
  emptyText?: string;
  emptyAction?: string;
  bottomInset?: number;
}) {
  const styles = useStyles();
  const passages = useMemo(
    () => descriptionReadingPassages(description ?? ''),
    [description],
  );
  const render = useCallback(
    ({ item }: { item: ReadingPassage }) => (
      <DescriptionText tokens={item.tokens} colour={colour} />
    ),
    [colour],
  );
  const sheetScroll = useSheetScroll();
  return (
    <FlatList
      {...sheetScroll}
      testID="habit-notes"
      data={passages}
      keyExtractor={(item) => item.key}
      renderItem={render}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      updateCellsBatchingPeriod={16}
      windowSize={7}
      alwaysBounceVertical
      directionalLockEnabled
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.body, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        header || onVersions ? (
          <>
            {header}
            {!header && onVersions && (
              <View style={styles.history}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous note versions"
                  onPress={onVersions}
                  style={styles.action}
                >
                  <Text style={styles.actionText}>Versions</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : null
      }
      ListEmptyComponent={
        <View style={{ gap: 8 }}>
          <Text style={styles.empty}>{emptyText}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !editable }}
            disabled={!editable}
            onPress={onEdit}
            style={[styles.action, { opacity: editable ? 1 : 0.35 }]}
          >
            <Text style={styles.actionText}>{emptyAction}</Text>
          </Pressable>
        </View>
      }
    />
  );
});
const useStyles = themedStyles((t) => ({
  body: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  history: { alignItems: 'flex-end', marginTop: -8, marginBottom: 4 },
  action: { minHeight: 44, justifyContent: 'center' },
  actionText: { color: t.ink(0xbb), fontSize: 13 },
  empty: { color: t.ink(0x92), fontSize: 15 },
}));
