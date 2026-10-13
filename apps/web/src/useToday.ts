import { useEffect, useState } from 'react';
import {
  localDateKey,
  millisecondsUntilTomorrow,
} from '@onpurpose/core/calendar';

// The local date, updated at midnight and whenever the tab becomes visible.
export function useToday(): string {
  const [today, setToday] = useState(() => localDateKey(new Date()));
  useEffect(() => {
    const refresh = () => setToday(localDateKey(new Date()));
    let timer = setTimeout(
      function tick() {
        refresh();
        timer = setTimeout(tick, millisecondsUntilTomorrow(new Date()) + 50);
      },
      millisecondsUntilTomorrow(new Date()) + 50,
    );
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}
