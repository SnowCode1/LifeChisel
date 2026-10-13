import { openDatabaseAsync } from 'expo-sqlite';
import {
  randomUUID,
  digestStringAsync,
  CryptoDigestAlgorithm,
} from 'expo-crypto';
import { ChangeStore } from '@onpurpose/core/storage/store';
import { sqliteRepository } from '@onpurpose/core/storage/repository';
import { eventMeta, initialEvent } from '@onpurpose/core/storage/newEvents';

const metadata = (sequence: number) => eventMeta(sequence, randomUUID());
export const digest = (text: string) =>
  digestStringAsync(CryptoDigestAlgorithm.SHA256, text);
let opening: Promise<ChangeStore> | null = null;
export function openStore(): Promise<ChangeStore> {
  if (!opening) {
    opening = (async () => {
      const db = await openDatabaseAsync('onpurpose.db');
      const store = new ChangeStore(
        sqliteRepository(db, () => initialEvent(randomUUID())),
        metadata,
      );
      await store.load();
      return store;
    })().catch((error) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}
