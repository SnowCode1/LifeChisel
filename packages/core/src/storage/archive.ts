import { replayEvents, type StoredEvent } from './model.ts';

export const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
export const MAX_ARCHIVE_EVENTS = 100000;
export type Digest = (text: string) => Promise<string>;
export async function encodeArchive(
  events: StoredEvent[],
  exportedAt: string,
  digest: Digest,
): Promise<string> {
  if (events.length > MAX_ARCHIVE_EVENTS)
    throw new Error('This backup exceeds the current 100,000-change limit.');
  replayEvents(events);
  const body = JSON.stringify(events);
  const archive = JSON.stringify(
    {
      format: 'onpurpose.changes',
      version: 20,
      exportedAt,
      eventCount: events.length,
      sha256: await digest(body),
      events,
    },
    null,
    2,
  );
  if (new TextEncoder().encode(archive).length > MAX_ARCHIVE_BYTES)
    throw new Error('This backup exceeds the current 20 MB limit.');
  return archive;
}
export async function decodeArchive(text: string, digest: Digest) {
  if (new TextEncoder().encode(text).length > MAX_ARCHIVE_BYTES)
    throw new Error('Choose an OnPurpose backup smaller than 20 MB.');
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid backup.');
  const archive = raw as Record<string, unknown>;
  const fields = [
    'format',
    'version',
    'exportedAt',
    'eventCount',
    'sha256',
    'events',
  ];
  if (
    Object.keys(archive).length !== fields.length ||
    !fields.every((key) => Object.hasOwn(archive, key)) ||
    archive.format !== 'onpurpose.changes' ||
    (archive.version !== 1 &&
      archive.version !== 2 &&
      archive.version !== 3 &&
      archive.version !== 4 &&
      archive.version !== 5 &&
      archive.version !== 6 &&
      archive.version !== 7 &&
      archive.version !== 8 &&
      archive.version !== 9 &&
      archive.version !== 10 &&
      archive.version !== 11 &&
      archive.version !== 12 &&
      archive.version !== 13 &&
      archive.version !== 14 &&
      archive.version !== 15 &&
      archive.version !== 16 &&
      archive.version !== 17 &&
      archive.version !== 18 &&
      archive.version !== 19 &&
      archive.version !== 20)
  )
    throw new Error('Unsupported backup format or version.');
  if (
    typeof archive.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(archive.exportedAt))
  )
    throw new Error('Invalid export timestamp.');
  if (
    !Array.isArray(archive.events) ||
    archive.events.length > MAX_ARCHIVE_EVENTS ||
    archive.eventCount !== archive.events.length
  )
    throw new Error('Incomplete backup.');
  if (
    typeof archive.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(archive.sha256) ||
    (await digest(JSON.stringify(archive.events))).toLowerCase() !==
      archive.sha256.toLowerCase()
  )
    throw new Error('The backup checksum does not match.');
  const result = replayEvents(archive.events);
  if (result.events.some((event) => event.version > Number(archive.version)))
    throw new Error('The backup version does not support its events.');
  return result;
}
