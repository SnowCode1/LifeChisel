// End-to-end encryption for sync (docs/SYNC.md). Each event is encrypted on
// the device with the account key (AES-256-GCM) before it is sent. The key
// itself is stored on the server only wrapped with the recovery code, which
// never leaves the person. Uses Web Crypto (browsers, Node and Workers).
import type { StoredEvent } from '../storage/model.ts';
import type { MailboxEvent, SealedEvent } from './protocol.ts';

const subtle = () => crypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class SyncDecryptError extends Error {
  constructor(message = 'Cloud data could not be decrypted.') {
    super(message);
  }
}
export class WrongRecoveryCode extends Error {
  constructor() {
    super('That recovery code does not unlock this account.');
  }
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
export function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}
const random = (length: number) =>
  crypto.getRandomValues(new Uint8Array(length));
// Web Crypto takes plain buffers; views over decoded text are copied.
const buffer = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  new Uint8Array(bytes);

/** A new account key; extractable so a new recovery code can wrap it. */
export function newAccountKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]) as Promise<CryptoKey>;
}

// What each ciphertext is bound to, so the server cannot move, renumber or
// swap events between devices or accounts without decryption failing.
function eventContext(sequence: number, id: string, device: string) {
  return encoder.encode(`onpurpose-sync-v1|${sequence}|${id}|${device}`);
}

/** Encrypt one event for the mailbox at its final position. */
export async function sealEvent(
  key: CryptoKey,
  event: StoredEvent,
  device: string,
): Promise<SealedEvent> {
  const iv = random(12);
  const sealed = new Uint8Array(
    await subtle().encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: eventContext(event.sequence, event.id, device),
      },
      key,
      encoder.encode(JSON.stringify(event)),
    ),
  );
  const payload = new Uint8Array(iv.length + sealed.length);
  payload.set(iv);
  payload.set(sealed, iv.length);
  return { id: event.id, device, payload: toBase64Url(payload) };
}

/**
 * Decrypt one mailbox event. Its position, ID and device must match what it
 * was encrypted with; the parsed event is checked again by replay.
 */
export async function openEvent(
  key: CryptoKey,
  event: MailboxEvent,
): Promise<StoredEvent> {
  let plain: Uint8Array;
  try {
    const bytes = fromBase64Url(event.payload);
    plain = new Uint8Array(
      await subtle().decrypt(
        {
          name: 'AES-GCM',
          iv: buffer(bytes.subarray(0, 12)),
          additionalData: eventContext(event.sequence, event.id, event.device),
        },
        key,
        buffer(bytes.subarray(12)),
      ),
    );
  } catch {
    throw new SyncDecryptError();
  }
  const parsed = JSON.parse(decoder.decode(plain)) as StoredEvent;
  if (parsed.id !== event.id || parsed.sequence !== event.sequence)
    throw new SyncDecryptError('A cloud event is not where it belongs.');
  return parsed;
}

// Recovery codes: 160 random bits in Crockford base32, shown in groups of
// four. Easy to read aloud; I, L and O are read as 1, 1 and 0.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_BYTES = 20;
const CODE_LENGTH = 32;

export function newRecoveryCode(): string {
  const bytes = random(CODE_BYTES);
  let bits = 0;
  let value = 0;
  let code = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      code += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return formatRecoveryCode(code);
}

export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,4}/g)!.join('-');
}

/** The canonical code, or null when the input cannot be one. */
export function normalizeRecoveryCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  if (code.length !== CODE_LENGTH) return null;
  for (const character of code) if (!ALPHABET.includes(character)) return null;
  return code;
}

