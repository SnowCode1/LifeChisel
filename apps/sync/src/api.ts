// The sync HTTP API (docs/SYNC.md), kept apart from Cloudflare's runtime so
// the Node tests drive the same routes with real sign-in and a real mailbox.
// The account comes only from the signed-in session, never from the request.
import {
  MAX_BATCH_PAYLOAD,
  SYNC_PROTOCOL_VERSION,
  parseKeyRequest,
  parsePullQuery,
  parsePushRequest,
  parseResetRequest,
  type KeyRequest,
  type KeyResult,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type ResetResult,
} from '@onpurpose/core/sync/protocol';
import type { Auth } from './auth.ts';

type Maybe<T> = Promise<T> | T;
export type MailboxClient = {
  push(request: PushRequest): Maybe<PushResponse>;
  pull(after: number, limit: number): Maybe<PullResponse>;
  key(): Maybe<string | null>;
  putKey(request: KeyRequest): Maybe<KeyResult>;
  reset(epoch: string): Maybe<ResetResult>;
  erase(): Maybe<void>;
};

export type ApiConfig = {
  auth: Auth;
  mailboxFor(account: string): MailboxClient;
  appOrigins: string[];
  /**
   * Development only: every signed-in account may sync. Otherwise sync is
   * refused until the subscription check exists (build step 7).
   */
  freeSync: boolean;
};

// Room for JSON punctuation and IDs around the payload characters.
const MAX_PUSH_BODY = MAX_BATCH_PAYLOAD + 1_000_000;

const json = (body: unknown, status = 200) => Response.json(body, { status });

function corsHeaders(request: Request, origins: string[]) {
  const origin = request.headers.get('Origin');
  if (!origin || !origins.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Expose-Headers': 'set-auth-token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

async function readJson(
  request: Request,
  limit: number,
): Promise<{ body: unknown } | { error: Response }> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (declared > limit) return { error: json({ error: 'Too large.' }, 413) };
  const text = await request.text();
  if (text.length > limit) return { error: json({ error: 'Too large.' }, 413) };
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return { error: json({ error: 'Send JSON.' }, 400) };
  }
}

/** The mailbox of the signed-in account, or the response refusing access. */
export async function mailboxOf(
  request: Request,
  config: ApiConfig,
): Promise<{ mailbox: MailboxClient } | { refused: Response }> {
  const session = await config.auth.api.getSession({
    headers: request.headers,
  });
  if (!session) return { refused: json({ error: 'Sign in to sync.' }, 401) };
  if (!config.freeSync)
    return { refused: json({ error: 'Sync needs a subscription.' }, 403) };
  return { mailbox: config.mailboxFor(mailboxName(session.user.id)) };
}
export const mailboxName = (userId: string) => `user:${userId}`;

async function key(request: Request, config: ApiConfig) {
  if (request.method !== 'GET' && request.method !== 'PUT')
    return json({ error: 'Use GET or PUT.' }, 405);
  const access = await mailboxOf(request, config);
  if ('refused' in access) return access.refused;
  if (request.method === 'GET')
    return json({ wrapped: await access.mailbox.key() });
  const read = await readJson(request, 8192);
  if ('error' in read) return read.error;
  const parsed = parseKeyRequest(read.body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const result = await access.mailbox.putKey(parsed.value);
  return json(result, result.ok ? 200 : 409);
}

async function reset(request: Request, config: ApiConfig) {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const access = await mailboxOf(request, config);
  if ('refused' in access) return access.refused;
  const read = await readJson(request, 1024);
  if ('error' in read) return read.error;
  const parsed = parseResetRequest(read.body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const result = await access.mailbox.reset(parsed.value.epoch);
  return json(result, result.ok ? 200 : 409);
}

async function events(request: Request, config: ApiConfig, url: URL) {
  if (request.method !== 'GET' && request.method !== 'POST')
    return json({ error: 'Use GET or POST.' }, 405);
  const access = await mailboxOf(request, config);
  if ('refused' in access) return access.refused;
  const mailbox = access.mailbox;

  if (request.method === 'GET') {
    const query = parsePullQuery(
      url.searchParams.get('after'),
      url.searchParams.get('limit'),
    );
    if (!query.ok) return json({ error: query.error }, 400);
    return json(await mailbox.pull(query.value.after, query.value.limit));
  }

  const read = await readJson(request, MAX_PUSH_BODY);
  if ('error' in read) return read.error;
  const push = parsePushRequest(read.body);
  if (!push.ok) return json({ error: push.error }, 400);
  const result = await mailbox.push(push.value);
  return json(result, result.ok ? 200 : 409);
}

async function route(request: Request, config: ApiConfig) {
  const url = new URL(request.url);
  if (url.pathname === '/health' && request.method === 'GET')
    return json({ ok: true, protocol: SYNC_PROTOCOL_VERSION });
  if (url.pathname.startsWith('/api/auth/'))
    return config.auth.handler(request);
  if (url.pathname === '/v1/events') return events(request, config, url);
  if (url.pathname === '/v1/key') return key(request, config);
  if (url.pathname === '/v1/reset') return reset(request, config);
  return json({ error: 'Not found.' }, 404);
}

export async function handleRequest(
  request: Request,
  config: ApiConfig,
): Promise<Response> {
  const cors = corsHeaders(request, config.appOrigins);
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: cors ?? {} });
  let response: Response;
  try {
    response = await route(request, config);
  } catch (error) {
    console.error(error);
    response = json({ error: 'Server error.' }, 500);
  }
  if (!cors) return response;
  // Copy so headers can be added to responses with immutable headers.
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(cors)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
