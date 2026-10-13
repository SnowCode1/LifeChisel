// Execute the production instrumentation with bounded fake timers. SQLite work
// uses Node's real database; these timings are never labelled iPhone timings.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import * as model from '../packages/core/src/storage/model.ts';
import * as metrics from '../packages/core/src/performanceModel.ts';
function load(path, imports, context = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      require(name) {
        if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
        return imports[name];
      },
      ...context,
    },
    { timeout: 1000 },
  );
  return module.exports;
}
export function performanceFixture({
  development = true,
  flag = true,
  comparison = false,
} = {}) {
  let offset = 0;
  const timers = new Map();
  let id = 0;
  const captured = [];
  const clock = { now: () => performance.now() + offset };
  const featureContext = {
    __DEV__: development,
    process: { env: { EXPO_PUBLIC_DEV_COMPARISON: String(comparison) } },
  };
  const features = load(
    '../packages/core/src/developmentFeatures.ts',
    {},
    featureContext,
  );
  const timing = load(
    '../packages/core/src/performance.ts',
    { './performanceModel.ts': metrics, './developmentFeatures.ts': features },
    {
      __DEV__: development,
      process: { env: { EXPO_PUBLIC_DEV_PERFORMANCE: String(flag) } },
      performance: clock,
      console: { info: (...values) => captured.push(values) },
      setInterval: (fn, delay) => {
        timers.set(++id, { fn, delay, interval: true });
        return id;
      },
      setTimeout: (fn, delay) => {
        timers.set(++id, { fn, delay });
        return id;
      },
      clearInterval: (handle) => timers.delete(handle),
      clearTimeout: (handle) => timers.delete(handle),
    },
  );
  const profiled = load('../packages/core/src/storage/profileSql.ts', {
    '../performance.ts': timing,
  });
  const repository = load('../packages/core/src/storage/repository.ts', {
    './model.ts': model,
    '../performance.ts': timing,
    './profileSql.ts': profiled,
  });
  const stores = load(
    '../packages/core/src/storage/store.ts',
    { './model.ts': model, '../performance.ts': timing },
    { performance: clock },
  );
  const upload = load('../src/dev/performanceUpload.ts', {
    '@onpurpose/core/performanceModel': metrics,
  });
  return {
    timing,
    ...profiled,
    ...repository,
    ...stores,
    ...upload,
    timers,
    captured,
    advance: (ms) => {
      offset += ms;
    },
  };
}
export function nodeSqlPort(raw, fault = () => {}) {
  const db = {
    async execAsync(sql) {
      fault(sql);
      raw.exec(sql);
    },
    async runAsync(sql, ...params) {
      fault(sql);
      return raw.prepare(sql).run(...params);
    },
    async getFirstAsync(sql, ...params) {
      fault(sql);
      return raw.prepare(sql).get(...params) ?? null;
    },
    async getAllAsync(sql, ...params) {
      fault(sql);
      return raw.prepare(sql).all(...params);
    },
    async withExclusiveTransactionAsync(task) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        await task(db);
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}
