import { ChangeStore } from '@onpurpose/core/storage/store';
import { sqliteRepository } from '@onpurpose/core/storage/repository';
import { eventMeta, initialEvent } from '@onpurpose/core/storage/newEvents';
import { workerSql, type SqlChannel } from './workerSql.ts';

export class OpenElsewhere extends Error {
  constructor() {
    super(
      'OnPurpose is already open in another tab. Close it to continue here.',
    );
  }
}

// Only one tab may write the log. The lock lasts until this tab closes.
function holdDatabaseLock(): Promise<void> {
  if (!navigator.locks) return Promise.resolve();
  return new Promise((resolve, reject) => {
    navigator.locks
      .request('onpurpose-database', { ifAvailable: true }, (lock) => {
        if (!lock) {
          reject(new OpenElsewhere());
          return;
        }
        resolve();
        return new Promise<void>(() => {});
      })
      .catch(reject);
  });
}

let opening: Promise<ChangeStore> | null = null;
export function openStore(): Promise<ChangeStore> {
  if (!opening)
    opening = (async () => {
      await holdDatabaseLock();
      const worker = new Worker(new URL('./sqliteWorker.ts', import.meta.url), {
        type: 'module',
      });
      const store = new ChangeStore(
        sqliteRepository(workerSql(worker as unknown as SqlChannel), () =>
          initialEvent(crypto.randomUUID()),
        ),
        (sequence) => eventMeta(sequence, crypto.randomUUID()),
      );
      await store.load();
      // Ask the browser not to evict local data under storage pressure.
      void navigator.storage?.persist?.().catch(() => false);
      return store;
    })().catch((error) => {
      opening = null;
      throw error;
    });
  return opening;
}
