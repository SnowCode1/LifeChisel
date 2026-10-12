import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React, { act, useLayoutEffect } from 'react';
import * as jsx from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { themeContextModule } from './theme-fixture.mjs';

function load(file, imports) {
  const module = { exports: {} };
  const code = ts.transpileModule(
    readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      require(name) {
        if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
        return imports[name];
      },
    },
    { timeout: 500 },
  );
  return module.exports;
}
const common = { react: React, 'react/jsx-runtime': jsx };
async function mount(t) {
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
  return (element) => act(() => root.render(element));
}
test('context-menu measurement stays local, leaves the held name uncovered and closes before dispatching an action', async (t) => {
  const render = await mount(t);
  let commits = 0,
    menuProps;
  const dismiss = [],
    buttons = [],
    calls = [];
  const Container = ({ children, ...props }) => {
    if (props.onLayout) menuProps = props;
    return React.createElement('div', null, children);
  };
  function Pressable(props) {
    if (props.accessibilityLabel === 'Dismiss habit actions')
      dismiss.push(props);
    else buttons.push(props);
    return React.createElement('button', null, props.children);
  }
  const { HabitContextMenu } = load('HabitContextMenu.tsx', {
    ...common,
    'react-native': {
      Pressable,
      ScrollView: Container,
      StyleSheet: { absoluteFill: {} },
    },
    'react-native-reanimated': {
      default: { View: Container },
      __esModule: true,
    },
    './Typography': { Text: Container },
    './Icon': { Icon: () => null },
    './ThemeContext': themeContextModule(),
    './motion': { appear: {}, disappear: {}, menuAppear: {} },
  });
  const anchor = { x: 0, y: 200, width: 120, height: 52 };
  const props = {
    menu: { anchor },
    habit: { id: 'walk', name: 'Walk', color: '#82E6BC' },
    bounds: { rootY: 20, rootHeight: 800 },
    width: 360,
    nameWidth: 120,
    onClose: () => calls.push('close'),
    onAction: (action) => calls.push(action),
  };
  function Host() {
    useLayoutEffect(() => {
      commits++;
    });
    return React.createElement(HabitContextMenu, props);
  }
  await render(React.createElement(Host));
  const priorCommits = commits;
  assert.equal(dismiss[0].style[1].height, 180);
  assert.equal(dismiss[1].style[1].top, 232);
  assert.equal(dismiss[2].style[1].left, 120);
  await act(() =>
    menuProps.onLayout({ nativeEvent: { layout: { height: 300 } } }),
  );
  assert.equal(
    commits,
    priorCommits,
    'menu measurement must not revisit the grid',
  );
  await act(() => buttons.at(-1).onPress());
  assert.deepEqual(calls, ['close', 'archive']);
});
