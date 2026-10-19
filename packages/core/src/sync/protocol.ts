// The account mailbox protocol (docs/SYNC.md), shared by the sync server and
// both apps. The server orders events it cannot read: each payload is opaque
// encrypted text, and only IDs, sizes and times are visible to it.

export const SYNC_PROTOCOL_VERSION = 1;
export const MAX_PUSH_EVENTS = 200;
export const MAX_PULL_EVENTS = 500;
/** Characters of base64url ciphertext in one event. */
export const MAX_PAYLOAD_LENGTH = 1_000_000;
/** Characters of payload in one push, and the page size of one pull. */
export const MAX_BATCH_PAYLOAD = 4_000_000;
/** Characters of the wrapped account key (base64url). */
export const MAX_WRAPPED_KEY_LENGTH = 1024;

const SYNC_ID = /^[A-Za-z0-9_-]{1,64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** An encrypted event as a device sends it. */
export type SealedEvent = { id: string; device: string; payload: string };
/** An event in the account's order, as the mailbox returns it. */
export type MailboxEvent = SealedEvent & {
  sequence: number;
  receivedAt: string;
};
/**
 * `epoch` names the mailbox's current contents. Erasing the cloud copy
 * starts a new epoch, so a device notices and does not push onto it blindly.
 */
export type PushRequest = {
  epoch: string;
  expectedHead: number;
  events: SealedEvent[];
};
/**
 * `behind`: other events arrived first; pull, rebase and push again.
 * `duplicate`: an event is already stored (a retry whose first attempt
 * succeeded); pull to see it in the account's order.
 * `reset`: the cloud copy was erased since this device last synced.
 */
export type PushResponse =
  | { ok: true; epoch: string; head: number; receivedAt: string }
  | {
      ok: false;
      reason: 'behind' | 'duplicate' | 'reset';
      epoch: string;
      head: number;
    };
export type PullResponse = {
  epoch: string;
  head: number;
  events: MailboxEvent[];
  more: boolean;
};
/** The account key, encrypted with the recovery code (or null when unset). */
export type KeyResponse = { wrapped: string | null };
/** Set the wrapped key if it is still `previous` (null: none yet). */
export type KeyRequest = { wrapped: string; previous: string | null };
export type KeyResult = { ok: boolean; wrapped: string | null };
/** Erase the cloud events if the mailbox is still at `epoch`. */
export type ResetRequest = { epoch: string };
export type ResetResult = { ok: boolean; epoch: string };
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function isSyncId(value: unknown): value is string {
  return typeof value === 'string' && SYNC_ID.test(value);
}

function isHead(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function hasExactKeys(value: object, keys: readonly string[]) {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => key in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWrappedKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    BASE64URL.test(value) &&
    value.length <= MAX_WRAPPED_KEY_LENGTH
  );
}

function parseSealedEvent(value: unknown): SealedEvent | string {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'device', 'payload']))
    return 'Each event needs exactly id, device and payload.';
  if (!isSyncId(value.id) || !isSyncId(value.device))
    return 'Event and device IDs must be 1–64 letters, digits, - or _.';
  if (
    typeof value.payload !== 'string' ||
    !BASE64URL.test(value.payload) ||
    value.payload.length > MAX_PAYLOAD_LENGTH
  )
    return `Payloads must be base64url text of at most ${MAX_PAYLOAD_LENGTH} characters.`;
  return { id: value.id, device: value.device, payload: value.payload };
}

export function parsePushRequest(value: unknown): Parsed<PushRequest> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['epoch', 'expectedHead', 'events'])
  )
    return {
      ok: false,
      error: 'A push needs exactly epoch, expectedHead and events.',
    };
  if (!isSyncId(value.epoch))
    return { ok: false, error: 'epoch must be a mailbox epoch.' };
  if (!isHead(value.expectedHead))
    return { ok: false, error: 'expectedHead must be a whole number ≥ 0.' };
  if (
    !Array.isArray(value.events) ||
    value.events.length === 0 ||
    value.events.length > MAX_PUSH_EVENTS
  )
    return {
      ok: false,
      error: `A push carries 1–${MAX_PUSH_EVENTS} events.`,
    };
  const events: SealedEvent[] = [];
  const ids = new Set<string>();
  let size = 0;
  for (const raw of value.events) {
    const event = parseSealedEvent(raw);
    if (typeof event === 'string') return { ok: false, error: event };
    if (ids.has(event.id))
      return { ok: false, error: 'A push repeats an event ID.' };
    ids.add(event.id);
    size += event.payload.length;
    events.push(event);
  }
  if (size > MAX_BATCH_PAYLOAD)
    return {
      ok: false,
      error: `A push carries at most ${MAX_BATCH_PAYLOAD} payload characters.`,
    };
  return {
    ok: true,
    value: { epoch: value.epoch, expectedHead: value.expectedHead, events },
  };
}

/** Reads `after` and `limit` from a pull's query string. */
export function parsePullQuery(
  after: string | null,
  limit: string | null,
): Parsed<{ after: number; limit: number }> {
  const afterValue = after === null ? NaN : Number(after);
  if (!/^\d+$/.test(after ?? '') || !isHead(afterValue))
    return { ok: false, error: 'after must be a whole number ≥ 0.' };
  if (limit === null)
    return { ok: true, value: { after: afterValue, limit: MAX_PULL_EVENTS } };
  const limitValue = Number(limit);
  if (
    !/^\d+$/.test(limit) ||
    !Number.isSafeInteger(limitValue) ||
    limitValue < 1 ||
    limitValue > MAX_PULL_EVENTS
  )
    return { ok: false, error: `limit must be 1–${MAX_PULL_EVENTS}.` };
  return { ok: true, value: { after: afterValue, limit: limitValue } };
}

export function parseKeyRequest(value: unknown): Parsed<KeyRequest> {
  if (!isRecord(value) || !hasExactKeys(value, ['wrapped', 'previous']))
    return { ok: false, error: 'A key needs exactly wrapped and previous.' };
  if (
    !isWrappedKey(value.wrapped) ||
    (value.previous !== null && !isWrappedKey(value.previous))
  )
    return { ok: false, error: 'Wrapped keys are short base64url text.' };
  return {
    ok: true,
    value: { wrapped: value.wrapped, previous: value.previous },
  };
}

export function parseResetRequest(value: unknown): Parsed<ResetRequest> {
  if (!isRecord(value) || !hasExactKeys(value, ['epoch']))
    return { ok: false, error: 'A reset needs exactly epoch.' };
  if (!isSyncId(value.epoch))
    return { ok: false, error: 'epoch must be a mailbox epoch.' };
  return { ok: true, value: { epoch: value.epoch } };
}
