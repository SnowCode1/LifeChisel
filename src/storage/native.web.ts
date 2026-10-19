import {
  randomUUID,
  digestStringAsync,
  CryptoDigestAlgorithm,
} from 'expo-crypto';
import { browserRepository } from '@onpurpose/core/storage/browserRepository';
import { ChangeStore } from '@onpurpose/core/storage/store';
import { eventMeta, initialEvent } from '@onpurpose/core/storage/newEvents';
const metadata = (sequence: number) => eventMeta(sequence, randomUUID());
export const digest = (text: string) =>
  digestStringAsync(CryptoDigestAlgorithm.SHA256, text);
let opening: Promise<ChangeStore> | null = null;
export function openStore() {
  if (!opening)
    opening = (async () => {
      const store = new ChangeStore(
        browserRepository(localStorage, (device) =>
          initialEvent(randomUUID(), device),
        ),
        metadata,
      );
      await store.load();
      return store;
    })().catch((error) => {
      opening = null;
      throw error;
    });
  return opening;
}
