import { useEffect, useState } from 'react';
import type { Habit } from '@onpurpose/core/habits';

export const COMPLETION_PAUSE_MS = 700;
// Undo/unchecking reveals immediately. Newly completed rows wait for a pause in
// the tap burst, so the user's next target cannot move under their finger.
export function useDelayedCompletionMask(
  mask: string,
  habits: Habit[],
  today: string,
  enabled: boolean,
) {
  const [settled, setSettled] = useState({ mask, habits, today, enabled });
  const reset =
    settled.habits !== habits ||
    settled.today !== today ||
    settled.enabled !== enabled;
  if (reset) setSettled({ mask, habits, today, enabled });
  const retained = reset
    ? mask
    : [...mask]
        .map((value, index) =>
          value === '1' && settled.mask[index] === '1' ? '1' : '0',
        )
        .join('');
  if (!reset && retained !== settled.mask)
    setSettled({ ...settled, mask: retained });
  useEffect(() => {
    if (reset || !enabled || settled.mask === mask) return;
    const timer = setTimeout(
      () => setSettled({ mask, habits, today, enabled }),
      COMPLETION_PAUSE_MS,
    );
    return () => clearTimeout(timer);
  }, [mask, habits, today, enabled, reset, settled.mask]);
  return retained;
}
