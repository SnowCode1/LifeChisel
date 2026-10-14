import {
  decodeArchive,
  encodeArchive,
  MAX_ARCHIVE_BYTES,
} from '@onpurpose/core/storage/archive';
import type { ChangeStore } from '@onpurpose/core/storage/store';

// The same backup file as the phone: core encodes and validates it, with a
// SHA-256 digest (hex, like expo-crypto's) guarding its contents.
export async function digest(text: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Encodes the whole log after pending saves finish and downloads it. */
export async function exportBackup(store: ChangeStore) {
  const text = await store.exclusive(() =>
    encodeArchive(store.getSnapshot().events, new Date().toISOString(), digest),
  );
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `OnPurpose-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads and fully validates a chosen backup; nothing changes yet. */
export async function readBackup(file: File) {
  if (file.size > MAX_ARCHIVE_BYTES)
    throw new Error('Choose an OnPurpose backup smaller than 20 MB.');
  return decodeArchive(await file.text(), digest);
}
