// This browser's sync secrets (docs/SYNC.md): the session token and the
// account key, in IndexedDB rather than localStorage. The key is kept as a
// Web Crypto key object. Nothing here is part of the habit log or backups.
const DB_NAME = 'onpurpose-sync';
const STORE = 'secrets';

let opening: Promise<IDBDatabase> | null = null;
function database(): Promise<IDBDatabase> {
  if (!opening)
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        opening = null;
        reject(request.error);
      };
    });
  return opening;
}

async function run<T>(
  mode: IDBTransactionMode,
  task: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = task(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const readSecret = <T>(key: string) =>
  run<T | undefined>('readonly', (store) => store.get(key));
export const writeSecret = (key: string, value: unknown) =>
  run('readwrite', (store) => store.put(value, key)).then(() => {});
export const deleteSecret = (key: string) =>
  run('readwrite', (store) => store.delete(key)).then(() => {});

export const TOKEN = 'session-token';
export const accountKey = (account: string) => `account-key:${account}`;
