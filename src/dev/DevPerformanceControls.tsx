import { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, Platform, Pressable, View } from 'react-native';
import { Text } from '../Typography';
import { performanceEnabled, performanceRun } from '../performance';
import type { GridExperiment } from '../performanceModel';
import { uploadPerformance } from './performanceUpload';
import { useTheme } from '../ThemeContext';
const options: { value: GridExperiment; label: string }[] = [
  // The canvas grid has no reduced renderer modes; reports keep the field.
  { value: 'normal', label: 'Normal' },
];
export function DevPerformanceLifecycle() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') performanceRun.stop();
    });
    return () => {
      subscription.remove();
      performanceRun.stop();
    };
  }, []);
  return null;
}
export function DevPerformanceControls({
  sampleData,
}: {
  sampleData: boolean;
}) {
  const running = useSyncExternalStore(
    performanceRun.subscribe,
    performanceRun.isRunning,
  );
  const report = useSyncExternalStore(
    performanceRun.subscribe,
    performanceRun.getReport,
  );
  const [choice, setChoice] = useState<GridExperiment>('normal');
  const [sending, setSending] = useState(false);
  const theme = useTheme();
  if (!__DEV__ || !performanceEnabled) return null;
  async function send() {
    const current = running ? performanceRun.stop() : report;
    if (!current || sending) return;
    const receiver = process.env.EXPO_PUBLIC_PREVIEW_URL;
    const token = process.env.EXPO_PUBLIC_PREVIEW_TOKEN;
    if (process.env.EXPO_PUBLIC_DEV_PREVIEW !== 'true' || !receiver || !token) {
      Alert.alert(
        'Timings kept locally',
        'Enable preview sharing and set up its receiver to send this report.',
      );
      return;
    }
    setSending(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      await uploadPerformance(
        current,
        receiver,
        token,
        fetch,
        controller.signal,
      );
      Alert.alert(
        'Timings saved',
        'The report is on your development computer.',
      );
    } catch (error) {
      Alert.alert(
        'Timings not sent',
        error instanceof Error ? error.message : 'Try sending again.',
      );
    } finally {
      clearTimeout(timeout);
      setSending(false);
    }
  }
  return (
    <View style={{ gap: 12, marginBottom: 24 }}>
      <Text style={{ color: theme.ink(0xdd), fontSize: 17 }}>
        Grid diagnostics
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={`Grid test, ${option.label}`}
            accessibilityState={{
              selected: choice === option.value,
              disabled: running || sending,
            }}
            disabled={running || sending}
            onPress={() => setChoice(option.value)}
            style={{
              minHeight: 44,
              paddingHorizontal: 10,
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor:
                choice === option.value ? `${theme.accent}20` : theme.ink(0x1b),
            }}
          >
            <Text
              style={{
                color:
                  choice === option.value ? theme.accentText : theme.ink(0xaa),
                fontSize: 14,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: theme.ink(0x96), fontSize: 14, lineHeight: 21 }}>
        {running
          ? 'Close Settings and wait two seconds, then scroll and rotate. Return here to send timings. Stops automatically after one minute.'
          : 'Repeat the same scrolls and rotations in each run. The canvas grid draws on the UI thread; JS timings here do not measure its frame rate.'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {!running && (
          <Pressable
            accessibilityRole="button"
            disabled={sending}
            onPress={() =>
              performanceRun.start(
                choice,
                Platform.OS === 'android'
                  ? 'android'
                  : Platform.OS === 'web'
                    ? 'web'
                    : 'ios',
                sampleData ? 'sample' : 'saved',
              )
            }
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: theme.accentText, fontSize: 16 }}>
              Start test
            </Text>
          </Pressable>
        )}
        {(running || report) && (
          <Pressable
            accessibilityRole="button"
            disabled={sending}
            onPress={() => void send()}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: theme.ink(0xdd), fontSize: 16 }}>
              {sending
                ? 'Sending…'
                : running
                  ? 'Stop and send timings'
                  : 'Send last timings'}
            </Text>
          </Pressable>
        )}
      </View>
      {!running && report && (
        <Text
          selectable
          style={{ color: theme.ink(0x96), fontSize: 13, lineHeight: 20 }}
        >
          {report.mode} · {report.source} ·{' '}
          {Math.round(report.elapsedMs / 1000)} seconds{'\n'}SQL reads:{' '}
          {report.metrics['sql.read']?.count ?? 0} · writes:{' '}
          {report.metrics['sql.write']?.count ?? 0}
          {'\n'}Grid ready:{' '}
          {Math.round(report.metrics['grid.ready']?.maxMs ?? 0)} ms max · React:{' '}
          {Math.round(report.metrics['grid.render']?.maxMs ?? 0)} ms max
        </Text>
      )}
    </View>
  );
}
