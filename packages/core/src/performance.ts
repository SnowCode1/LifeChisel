import {
  createPerformanceRecorder,
  type GridExperiment,
  type PerformanceReport,
} from './performanceModel.ts';
import { developmentToolsEnabled } from './developmentFeatures.ts';
export const performanceEnabled =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  developmentToolsEnabled &&
  process.env.EXPO_PUBLIC_DEV_PERFORMANCE === 'true';
const windowSamples = createPerformanceRecorder();
const runSamples = createPerformanceRecorder();
let timer: ReturnType<typeof setTimeout> | undefined;
let run: {
  start: number;
  platform: PerformanceReport['platform'];
  source: PerformanceReport['source'];
  mode: GridExperiment;
} | null = null;
let mode: GridExperiment = 'normal';
let lastReport: PerformanceReport | null = null;
let monitor: ReturnType<typeof setInterval> | undefined;
let deadline: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
export const performanceRun = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getMode: () => mode,
  isRunning: () => run !== null,
  getReport: () => lastReport,
  start(
    next: GridExperiment,
    platform: PerformanceReport['platform'],
    source: PerformanceReport['source'],
  ) {
    if (!performanceEnabled) return;
    if (monitor) clearInterval(monitor);
    if (deadline) clearTimeout(deadline);
    runSamples.reset();
    // Exclude the mode-switch render and sheet dismissal from comparisons.
    run = { start: performance.now() + 2000, platform, source, mode: next };
    mode = next;
    let expected = performance.now() + 100;
    monitor = setInterval(() => {
      const now = performance.now();
      recordPerformance('js.eventLoop.delay', Math.max(0, now - expected));
      expected = now + 100;
    }, 100);
    deadline = setTimeout(() => performanceRun.stop(), 62000);
    notify();
  },
  stop(): PerformanceReport | null {
    if (!run) return null;
    const report: PerformanceReport = {
      version: 1,
      environment: 'development',
      platform: run.platform,
      source: run.source,
      mode: run.mode,
      elapsedMs: Math.max(0, performance.now() - run.start),
      metrics: runSamples.snapshot(),
    };
    run = null;
    lastReport = report;
    if (monitor) clearInterval(monitor);
    if (deadline) clearTimeout(deadline);
    monitor = undefined;
    deadline = undefined;
    mode = 'normal';
    notify();
    return report;
  },
};
export function recordPerformance(name: string, duration = 0) {
  if (!performanceEnabled) return;
  windowSamples.record(name, duration);
  if (run && performance.now() >= run.start) runSamples.record(name, duration);
  if (timer) return;
  timer = setTimeout(() => {
    console.info('[OnPurpose performance]', windowSamples.snapshot());
    windowSamples.reset();
    timer = undefined;
  }, 5000);
}
export function timePerformance<T>(name: string, task: () => T): T {
  if (!performanceEnabled) return task();
  const start = performance.now();
  try {
    return task();
  } finally {
    recordPerformance(name, performance.now() - start);
  }
}
export async function timePerformanceAsync<T>(
  name: string,
  task: () => Promise<T>,
): Promise<T> {
  if (!performanceEnabled) return task();
  const start = performance.now();
  try {
    return await task();
  } finally {
    recordPerformance(name, performance.now() - start);
  }
}
