import {
  validPerformanceReport,
  type PerformanceReport,
} from '@onpurpose/core/performanceModel';
import type { PreviewTransport } from './previewUpload';
export async function uploadPerformance(
  report: PerformanceReport,
  receiver: string,
  token: string,
  transport: PreviewTransport,
  signal: AbortSignal,
) {
  if (!validPerformanceReport(report))
    throw new Error('The timing report is invalid.');
  let response;
  try {
    response = await transport(`${receiver.replace(/\/$/, '')}/performance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(report),
      signal,
    });
  } catch {
    throw new Error(
      'Could not reach the preview receiver. The timing report is kept for Retry.',
    );
  }
  if (!response.ok)
    throw new Error(
      `The receiver could not save timings (HTTP ${response.status}). The report is kept for Retry.`,
    );
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== 'object' ||
    !('saved' in result) ||
    result.saved !== true
  )
    throw new Error('The receiver did not confirm saving timings.');
}
