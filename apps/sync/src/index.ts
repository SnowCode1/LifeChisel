// The sync Worker (docs/SYNC.md): wires the API to Cloudflare. Accounts live
// in D1 through Better Auth; each account's events live in its own Durable
// Object mailbox.
import { DurableObject } from 'cloudflare:workers';
import type { LinkRecord, LinkStep } from '@onpurpose/core/sync/link';
import type {
  KeyCopy,
  KeyCopyRequest,
  KeyCopyResult,
  PullResponse,
  PushRequest,
  PushResponse,
  ResetResult,
} from '@onpurpose/core/sync/protocol';
import { handleRequest, mailboxName } from './api.ts';
import { createAuth, type Auth } from './auth.ts';
import { Mailbox, type MailboxSql } from './mailbox.ts';

type Env = {
  MAILBOX: DurableObjectNamespace<AccountMailbox>;
  DB: D1Database;
  /** A Worker secret; the local value below works only on localhost. */
  BETTER_AUTH_SECRET?: string;
  /** Comma-separated browser origins of the apps. */
  APP_ORIGINS?: string;
  PASSKEY_RP_ID?: string;
  /** Development servers only. */
  DEV_PASSWORD_SIGN_IN?: string;
  DEV_FREE_SYNC?: string;
  /** Comma-separated emails allowed to sign up; unset allows anyone. */
  SIGNUP_ALLOWLIST?: string;
};

// Passed by `npm run sync:dev`. It is public, so it is refused off localhost.
const LOCAL_SECRET = 'local-development-only-secret-never-deploy-0000';

function durableSql(storage: DurableObjectStorage): MailboxSql {
  return {
    all: <T>(query: string, ...params: (string | number | null)[]) =>
      storage.sql.exec(query, ...params).toArray() as T[],
    run: (query, ...params) => {
      storage.sql.exec(query, ...params).toArray();
    },
    transaction: (task) => storage.transactionSync(task),
  };
}

export class AccountMailbox extends DurableObject<Env> {
  private readonly mailbox: Mailbox;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.mailbox = new Mailbox(durableSql(ctx.storage));
    this.mailbox.migrate();
  }

  push(request: PushRequest): PushResponse {
    return this.mailbox.push(request);
  }

  pull(after: number, limit: number): PullResponse {
    return this.mailbox.pull(after, limit);
  }

  keys(): KeyCopy[] {
    return this.mailbox.keys();
  }

  putKey(id: string, request: KeyCopyRequest): KeyCopyResult {
    return this.mailbox.putKey(id, request);
  }

  deleteKey(id: string): boolean {
    return this.mailbox.deleteKey(id);
  }

  createLink(request: { id: string; label: string; newKey: string }): boolean {
    return this.mailbox.createLink(request);
  }

  links(): LinkRecord[] {
    return this.mailbox.links();
  }

  link(id: string): LinkRecord | null {
    return this.mailbox.link(id);
  }

  postLink(id: string, step: LinkStep, value: string): LinkRecord | null {
    return this.mailbox.postLink(id, step, value);
  }

  reset(epoch: string): ResetResult {
    return this.mailbox.reset(epoch);
  }

  erase(): void {
    this.mailbox.erase();
  }
}

const mailboxFor = (env: Env, account: string) =>
  env.MAILBOX.get(env.MAILBOX.idFromName(account));

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

// A new instance for every request: Workers cannot await work begun by another
// request, and a shared instance hung later requests on the deployed server.
function authFor(env: Env, origin: string): Auth {
  const allowlist = list(env.SIGNUP_ALLOWLIST).map((e) => e.toLowerCase());
  return createAuth({
    database: env.DB,
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET!,
    appOrigins: list(env.APP_ORIGINS),
    passkeyRpId: env.PASSKEY_RP_ID || new URL(origin).hostname,
    passwordSignIn: env.DEV_PASSWORD_SIGN_IN === 'enabled',
    signupAllowlist: allowlist.length > 0 ? allowlist : null,
    onDeleteUser: async (userId) => {
      await mailboxFor(env, mailboxName(userId)).erase();
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const secret = env.BETTER_AUTH_SECRET ?? '';
    if (secret.length < 32 || (secret === LOCAL_SECRET && !local)) {
      console.error('BETTER_AUTH_SECRET is missing or is the local value.');
      return Response.json({ error: 'Server misconfigured.' }, { status: 500 });
    }
    return handleRequest(request, {
      auth: authFor(env, url.origin),
      mailboxFor: (account) => mailboxFor(env, account),
      appOrigins: list(env.APP_ORIGINS),
      freeSync: env.DEV_FREE_SYNC === 'enabled',
    });
  },
} satisfies ExportedHandler<Env>;
