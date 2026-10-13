import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {
  handleSql,
  type SqlRequest,
  type SqlResponse,
} from './sqliteHandler.ts';

// SQLite runs here, off the page's thread, in the browser's private file
// storage (OPFS). The pool VFS needs no special server headers.
const scope = self as unknown as {
  postMessage(message: SqlResponse): void;
  onmessage: ((event: MessageEvent<SqlRequest>) => void) | null;
};
const opening = (async () => {
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'onpurpose' });
  return new pool.OpfsSAHPoolDb('/onpurpose.db');
})();
// Never fall back to a temporary database: unsaved data must look unsaved.
scope.onmessage = async ({ data }) => {
  try {
    scope.postMessage(handleSql(await opening, data));
  } catch (error) {
    scope.postMessage({
      id: data.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
