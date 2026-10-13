import type {
  SqlPort,
  TransactionalSql,
} from '@onpurpose/core/storage/repository';
import type { SqlParam, SqlRequest, SqlResponse } from './sqliteHandler.ts';

export type SqlChannel = {
  postMessage(message: SqlRequest): void;
  onmessage: ((event: { data: SqlResponse }) => void) | null;
};

// The phone's SqlPort over a worker channel, so the shared sqliteRepository
// runs unchanged. One transaction at a time; other statements wait for it.
export function workerSql(channel: SqlChannel): TransactionalSql {
  let next = 0;
  const waiting = new Map<
    number,
    { resolve(rows: unknown[]): void; reject(error: Error): void }
  >();
  channel.onmessage = ({ data }) => {
    const request = waiting.get(data.id);
    if (!request) return;
    waiting.delete(data.id);
    if (data.ok) request.resolve(data.rows);
    else request.reject(new Error(data.error));
  };
  const call = (op: SqlRequest['op'], sql: string, params: SqlParam[]) =>
    new Promise<unknown[]>((resolve, reject) => {
      const id = ++next;
      waiting.set(id, { resolve, reject });
      channel.postMessage({ id, op, sql, params });
    });
  const direct: SqlPort = {
    execAsync: async (sql) => {
      await call('exec', sql, []);
    },
    runAsync: (sql, ...params) => call('run', sql, params),
    getFirstAsync: async <T>(sql: string, ...params: SqlParam[]) =>
      ((await call('all', sql, params))[0] as T | undefined) ?? null,
    getAllAsync: async <T>(sql: string, ...params: SqlParam[]) =>
      (await call('all', sql, params)) as T[],
  };
  let lock: Promise<unknown> = Promise.resolve();
  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = lock.then(task);
    lock = run.catch(() => {});
    return run;
  }
  return {
    execAsync: (sql) => exclusive(() => direct.execAsync(sql)),
    runAsync: (sql, ...params) =>
      exclusive(() => direct.runAsync(sql, ...params)),
    getFirstAsync: <T>(sql: string, ...params: SqlParam[]) =>
      exclusive(() => direct.getFirstAsync<T>(sql, ...params)),
    getAllAsync: <T>(sql: string, ...params: SqlParam[]) =>
      exclusive(() => direct.getAllAsync<T>(sql, ...params)),
    withExclusiveTransactionAsync: (task) =>
      exclusive(async () => {
        await direct.execAsync('BEGIN IMMEDIATE');
        try {
          await task(direct);
          await direct.execAsync('COMMIT');
        } catch (error) {
          await direct.execAsync('ROLLBACK').catch(() => {});
          throw error;
        }
      }),
  };
}
