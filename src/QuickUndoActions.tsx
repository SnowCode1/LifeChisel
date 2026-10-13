import { useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeOut, ReduceMotion } from 'react-native-reanimated';
import { Text } from './Typography';
import { Icon } from './Icon';
import { feedback } from './haptics';
import type { QuickUndo } from '@onpurpose/core/quickUndo';
import { appear } from './motion';
import { themedStyles, useTheme } from './ThemeContext';

const undoExit = FadeOut.duration(180).reduceMotion(ReduceMotion.System);
export function QuickUndoActions({
  controller,
  atToday,
  todayLabel,
  onToday,
  editable,
}: {
  controller: QuickUndo;
  atToday: boolean;
  todayLabel: string;
  onToday: () => void;
  editable: boolean;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const receipt = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  return (
    <View style={styles.actions}>
      {!atToday && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Return to today"
          onPress={onToday}
          style={styles.today}
        >
          <Text numberOfLines={1} style={styles.text}>
            {todayLabel}
          </Text>
        </Pressable>
      )}
      {receipt && (
        <Animated.View entering={appear} exiting={undoExit}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              receipt.action === 'archive'
                ? `Undo archiving ${receipt.label}`
                : `Undo entry for ${receipt.label}`
            }
            disabled={!editable}
            onPress={() => {
              if (controller.undo()) feedback('undo');
            }}
            style={[styles.undo, atToday && styles.today]}
          >
            {atToday ? (
              <>
                <Icon name="undo" size={18} color={theme.ink(0xd0)} />
                <Text style={styles.text}>Undo</Text>
              </>
            ) : (
              <Icon name="undo" size={19} />
            )}
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}
const useStyles = themedStyles((t) => ({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    maxWidth: '100%',
  },
  today: {
    minWidth: 44,
    flexShrink: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: t.ink(0x12),
  },
  undo: {
    flexShrink: 0,
    flexDirection: 'row',
    gap: 5,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  text: {
    color: t.ink(0xd0),
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
}));
