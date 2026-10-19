// Unlocking a new device (docs/SYNC.md): approval from another device, and
// passkey copies of the account key. Real Web Crypto and a real mailbox;
// fictional data only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { Mailbox } from '../apps/sync/src/mailbox.ts';
import {
  LinkDeclined,
  LinkTampered,
  answerRequest,
  requestApproval,
} from '../packages/core/src/sync/link.ts';
import {
  addPasskeyUnlock,
  createAccountKey,
  saveAccountKey,
  unlockWithPasskey,
} from '../packages/core/src/sync/engine.ts';
import {
  openEvent,
  passkeyPrfInput,
  sealEvent,
} from '../packages/core/src/sync/crypto.ts';

function mailbox() {
  const db = new DatabaseSync(':memory:');
  const box = new Mailbox({
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
  });
  box.migrate();
  return box;
}
// The device API over a mailbox, with an optional hook to tamper in transit.
function api(box, tamper = (step, value) => value) {
  return {
    keys: async () => structuredClone(box.keys()),
    putKey: async (id, request) => structuredClone(box.putKey(id, request)),
    deleteKey: async (id) => box.deleteKey(id),
    createLink: async (request) => {
      if (!box.createLink(request)) throw new Error('refused');
    },
    listLinks: async () => structuredClone(box.links()),
    getLink: async (id) => structuredClone(box.link(id)),
    postLink: async (id, step, value) =>
      !!box.postLink(id, step, tamper(step, value)),
  };
}
let ids = 0;
const newId = () => `req${++ids}`;
const fast = { pollMs: 5 };

// Proof that two keys are the same: one opens what the other sealed.
async function sameKey(left, right) {
  const event = { id: 'x', sequence: 1, check: Math.random() };
  const sealed = await sealEvent(left, event, 'd');
  const opened = await openEvent(right, {
    ...sealed,
    sequence: 1,
    receivedAt: '',
  });
  return opened.check === event.check;
}

// The approving device finds the request in the open list, as the app does.
async function approverAnswers(device) {
  for (;;) {
    const [request] = await device.listLinks();
    if (request) return request.id;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('a new device gets the account key once the person approves on another', async () => {
  const box = mailbox();
  const { key } = await createAccountKey('acct');
  let shown = null;
  const requesting = requestApproval({
    api: api(box),
    account: 'acct',
    label: 'Edge on Windows',
    newId,
    onCode: (code) => (shown = code),
    ...fast,
  });
  const id = await approverAnswers(api(box));
  const pending = await answerRequest({
    api: api(box),
    account: 'acct',
    id,
    ...fast,
  });
  assert.equal(pending.label, 'Edge on Windows');
  assert.match(pending.code, /^\d{3} \d{3}$/);
  // Both screens show the same code before anything secret moves.
  while (!shown) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(shown, pending.code);
  assert.equal(box.link(id).sealedKey, undefined);
  await pending.approve(key);
  const received = await requesting;
  assert.ok(await sameKey(key, received));
  // The relayed record holds nothing that opens the key without the new
  // device's one-time private key.
  const record = box.link(id);
  assert.ok(record.sealedKey);
  assert.ok(!JSON.stringify(record).includes('acct'));
});

test('a server that swaps keys in the middle gets different codes on the two screens', async () => {
  // The new device talks to one mailbox and the approver to another; the
  // attacker sits between them, answering each side with its own keys.
  const toNew = mailbox();
  const toApprover = mailbox();
  const { key } = await createAccountKey('acct');
  let newCode = null;
  const requesting = requestApproval({
    api: api(toNew),
    account: 'acct',
    label: 'Edge on Windows',
    newId,
    onCode: (code) => (newCode = code),
    ...fast,
  });
  requesting.catch(() => {});
  // The attacker plays approver to the new device…
  const facingNew = await answerRequest({
    api: api(toNew),
    account: 'acct',
    id: await approverAnswers(api(toNew)),
    ...fast,
  });
  // …and plays a new device to the real approver.
  let attackerCode = null;
  const facingApprover = requestApproval({
    api: api(toApprover),
    account: 'acct',
    label: 'Edge on Windows',
    newId,
    onCode: (code) => (attackerCode = code),
    ...fast,
  });
  facingApprover.catch(() => {});
  const real = await answerRequest({
    api: api(toApprover),
    account: 'acct',
    id: await approverAnswers(api(toApprover)),
    ...fast,
  });
  while (!newCode || !attackerCode)
    await new Promise((resolve) => setTimeout(resolve, 5));
  // The person compares the new device's screen with the approver's.
  assert.equal(facingNew.code, newCode);
  assert.notEqual(real.code, newCode);
  // So they decline, and the key never leaves the approver.
  await real.decline();
  await assert.rejects(facingApprover, LinkDeclined);
  await facingNew.decline();
  await assert.rejects(requesting, LinkDeclined);
  void key;
});

test('changing the committed nonce in transit is caught before any code is shown', async () => {
  const box = mailbox();
  const tampering = api(box, (step, value) =>
    step === 'newNonce' ? 'AAAAAAAAAAAAAAAAAAAAAA' : value,
  );
  const requesting = requestApproval({
    api: tampering,
    account: 'acct',
    label: 'Phone',
    newId,
    onCode: () => {},
    ...fast,
  });
  requesting.catch(() => {});
  const id = await approverAnswers(api(box));
  await assert.rejects(
    answerRequest({ api: api(box), account: 'acct', id, ...fast }),
    LinkTampered,
  );
});

test('declining ends the request; a second approver cannot take over', async () => {
  const box = mailbox();
  const requesting = requestApproval({
    api: api(box),
    account: 'acct',
    label: 'Phone',
    newId,
    onCode: () => {},
    ...fast,
  });
  const id = await approverAnswers(api(box));
  const first = answerRequest({ api: api(box), account: 'acct', id, ...fast });
  // Give the first approver a moment to claim it.
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(
    await answerRequest({ api: api(box), account: 'acct', id, ...fast }),
    null,
  );
  await (await first).decline();
  await assert.rejects(requesting, LinkDeclined);
});

test('a passkey copy unlocks with that passkey’s secret only', async () => {
  const box = mailbox();
  const device = api(box);
  const { key, wrapped } = await createAccountKey('acct');
  assert.equal(await saveAccountKey(device, wrapped), true);
  const secret = crypto.getRandomValues(new Uint8Array(32));
  await addPasskeyUnlock(device, 'acct', key, {
    credentialId: 'credential-one',
    label: 'Windows Hello',
    prfSecret: secret,
  });
  const copies = await device.keys();
  assert.deepEqual(copies.map((copy) => copy.kind).sort(), [
    'passkey',
    'recovery',
  ]);
  const unlocked = await unlockWithPasskey(device, 'acct', {
    credentialId: 'credential-one',
    prfSecret: secret,
  });
  assert.ok(await sameKey(key, unlocked));
  // Another secret, another passkey or another account: nothing.
  assert.equal(
    await unlockWithPasskey(device, 'acct', {
      credentialId: 'credential-one',
      prfSecret: crypto.getRandomValues(new Uint8Array(32)),
    }),
    null,
  );
  assert.equal(
    await unlockWithPasskey(device, 'acct', {
      credentialId: 'credential-two',
      prfSecret: secret,
    }),
    null,
  );
  assert.equal(
    await unlockWithPasskey(device, 'other-account', {
      credentialId: 'credential-one',
      prfSecret: secret,
    }),
    null,
  );
  // Every app asks passkeys for the same PRF input.
  assert.deepEqual(await passkeyPrfInput(), await passkeyPrfInput());
});
