import assert from 'node:assert/strict';
import test from 'node:test';
import { descriptionDiff } from '../packages/core/src/descriptionDiff.ts';
import {
  parseDescription,
  descriptionSummary,
} from '../packages/core/src/description.ts';

const flags = (passages) => passages.map((passage) => passage.changed);
test('passage comparisons isolate additions, removals and replacements while keeping unchanged neighbours quiet', () => {
  const diff = descriptionDiff(
    'First\n\nOld middle\n\nLast',
    'First\n\nNew middle\n\nLast',
  );
  assert.deepEqual(flags(diff.before), [false, true, false]);
  assert.deepEqual(flags(diff.after), [false, true, false]);
  const insertion = descriptionDiff('First\n\nLast', 'First\n\nNew\n\nLast');
  assert.deepEqual(flags(insertion.before), [false, false]);
  assert.deepEqual(flags(insertion.after), [false, true, false]);
  const removal = descriptionDiff('First\n\nOld\n\nLast', 'First\n\nLast');
  assert.deepEqual(flags(removal.before), [false, true, false]);
  assert.deepEqual(flags(removal.after), [false, false]);
});
test('matching passages inside changed regions remain quiet, including repeated paragraphs', () => {
  const diff = descriptionDiff(
    'Old start\n\nSame\n\nSame\n\nOld end',
    'New start\n\nSame\n\nSame\n\nNew end',
  );
  assert.deepEqual(flags(diff.before), [true, false, false, true]);
  assert.deepEqual(flags(diff.after), [true, false, false, true]);
});
test('comparison notices style, link destination, highlight and code changes, and ignores equivalent Markdown syntax', () => {
  for (const [before, after] of [
    ['Plain', '**Plain**'],
    ['# Heading', 'Heading'],
    ['[Notes](https://old.example.com)', '[Notes](https://new.example.com)'],
    ['=={blue}Focus==', '=={pink}Focus=='],
    ['```\nold code\n```', '```\nnew code\n```'],
    ['![Same](https://old.example.com)', '![Same](https://new.example.com)'],
  ]) {
    const diff = descriptionDiff(before, after);
    assert.deepEqual(flags(diff.before), [true]);
    assert.deepEqual(flags(diff.after), [true]);
  }
  const equivalent = descriptionDiff(
    '**Bold** and _italic_',
    '__Bold__ and *italic*',
  );
  assert.deepEqual(flags(equivalent.before), [false]);
  assert.deepEqual(flags(equivalent.after), [false]);
});
test('complete nested Markdown passages stay intact and comparisons do not mutate reader tokens or stored text', () => {
  const before =
    '# Title\n\n- **First**\n- [Second](obsidian://open?vault=Habits)\n\n> Old reminder';
  const after =
    '# Title\n\n- **First**\n- [Second](obsidian://open?vault=Habits)\n\n> New reminder';
  const diff = descriptionDiff(before, after);
  assert.deepEqual(flags(diff.before), [false, false, true]);
  const simplify = (tokens) =>
    tokens.map((token) => JSON.parse(JSON.stringify(token)));
  assert.deepEqual(
    simplify(diff.before.flatMap((passage) => passage.tokens)),
    simplify(parseDescription(before)),
  );
  assert.deepEqual(
    simplify(diff.after.flatMap((passage) => passage.tokens)),
    simplify(parseDescription(after)),
  );
  assert.equal(descriptionSummary(before), 'Title First Second Old reminder');
  assert.equal(diff.before[1].tokens[0].type, 'bullet_list_open');
  assert.equal(diff.before[1].tokens.at(-1).type, 'bullet_list_close');
});
test('empty, cleared and maximum-length unrelated notes use bounded comparison memory', () => {
  assert.deepEqual(descriptionDiff('', ''), { before: [], after: [] });
  assert.deepEqual(flags(descriptionDiff('', 'New').after), [true]);
  assert.deepEqual(flags(descriptionDiff('Old', '').before), [true]);
  const before = 'Same start\n\n' + 'a\n\n'.repeat(4000) + 'Same end';
  const after = 'Same start\n\n' + 'b\n\n'.repeat(4000) + 'Same end';
  const diff = descriptionDiff(before, after);
  for (const passages of [diff.before, diff.after]) {
    assert.equal(passages.length, 4002);
    assert.equal(passages[0].changed, false);
    assert.equal(passages.at(-1).changed, false);
    assert.equal(passages.filter((passage) => passage.changed).length, 4000);
  }
});
