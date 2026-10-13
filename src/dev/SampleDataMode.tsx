import { Text } from '../Typography';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { localDateKey } from '@onpurpose/core/calendar';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import { createSampleStore } from '@onpurpose/core/dev/sampleData';
import { performanceRun } from '@onpurpose/core/performance';
import { themedStyles, useTheme } from '../ThemeContext';

// Mounted inside the app's ThemeProvider (Settings), unlike SampleDataMode
// itself, so it reads the current theme where it renders.
function SampleControls({
  enabled,
  onChange,
  onReset,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  onReset: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.controls}>
      <Text style={styles.eyebrow}>DEVELOPMENT</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Sample data</Text>
        <Switch
          accessibilityLabel="Use sample data instead of real data"
          value={enabled}
          onValueChange={onChange}
          trackColor={{ false: theme.ink(0x30), true: theme.accent }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={theme.ink(0x30)}
        />
      </View>
      <Text style={styles.description}>
        {enabled
          ? 'Six months of fictional history. Edits stay in this preview session; turn this off to return to your real data.'
          : 'Try statistics with six months of fictional history. Your real data stays separate.'}
      </Text>
      {enabled && (
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={onReset}
        >
          <Text style={styles.label}>Reset sample data</Text>
        </Pressable>
      )}
    </View>
  );
}

export function SampleDataMode({
  store,
  children,
}: {
  store: ChangeStore;
  children: (
    activeStore: ChangeStore,
    sample: boolean,
    controls: ReactNode,
  ) => ReactNode;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const [enabled, setEnabled] = useState(
    process.env.EXPO_PUBLIC_DEV_MOCK_DATA === 'true',
  );
  const [sample, setSample] = useState<ChangeStore | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled || sample) return;
    let active = true;
    void createSampleStore(localDateKey(new Date()))
      .then((value) => {
        if (active) setSample(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [enabled, sample]);
  const controls = (
    <SampleControls
      enabled={enabled}
      onChange={(value) => {
        performanceRun.stop();
        setError(false);
        setEnabled(value);
      }}
      onReset={() => {
        performanceRun.stop();
        setError(false);
        setSample(null);
      }}
    />
  );
  if (enabled && !sample)
    return (
      <View style={styles.loading}>
        {error ? (
          <Text style={styles.description}>
            Sample data could not be opened.
          </Text>
        ) : (
          <ActivityIndicator
            color={theme.colour('#82E6BC')}
            accessibilityLabel="Preparing sample history"
          />
        )}
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => setEnabled(false)}
        >
          <Text style={styles.label}>Return to real data</Text>
        </Pressable>
      </View>
    );
  return children(enabled ? sample! : store, enabled, controls);
}
const useStyles = themedStyles((t) => ({
  controls: { gap: 12, marginBottom: 28 },
  eyebrow: {
    color: t.ink(0x85),
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  label: {
    fontSize: 17,
    color: t.ink(0xe0),
    fontWeight: '500',
    flexShrink: 1,
  },
  description: { color: t.ink(0x96), fontSize: 14, lineHeight: 21 },
  button: {
    minHeight: 48,
    padding: 14,
    backgroundColor: t.ink(0x15),
    justifyContent: 'center',
    borderRadius: 12,
  },
  loading: {
    flex: 1,
    backgroundColor: t.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 24,
  },
}));
