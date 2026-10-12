import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

function load(file, imports, context = {}) {
  const module = { exports: {} };
  runInNewContext(
    ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => {
        if (name === 'react') return React;
        if (name === 'react/jsx-runtime') return jsx;
        if (!(name in imports)) throw new Error(`Unexpected module ${name}`);
        return imports[name];
      },
      ...context,
    },
    { timeout: 500 },
  );
  return module.exports;
}
function browserRoot(t) {
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
  return root;
}

test('one row controller serves all columns; recycling/rotation retains owners and removal releases only that habit', async (t) => {
  const root = browserRoot(t);
  let created = 0,
    alive = 0;
  const received = new Map();
  const View = ({ children, ref, testID, style }) => {
    if (testID) received.set(testID, style.at(-1));
    return React.createElement('div', { ref, 'data-testid': testID }, children);
  };
  const { RowPositions, ReorderRow } = load('../src/ReorderRow.tsx', {
    'react-native': { View },
    'react-native-reanimated': {
      __esModule: true,
      default: { View },
      useAnimatedStyle(updater) {
        const latest = React.useRef(updater);
        React.useLayoutEffect(() => {
          latest.current = updater;
        });
        const [style] = React.useState(() => ({
          read: () => latest.current(),
        }));
        React.useEffect(() => {
          created++;
          alive++;
          return () => {
            alive--;
          };
        }, []);
        return style;
      },
    },
  });
  const rowTops = { value: { a: 0, b: 52 } },
    dragY = { value: 180 },
    bodyTop = { value: 30 },
    scrollOffset = { value: 12 };
  const motion = (id, active = false) => ({
    id,
    rowTops,
    dragY,
    bodyTop,
    scrollOffset,
    active,
    top: rowTops.value[id],
  });
  let motions = { a: motion('a'), b: motion('b') };
  const render = async (generation, count = 12, stationary = false) =>
    act(() =>
      root.render(
        React.createElement(
          RowPositions,
          { motions },
          [
            'name',
            'loading',
            ...Array.from({ length: count }, (_, i) => `${generation}_${i}`),
          ].flatMap((column) =>
            Object.values(motions).map((m) =>
              React.createElement(ReorderRow, {
                key: `${column}:${m.id}`,
                motion: m,
                testID: `${column}:${m.id}`,
                animatedPosition:
                  column === 'name' || column === 'loading' || !stationary,
              }),
            ),
          ),
        ),
      ),
    );
  await render('portrait');
  assert.equal(created, 2);
  assert.equal(alive, 2);
  const positionA = received.get('name:a'),
    positionB = received.get('name:b');
  assert.notEqual(positionA, positionB);
  assert.equal(received.get('portrait_0:a'), positionA);
  assert.equal(received.get('loading:a'), positionA);
  assert.equal(positionB.read().transform[0].translateY, 52);
  await render('landscape', 28);
  assert.equal(created, 2, 'new date views attach to the existing two owners');
  assert.equal(received.get('landscape_27:a'), positionA);
  await render('landscape', 28, true);
  assert.equal(created, 2, 'stationary cells retain their existing owners');
  assert.notEqual(received.get('landscape_27:a'), positionA);
  assert.equal(received.get('landscape_27:a').transform[0].translateY, 0);
  assert.equal(received.get('name:a'), positionA);
  assert.equal(received.get('loading:a'), positionA);
  await render('landscape', 28);
  assert.equal(
    received.get('landscape_27:a'),
    positionA,
    'movement reconnects the same handle',
  );
  rowTops.value = { a: 52, b: 0 };
  assert.equal(positionA.read().transform[0].translateY, 52);
  assert.equal(positionB.read().transform[0].translateY, 0);
  motions = { ...motions, a: motion('a', true) };
  await render('landscape', 28);
  assert.equal(received.get('name:a'), positionA);
  assert.equal(positionA.read().transform[0].translateY, 162);
  assert.equal(positionA.read().zIndex, 1);
  dragY.value = 206;
  assert.equal(
    positionA.read().transform[0].translateY,
    188,
    'UI values move the shared style without React',
  );
  motions = { a: motion('a') };
  await render('portrait');
  assert.equal(alive, 1);
  assert.equal(created, 2);
  assert.equal(received.get('portrait_0:a'), positionA);
  motions = { ...motions, b: motion('b') };
  await render('portrait');
  assert.equal(created, 3);
  assert.equal(alive, 2);
  assert.notEqual(received.get('name:b'), positionB);
  assert.equal(received.get('portrait_0:b'), received.get('name:b'));
});
