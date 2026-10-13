import { Profiler, type ReactNode } from 'react';
import {
  performanceEnabled,
  recordPerformance,
} from '@onpurpose/core/performance';

export function PerformanceBoundary({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return performanceEnabled ? (
    <Profiler
      id={name}
      onRender={(id, _phase, duration) =>
        recordPerformance(`${id}.render`, duration)
      }
    >
      {children}
    </Profiler>
  ) : (
    children
  );
}
