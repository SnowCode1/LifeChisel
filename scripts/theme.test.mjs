import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  backgroundLimits,
  backgroundName,
  backgroundPresets,
  blackTheme,
  createTheme,
  defaultBackgrounds,
  fitBackground,
  MIN_CONTRAST,
  resolveScheme,
  themeFor,
} from '../packages/core/src/theme.ts';
import {
  colorOnBlack,
  contrastRatio,
  dimmedColor,
  hexToOklch,
  luminance,
} from '../packages/core/src/colors.ts';
import { habitColors } from '../packages/core/src/habits.ts';
import {
  createGridPalette,
  dateTone,
} from '../packages/core/src/gridAppearance.ts';
import { highlightColours } from '../packages/core/src/richText/highlights.ts';
import { editorPalette, inkVariable } from '../src/richText/editorTheme.ts';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { sqliteRepository } from '../packages/core/src/storage/repository.ts';
import {
  encodeArchive,
  decodeArchive,
} from '../packages/core/src/storage/archive.ts';
import {
  applyChange,
  applyEvent,
  replayEvents,
  validateChange,
} from '../packages/core/src/storage/model.ts';
import { displayDefaults } from '../packages/core/src/displayPreferences.ts';

const grey = (level) => {
  const pair = level.toString(16).padStart(2, '0').toUpperCase();
  return `#${pair}${pair}${pair}`;
};
const custom = [
  createTheme('dark', '#0B1424'),
  createTheme('dark', '#1C1611'),
  createTheme('light', '#F6F3EC'),
  createTheme('light', '#EDF1F5'),
];

test('the default black theme returns every original colour exactly', () => {
  assert.equal(blackTheme.background, '#000000');
  for (let level = 0; level < 256; level++)
    assert.equal(blackTheme.ink(level), grey(level));
  assert.equal(blackTheme.overlay(0x20), '#FFFFFF20');
  assert.equal(blackTheme.tint('#251C16'), '#251C16');
  for (const { value } of habitColors) {
    assert.equal(blackTheme.colour(value), value);
    assert.equal(blackTheme.mix(value, 0.32), colorOnBlack(value, 0.32));
    for (const amount of [0, 0.3, 1])
      assert.equal(blackTheme.fade(value, amount), dimmedColor(value, amount));
  }
  assert.equal(blackTheme.accent, '#74BBA5');
  assert.equal(blackTheme.link, '#B7DCCF');
  assert.equal(blackTheme.statusBar, 'light');
});

test('other backgrounds keep each interface grey at its original relative contrast', () => {
  const white = createTheme('light', '#FFFFFF');
  for (const level of [0x11, 0x24, 0x33, 0x66, 0x77, 0x99, 0xaa, 0xdd, 0xff]) {
    const original = contrastRatio(grey(level), '#000000');
    const mirrored = contrastRatio(white.ink(level), '#FFFFFF');
    assert.ok(Math.abs(original - mirrored) / original < 0.03, `${level}`);
  }
  for (const theme of [white, ...custom]) {
    assert.equal(theme.ink(0), theme.background);
    let previous = 1;
    for (let level = 1; level < 256; level += 5) {
      const contrast = theme.contrast(theme.ink(level));
      // Allow 8-bit rounding, never a reversed hierarchy.
      assert.ok(contrast >= previous - 0.02, `${theme.background} ${level}`);
      previous = Math.max(previous, contrast);
    }
    // Secondary and primary text remain comfortably readable.
    assert.ok(theme.contrast(theme.ink(0x99)) >= 4.5, theme.background);
    assert.ok(theme.contrast(theme.ink(0xdd)) >= 9, theme.background);
    assert.equal(theme.statusBar, theme.scheme === 'dark' ? 'light' : 'dark');
  }
});

test('habit and accent colours stay readable, keeping their hue', () => {
  for (const theme of [createTheme('light', '#FFFFFF'), ...custom]) {
    for (const { name, value } of habitColors) {
      const shown = theme.colour(value);
      assert.ok(theme.contrast(shown) >= MIN_CONTRAST, `${name} ${shown}`);
      assert.equal(theme.colour(shown), shown, 'idempotent');
      const before = hexToOklch(value).h,
        after = hexToOklch(shown).h,
        drift = Math.abs(before - after);
      assert.ok(Math.min(drift, 360 - drift) < 12, `${name} hue`);
    }
    for (const token of [theme.accent, theme.accentText, theme.link])
      assert.ok(theme.contrast(token) >= MIN_CONTRAST);
  }
  // Unreadable custom colours are lightened even on black.
  assert.ok(blackTheme.contrast(blackTheme.colour('#101820')) >= MIN_CONTRAST);
});

