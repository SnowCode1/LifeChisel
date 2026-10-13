import assert from 'node:assert/strict';
import test from 'node:test';
import {
  descriptionExcerpt,
  descriptionReadingPassages,
  DESCRIPTION_EXCERPT_LENGTH,
} from '../packages/core/src/descriptionReading.ts';
import { parseDescription } from '../packages/core/src/description.ts';
import { sampleDescriptions } from '../packages/core/src/dev/sampleDescriptions.ts';

test('excerpt work is bounded independently of the rest of a long note and retains readable labels', () => {
  const prefix = '**My purpose**: [a reminder](https://example.com)\n\n';
  const source = prefix + 'A useful ordinary sentence. '.repeat(700);
  const copy = source;
  const excerpt = descriptionExcerpt(source);
  assert.ok(excerpt.startsWith('My purpose: a reminder'));
  assert.ok(excerpt.length <= DESCRIPTION_EXCERPT_LENGTH);
  assert.equal(source, copy);
  assert.equal(descriptionExcerpt(''), '');
  assert.equal(descriptionExcerpt('**Start small.**'), 'Start small.');
  assert.equal(
    descriptionExcerpt('```text\nA literal reminder.\n```'),
    'A literal reminder.',
  );
  const edge = 'x'.repeat(599) + '🚶';
  assert.equal(/[\uD800-\uDBFF]$/.test(descriptionExcerpt(edge)), false);
});
test('reader passages retain the full note, nested formatting and ordered list numbering', () => {
  const text =
    '# Purpose\n\nFirst **paragraph**.\n\n7. First\n   - Nested one\n   - Nested two\n8. Second\n9. Third\n\n> Keep going.\n\n```text\nliteral ==highlight==\n```';
  const tokens = parseDescription(text);
  const original = JSON.stringify(tokens);
  const passages = descriptionReadingPassages(text);
  assert.equal(new Set(passages.map((p) => p.key)).size, passages.length);
  const lists = passages.filter(
    (p) => p.tokens[0].type === 'ordered_list_open',
  );
  assert.deepEqual(
    lists.map((p) => p.tokens[0].attrGet('start')),
    ['7', '8', '9'],
  );
  assert.equal(
    lists[0].tokens.some((t) => t.type === 'bullet_list_open'),
    true,
  );
  assert.equal(passages.at(-1).tokens[0].type, 'fence');
  assert.equal(passages.at(-1).tokens[0].content, 'literal ==highlight==\n');
  const visibleText = (ts) =>
    ts
      .filter((t) => t.type === 'inline')
      .map((t) => t.content)
      .join('|');
  assert.equal(
    visibleText(passages.flatMap((p) => p.tokens)),
    visibleText(tokens),
  );
  assert.equal(JSON.stringify(tokens), original);
});
test('a long single list becomes many bounded reading rows, with balanced wrappers', () => {
  const text = Array.from(
    { length: 100 },
    (_, i) => `- Item ${i} **reminder**`,
  ).join('\n');
  const passages = descriptionReadingPassages(text);
  assert.equal(passages.length, 100);
  for (const passage of passages) {
    assert.equal(passage.tokens[0].type, 'bullet_list_open');
    assert.equal(passage.tokens.at(-1).type, 'bullet_list_close');
    assert.equal(
      passage.tokens.reduce((depth, t) => depth + t.nesting, 0),
      0,
    );
    assert.equal(
      passage.tokens.filter((t) => t.type === 'list_item_open').length,
      1,
    );
  }
});
test('reader caches a few recently opened notes and evicts older documents without losing text', () => {
  const first = sampleDescriptions.walk;
  const saved = descriptionReadingPassages(first);
  assert.equal(descriptionReadingPassages(first), saved);
  for (let i = 0; i < 6; i++)
    descriptionReadingPassages(`Unique ${i}\n\n` + sampleDescriptions.meditate);
  const reopened = descriptionReadingPassages(first);
  assert.notEqual(reopened, saved);
  assert.equal(
    reopened
      .flatMap((p) => p.tokens)
      .filter((t) => t.type === 'inline')
      .map((t) => t.content)
      .join('|'),
    saved
      .flatMap((p) => p.tokens)
      .filter((t) => t.type === 'inline')
      .map((t) => t.content)
      .join('|'),
  );
});
