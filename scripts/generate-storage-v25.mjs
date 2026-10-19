// One-off generator for docs/examples/storage-v25.json: the v24 example
// exactly, followed by v25 statistics layout preferences from two devices.
// The example is committed: rerunning, then Prettier, reproduces it exactly.
// Run: node scripts/generate-storage-v25.mjs && npx prettier --write docs/examples/storage-v25.json
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  decodeArchive,
  encodeArchive,
} from '../packages/core/src/storage/archive.ts';

const digest = async (text) => createHash('sha256').update(text).digest('hex');
const path = (version) =>
  new URL(`../docs/examples/storage-v${version}.json`, import.meta.url);
const previous = await decodeArchive(readFileSync(path(24), 'utf8'), digest);
const events = [...previous.events];
let minute = 0;
const add = (device, change) =>
  events.push({
    version: 25,
    id: `v25-example-${events.length + 1}`,
    sequence: events.length + 1,
    recordedAt: new Date(Date.UTC(2026, 9, 19, 9, minute++)).toISOString(),
    timeZone: 'Australia/Melbourne',
    utcOffsetMinutes: 660,
    device,
    type: 'preference',
    change,
  });
// The browser hides Walk's time of day; the phone then moves its calendar
// first. The archived text habit gets a layout that is reset again.
add('example-web', {
  kind: 'statsLayout',
  habitId: 'walk',
  before: null,
  after: { hidden: ['timeOfDay'] },
});
add('example-phone', {
  kind: 'statsLayout',
  habitId: 'walk',
  before: { hidden: ['timeOfDay'] },
  after: {
    order: ['calendar', 'success', 'streaks', 'weekday', 'timeOfDay'],
    hidden: ['timeOfDay'],
  },
});
add('example-phone', {
  kind: 'statsLayout',
  habitId: 'highlight',
  before: null,
  after: { hidden: ['streaks'] },
});
add('example-phone', {
  kind: 'statsLayout',
  habitId: 'highlight',
  before: { hidden: ['streaks'] },
  after: null,
});
writeFileSync(
  path(25),
  `${await encodeArchive(events, '2026-10-19T09:30:00.000Z', digest)}\n`,
);
console.log(`storage-v25.json: ${events.length} events`);
