import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { openStore } from './storage/native';
import { type ChangeStore } from '@onpurpose/core/storage/store';

export function useStoreOpening() {
  const [store, setStore] = useState<ChangeStore | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void openStore()
      .then((value) => {
        if (active) setStore(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return {
    store,
    error,
    retry: () => {
      setError(false);
      setAttempt((value) => value + 1);
    },
  };
}
export function usePersistentStore(store: ChangeStore) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (
        state === 'active' &&
        store.getSnapshot().error &&
        store.getSnapshot().status === 'ready'
      )
        void store.retry();
      // Writes start immediately; backgrounding must not initiate a second queue.
    });
    return () => subscription.remove();
  }, [store]);
  return snapshot;
}