test('grid palettes and date headings stay visible on any background', () => {
  for (const theme of [blackTheme, ...custom]) {
    for (const { value } of habitColors.slice(0, 6)) {
      const palette = createGridPalette(value, theme);
      assert.ok(
        theme.contrast(palette.checkbox) > 1.2,
        `${theme.background} ${value}`,
      );
      assert.equal(palette.background, theme.background);
    }
    const dates = dateTone(theme);
    assert.equal(dateTone(theme), dates, 'cached per theme');
    assert.ok(theme.contrast(dates.number) >= 3, theme.background);
  }
});

test('backgrounds stay within readable ranges; System follows the phone', () => {
  for (const scheme of ['dark', 'light']) {
    const { min, max } = backgroundLimits[scheme];
    for (const preset of backgroundPresets[scheme]) {
      assert.equal(fitBackground(scheme, preset.value), preset.value);
      assert.equal(backgroundName(scheme, preset.value), preset.name);
    }
    assert.equal(
      backgroundPresets[scheme][0].value,
      defaultBackgrounds[scheme],
    );
    for (const input of [
      '#808080',
      '#FF0000',
      '#00FF66',
      '#FFFFFF',
      '#000000',
    ]) {
      const fitted = fitBackground(scheme, input);
      const { l, c } = hexToOklch(fitted);
      assert.ok(l >= min - 0.006 && l <= max + 0.006, `${scheme} ${input}`);
      assert.ok(c <= backgroundLimits.chroma + 0.006);
      assert.equal(fitBackground(scheme, fitted), fitted, 'stable');
    }
    // A saved colour outside the range is displayed fitted, never rejected.
    assert.equal(
      createTheme(scheme, '#808080').background,
      fitBackground(scheme, '#808080'),
    );
  }
  assert.equal(resolveScheme('system', 'light'), 'light');
  assert.equal(resolveScheme('system', 'dark'), 'dark');
  assert.equal(resolveScheme('system', null), 'dark');
  assert.equal(resolveScheme('light', 'dark'), 'light');
  assert.equal(
    themeFor('system', 'light', '#000000', '#F6F3EC').background,
    '#F6F3EC',
  );
  assert.equal(
    themeFor('dark', 'light', '#0B1424', '#FFFFFF').background,
    '#0B1424',
  );
  assert.equal(createTheme('dark', '#0B1424'), createTheme('dark', '#0b1424'));
  assert.ok(luminance(createTheme('light', '#FFFFFF').ink(0xff)) < 0.01);
});

