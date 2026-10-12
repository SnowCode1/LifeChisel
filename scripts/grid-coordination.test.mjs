import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React, { act, useLayoutEffect } from 'react';
import * as jsx from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import * as calendar from '../src/calendar.ts';
import * as navigation from '../src/gridNavigation.ts';
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
async function datesFixture(t, os = 'ios') {
  const render = await mount(t);
  let view, options;
  const calls = [],
    haptics = [];
  const offset = { value: 0 },
    geometryReady = { value: true };
  const scroll = {
    header: {},
    body: {},
    headerScroll: {},
    bodyScroll: {},
    offset,
    geometryReady,
    pull: { value: 0 },
    stopSync: () => calls.push({ kind: 'stop' }),
    continueReveal: (x) => {
      offset.value = x;
      calls.push({ kind: 'reveal', x });
    },
    alignGeometry: (x, ready) => {
      offset.value = x;
      geometryReady.value = ready;
      calls.push({ kind: 'align', x, ready });
    },
    scrollToDay: (day, finish) =>
      calls.push({
        kind: 'navigate',
        day,
        arrive: () => {
          offset.value =
            (options.futureCount + day - options.origin) * options.columnWidth;
          finish();
        },
      }),
  };
  const { useGridDates } = load('useGridDates.ts', {
    ...common,
    'react-native': { Platform: { OS: os } },
    'react-native-reanimated': { useAnimatedStyle: (fn) => fn },
    './calendar': calendar,
    './gridNavigation': navigation,
    './performance': { performanceEnabled: false, recordPerformance: () => {} },
    './haptics': { feedback: (value) => haptics.push(value) },
    './useGridScroll': {
      useGridScroll: (value) => {
        options = value;
        return scroll;
      },
    },
  });
  function Host(props) {
    const controller = useGridDates({ today: '2026-10-07', ...props });
    useLayoutEffect(() => {
      view = controller;
    });
    return null;
  }
  const geometry = { columnWidth: 55, dateWidth: 220, visibleDays: 4 };
  await render(React.createElement(Host, geometry));
  async function resize(next) {
    await act(() => view.prepareResize());
    await render(React.createElement(Host, next));
  }
  async function ready(controller = view, width = geometry.dateWidth) {
    await act(() => {
      controller.listLaidOut('header', width);
      controller.listLoaded('header');
      controller.listLoaded('body');
      controller.listLaidOut('body', width);
    });
  }
  return {
    view: () => view,
    options: () => options,
    offset,
    geometryReady,
    calls,
    haptics,
    resize,
    ready,
  };
}

test('date controller preserves the actual native anchor on rotation and rejects callbacks from the old generation', async (t) => {
  const f = await datesFixture(t);
  await f.ready();
  assert.equal(f.view().layoutBusy, false);
  const old = f.view();
  await act(() => f.options().onSettle(80, false));
  f.offset.value = 37 * 55; // Finger/momentum position is ahead of stale JS prediction.
  await f.resize({ columnWidth: 48, dateWidth: 624, visibleDays: 13 });
  assert.equal(f.view().rightmostDay, 37);
  assert.equal(f.view().frame.offset.x, 37 * 48);
  assert.equal(f.view().layoutBusy, true);
  assert.equal(f.geometryReady.value, false);
  await f.ready(old);
  assert.equal(f.view().layoutBusy, true);
  await f.ready(f.view(), 624);
  assert.equal(f.view().layoutBusy, false);
  assert.equal(f.geometryReady.value, true);
  assert.equal(f.offset.value, 37 * 48);
});

test('future pull waits for both expanded lists, retains date identities and collapses only after Today arrives', async (t) => {
  const f = await datesFixture(t);
  await f.ready();
  assert.equal(
    f.view().shared.maintainVisibleContentPosition.disabled,
    false,
    'iOS keeps native anchoring for inserted columns',
  );
  assert.equal(typeof f.view().shared.onStartReached, 'function');
  const before = f.view().days;
  await act(() => f.view().revealFuture(-100));
  assert.equal(f.view().days.length, 120);
  assert.equal(f.view().days[30], before[0]);
  assert.equal(
    f.haptics.length,
    0,
    'pull threshold owns its existing feedback',
  );
  await act(() => f.view().listSized('header', 120 * 55));
  assert.equal(
    f.calls.some((call) => call.kind === 'reveal'),
    false,
  );
  await act(() => f.view().listSized('body', 120 * 55));
  assert.equal(f.view().rightmostDay, -2);
  assert.equal(f.calls.at(-1).x, 28 * 55);
  await act(() => f.view().returnToToday());
  const trip = f.calls.at(-1);
  assert.equal(trip.kind, 'navigate');
  assert.equal(trip.day, 0);
  assert.equal(
    f.view().days.length,
    120,
    'future dates must stay mounted during arrival',
  );
  await act(() => trip.arrive());
  assert.equal(f.view().days.length, 90);
  assert.equal(f.view().days[0], before[0]);
  assert.equal(f.view().rangeReset, 1);
  assert.equal(f.view().atTodayBoundary, true);
});

