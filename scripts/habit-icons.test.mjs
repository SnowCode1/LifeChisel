import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSingleEmoji,
  isHabitIcon,
  habitIconLabel,
} from '../packages/core/src/habitIcons.ts';
import { habitIconCatalog } from '../packages/core/src/habitIconCatalog.ts';
import { phosphorPaths } from '../packages/core/src/phosphorPaths.ts';
import { historyPresentation } from '../packages/core/src/history.ts';

test('emoji validation accepts a whole emoji including skin tones, flags and joined sequences', () => {
  for (const value of ['💧', '🏋️', '🚶🏽‍♀️', '👩🏿‍💻', '👨‍👩‍👧‍👦', '🇦🇺', '1️⃣', '❤️']) {
    assert.equal(isSingleEmoji(value), true, value);
    assert.equal(isHabitIcon(`emoji:${value}`), true, value);
  }
  for (const value of [
    '',
    '1',
    'abc',
    '💧🌙',
    ' 💧',
    '💧 ',
    '\u200D',
    '💧'.repeat(65),
  ])
    assert.equal(isSingleEmoji(value), false, value);
});
test('every stable pack ID has a bundled glyph and unknown packs/IDs are rejected', () => {
  assert.equal(
    new Set(habitIconCatalog.map((icon) => icon.id)).size,
    habitIconCatalog.length,
  );
  for (const icon of habitIconCatalog) {
    assert.equal(isHabitIcon(`phosphor:${icon.id}`), true);
    assert.ok(phosphorPaths[icon.id]?.every((path) => path.length > 0));
  }
  assert.deepEqual(
    Object.keys(phosphorPaths).sort(),
    habitIconCatalog.map((icon) => icon.id).sort(),
  );
  for (const icon of [
    'other:drop',
    'phosphor:missing',
    'phosphor:',
    'emoji:text',
    null,
    undefined,
  ])
    assert.equal(isHabitIcon(icon), false);
});
test('history distinguishes icon-only changes and removal from combined habit edits', () => {
  const before = { id: 'walk', name: 'Walk', color: '#82E6BC' };
  const present = (after) =>
    historyPresentation(
      { change: { kind: 'habit', habitId: 'walk', index: 0, before, after } },
      { habits: [after], values: {}, hapticsEnabled: true },
    ).summary;
  assert.equal(present({ ...before, icon: 'emoji:🚶' }), 'Icon changed');
  assert.equal(
    present({ ...before, name: 'Daily walk', icon: 'emoji:🚶' }),
    'Habit edited',
  );
  assert.equal(
    historyPresentation(
      {
        change: {
          kind: 'habit',
          habitId: 'walk',
          index: 0,
          before: { ...before, icon: 'emoji:🚶' },
          after: before,
        },
      },
      { habits: [before], values: {}, hapticsEnabled: true },
    ).summary,
    'Icon removed',
  );
});

test('full regular catalogue preserves common choices and searches all icons by words, categories and aliases', async () => {
  const { searchHabitIcons } =
    await import('../packages/core/src/searchHabitIcons.ts');
  const { commonHabitIcons } =
    await import('../packages/core/src/commonHabitIcons.ts');
  assert.equal(habitIconCatalog.length, 1512);
  assert.deepEqual(
    searchHabitIcons('', false, 'phosphor').map((item) => item.id),
    commonHabitIcons.map((item) => item.id),
  );
  assert.equal(searchHabitIcons('', true, 'phosphor').length, 1512);
  for (const old of commonHabitIcons) {
    const current = habitIconCatalog.find((item) => item.id === old.id);
    assert.equal(current?.label, old.label);
    assert.ok(current?.tags.includes(old.tags));
  }
  assert.ok(
    searchHabitIcons('  PERSON_simple   RUN ').some(
      (item) => item.id === 'person-simple-run',
    ),
  );
  assert.ok(searchHabitIcons('hydration').some((item) => item.id === 'drop'));
  assert.ok(
    searchHabitIcons('health wellness').some(
      (item) => item.id === 'stethoscope',
    ),
  );
  assert.ok(searchHabitIcons('acorn').some((item) => item.id === 'acorn'));
  assert.ok(
    searchHabitIcons('archive-box').some(
      (item) => item.id === 'box-arrow-down',
    ),
  );
  assert.ok(
    habitIconCatalog.every((item) => !item.tags.includes('[object Object]')),
  );
  assert.deepEqual(searchHabitIcons('definitelynonexistenticon'), []);
  assert.deepEqual(searchHabitIcons('  '), searchHabitIcons(''));
  assert.deepEqual(
    searchHabitIcons('acorn', true),
    searchHabitIcons('acorn', false),
  );
});

test('Tabler outline IDs and rendering attributes are complete and reject unknown values', async () => {
  const { tablerIconCatalog } =
    await import('../packages/core/src/tablerIconCatalog.ts');
  const { tablerPaths } = await import('../packages/core/src/tablerPaths.ts');
  assert.equal(tablerIconCatalog.length, 5166);
  assert.equal(new Set(tablerIconCatalog.map((icon) => icon.id)).size, 5166);
  assert.deepEqual(
    Object.keys(tablerPaths).sort(),
    tablerIconCatalog.map((icon) => icon.id).sort(),
  );
  for (const icon of tablerIconCatalog) {
    assert.equal(isHabitIcon(`tabler:${icon.id}`), true);
    assert.equal(habitIconLabel(`tabler:${icon.id}`), icon.label);
    assert.ok(tablerPaths[icon.id].length > 0);
    for (const path of tablerPaths[icon.id]) {
      assert.ok(path.d.length > 0);
      assert.ok(path.fill === undefined || path.fill === 'currentColor');
      assert.ok(path.stroke === undefined || path.stroke === 'none');
      assert.ok(
        path.opacity === undefined || (path.opacity >= 0 && path.opacity <= 1),
      );
    }
  }
  assert.equal(tablerPaths['percentage-10'][0].fill, 'currentColor');
  assert.equal(tablerPaths['percentage-10'][0].stroke, 'none');
  assert.ok(tablerPaths['brand-parsinta'].some((path) => path.opacity === 0.5));
  for (const invalid of [
    'tabler:',
    'tabler:does-not-exist',
    'tabler:filled/yoga',
    'Tabler:yoga',
  ])
    assert.equal(isHabitIcon(invalid), false);
});

test('shared search overrides browsing filters, preserves pack identity and finds habit vocabulary', async () => {
  const { searchHabitIcons, packIconCount } =
    await import('../packages/core/src/searchHabitIcons.ts');
  assert.equal(packIconCount, 6678);
  assert.equal(searchHabitIcons('', true).length, 6678);
  assert.equal(searchHabitIcons('', true, 'tabler').length, 5166);
  assert.ok(
    searchHabitIcons('', false).some((icon) => icon.value === 'tabler:yoga'),
  );
  for (const term of ['meditation', 'meditate', 'mindfulness', 'yoga']) {
    const matches = searchHabitIcons(term, false, 'phosphor');
    assert.ok(
      matches.some((icon) => icon.value === 'tabler:yoga'),
      term,
    );
    assert.deepEqual(matches, searchHabitIcons(term, true, 'tabler'));
  }
  assert.ok(searchHabitIcons('water').some((icon) => icon.pack === 'phosphor'));
  assert.ok(searchHabitIcons('water').some((icon) => icon.pack === 'tabler'));
  const all = searchHabitIcons('', true);
  assert.equal(new Set(all.map((icon) => icon.value)).size, all.length);
  assert.equal(searchHabitIcons('yoga')[0].value, 'tabler:yoga');
});
