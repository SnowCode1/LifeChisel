import { performanceEnabled, timePerformanceAsync } from '../performance.ts';
import type { SqlPort, TransactionalSql } from './repository.ts';
function port(db: SqlPort): SqlPort {
  return {
    execAsync: (sql) =>
      timePerformanceAsync('sql.write', () => db.execAsync(sql)),
    runAsync: (sql, ...params) =>
      timePerformanceAsync('sql.write', () => db.runAsync(sql, ...params)),
    getFirstAsync: (sql, ...params) =>
      timePerformanceAsync('sql.read', () => db.getFirstAsync(sql, ...params)),
    getAllAsync: (sql, ...params) =>
      timePerformanceAsync('sql.read', () => db.getAllAsync(sql, ...params)),
  };
}
export function profileSql(db: TransactionalSql): TransactionalSql {
  if (!performanceEnabled) return db;
  return {
    ...port(db),
    withExclusiveTransactionAsync: (task) =>
      timePerformanceAsync('sql.transaction', () =>
        db.withExclusiveTransactionAsync((tx) => task(port(tx))),
      ),
  };
}
