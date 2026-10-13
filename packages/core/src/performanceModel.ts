// Reports contain fixed metric names and numbers only, never habit data or SQL.
export const performanceMetrics = [
  'grid.container.render',
  'grid.cell.render',
  'grid.cell.mount',
  'grid.cell.unmount',
  'grid.column.render',
  'grid.heading.render',
  'grid.render',
  'statistics.render',
  'grid.goal',
  'grid.checkbox.policy',
  'grid.ready',
  'grid.header.load',
  'grid.body.load',
  'store.metadata',
  'store.apply',
  'store.publish',
  'store.append',
  'store.load',
  'store.ack',
  'sql.read',
  'sql.write',
  'sql.transaction',
  'repository.read.parse',
  'repository.read.replay',
  'repository.append.validate',
  'repository.append.serialize',
  'repository.projection.serialize',
  'js.eventLoop.delay',
] as const;
export type GridExperiment = 'normal' | 'no-goal-tint' | 'simple-cells';
export type PerformanceSample = {
  count: number;
  totalMs: number;
  maxMs: number;
};
export type PerformanceReport = {
  version: 1;
  environment: 'development';
  platform: 'ios' | 'android' | 'web';
  source: 'sample' | 'saved';
  mode: GridExperiment;
  elapsedMs: number;
  metrics: Partial<
    Record<(typeof performanceMetrics)[number], PerformanceSample>
  >;
};
const allowed = new Set<string>(performanceMetrics);
export function createPerformanceRecorder() {
  let samples: PerformanceReport['metrics'] = {};
  return {
    record(name: string, duration = 0) {
      if (!allowed.has(name) || !Number.isFinite(duration) || duration < 0)
        return;
      const key = name as (typeof performanceMetrics)[number];
      const sample = samples[key] ?? { count: 0, totalMs: 0, maxMs: 0 };
      samples[key] = {
        count: sample.count + 1,
        totalMs: sample.totalMs + duration,
        maxMs: Math.max(sample.maxMs, duration),
      };
    },
    reset() {
      samples = {};
    },
    snapshot() {
      return Object.fromEntries(
        Object.entries(samples).map(([name, value]) => [name, { ...value }]),
      ) as PerformanceReport['metrics'];
    },
  };
}
export function validPerformanceReport(
  value: unknown,
): value is PerformanceReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  if (
    Object.keys(p).sort().join(',') !==
      'elapsedMs,environment,metrics,mode,platform,source,version' ||
    p.version !== 1 ||
    p.environment !== 'development' ||
    !['ios', 'android', 'web'].includes(p.platform as string) ||
    !['sample', 'saved'].includes(p.source as string) ||
    !['normal', 'no-goal-tint', 'simple-cells'].includes(p.mode as string) ||
    typeof p.elapsedMs !== 'number' ||
    !Number.isFinite(p.elapsedMs) ||
    p.elapsedMs < 0 ||
    p.elapsedMs > 3600000 ||
    !p.metrics ||
    typeof p.metrics !== 'object' ||
    Array.isArray(p.metrics)
  )
    return false;
  return Object.entries(p.metrics).every(([name, sample]) => {
    if (
      !allowed.has(name) ||
      !sample ||
      typeof sample !== 'object' ||
      Array.isArray(sample)
    )
      return false;
    const s = sample as Record<string, unknown>;
    return (
      Object.keys(s).sort().join(',') === 'count,maxMs,totalMs' &&
      typeof s.count === 'number' &&
      Number.isSafeInteger(s.count) &&
      s.count > 0 &&
      s.count <= 10000000 &&
      typeof s.totalMs === 'number' &&
      Number.isFinite(s.totalMs) &&
      s.totalMs >= 0 &&
      s.totalMs <= 1e10 &&
      typeof s.maxMs === 'number' &&
      Number.isFinite(s.maxMs) &&
      s.maxMs >= 0 &&
      s.maxMs <= 3600000 &&
      s.maxMs <= s.totalMs
    );
  });
}
