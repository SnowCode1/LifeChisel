// The mailbox API as a device sees it (docs/SYNC.md). The platform supplies
// the transport (base address and session token); answers are checked here
// rather than trusted.
import type { LinkApi, LinkRecord } from './link.ts';
import {
  isSyncId,
  type KeyCopy,
  type KeyCopyRequest,
  type KeyCopyResult,
  type MailboxEvent,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type ResetResult,
} from './protocol.ts';

export type SyncTransport = (
  path: string,
  init: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: string },
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

export type SyncApi = LinkApi & {
  pull(after: number, limit?: number): Promise<PullResponse>;
  push(request: PushRequest): Promise<PushResponse>;
  keys(): Promise<KeyCopy[]>;
  putKey(id: string, request: KeyCopyRequest): Promise<KeyCopyResult>;
  deleteKey(id: string): Promise<boolean>;
  reset(epoch: string): Promise<ResetResult>;
};

function keyCopy(value: unknown): KeyCopy {
  if (
    !isRecord(value) ||
    !isSyncId(value.id) ||
    (value.kind !== 'recovery' && value.kind !== 'passkey') ||
    typeof value.label !== 'string' ||
    (value.credentialId !== null && typeof value.credentialId !== 'string') ||
    typeof value.wrapped !== 'string' ||
    typeof value.createdAt !== 'string'
  )
    invalid();
  return value as KeyCopy;
}

function linkRecord(value: unknown): LinkRecord {
  const text = (field: unknown) =>
    field === undefined || typeof field === 'string';
  if (
    !isRecord(value) ||
    !isSyncId(value.id) ||
    typeof value.label !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.newKey !== 'string' ||
    !text(value.approverKey) ||
    !text(value.commitment) ||
    !text(value.approverNonce) ||
    !text(value.newNonce) ||
    !text(value.sealedKey) ||
    (value.declined !== undefined && value.declined !== true)
  )
    invalid();
  return value as LinkRecord;
}

export function syncApi(transport: SyncTransport): SyncApi {
  async function call(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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
        !isCount(value.links) ||
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
        links: value.links,
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
    async keys() {
      const value = await call('/v1/keys', 'GET');
      if (!isRecord(value) || !Array.isArray(value.keys)) invalid();
      return value.keys.map(keyCopy);
    },
    async putKey(id, request) {
      const value = await call(`/v1/keys/${id}`, 'PUT', request, true);
      if (!isRecord(value) || typeof value.ok !== 'boolean') invalid();
      return {
        ok: value.ok,
        copy: value.copy === null ? null : keyCopy(value.copy),
      };
    },
    async deleteKey(id) {
      const value = await call(`/v1/keys/${id}`, 'DELETE');
      return isRecord(value) && value.ok === true;
    },
    async createLink(request) {
      const value = await call('/v1/links', 'POST', request);
      if (!isRecord(value) || value.ok !== true) invalid();
    },
    async listLinks() {
      const value = await call('/v1/links', 'GET');
      if (!isRecord(value) || !Array.isArray(value.links)) invalid();
      return value.links.map(linkRecord);
    },
    async getLink(id) {
      try {
        return linkRecord(await call(`/v1/links/${id}`, 'GET'));
      } catch (error) {
        if (error instanceof SyncHttpError && error.status === 404) return null;
        throw error;
      }
    },
    async postLink(id, step, value) {
      try {
        linkRecord(await call(`/v1/links/${id}`, 'POST', { step, value }));
        return true;
      } catch (error) {
        if (error instanceof SyncHttpError && error.status === 409)
          return false;
        throw error;
      }
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
