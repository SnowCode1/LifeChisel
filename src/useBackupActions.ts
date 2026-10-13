import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import { chooseBackup, shareBackup } from './storage/backups';

// Native confirmations stay here; the store still owns exclusive, atomic restore
// and its pre-restore copy. The ref blocks repeated presses before React commits.
export function useBackupActions(store: ChangeStore, sampleData: boolean) {
  const [backupBusy, setBackupBusy] = useState(false);
  const running = useRef(false);
  async function backupAction(action: () => Promise<void>) {
    if (sampleData || running.current) return;
    running.current = true;
    setBackupBusy(true);
    try {
      await action();
    } catch (error) {
      Alert.alert(
        'Backup could not be completed',
        error instanceof Error
          ? error.message
          : 'Your saved data has been kept. Please try again.',
      );
    } finally {
      running.current = false;
      setBackupBusy(false);
    }
  }
  async function restoreBackup() {
    await backupAction(async () => {
      const archive = await chooseBackup();
      if (!archive) return;
      const confirmed = await new Promise<boolean>((resolve) =>
        Alert.alert(
          'Restore this backup?',
          `This backup has ${archive.replay.state.habits.length} habits and ${archive.events.length - 1} changes. It will replace your current entries, colours, and settings. A copy of the current data will be kept on this device.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            {
              text: 'Restore',
              style: 'destructive',
              onPress: () => resolve(true),
            },
          ],
          { cancelable: false },
        ),
      );
      if (confirmed) await store.exclusive(() => store.replace(archive.events));
    });
  }
  function recoverPrevious() {
    if (sampleData || running.current) return;
    Alert.alert(
      'Return to the pre-restore copy?',
      'This replaces the current data. A copy of the current data will also be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore copy',
          style: 'destructive',
          onPress: () => {
            void backupAction(() =>
              store.exclusive(async () => {
                await store.replace(await store.recoveryEvents());
              }),
            );
          },
        },
      ],
    );
  }

  return {
    backupBusy,
    exportBackup: () => backupAction(() => shareBackup(store)),
    restoreBackup,
    recoverPrevious,
  };
}
