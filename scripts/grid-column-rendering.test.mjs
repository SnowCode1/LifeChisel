import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React, { act, useImperativeHandle } from 'react';
import * as jsx from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import * as entries from '../src/entries.ts';
import * as goals from '../src/habitGoals.ts';
import * as habits from '../src/habits.ts';
import * as appearance from '../src/gridAppearance.ts';
import * as display from '../src/displayPreferences.ts';
import * as selection from '../src/storage/selection.ts';
import * as textLayout from '../src/gridEntryText.ts';
import { createGridDayCache } from '../src/calendar.ts';
import { gridColumnHit } from '../src/gridColumnHit.ts';
import { themeContextModule } from './theme-fixture.mjs';

function load(file, modules) {
  const code = ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const module = { exports: {} };
  runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      setTimeout,
      clearTimeout,
      require(name) {
        if (!(name in modules)) throw new Error(`Unexpected module ${name}`);
        return modules[name];
      },
    },
    { timeout: 500 },
  );
  return module.exports;
}

test('column hit testing respects measured rows, omitted rows and exclusive boundaries', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'd' }];
  const tops = { a: { top: 0 }, b: { top: 52 }, d: { top: 188 } };
  const heights = { b: 84 };
  const hit = (y) => gridColumnHit(rows, tops, heights, 52, y)?.id ?? null;
  assert.equal(hit(0), 'a');
  assert.equal(hit(51.99), 'a');
  assert.equal(hit(52), 'b');
  assert.equal(hit(135.99), 'b');
  assert.equal(
    hit(136),
    null,
    'virtualized rows are not tappable fallback records',
  );
  assert.equal(hit(188), 'd');
  assert.equal(hit(240), null);
  assert.equal(
    gridColumnHit(rows, tops, heights, 52, 20, { a: 52, b: 0 })?.id,
    'b',
    'animated positions take precedence during a transition',
  );
  for (const y of [-1, NaN, Infinity, -Infinity]) assert.equal(hit(y), null);
});