test('Android future reveals remount both lists at the new date instead of settling after anchoring', async (t) => {
  const f = await datesFixture(t, 'android');
  await f.ready();
  const before = f.view().days;
  await act(() => f.view().revealFuture(-100));
  assert.equal(f.view().days.length, 120);
  assert.equal(f.view().days[30], before[0]);
  assert.equal(f.view().rightmostDay, -2);
  assert.equal(f.view().rangeReset, 1);
  assert.equal(f.view().frame.offset.x, 28 * 55);
  assert.equal(f.view().layoutBusy, true);
  await act(() => f.view().listSized('header', 120 * 55));
  await act(() => f.view().listSized('body', 120 * 55));
  assert.equal(
    f.calls.some((call) => call.kind === 'reveal'),
    false,
  );
  await f.ready();
  assert.equal(f.view().layoutBusy, false);
  assert.equal(f.offset.value, 28 * 55);
  assert.equal(f.haptics.length, 0);
});

test('Android never anchors inserted columns; newer history remounts once a gesture settles near its edge', async (t) => {
  const f = await datesFixture(t, 'android');
  await f.ready();
  assert.equal(
    f.view().shared.maintainVisibleContentPosition.disabled,
    true,
    'native anchoring follows recycled views and jumps on Android',
  );
  assert.equal(f.view().shared.onStartReached, undefined);
  await act(() => f.view().navigateToDate(10000));
  await f.ready();
  assert.equal(f.view().rightmostDay, 10000);
  const reset = f.view().rangeReset;
  await act(() => f.options().onSettle(9975, false));
  await act(() => f.options().onSettle(9990, true));
  assert.equal(f.view().rangeReset, reset, 'far from the newest date');
  await act(() => f.options().onSettle(9971, true));
  assert.equal(f.view().rangeReset, reset + 1);
  assert.equal(f.view().rightmostDay, 9971);
  assert.equal(f.view().days.length, 210);
  assert.equal(f.view().days[f.view().frame.index].daysAgo, 9971);
  assert.equal(f.view().layoutBusy, true);
  await f.ready();
  assert.equal(f.offset.value, f.view().frame.offset.x);
});

test('history expands once per rendered boundary and compacts only after settling; distant navigation stays bounded', async (t) => {
  const f = await datesFixture(t);
  await f.ready();
  const original = f.view().days;
  await act(() => {
    const grow = f.view().shared.onEndReached;
    grow();
    grow();
  });
  assert.equal(f.view().days.length, 180);
  assert.equal(f.view().days[0], original[0]);
  for (let i = 0; i < 3; i++) await act(() => f.view().shared.onEndReached());
  assert.equal(f.view().days.length, 450);
  await act(() => f.options().onSettle(200, false));
  assert.equal(f.view().days.length, 450);
  await act(() => f.options().onSettle(200, true));
  assert.equal(f.view().days.length, 270);
  assert.equal(f.view().days[f.view().frame.index].daysAgo, 200);
  await f.ready();
  await act(() => f.view().navigateToDate(10000));
  assert.equal(f.view().days.length, 120, 'never allocate intervening years');
  assert.equal(f.view().layoutBusy, true);
  await f.ready();
  assert.equal(f.calls.at(-1).day, 10000);
  await act(() => f.calls.at(-1).arrive());
  assert.equal(f.view().rightmostDay, 10000);
});

test('native date-list adapter freezes its initial index until the width-generation key remounts it', async (t) => {
  const render = await mount(t);
  let nativeProps;
  const List = (props) => {
    nativeProps = props;
    return null;
  };
  const { DateColumns } = load('DateColumns.tsx', {
    ...common,
    '@shopify/flash-list': { FlashList: List },
    'react-native': { Platform: { OS: 'ios' } },
    'react-native-reanimated': {
      default: { createAnimatedComponent: (component) => component },
      __esModule: true,
    },
  });
  const show = (width, index) =>
    render(
      React.createElement(DateColumns, {
        key: width,
        columnWidth: width,
        initialScrollIndex: index,
        data: [],
      }),
    );
  await show(55, 20);
  assert.equal(nativeProps.initialScrollIndex, 20);
  await show(55, 50);
  assert.equal(nativeProps.initialScrollIndex, 20);
  await show(48, 50);
  assert.equal(nativeProps.initialScrollIndex, 50);
});

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
