import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { digest } from './native';
import {
  decodeArchive,
  encodeArchive,
  MAX_ARCHIVE_BYTES,
} from '@onpurpose/core/storage/archive';
import type { ChangeStore } from '@onpurpose/core/storage/store';

export async function shareBackup(store: ChangeStore) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('File sharing is unavailable on this device.');
  const text = await store.exclusive(() =>
    encodeArchive(store.getSnapshot().events, new Date().toISOString(), digest),
  );
  const file = new File(
    Paths.cache,
    `OnPurpose-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  try {
    file.create();
    file.write(text);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Export OnPurpose backup',
    });
  } finally {
    if (file.exists) file.delete();
  }
}
export async function chooseBackup() {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'public.json'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled) return null;
  const file = new File(picked.assets[0].uri);
  try {
    if ((picked.assets[0].size ?? file.size) > MAX_ARCHIVE_BYTES)
      throw new Error('Choose a backup smaller than 20 MB.');
    return await decodeArchive(await file.text(), digest);
  } finally {
    if (file.exists) file.delete();
  }
}
