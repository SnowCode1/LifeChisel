import { openDatabaseAsync } from 'expo-sqlite';
import {
  serializedDrafts,
  sqliteDrafts,
  type DraftPort,
  type DraftStorage,
} from '@onpurpose/core/storage/descriptionDraftModel';
let opening: Promise<DraftStorage> | null = null;
async function open() {
  if (!opening)
    opening = (async () => {
      const db = await openDatabaseAsync('onpurpose-description-drafts.db');
      const version = await db.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version',
      );
      if (version?.user_version !== 0 && version?.user_version !== 1)
        throw new Error('Unsupported draft database.');
      if (version.user_version === 0)
        await db.withExclusiveTransactionAsync(async (tx) => {
          const count = await tx.getFirstAsync<{ total: number }>(
            "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          );
          if (count?.total) throw new Error('Unrecognized draft database.');
          await tx.execAsync(
            'CREATE TABLE description_drafts (draft_key TEXT PRIMARY KEY, draft_json TEXT NOT NULL); PRAGMA user_version = 1;',
          );
        });
      return sqliteDrafts(db);
    })().catch((error) => {
      opening = null;
      throw error;
    });
  return opening;
}
export const descriptionDrafts: DraftPort = serializedDrafts({
  get: async (key) => (await open()).get(key),
  put: async (key, draft) => (await open()).put(key, draft),
  remove: async (key) => (await open()).remove(key),
});
