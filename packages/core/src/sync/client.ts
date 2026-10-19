// The mailbox API as a device sees it (docs/SYNC.md). The platform supplies
// the transport (base address and session token); answers are checked here
// rather than trusted.
import {
  isSyncId,
  type KeyRequest,
  type KeyResult,
  type MailboxEvent,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type ResetResult,
} from './protocol.ts';

export type SyncTransport = (
  path: string,
  init: { method: 'GET' | 'POST' | 'PUT'; body?: string },
) => Promise<Response>;

/** No answer from the server (offline, or it could not be reached). */
export class SyncOffline extends Error {
  constructor() {
    super('The sync server could not be reached.');
  }
}
/** The server answered with an error status. */
export class SyncHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
function invalid(): never {
  throw new SyncHttpError(502, 'The sync server sent an unexpected answer.');
}

function mailboxEvent(value: unknown): MailboxEvent {
  if (
    !isRecord(value) ||
    !isCount(value.sequence) ||
    !isSyncId(value.id) ||
    !isSyncId(value.device) ||
    typeof value.payload !== 'string' ||
    typeof value.receivedAt !== 'string'
  )
    invalid();
  return value as MailboxEvent;
}

export type SyncApi = {
  pull(after: number, limit?: number): Promise<PullResponse>;
  push(request: PushRequest): Promise<PushResponse>;
  key(): Promise<string | null>;
  putKey(request: KeyRequest): Promise<KeyResult>;
  reset(epoch: string): Promise<ResetResult>;
};

export function syncApi(transport: SyncTransport): SyncApi {
  async function call(
    path: string,
    method: 'GET' | 'POST' | 'PUT',
    body?: unknown,
    conflictOk = false,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await transport(path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new SyncOffline();
    }
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    if (response.ok || (conflictOk && response.status === 409)) return parsed;
    const message =
      isRecord(parsed) && typeof parsed.error === 'string'
        ? parsed.error
        : isRecord(parsed) && typeof parsed.message === 'string'
          ? parsed.message
          : `Sync failed (${response.status}).`;
    throw new SyncHttpError(response.status, message);
  }
  return {
    async pull(after, limit) {
      const value = await call(
        `/v1/events?after=${after}${limit ? `&limit=${limit}` : ''}`,
        'GET',
      );
      if (
        !isRecord(value) ||
        !isSyncId(value.epoch) ||
        !isCount(value.head) ||
        typeof value.more !== 'boolean' ||
        !Array.isArray(value.events)
      )
        invalid();
      const events = value.events.map(mailboxEvent);
      // Pages run on from `after` without gaps.
      events.forEach((event, index) => {
        if (event.sequence !== after + index + 1) invalid();
      });
      return {
        epoch: value.epoch,
        head: value.head,
        more: value.more,
        events,
      };
    },
    async push(request) {
      const value = await call('/v1/events', 'POST', request, true);
      if (
        !isRecord(value) ||
        typeof value.ok !== 'boolean' ||
        !isSyncId(value.epoch) ||
        !isCount(value.head)
      )
        invalid();
      if (
        !value.ok &&
        value.reason !== 'behind' &&
        value.reason !== 'duplicate' &&
        value.reason !== 'reset'
      )
        invalid();
      return value as PushResponse;
    },
    async key() {
      const value = await call('/v1/key', 'GET');
      if (
        !isRecord(value) ||
        (value.wrapped !== null && typeof value.wrapped !== 'string')
      )
        invalid();
      return value.wrapped as string | null;
    },
    async putKey(request) {
      const value = await call('/v1/key', 'PUT', request, true);
      if (!isRecord(value) || typeof value.ok !== 'boolean') invalid();
      return value as KeyResult;
    },
    async reset(epoch) {
      const value = await call('/v1/reset', 'POST', { epoch }, true);
      if (
        !isRecord(value) ||
        typeof value.ok !== 'boolean' ||
        !isSyncId(value.epoch)
      )
        invalid();
      return value as ResetResult;
    },
  };
}
