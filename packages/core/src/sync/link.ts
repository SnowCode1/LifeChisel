// Approving a new device from one that already syncs (docs/SYNC.md,
// Unlocking a new device). The two devices exchange one-time ECDH keys
// through the mailbox, which only relays. The new device commits to its
// nonce before it sees the approver's, so an attacker in the middle cannot
// search for keys that make both screens show the same code (as in
// Bluetooth numeric comparison): a 6-digit code leaves one chance in a
// million. The account key travels only after the person approves, sealed
// for the new device's one-time key.
import { fromBase64Url, importAccountKey, toBase64Url } from './crypto.ts';

/** A request as the mailbox holds it; each step is written once, in order. */
export type LinkRecord = {
  id: string;
  /** What the new device calls itself, such as "Edge on Windows". */
  label: string;
  createdAt: string;
  /** The new device's one-time public key. */
  newKey: string;
  approverKey?: string;
  /** The new device's commitment to its nonce. */
  commitment?: string;
  approverNonce?: string;
  newNonce?: string;
  /** The account key, sealed for the new device. */
  sealedKey?: string;
  declined?: true;
};
export const LINK_STEPS = [
  'approverKey',
  'commitment',
  'approverNonce',
  'newNonce',
  'sealedKey',
] as const;
export type LinkStep = (typeof LINK_STEPS)[number] | 'declined';
/** Requests expire; the new device then starts again. */
export const LINK_LIFETIME_MS = 10 * 60 * 1000;
export const MAX_OPEN_LINKS = 5;

export type LinkApi = {
  createLink(request: {
    id: string;
    label: string;
    newKey: string;
  }): Promise<void>;
  listLinks(): Promise<LinkRecord[]>;
  getLink(id: string): Promise<LinkRecord | null>;
  postLink(id: string, step: LinkStep, value: string): Promise<boolean>;
};

export class LinkDeclined extends Error {
  constructor() {
    super('The other device declined.');
  }
}
export class LinkExpired extends Error {
  constructor() {
    super('The request expired. Start again.');
  }
}
export class LinkTampered extends Error {
  constructor() {
    super('The devices did not agree; nothing was shared. Start again.');
  }
}

const subtle = () => crypto.subtle;
const encoder = new TextEncoder();
const random = (length: number) =>
  crypto.getRandomValues(new Uint8Array(length));
const buffer = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  new Uint8Array(bytes);
const hash = async (...parts: string[]) =>
  new Uint8Array(
    await subtle().digest(
      'SHA-256',
      encoder.encode(['onpurpose-link-v1', ...parts].join('|')),
    ),
  );

export type LinkKeys = { privateKey: CryptoKey; publicKey: string };

export async function linkKeys(): Promise<LinkKeys> {
  const pair = (await subtle().generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  )) as CryptoKeyPair;
  const raw = new Uint8Array(
    (await subtle().exportKey('raw', pair.publicKey)) as ArrayBuffer,
  );
  return { privateKey: pair.privateKey, publicKey: toBase64Url(raw) };
}

export const newNonce = () => toBase64Url(random(16));

export async function commitmentFor(
  newKey: string,
  approverKey: string,
  nonce: string,
): Promise<string> {
  return toBase64Url(await hash('commit', newKey, approverKey, nonce));
}

