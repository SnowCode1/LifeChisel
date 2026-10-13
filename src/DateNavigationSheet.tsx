import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Text, TextInput } from './Typography';
import { Icon } from './Icon';
import { localDateKey } from '@onpurpose/core/calendar';
import { validTimingDate } from '@onpurpose/core/goalTiming';
import { DateCalendar } from './DateCalendar';
import type { WeekStart } from '@onpurpose/core/displayPreferences';
import { themedStyles, useTheme } from './ThemeContext';

export function DateNavigationSheet({
  date,
  today,
  weekStart,
  onClose,
  onChoose,
}: {
  date: string;
  today: string;
  weekStart?: WeekStart;
  onClose: () => void;
  onChoose: (date: string) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const [chosen, setChosen] = useState(date);
  const insets = useSafeAreaInsets();
  const valid = validTimingDate(chosen);
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(16, insets.top),
            paddingBottom: Math.max(16, insets.bottom),
          },
        ]}
      >
        <View accessibilityViewIsModal style={styles.card}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              Jump to date
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close date picker"
              onPress={onClose}
              style={styles.action}
            >
              <Icon name="close" />
            </Pressable>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 12 }}
          >
            {Platform.OS === 'web' ? (
              <TextInput
                accessibilityLabel="Jump to date"
                value={chosen}
                onChangeText={setChosen}
                placeholder="YYYY-MM-DD"
                maxLength={10}
                style={styles.input}
              />
            ) : Platform.OS === 'android' ? (
              <DateCalendar
                value={chosen}
                today={today}
                weekStart={weekStart}
                onChange={setChosen}
              />
            ) : (
              <DateTimePicker
                accessibilityLabel="Choose grid date"
                value={new Date(`${chosen}T12:00:00`)}
                mode="date"
                display="inline"
                themeVariant={theme.scheme}
                accentColor={theme.ink(0xdd)}
                onValueChange={(_, value) => setChosen(localDateKey(value))}
              />
            )}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
              onPress={() => onChoose(today)}
              style={styles.action}
            >
              <Text style={styles.secondary}>Today</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go to selected date"
              disabled={!valid}
              accessibilityState={{ disabled: !valid }}
              onPress={() => {
                if (valid) onChoose(chosen);
              }}
              style={[
                styles.action,
                styles.primary,
                { opacity: valid ? 1 : 0.4 },
              ]}
            >
              <Text
                style={{
                  color: theme.background,
                  fontSize: 15,
                  fontWeight: '600',
                }}
              >
                Go to date
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const useStyles = themedStyles((t) => ({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: t.scrim(0x99),
    paddingHorizontal: 18,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    maxHeight: '100%',
    backgroundColor: t.ink(0x12),
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  title: { color: t.ink(0xee), fontSize: 19, fontWeight: '600', flexShrink: 1 },
  action: {
    minHeight: 44,
    minWidth: 60,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  secondary: { color: t.ink(0xbb), fontSize: 15 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    padding: 16,
  },
  primary: { backgroundColor: t.ink(0xdd), borderRadius: 10 },
  input: {
    marginTop: 16,
    color: t.ink(0xee),
    fontSize: 18,
    backgroundColor: t.ink(0x1c),
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 12,
  },
}));
