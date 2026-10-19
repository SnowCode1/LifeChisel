import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { handleRequest, mailboxName } from '../apps/sync/src/api.ts';
import { createAuth } from '../apps/sync/src/auth.ts';
import { Mailbox } from '../apps/sync/src/mailbox.ts';

const APP = 'http://localhost:5173';
const SERVER = 'http://localhost:8787';
const migration = readFileSync(
  new URL('../apps/sync/migrations/0001_auth.sql', import.meta.url),
  'utf8',
);

function nodeSql(db) {
  return {
    all: (query, ...params) => db.prepare(query).all(...params),
    run: (query, ...params) => {
      db.prepare(query).run(...params);
    },
    transaction: (task) => {
      db.exec('BEGIN');
      try {
        const result = task();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

// A server like the Worker: sign-in tables from the real migration, and one
// in-memory mailbox per account name.
function server({
  freeSync = true,
  passwordSignIn = true,
  signupAllowlist = null,
} = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(migration);
  const mailboxes = new Map();
  const auth = createAuth({
    database: db,
    baseURL: SERVER,
    secret: randomBytes(32).toString('hex'),
    appOrigins: [APP],
    passkeyRpId: 'localhost',
    passwordSignIn,
    signupAllowlist,
    onDeleteUser: async (id) => mailboxes.get(mailboxName(id))?.erase(),
  });
  const config = {
    auth,
    appOrigins: [APP],
    freeSync,
    mailboxFor: (name) => {
      if (!mailboxes.has(name)) {
        const mailbox = new Mailbox(nodeSql(new DatabaseSync(':memory:')));
        mailbox.migrate();
        mailboxes.set(name, mailbox);
      }
      return mailboxes.get(name);
    },
  };
  let ip = 0;
  const call = (
    path,
    { method = 'GET', body, token, origin = APP, from } = {},
  ) =>
    handleRequest(
      new Request(SERVER + path, {
        method,
        headers: {
          ...(origin ? { Origin: origin } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          // Rate limits are per address; most calls come from a fresh one.
          'cf-connecting-ip': from ?? `198.51.100.${(ip += 1) % 250}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      config,
    );
  const signUp = async (email) => {
    const response = await call('/api/auth/sign-up/email', {
      method: 'POST',
      body: { email, password: 'correct horse battery', name: email },
    });
    return { response, token: response.headers.get('set-auth-token') };
  };
  // The epoch a device learns from its first pull.
  const epochOf = async (token) =>
    (await (await call('/v1/events?after=0', { token })).json()).epoch;
  return { call, signUp, mailboxes, epochOf, db };
}

const push = (epoch, expectedHead, ids) => ({
  method: 'POST',
  body: {
    epoch,
    expectedHead,
    events: ids.map((id) => ({ id, device: 'web', payload: 'c2VhbGVk' })),
  },
});

test('a signed-in account pushes and pulls its own mailbox', async () => {
  const { call, signUp, mailboxes, epochOf } = server();
  const { response, token } = await signUp('ada@example.com');
  assert.equal(response.status, 200);
  assert.ok(token);
  const epoch = await epochOf(token);

  const pushed = await call('/v1/events', {
    ...push(epoch, 0, ['a', 'b']),
    token,
  });
  assert.equal(pushed.status, 200);
  assert.equal((await pushed.json()).head, 2);
  const behind = await call('/v1/events', { ...push(epoch, 0, ['c']), token });
  assert.equal(behind.status, 409);
  assert.equal((await behind.json()).reason, 'behind');
  const pulled = await (await call('/v1/events?after=0', { token })).json();
  assert.deepEqual(
    pulled.events.map((event) => event.id),
    ['a', 'b'],
  );
  assert.deepEqual([...mailboxes.keys()].length, 1);
  assert.match([...mailboxes.keys()][0], /^user:/);
});

test('accounts never see each other', async () => {
  const { call, signUp, epochOf } = server();
  const ada = await signUp('ada@example.com');
  const bob = await signUp('bob@example.com');
  await call('/v1/events', {
    ...push(await epochOf(ada.token), 0, ['ada-1']),
    token: ada.token,
  });
  await call('/v1/key', {
    method: 'PUT',
    body: { wrapped: 'adaskey', previous: null },
    token: ada.token,
  });
  const bobs = await (
    await call('/v1/events?after=0', { token: bob.token })
  ).json();
  assert.deepEqual(
    { ...bobs, epoch: undefined },
    { epoch: undefined, head: 0, events: [], more: false },
  );
  const key = await (await call('/v1/key', { token: bob.token })).json();
  assert.deepEqual(key, { wrapped: null });
});

test('without a valid session there is no access', async () => {
  const { call, signUp } = server();
  assert.equal((await call('/v1/events?after=0')).status, 401);
  assert.equal(
    (await call('/v1/events?after=0', { token: 'forged.token' })).status,
    401,
  );
  const { token } = await signUp('ada@example.com');
  const signOut = await call('/api/auth/sign-out', {
    method: 'POST',
    body: {},
    token,
  });
  assert.equal(signOut.status, 200);
  assert.equal((await call('/v1/events?after=0', { token })).status, 401);
});

test('sync is refused unless the server allows free sync', async () => {
  const { call, signUp } = server({ freeSync: false });
  const { token } = await signUp('ada@example.com');
  assert.equal((await call('/v1/events?after=0', { token })).status, 403);
  assert.equal(
    (await call('/v1/events', { ...push('e1', 0, ['a']), token })).status,
    403,
  );
  assert.equal((await call('/v1/key', { token })).status, 403);
});

test('the allowlist limits who can sign up', async () => {
  const { signUp } = server({ signupAllowlist: ['ada@example.com'] });
  assert.equal((await signUp('mallory@example.com')).response.status, 403);
  assert.equal((await signUp('Ada@Example.com')).response.status, 200);
});

test('email and password sign-in can be switched off', async () => {
  const { signUp } = server({ passwordSignIn: false });
  const { response, token } = await signUp('ada@example.com');
  assert.equal(response.status, 400);
  assert.equal(token, null);
});

test('repeated failed sign-ins from one address are slowed down', async () => {
  const { call, signUp } = server();
  await signUp('ada@example.com');
  const statuses = [];
  for (let attempt = 0; attempt < 8; attempt += 1)
    statuses.push(
      (
        await call('/api/auth/sign-in/email', {
          method: 'POST',
          body: { email: 'ada@example.com', password: 'wrong password!!' },
          from: '203.0.113.9',
        })
      ).status,
    );
  assert.equal(statuses[0], 401);
  assert.ok(statuses.includes(429), statuses.join(' '));
});

test('browsers may call only from the app origins', async () => {
  const { call } = server();
  const allowed = await call('/v1/events', { method: 'OPTIONS' });
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), APP);
  assert.equal(
    allowed.headers.get('Access-Control-Expose-Headers'),
    'set-auth-token',
  );
  const other = await call('/v1/events', {
    method: 'OPTIONS',
    origin: 'https://evil.example',
  });
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
  const health = await call('/health');
  assert.deepEqual(await health.json(), { ok: true, protocol: 1 });
});

test('the wrapped key is shared by the account and replaced only knowingly', async () => {
  const { call, signUp } = server();
  const { token } = await signUp('ada@example.com');
  const put = (wrapped, previous) =>
    call('/v1/key', { method: 'PUT', body: { wrapped, previous }, token });
  assert.deepEqual(await (await call('/v1/key', { token })).json(), {
    wrapped: null,
  });
  assert.equal((await put('first', null)).status, 200);
  const clash = await put('second', null);
  assert.equal(clash.status, 409);
  assert.deepEqual(await clash.json(), { ok: false, wrapped: 'first' });
  assert.equal((await put('second', 'first')).status, 200);
  assert.equal((await put('not base64url!', 'second')).status, 400);
});

test('a reset erases the cloud events and refuses pushes on the old epoch', async () => {
  const { call, signUp, epochOf } = server();
  const { token } = await signUp('ada@example.com');
  const epoch = await epochOf(token);
  await call('/v1/events', { ...push(epoch, 0, ['a']), token });
  assert.equal(
    (await call('/v1/reset', { method: 'POST', body: { epoch: 'x' }, token }))
      .status,
    409,
  );
  const reset = await call('/v1/reset', {
    method: 'POST',
    body: { epoch },
    token,
  });
  assert.equal(reset.status, 200);
  const next = (await reset.json()).epoch;
  assert.notEqual(next, epoch);
  const stale = await call('/v1/events', { ...push(epoch, 0, ['b']), token });
  assert.equal((await stale.json()).reason, 'reset');
  const pulled = await (await call('/v1/events?after=0', { token })).json();
  assert.deepEqual([pulled.epoch, pulled.head], [next, 0]);
});

test('deleting the account erases its mailbox and its sign-in records', async () => {
  const { call, signUp, epochOf, mailboxes, db } = server();
  const { token } = await signUp('ada@example.com');
  await call('/v1/events', {
    ...push(await epochOf(token), 0, ['a']),
    token,
  });
  await call('/v1/key', {
    method: 'PUT',
    body: { wrapped: 'key', previous: null },
    token,
  });
  const mailbox = [...mailboxes.values()][0];
  const deleted = await call('/api/auth/delete-user', {
    method: 'POST',
    body: {},
    token,
  });
  assert.equal(deleted.status, 200);
  assert.equal(mailbox.head(), 0);
  assert.equal(mailbox.key(), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM session').get().n, 0);
  assert.equal((await call('/v1/events?after=0', { token })).status, 401);
});
