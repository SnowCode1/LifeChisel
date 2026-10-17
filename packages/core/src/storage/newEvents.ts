import { localDateKey } from '../calendar.ts';
import { demoHabits } from '../habits.ts';
import { presetDescriptions } from '../presetDescriptions.ts';
import type { EventMeta, StoredEvent } from './model.ts';

// Every app writes new events with the current writer version; keep the phone
// and web stores on one definition so they cannot drift apart.
export function eventMeta(
  sequence: number,
  id: string,
  now = new Date(),
): EventMeta {
  return {
    version: 22,
    id,
    sequence,
    recordedAt: now.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    utcOffsetMinutes: -now.getTimezoneOffset(),
  };
}

// The one-time first event of a new store (development presets for now).
export function initialEvent(id: string, now = new Date()): StoredEvent {
  return {
    ...eventMeta(1, id, now),
    type: 'initialize',
    habits: demoHabits.map((habit) => ({
      ...habit,
      description: presetDescriptions[habit.id],
      startDate: localDateKey(now),
    })),
  };
}
