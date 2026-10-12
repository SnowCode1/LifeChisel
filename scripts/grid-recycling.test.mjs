import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React, { act, useEffect } from 'react';
import * as awaitlessJsx from 'react/jsx-runtime';
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
import { themeContextModule } from './theme-fixture.mjs';

const code = ts.transpileModule(
  readFileSync(new URL('../src/GridCells.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;

test('recycled date columns keep row views while switching subscriptions, taps and accessible values to the new date', async (t) => {
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
  const h = { id: 'read', name: 'Read', type: 'number', color: '#BDA5FF' };
  const days = createGridDayCache('2026-10-07')(3);
  let snapshot = {
    replay: {
      state: { values: { 'read:2026-10-07': 30, 'read:2026-10-06': 45 } },
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
  const publish = async (values) =>
    act(() => {
      snapshot = { replay: { state: { values } } };
      for (const listener of listeners) listener();
    });
  let mounts = 0,
    renders = 0,
    goalCalls = 0;
  function Row({ children }) {
    renders++;
    useEffect(() => {
      mounts++;
    }, []);
    return React.createElement('div', null, children);
  }
  function Pressable({
    children,
    onPress,
    testID,
    accessibilityLabel,
    disabled,
  }) {
    return React.createElement(
      'button',
      {
        onClick: onPress,
        'data-testid': testID,
        'aria-label': accessibilityLabel,
        disabled,
      },
      children,
    );
  }
  const module = { exports: {} };
  runInNewContext(
    code,
    {
      exports: module.exports,
      module,
      require: (name) => {
        const modules = {
          react: React,
          'react/jsx-runtime': awaitlessJsx,
          'react-native': {
            Platform: { OS: 'web' },
            View: ({ children }) => React.createElement('div', null, children),
            Pressable,
            StyleSheet: { create: (s) => s, hairlineWidth: 1 },
          },
          './Typography': {
            Text: ({ children }) => React.createElement('span', null, children),
          },
          './ReorderRow': { ReorderRow: Row },
          './ThemeContext': themeContextModule(),
          'react-native-reanimated': { useReducedMotion: () => false },
          './useGridColumnPress': {
            useGridColumnPress: () => ({ pressed: null, handlers: {} }),
          },
          './GridCheckboxLayer': {
            CheckboxGraphic: () => null,
            GridCheckboxLayer: () => null,
          },
          './entries': entries,
          './habitGoals': {
            ...goals,
            evaluateGoal: (...args) => {
              goalCalls++;
              return goals.evaluateGoal(...args);
            },
          },
          './habits': habits,
          './gridAppearance': appearance,
          './displayPreferences': display,
          './storage/selection': selection,
          './gridEntryText': textLayout,
          './performance': {
            recordPerformance: () => {},
            performanceEnabled: false,
          },
          './GridCheckboxMark': { GridCheckboxMark: () => null },
        };
        if (!(name in modules)) throw new Error(`Unexpected module ${name}`);
        return modules[name];
      },
    },
    { timeout: 500 },
  );
  const palette = appearance.createGridPalette(h.color);
  const props = {
    store,
    habits: [h],
    palettes: { read: palette },
    motions: { read: {} },
    heights: {},
    baseHeight: 52,
    checkboxStyle: 'boxes',
    tapAnimations: true,
    fontScale: 1,
    width: 55,
    height: 52,
    disabled: false,
  };
  const taps = [];
  const render = async (day, experiment = 'normal', rows = props.habits) =>
    act(() =>
      root.render(
        React.createElement(module.exports.GridDateColumn, {
          ...props,
          habits: rows,
          day,
          experiment,
          onPress: (habit, day) => taps.push([habit.id, day.key]),
        }),
      ),
    );
  await render(days[0]);
  const button = document.querySelector('button');
  assert.equal(button.textContent, '30');
  assert.match(button.getAttribute('aria-label'), /30/);
  await render(days[1]);
  assert.equal(document.querySelector('button'), button);
  assert.equal(mounts, 1);
  assert.equal(listeners.size, 1);
  assert.equal(button.textContent, '45');
  const settledRenders = renders;
  await publish({ ...snapshot.replay.state.values, 'read:2026-10-07': 90 });
  assert.equal(
    renders,
    settledRenders,
    'the old date no longer notifies this cell',
  );
  await publish({ ...snapshot.replay.state.values, 'read:2026-10-06': 0 });
  assert.equal(button.textContent, '0');
  assert.match(button.getAttribute('aria-label'), /, 0,/);
  await act(() => button.click());
  assert.deepEqual(taps, [['read', '2026-10-06']]);
  await render(days[2]);
  assert.equal(button.textContent, '—');
  assert.match(button.getAttribute('aria-label'), /not recorded/);
  assert.equal(mounts, 1);
  const calls = goalCalls;
  await render(days[1], 'no-goal-tint');
  assert.equal(goalCalls, calls, 'success-tint experiment skips evaluation');
  assert.equal(document.querySelector('button').textContent, '0');
  await render(days[1], 'simple-cells');
  assert.ok(
    goalCalls > calls,
    'simple rendering still evaluates the same goal',
  );
  assert.equal(document.querySelector('button').textContent, '0');
  assert.equal(listeners.size, 1);
  await act(() => document.querySelector('button').click());
  assert.deepEqual(taps.at(-1), ['read', '2026-10-06']);
  await render(days[1], 'normal', []);
  assert.equal(
    listeners.size,
    0,
    'off-screen rows release their subscriptions',
  );
  assert.equal(document.querySelector('button'), null);
  await publish({ ...snapshot.replay.state.values, 'read:2026-10-06': 17 });
  await render(days[1]);
  assert.equal(listeners.size, 1);
  assert.equal(
    document.querySelector('button').textContent,
    '17',
    'a refilled row reads edits made while it was off-screen',
  );
  await act(() => document.querySelector('button').click());
  assert.deepEqual(taps.at(-1), ['read', '2026-10-06']);
});
