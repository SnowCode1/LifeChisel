import { useEffect, useMemo, useState } from 'react';
import type { EntryValues } from '@onpurpose/core/entries';
import type { Habit } from '@onpurpose/core/habits';
import { completionMask } from '@onpurpose/core/habitCompletion';

const SETTLE_MS = 700;

/**
 * Habits hidden by Hide completed today. A row that has just met today's goal
 * stays for a moment, so the next row does not slide under the pointer; a
 * row that is no longer complete comes back at once.
 */
export function useHiddenCompleted(
  habits: Habit[],
  values: EntryValues,
  today: string,
  enabled: boolean,
) {
  const mask = completionMask(habits, values, today);
  const complete = useMemo(
    () => habits.filter((_, index) => mask[index] === '1').map((h) => h.id),
    // The mask is a primitive string, so this only changes with completion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mask, habits.length],
  );
  const key = complete.join('|');
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    if (key === settled) return;
    const timer = setTimeout(() => setSettled(key), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [key, settled]);
  if (!enabled) return new Set<string>();
  // Reveal immediately: only ids complete both now and when settled hide.
  const now = new Set(complete);
  return new Set(settled.split('|').filter((id) => id && now.has(id)));
}