function codeBytes(code: string): Uint8Array {
  const bytes = new Uint8Array(CODE_BYTES);
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const character of code) {
    value = (value << 5) | ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes[index++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return bytes;
}

// Wrapping the account key (docs/SYNC.md, Unlocking a new device). The
// server keeps copies of the key, each encrypted with a key derived from one
// unlock secret: the emergency recovery code, or a passkey's PRF output. Both
// secrets have at least 160 random bits, so a fast key derivation is enough;
// binding to the account means a secret never unlocks another account's key.
type WrapKind = 'recovery' | 'passkey';
const wrapVersions: Record<WrapKind, number> = { recovery: 1, passkey: 2 };
const wrapSalts: Record<WrapKind, string> = {
  recovery: 'onpurpose-recovery-v1',
  passkey: 'onpurpose-passkey-v1',
};

async function wrappingKey(
  secret: Uint8Array,
  kind: WrapKind,
  account: string,
) {
  const material = await subtle().importKey(
    'raw',
    buffer(secret),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(wrapSalts[kind]),
      info: encoder.encode(account),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function wrap(
  key: CryptoKey,
  secret: Uint8Array,
  kind: WrapKind,
  account: string,
): Promise<string> {
  const iv = random(12);
  const raw = new Uint8Array(
    (await subtle().exportKey('raw', key)) as ArrayBuffer,
  );
  const sealed = new Uint8Array(
    await subtle().encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: encoder.encode(`onpurpose-key-v1|${account}`),
      },
      await wrappingKey(secret, kind, account),
      raw,
    ),
  );
  const out = new Uint8Array(1 + iv.length + sealed.length);
  out[0] = wrapVersions[kind];
  out.set(iv, 1);
  out.set(sealed, 1 + iv.length);
  return toBase64Url(out);
}

async function unwrap(
  wrapped: string,
  secret: Uint8Array,
  kind: WrapKind,
  account: string,
): Promise<CryptoKey | null> {
  const bytes = fromBase64Url(wrapped);
  if (bytes[0] !== wrapVersions[kind]) return null;
  let raw: ArrayBuffer;
  try {
    raw = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: buffer(bytes.subarray(1, 13)),
        additionalData: encoder.encode(`onpurpose-key-v1|${account}`),
      },
      await wrappingKey(secret, kind, account),
      buffer(bytes.subarray(13)),
    );
  } catch {
    return null;
  }
  return importAccountKey(new Uint8Array(raw));
}

/** An account key from its raw bytes (extractable, so it can be rewrapped). */
export function importAccountKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey('raw', buffer(raw), { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]) as Promise<CryptoKey>;
}

/** The account key encrypted with the emergency recovery code. */
export async function wrapAccountKey(
  key: CryptoKey,
  recoveryCode: string,
  account: string,
): Promise<string> {
  const code = normalizeRecoveryCode(recoveryCode);
  if (!code) throw new Error('Invalid recovery code.');
  return wrap(key, codeBytes(code), 'recovery', account);
}

export async function unwrapAccountKey(
  wrapped: string,
  recoveryCode: string,
  account: string,
): Promise<CryptoKey> {
  const code = normalizeRecoveryCode(recoveryCode);
  const key = code
    ? await unwrap(wrapped, codeBytes(code), 'recovery', account)
    : null;
  if (!key) throw new WrongRecoveryCode();
  return key;
}

/**
 * The PRF input every OnPurpose passkey is asked for. The passkey turns it
 * into the same 32-byte secret on every device it syncs to; the secret never
 * leaves the device.
 */
export async function passkeyPrfInput(): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await subtle().digest(
      'SHA-256',
      encoder.encode('onpurpose-passkey-unlock-v1'),
    ),
  );
}

/** The account key encrypted with a passkey's PRF secret. */
export function wrapAccountKeyWithPasskey(
  key: CryptoKey,
  prfSecret: Uint8Array,
  account: string,
): Promise<string> {
  return wrap(key, prfSecret, 'passkey', account);
}

/** The account key from a passkey's copy, or null when it does not open. */
export function unwrapAccountKeyWithPasskey(
  wrapped: string,
  prfSecret: Uint8Array,
  account: string,
): Promise<CryptoKey | null> {
  return unwrap(wrapped, prfSecret, 'passkey', account);
}

/** A short, stable ID for a passkey's copy of the key (server-safe). */
export async function passkeyCopyId(credentialId: string): Promise<string> {
  const digest = new Uint8Array(
    await subtle().digest('SHA-256', encoder.encode(credentialId)),
  );
  return `pk-${toBase64Url(digest).slice(0, 40)}`;
}
