import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import * as ordering from '../packages/core/src/habitOrdering.ts';

test('hidden/archive rows animate surviving shared targets; geometry and active drag cancellation stay immediate', async (t) => {
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
  const writes = [];
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL('../src/useHabitReorder.ts', import.meta.url),
        'utf8',
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      module,
      exports: module.exports,
      cancelAnimationFrame: () => {},
      requestAnimationFrame: () => 1,
      require(name) {
        if (name === 'react') return React;
        if (name === 'react-native')
          return {
            AppState: { addEventListener: () => ({ remove() {} }) },
            AccessibilityInfo: { announceForAccessibility() {} },
          };
        if (name === '@onpurpose/core/habitOrdering') return ordering;
        if (name === './haptics') return { feedback() {} };
        if (name === './motion')
          return {
            rowRemovalTiming: { duration: 220, reduceMotion: 'system' },
            reorderSpring: {},
          };
        if (name === 'react-native-reanimated')
          return {
            useSharedValue(initial) {
              return React.useState(() => ({
                value: initial,
                get() {
                  return this.value;
                },
                set(next) {
                  this.value = next;
                  writes.push(next);
                },
              }))[0];
            },
            withTiming(target, config) {
              writes.push({ animation: target, config });
              return target;
            },
            withSpring: (value) => value,
            cancelAnimation() {},
            runOnJS: (fn) => fn,
          };
        throw new Error(`Unexpected import ${name}`);
      },
    },
    { timeout: 1000 },
  );
  let model;
  const heights = { a: 52, b: 70, c: 52 };
  function Rows({ ids, geometry }) {
    model = module.exports.useHabitReorder(
      ids.map((id) => ({ id })),
      heights,
      52,
      () => true,
      geometry,
    );
    return null;
  }
  const render = (ids, geometry = 'portrait') =>
    act(() => root.render(React.createElement(Rows, { ids, geometry })));
  const targets = () => JSON.parse(JSON.stringify(model.rowTops.get()));
  const animations = () => writes.filter((item) => item?.animation);
  await render(['a', 'b', 'c']);
  assert.deepEqual(targets(), { a: 0, b: 52, c: 122 });
  assert.equal(animations().length, 0);
  writes.length = 0;
  await render(['a', 'c']);
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0])), { a: 0, c: 122 });
  assert.deepEqual(targets(), { a: 0, c: 52 });
  assert.equal(animations().length, 1);
  assert.equal(animations()[0].config.duration, 220);
  assert.equal(animations()[0].config.reduceMotion, 'system');
  // The idle identity effect must not immediately replace the animated targets.
  assert.equal(
    writes.filter((item) => item && typeof item === 'object').length,
    3,
  );
  writes.length = 0;
  await render(['a', 'b', 'c']);
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0])), {
    a: 0,
    b: 52,
    c: 52,
  });
  assert.deepEqual(targets(), { a: 0, b: 52, c: 122 });
  assert.equal(animations().length, 1);
  writes.length = 0;
  await render(['a', 'c'], 'landscape');
  assert.equal(animations().length, 0);
  assert.deepEqual(targets(), { a: 0, c: 52 });
  await act(() => model.beginOrMove('a', 0, 0));
  assert.equal(model.dragId, 'a');
  writes.length = 0;
  await render(['c'], 'landscape');
  assert.equal(model.dragId, null);
  assert.deepEqual(targets(), { c: 0 });
  assert.equal(animations().length, 0);
});
