import type { Database } from '@sqlite.org/sqlite-wasm';

// Messages between the page and the SQLite worker. Statements run in order.
export type SqlParam = string | number | null;
export type SqlRequest = {
  id: number;
  op: 'exec' | 'run' | 'all';
  sql: string;
  params: SqlParam[];
};
export type SqlResponse =
  | { id: number; ok: true; rows: unknown[] }
  | { id: number; ok: false; error: string };

export function handleSql(db: Database, request: SqlRequest): SqlResponse {
  try {
    if (request.op === 'exec') {
      db.exec(request.sql);
      return { id: request.id, ok: true, rows: [] };
    }
    const rows = db.exec({
      sql: request.sql,
      bind: request.params.length ? request.params : undefined,
      rowMode: 'object',
      returnValue: 'resultRows',
    });
    return { id: request.id, ok: true, rows: request.op === 'all' ? rows : [] };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