test('the DOM editor palette covers every colour variable its stylesheet reads', () => {
  const css = readFileSync(
    new URL('../src/richText/editor.css', import.meta.url),
    'utf8',
  );
  const used = new Set(css.match(/--(?:ink-[0-9a-f]{2}|scrim|warning)\b/g));
  for (const theme of [blackTheme, ...custom]) {
    const palette = editorPalette(theme);
    for (const name of used) assert.ok(name in palette, name);
    for (const name of Object.keys(palette).filter((key) =>
      key.startsWith('--ink-'),
    ))
      assert.ok(used.has(name), `${name} unused`);
    for (const id of Object.keys(highlightColours)) {
      assert.ok(`--highlight-${id}-bg` in palette);
      const text = palette[`--highlight-${id}-text`],
        background = palette[`--highlight-${id}-bg`];
      assert.ok(contrastRatio(text, background) >= 4.5, `${id}`);
    }
  }
  // Black keeps the stylesheet's original fallbacks.
  assert.equal(editorPalette(blackTheme)[inkVariable(0xdd)], '#DDDDDD');
  assert.ok(!/#(?!0005\b)[0-9a-f]{3,6}\b(?![^(]*\))/i.test(css));
});

const digest = async (text) => createHash('sha256').update(text).digest('hex');
const habit = { id: 'read', name: 'Read', color: '#BDA5FF', type: 'number' };
function sqlPort(raw) {
  const db = {
    execAsync: async (sql) => raw.exec(sql),
    runAsync: async (sql, ...args) => raw.prepare(sql).run(...args),
    getFirstAsync: async (sql, ...args) =>
      raw.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
    withExclusiveTransactionAsync: async (task) => {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const value = await task(db);
        raw.exec('COMMIT');
        return value;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}

test('v19 theme preferences persist in SQLite/backup outside History and Redo', async (t) => {
  const raw = new DatabaseSync(':memory:');
  t.after(() => raw.close());
  let id = 0;
  const meta = (sequence) => ({
    version: 19,
    id: `theme_${++id}`,
    sequence,
    recordedAt: '2026-10-10T04:00:00.000Z',
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
  });
  const repo = sqliteRepository(sqlPort(raw), () => ({
    ...meta(1),
    version: 18,
    type: 'initialize',
    habits: [habit],
  }));
  let store = new ChangeStore(repo, meta);
  await store.load();
  store.change({
    kind: 'entry',
    habitId: habit.id,
    date: '2026-10-10',
    before: null,
    after: 20,
  });
  store.undo();
  const redo = store.getSnapshot().replay.redo.map((item) => item.undoId);
  // `before` is null until the first choice, independent of the defaults.
  const changes = [
    { kind: 'themeMode', before: null, after: 'light' },
    { kind: 'lightBackground', before: null, after: '#FFFFFF' },
    { kind: 'darkBackground', before: null, after: '#0B1424' },
  ];
  for (const change of changes) {
    for (let version = 1; version < 19; version++)
      assert.throws(() => validateChange(change, version), /version 19/);
    assert.throws(
      () =>
        applyChange(store.getSnapshot().replay.state, {
          ...change,
          before: change.kind === 'themeMode' ? 'dark' : '#F6F3EC',
        }),
      /precondition/,
    );
    assert.equal(store.change(change), true);
    assert.throws(
      () => applyChange(store.getSnapshot().replay.state, change),
      /precondition/,
    );
  }
  assert.equal(
    store.change({ kind: 'themeMode', before: 'light', after: 'system' }),
    true,
  );
  assert.equal(
    store.change({ kind: 'themeMode', before: 'system', after: 'light' }),
    true,
  );
  // Development builds earlier on 10 October wrote that day's defaults as the
  // first `before`; those events still replay.
  const empty = { habits: [], values: {}, hapticsEnabled: true };
  for (const [kind, before, after, wrong] of [
    ['themeMode', 'system', 'dark', 'dark'],
    ['darkBackground', '#000000', '#161616', '#161616'],
    ['lightBackground', '#FFFFFF', '#F6F3EC', '#F6F3EC'],
  ]) {
    assert.equal(applyChange(empty, { kind, before, after })[kind], after);
    assert.throws(
      () => applyChange(empty, { kind, before: wrong, after: before }),
      /precondition/,
    );
  }
  for (const invalid of [
    { kind: 'themeMode', before: 'light', after: 'sepia' },
    { kind: 'darkBackground', before: '#0B1424', after: '#0b1424' },
    { kind: 'darkBackground', before: '#0B1424', after: '#FFF' },
    { kind: 'lightBackground', before: '#F6F3EC', after: 'white' },
    { kind: 'lightBackground', before: '#F6F3EC', after: null },
    { kind: 'themeMode', before: null, after: null },
  ])
    assert.throws(() => validateChange(invalid));
  // Any well-formed colour is stored; display fits it to the scheme's range.
  assert.doesNotThrow(() =>
    validateChange({
      kind: 'darkBackground',
      before: '#0B1424',
      after: '#FFFFFF',
    }),
  );
  await store.flush();
  store = new ChangeStore(repo, meta);
  await store.load();
  const state = store.getSnapshot().replay.state;
  assert.equal(state.themeMode, 'light');
  assert.equal(state.lightBackground, '#FFFFFF');
  assert.equal(state.darkBackground, '#0B1424');
  assert.deepEqual(
    store.getSnapshot().replay.redo.map((item) => item.undoId),
    redo,
  );
  assert.equal(store.getSnapshot().replay.undo.length, 0);
  const events = store.getSnapshot().events;
  const backup = await encodeArchive(
    events,
    '2026-10-10T04:00:00.000Z',
    digest,
  );
  assert.equal(JSON.parse(backup).version, 21);
  const decoded = await decodeArchive(backup, digest);
  assert.deepEqual(decoded.events, events);
  await store.exclusive(() => store.replace(decoded.events));
  assert.equal(store.redo(), true);
  assert.equal(store.getSnapshot().replay.state.values['read:2026-10-10'], 20);
  assert.throws(
    () =>
      applyEvent(store.getSnapshot().replay, {
        ...meta(store.getSnapshot().events.length + 1),
        version: 18,
        type: 'preference',
        change: { kind: 'haptics', before: true, after: false },
      }),
    /version-21/,
  );
  const previous = JSON.parse(
    readFileSync(
      new URL('../docs/examples/storage-v18.json', import.meta.url),
      'utf8',
    ),
  );
  const next = await decodeArchive(
    readFileSync(
      new URL('../docs/examples/storage-v19.json', import.meta.url),
      'utf8',
    ),
    digest,
  );
  assert.deepEqual(
    next.events.slice(0, previous.events.length),
    previous.events,
  );
  assert.equal(next.replay.state.themeMode, 'light');
  assert.equal(next.replay.state.lightBackground, '#FFFFFF');
  assert.equal(next.replay.state.darkBackground, '#0B1424');
  const old = replayEvents(previous.events).replay;
  assert.equal(old.hasV19, false);
  // Absent fields display the defaults: Dark, black and Paper.
  assert.equal(old.state.themeMode, undefined);
  assert.equal(old.state.darkBackground, undefined);
  assert.equal(displayDefaults.themeMode, 'dark');
  assert.equal(displayDefaults.darkBackground, '#000000');
  assert.equal(displayDefaults.lightBackground, '#F6F3EC');
});