/** The code both screens show once every step up to the nonces is done. */
export async function linkCode(record: LinkRecord): Promise<string> {
  const { newKey, approverKey, approverNonce, newNonce } = record;
  if (!approverKey || !approverNonce || !newNonce)
    throw new Error('The code needs both keys and both nonces.');
  const digest = await hash(
    'code',
    newKey,
    approverKey,
    approverNonce,
    newNonce,
  );
  const value =
    ((digest[0]! << 24) |
      (digest[1]! << 16) |
      (digest[2]! << 8) |
      digest[3]!) >>>
    0;
  const code = String(value % 1_000_000).padStart(6, '0');
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

// The key that seals the account key, from the ECDH secret and everything
// both devices saw, so a changed step changes the key.
async function sealingKey(
  privateKey: CryptoKey,
  peerKey: string,
  record: LinkRecord,
  account: string,
) {
  const peer = await subtle().importKey(
    'raw',
    buffer(fromBase64Url(peerKey)),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = await subtle().deriveBits(
    // Cast: Workers' typings spell this field differently from browsers'.
    { name: 'ECDH', public: peer } as unknown as Parameters<
      SubtleCrypto['deriveBits']
    >[0],
    privateKey,
    256,
  );
  const material = await subtle().importKey('raw', shared, 'HKDF', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: buffer(
        await hash(
          'transcript',
          record.id,
          record.newKey,
          record.approverKey ?? '',
          record.approverNonce ?? '',
          record.newNonce ?? '',
        ),
      ),
      info: encoder.encode(`onpurpose-link-v1|${account}`),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function sealForNewDevice(
  accountKey: CryptoKey,
  approver: LinkKeys,
  record: LinkRecord,
  account: string,
): Promise<string> {
  const iv = random(12);
  const raw = new Uint8Array(
    (await subtle().exportKey('raw', accountKey)) as ArrayBuffer,
  );
  const sealed = new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(record.id) },
      await sealingKey(approver.privateKey, record.newKey, record, account),
      raw,
    ),
  );
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return toBase64Url(out);
}

export async function openOnNewDevice(
  keys: LinkKeys,
  record: LinkRecord,
  account: string,
): Promise<CryptoKey> {
  if (!record.sealedKey || !record.approverKey) throw new LinkTampered();
  const bytes = fromBase64Url(record.sealedKey);
  try {
    const raw = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: buffer(bytes.subarray(0, 12)),
        additionalData: encoder.encode(record.id),
      },
      await sealingKey(keys.privateKey, record.approverKey, record, account),
      buffer(bytes.subarray(12)),
    );
    return importAccountKey(new Uint8Array(raw));
  } catch {
    throw new LinkTampered();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const expired = (record: LinkRecord, now: number) =>
  now - Date.parse(record.createdAt) > LINK_LIFETIME_MS;

/**
 * The new device's side: ask, show the code when both nonces are known, and
 * return the account key once approved. Stops on decline, expiry or abort.
 */
export async function requestApproval(options: {
  api: LinkApi;
  account: string;
  label: string;
  newId: () => string;
  onCode: (code: string) => void;
  signal?: AbortSignal;
  pollMs?: number;
}): Promise<CryptoKey> {
  const { api, account, label, onCode, signal } = options;
  const keys = await linkKeys();
  const id = options
    .newId()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 64);
  await api.createLink({ id, label, newKey: keys.publicKey });
  const nonce = newNonce();
  let shown = false;
  for (;;) {
    if (signal?.aborted) throw new Error('Cancelled.');
    const record = await api.getLink(id);
    if (!record || expired(record, Date.now())) throw new LinkExpired();
    if (record.declined) throw new LinkDeclined();
    if (record.newKey !== keys.publicKey) throw new LinkTampered();
    if (record.sealedKey) return openOnNewDevice(keys, record, account);
    if (record.approverKey && !record.commitment)
      await api.postLink(
        id,
        'commitment',
        await commitmentFor(keys.publicKey, record.approverKey, nonce),
      );
    if (record.approverNonce && !record.newNonce)
      await api.postLink(id, 'newNonce', nonce);
    if (record.newNonce && !shown) {
      if (record.newNonce !== nonce) throw new LinkTampered();
      onCode(await linkCode(record));
      shown = true;
    }
    await sleep(options.pollMs ?? 1500);
  }
}

export type PendingApproval = {
  id: string;
  label: string;
  code: string;
  approve(accountKey: CryptoKey): Promise<void>;
  decline(): Promise<void>;
};

/**
 * The approving device's side: answer one request up to the code. Null when
 * another device answered it first, or it ended.
 */
export async function answerRequest(options: {
  api: LinkApi;
  account: string;
  id: string;
  signal?: AbortSignal;
  pollMs?: number;
  timeoutMs?: number;
}): Promise<PendingApproval | null> {
  const { api, account, id, signal } = options;
  const keys = await linkKeys();
  const first = await api.getLink(id);
  if (!first || first.approverKey || first.declined || first.sealedKey)
    return null;
  if (!(await api.postLink(id, 'approverKey', keys.publicKey))) return null;
  const nonce = newNonce();
  const deadline = Date.now() + (options.timeoutMs ?? LINK_LIFETIME_MS);
  for (;;) {
    if (signal?.aborted || Date.now() > deadline) return null;
    const record = await api.getLink(id);
    if (!record || record.declined || record.approverKey !== keys.publicKey)
      return null;
    if (record.commitment && !record.approverNonce)
      await api.postLink(id, 'approverNonce', nonce);
    if (record.newNonce) {
      // The nonce must match what the new device committed to before it
      // saw ours; otherwise someone in between chose it.
      if (
        record.approverNonce !== nonce ||
        record.commitment !==
          (await commitmentFor(record.newKey, keys.publicKey, record.newNonce))
      )
        throw new LinkTampered();
      const code = await linkCode(record);
      return {
        id,
        label: record.label,
        code,
        approve: async (accountKey) => {
          const sealed = await sealForNewDevice(
            accountKey,
            keys,
            record,
            account,
          );
          if (!(await api.postLink(id, 'sealedKey', sealed)))
            throw new LinkExpired();
        },
        decline: async () => {
          await api.postLink(id, 'declined', 'yes');
        },
      };
    }
    await sleep(options.pollMs ?? 1500);
  }
}
