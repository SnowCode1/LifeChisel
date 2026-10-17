import { localDateKey } from '../calendar.ts';
import { demoHabits } from '../habits.ts';
import { presetDescriptions } from '../presetDescriptions.ts';
import { LEGACY_NOTE_TITLE } from '../notes.ts';
import type { EventMeta, StoredEvent } from './model.ts';

// Every app writes new events with the current writer version; keep the phone
// and web stores on one definition so they cannot drift apart.
export function eventMeta(
  sequence: number,
  id: string,
  now = new Date(),
): EventMeta {
  return {
    version: 23,
    id,
    sequence,
    recordedAt: now.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    utcOffsetMinutes: -now.getTimezoneOffset(),
  };
}

// The one-time first event of a new store (development presets for now).
// Each preset's placeholder text is its first note, titled Info.
export function initialEvent(id: string, now = new Date()): StoredEvent {
  return {
    ...eventMeta(1, id, now),
    type: 'initialize',
    habits: demoHabits.map((habit) => ({
      ...habit,
      startDate: localDateKey(now),
    })),
    notes: Object.fromEntries(
      demoHabits
        .filter((habit) => presetDescriptions[habit.id])
        .map((habit) => [
          habit.id,
          [
            {
              id: 'info',
              title: LEGACY_NOTE_TITLE,
              text: presetDescriptions[habit.id]!,
            },
          ],
        ]),
    ),
  };
}
