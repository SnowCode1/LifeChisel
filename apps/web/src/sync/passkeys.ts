// Browser passkey helpers for sync (docs/SYNC.md, Unlocking a new device).
// Sign-in and registration go through Better Auth's client, which keeps
// extension results on this device; these cover the rest.
import { fromBase64Url } from '@onpurpose/core/sync/crypto';

/** The PRF secret in a WebAuthn result, if the passkey produced one. */
export function prfSecret(results: unknown): Uint8Array | null {
  const first = (
    results as { prf?: { results?: { first?: ArrayBuffer | ArrayBufferView } } }
  )?.prf?.results?.first;
  if (!first) return null;
  return first instanceof ArrayBuffer
    ? new Uint8Array(first)
    : new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
}

export function prfEnabled(results: unknown): boolean {
  return !!(results as { prf?: { enabled?: boolean } })?.prf?.enabled;
}

/** The PRF request for a passkey (not yet in TypeScript's DOM types). */
export const prfExtension = (input: Uint8Array<ArrayBuffer>) =>
  ({ prf: { eval: { first: input } } }) as AuthenticationExtensionsClientInputs;

const challenge = () => crypto.getRandomValues(new Uint8Array(32));

/**
 * Ask one passkey for its PRF secret (a second prompt, used when the passkey
 * did not produce it while being created). Null when it cannot.
 */
export async function evaluatePasskey(
  credentialId: string,
  input: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array | null> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge(),
      allowCredentials: [
        { type: 'public-key', id: new Uint8Array(fromBase64Url(credentialId)) },
      ],
      userVerification: 'required',
      extensions: prfExtension(input),
    },
  })) as PublicKeyCredential | null;
  return credential ? prfSecret(credential.getClientExtensionResults()) : null;
}

/**
 * Confirm the person at this device with one of their passkeys before it
 * approves another device. Local only: it guards an unlocked laptop.
 */
export async function confirmPresence(
  credentialIds: string[],
): Promise<boolean> {
  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: challenge(),
        allowCredentials: credentialIds.map((id) => ({
          type: 'public-key' as const,
          id: new Uint8Array(fromBase64Url(id)),
        })),
        userVerification: 'required',
      },
    });
    return !!credential;
  } catch {
    return false;
  }
}

/** What this device calls itself in approval requests, e.g. "Edge on Windows". */
export function deviceLabel(userAgent = navigator.userAgent): string {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'A browser';
  const system = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(userAgent)
            ? 'Mac'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : '';
  return system ? `${browser} on ${system}` : browser;
}
