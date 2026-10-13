import {
  decodeArchive,
  encodeArchive,
  MAX_ARCHIVE_BYTES,
} from '@onpurpose/core/storage/archive';
import { digest } from './native';
import type { ChangeStore } from '@onpurpose/core/storage/store';
export async function shareBackup(store: ChangeStore) {
  const text = await store.exclusive(() =>
    encodeArchive(store.getSnapshot().events, new Date().toISOString(), digest),
  );
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'OnPurpose-backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function chooseBackup() {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
  if (file && file.size > MAX_ARCHIVE_BYTES)
    throw new Error('Choose a backup smaller than 20 MB.');
  return file ? decodeArchive(await file.text(), digest) : null;
}
