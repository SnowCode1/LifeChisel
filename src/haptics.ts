import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

type Feedback = 'confirm' | 'undo' | 'selection' | 'boundary';

// Android pulse lengths at full strength. Short pulses read as taps; Expo's
// Android waveforms (43–50 ms at low strength) felt buzzy on the founder's phone.
// Only duration is adjustable here, so lighter cues are much shorter.
const androidPulseMs: Record<Feedback, number> = {
  confirm: 12,
  boundary: 12,
  undo: 5,
  selection: 5,
};

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

// Fire at accepted actions, never from render/state updaters. UI and state must
// not wait for the motor, and unavailable haptics must never break an action.
// Android vibrates directly rather than using performAndroidHapticsAsync: view
// haptics are silently dropped when the phone's touch-interaction vibration is
// off, so the app's own Haptics setting would appear to do nothing.
export function feedback(kind: Feedback): void {
  if (!enabled) return;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    if (Platform.OS === 'android') {
      Vibration.vibrate(androidPulseMs[kind]);
      return;
    }
    let result: Promise<void>;
    if (kind === 'selection') {
      result = Haptics.selectionAsync();
    } else {
      const style = {
        confirm: Haptics.ImpactFeedbackStyle.Medium,
        undo: Haptics.ImpactFeedbackStyle.Soft,
        boundary: Haptics.ImpactFeedbackStyle.Medium,
      }[kind];
      result = Haptics.impactAsync(style);
    }
    void result.catch(() => undefined);
  } catch {
    // Native support is optional; the visual state remains authoritative.
  }
}
