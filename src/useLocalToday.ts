import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  localDateKey,
  millisecondsUntilTomorrow,
} from '@onpurpose/core/calendar';

export function useLocalToday() {
  const [today, setToday] = useState(() => localDateKey(new Date()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      clearTimeout(timer);
      const now = new Date();
      setToday(localDateKey(now));
      timer = setTimeout(refresh, millisecondsUntilTomorrow(now));
    }
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);
  return today;
}