test('native columns share controls/drawing while preserving dated input, accessible actions and moving rows', async (t) => {
  const browser = new JSDOM('<div id="root"></div>');
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = browser.window;
  globalThis.document = browser.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(() => root.unmount());
    browser.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  });
  let pressProps;
  const cells = new Map(),
    textProps = new Map();
  let pulses = 0;
  function Row(props) {
    if (props.testID) cells.set(props.testID, props);
    return React.createElement(
      'div',
      {
        'data-cell': props.testID,
        'data-overlay': props.accessibilityElementsHidden ? 'true' : undefined,
      },
      props.children,
    );
  }
  function Pressable(props) {
    pressProps = props;
    return React.createElement(
      'div',
      { 'data-control': 'true' },
      props.children,
    );
  }
  function Text(props) {
    textProps.set(String(props.children), props);
    return React.createElement('span', null, props.children);
  }
  function Mark(props) {
    useImperativeHandle(props.ref, () => ({ pulse: () => pulses++ }));
    return React.createElement('i', {
      'data-mark': props.identity,
      'data-checked': String(props.checked),
    });
  }
  const svg = (name) =>
    function SvgNode({ children, ...props }) {
      // Native accessibility/style props are checked separately; omit from DOM mocks.
      delete props.accessible;
      delete props.accessibilityElementsHidden;
      delete props.importantForAccessibility;
      delete props.pointerEvents;
      return React.createElement(name, props, children);
    };
  const modules = {
    react: React,
    'react/jsx-runtime': jsx,
    'react-native': {
      Platform: { OS: 'ios' },
      View: Row,
      Pressable,
      StyleSheet: { create: (s) => s, hairlineWidth: 1 },
    },
    'react-native-reanimated': { useReducedMotion: () => false },
    'react-native-svg': {
      __esModule: true,
      default: svg('svg'),
      G: svg('g'),
      Rect: svg('rect'),
      Path: svg('path'),
    },
    './Typography': { Text },
    './ThemeContext': themeContextModule(),
    './ReorderRow': { ReorderRow: Row },
    './GridCheckboxMark': { GridCheckboxMark: Mark },
    './gridColumnHit': { gridColumnHit },
    './entries': entries,
    './habitGoals': goals,
    './habits': habits,
    './gridAppearance': appearance,
    './displayPreferences': display,
    './storage/selection': selection,
    './gridEntryText': textLayout,
    './performance': { recordPerformance: () => {}, performanceEnabled: false },
  };
  modules['./useGridColumnPress'] = load(
    '../src/useGridColumnPress.ts',
    modules,
  );
  modules['./GridCheckboxLayer'] = load(
    '../src/GridCheckboxLayer.tsx',
    modules,
  );
  const { GridDateColumn } = load('../src/GridCells.tsx', modules);
  const definitions = [
    { id: 'check', name: 'Check', color: '#82E6BC' },
    {
      id: 'default',
      name: 'Default on',
      color: '#BDA5FF',
      goals: [
        {
          id: 'g',
          from: '2026-10-01',
          rule: { kind: 'unchecked' },
          weekdays: goals.allWeekdays,
          defaultChecked: true,
        },
      ],
    },
    {
      id: 'number',
      name: 'Minutes',
      type: 'number',
      color: '#84C9FF',
      unit: 'minutes',
    },
    { id: 'text', name: 'Highlight', type: 'text', color: '#FF9ABD' },
    {
      id: 'category',
      name: 'Workout',
      type: 'categorical',
      color: '#FFB38A',
      categories: [
        { id: 'walk', label: 'Walking' },
        { id: 'cycle', label: 'Cycling' },
      ],
    },
  ];
  const days = createGridDayCache('2026-10-07')(3);
  let snapshot = {
    replay: {
      state: {
        values: {
          'number:2026-10-07': 0,
          'text:2026-10-07': 'A walk by the river',
          'category:2026-10-07': ['cycle', 'walk'],
        },
      },
    },
  };
  const listeners = new Set();
  const store = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const taps = [];
  let positionReads = 0;
  let liveTops = Object.fromEntries(definitions.map((h, i) => [h.id, i * 52]));
  const props = {
    store,
    habits: definitions,
    palettes: Object.fromEntries(
      definitions.map((h) => [h.id, appearance.createGridPalette(h.color)]),
    ),
    motions: Object.fromEntries(
      definitions.map((h, i) => [
        h.id,
        {
          id: h.id,
          top: i * 52,
          rowTops: {
            get: () => {
              positionReads++;
              return liveTops;
            },
          },
        },
      ]),
    ),
    heights: {},
    baseHeight: 52,
    checkboxStyle: 'boxes',
    tapAnimations: false,
    fontScale: 1,
    width: 60,
    height: 260,
    disabled: false,
    onPress(habit, day) {
      taps.push([habit.id, day.key]);
      if (habits.habitType(habit) !== 'checkbox') return;
      const key = `${habit.id}:${day.key}`;
      const values = {
        ...snapshot.replay.state.values,
        [key]: goals.checkboxChecked(
          habit,
          snapshot.replay.state.values[key],
          day.key,
        )
          ? 0
          : 1,
      };
      snapshot = { replay: { state: { values } } };
      for (const listener of listeners) listener();
    },
  };
  const render = async (day = days[0], overrides = {}) =>
    act(() =>
      root.render(
        React.createElement(GridDateColumn, { ...props, day, ...overrides }),
      ),
    );
  const event = (y) => ({ nativeEvent: { locationY: y } });
  const touch = async (start, end = start) =>
    act(() => {
      pressProps.onPressIn(event(start));
      pressProps.onPressOut();
      pressProps.onPress(event(end));
    });
  const cell = (id, day = days[0]) => cells.get(`cell-${id}-${day.key}`);
  await render();
  assert.equal(document.querySelectorAll('[data-control]').length, 1);
  assert.equal(document.querySelectorAll('svg').length, 1);
  assert.equal(document.querySelectorAll('rect').length, 2);
  assert.equal(document.querySelectorAll('[data-cell]').length, 5);
  assert.equal(document.querySelectorAll('[data-mark]').length, 0);
  assert.equal(cell('check').accessibilityRole, 'checkbox');
  assert.equal(
    cell('check').animatedPosition,
    false,
    'stationary date rows have no animated-style attachment',
  );
  assert.equal(cell('check').accessibilityState.checked, false);
  assert.equal(cell('default').accessibilityState.checked, true);
  assert.equal(cell('number').accessibilityRole, 'button');
  assert.match(cell('number').accessibilityLabel, /0 minutes/);
  assert.equal(
    textProps.get('A walk by the river').adjustsFontSizeToFit,
    false,
  );
  assert.equal(textProps.get('A walk by the river').ellipsizeMode, 'tail');
  assert.equal(textProps.get('0').adjustsFontSizeToFit, true);
  assert.equal(pressProps.accessible, false);
  await touch(10);
  assert.equal(cell('check').accessibilityState.checked, true);
  assert.equal(document.querySelector('rect').getAttribute('fill'), '#82E6BC');
  await touch(55);
  assert.equal(
    snapshot.replay.state.values['default:2026-10-07'],
    0,
    'Off is an explicit override of a dated default',
  );
  assert.equal(cell('default').accessibilityState.checked, false);
  await touch(110);
  await touch(160);
  await touch(220);
  assert.deepEqual(
    taps.slice(-3).map(([id]) => id),
    ['number', 'text', 'category'],
  );
  const count = taps.length;
  await touch(10, 60);
  assert.equal(
    taps.length,
    count,
    'crossing into a different row cancels activation',
  );
  await act(() => pressProps.onPressIn(event(10)));
  await render(days[1]);
  await act(() => {
    pressProps.onPressOut();
    pressProps.onPress(event(10));
  });
  assert.equal(
    taps.length,
    count,
    'a recycled date cannot accept the old gesture',
  );
  await touch(10);
  assert.deepEqual(taps.at(-1), ['check', '2026-10-06']);
  await act(() => cell('check', days[1]).onAccessibilityTap());
  assert.equal(cell('check', days[1]).accessibilityState.checked, false);
  await act(() =>
    cell('number', days[1]).onAccessibilityAction({
      nativeEvent: { actionName: 'activate' },
    }),
  );
  assert.deepEqual(taps.at(-1), ['number', '2026-10-06']);
  const beforeDisabled = taps.length;
  await render(days[1], { disabled: true });
  await touch(10);
  await act(() => cell('check', days[1]).onAccessibilityTap());
  assert.equal(
    taps.length,
    beforeDisabled,
    'save errors block touch and accessible edits',
  );
  assert.equal(cell('check', days[1]).accessibilityState.disabled, true);
  await render(days[0], { tapAnimations: true });
  await touch(10);
  assert.equal(pulses, 1);
  assert.equal(
    document.querySelectorAll('[data-mark]').length,
    1,
    'only a tapped mark allocates feedback',
  );
  assert.equal(
    document.querySelectorAll('rect').length,
    1,
    'the static glyph is hidden during feedback',
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 240));
  });
  assert.equal(document.querySelectorAll('[data-mark]').length, 0);
  assert.equal(document.querySelectorAll('rect').length, 2);
  const stableCell = document.querySelector(
    '[data-cell="cell-check-2026-10-07"]',
  );
  await render(days[0], { batchCheckboxes: false });
  assert.equal(document.querySelectorAll('svg').length, 0);
  assert.equal(document.querySelectorAll('[data-mark]').length, 2);
  assert.equal(
    cell('check').animatedPosition,
    true,
    'moving rows attach the shared native transform',
  );
  assert.equal(
    positionReads,
    0,
    'ordinary idle taps never synchronously read UI positions',
  );
  liveTops = { ...liveTops, check: 52, default: 0 };
  await touch(60);
  assert.deepEqual(
    taps.at(-1),
    ['check', '2026-10-07'],
    'touches follow the actual moving row, not its final target',
  );
  assert.equal(positionReads, 2);
  assert.equal(
    document.querySelector('[data-cell="cell-check-2026-10-07"]'),
    stableCell,
    'movement uses the same accessible row views',
  );
  await render(days[2]);
  assert.equal(cell('check', days[2]).accessibilityState.checked, false);
  assert.match(cell('number', days[2]).accessibilityLabel, /not recorded/);
  assert.equal(document.querySelectorAll('rect').length, 2);
  await render(days[2], { habits: [] });
  assert.equal(document.querySelectorAll('svg').length, 0);
  assert.equal(
    listeners.size,
    0,
    'omitted rows release all entry subscriptions',
  );
});
