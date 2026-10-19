// Sign-in for sync (docs/SYNC.md): Better Auth with accounts in D1. Sessions
// travel as bearer tokens so the browser and the phone use the same flow.
// Passkeys are added once signed in. Email and password exist only for
// development until Apple, Google and emailed-code sign-in arrive.
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { bearer } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';

export type AuthSettings = {
  database: BetterAuthOptions['database'];
  /** The Worker's own origin. */
  baseURL: string;
  secret: string;
  /** Browser origins of the apps, trusted for sign-in and passkeys. */
  appOrigins: string[];
  /** Domain passkeys belong to: the apps' shared parent domain. */
  passkeyRpId: string;
  passwordSignIn: boolean;
  /** When set, only these emails may create accounts. */
  signupAllowlist: string[] | null;
  /** Erase the account's cloud data before its sign-in records go. */
  onDeleteUser?: (userId: string) => Promise<void>;
};

export function authOptions(settings: AuthSettings): BetterAuthOptions {
  const allowlist = settings.signupAllowlist;
  return {
    appName: 'OnPurpose',
    database: settings.database,
    baseURL: settings.baseURL,
    basePath: '/api/auth',
    secret: settings.secret,
    trustedOrigins: settings.appOrigins,
    emailAndPassword: {
      enabled: settings.passwordSignIn,
      minPasswordLength: 12,
    },
    plugins: [
      bearer(),
      passkey({
        rpID: settings.passkeyRpId,
        rpName: 'OnPurpose',
        origin: settings.appOrigins,
      }),
    ],
    // Kept in D1 because each Worker instance has its own memory.
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30 },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    telemetry: { enabled: false },
    // Required by both stores: deleting an account erases its mailbox too.
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await settings.onDeleteUser?.(user.id);
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (allowlist && !allowlist.includes(user.email.toLowerCase()))
              throw new APIError('FORBIDDEN', {
                message: 'Sign-up is closed on this server.',
              });
          },
        },
      },
    },
  };
}

export const createAuth = (settings: AuthSettings) =>
  betterAuth(authOptions(settings));
export type Auth = ReturnType<typeof createAuth>;
