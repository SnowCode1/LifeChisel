// End-to-end encryption for sync (docs/SYNC.md). Each event is encrypted on
// the device with the account key (AES-256-GCM) before it is sent. The key
// itself is stored on the server only wrapped with the recovery code, which
// never leaves the person. Uses Web Crypto (browsers, Node and Workers).
import type { StoredEvent } from '../storage/model.ts';
import type { MailboxEvent, SealedEvent } from './protocol.ts';

const subtle = () => globalThis.crypto.subtle;
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
  globalThis.crypto.getRandomValues(new Uint8Array(length));
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

// The code has 160 random bits, so a fast key derivation is enough; binding
// to the account means a code never unlocks another account's key.
async function wrappingKey(code: string, account: string) {
  const material = await subtle().importKey(
    'raw',
    buffer(codeBytes(code)),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('onpurpose-recovery-v1'),
      info: encoder.encode(account),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const WRAP_VERSION = 1;

/** The account key encrypted with a recovery code, for the server. */
export async function wrapAccountKey(
  key: CryptoKey,
  recoveryCode: string,
  account: string,
): Promise<string> {
  const code = normalizeRecoveryCode(recoveryCode);
  if (!code) throw new Error('Invalid recovery code.');
  const iv = random(12);
  const raw = new Uint8Array(await subtle().exportKey('raw', key));
  const sealed = new Uint8Array(
    await subtle().encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: encoder.encode(`onpurpose-key-v1|${account}`),
      },
      await wrappingKey(code, account),
      raw,
    ),
  );
  const out = new Uint8Array(1 + iv.length + sealed.length);
  out[0] = WRAP_VERSION;
  out.set(iv, 1);
  out.set(sealed, 1 + iv.length);
  return toBase64Url(out);
}

export async function unwrapAccountKey(
  wrapped: string,
  recoveryCode: string,
  account: string,
): Promise<CryptoKey> {
  const code = normalizeRecoveryCode(recoveryCode);
  if (!code) throw new WrongRecoveryCode();
  const bytes = fromBase64Url(wrapped);
  if (bytes[0] !== WRAP_VERSION) throw new Error('Unsupported key format.');
  let raw: ArrayBuffer;
  try {
    raw = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: buffer(bytes.subarray(1, 13)),
        additionalData: encoder.encode(`onpurpose-key-v1|${account}`),
      },
      await wrappingKey(code, account),
      buffer(bytes.subarray(13)),
    );
  } catch {
    throw new WrongRecoveryCode();
  }
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
}
