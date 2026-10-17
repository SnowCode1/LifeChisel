import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React, { act, useLayoutEffect } from 'react';
import * as jsx from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { ChangeStore } from '../packages/core/src/storage/store.ts';
import { replayEvents } from '../packages/core/src/storage/model.ts';
import * as entries from '../packages/core/src/entries.ts';
import * as habits from '../packages/core/src/habits.ts';
import * as goals from '../packages/core/src/habitGoals.ts';
import * as colors from '../packages/core/src/colors.ts';
import * as suggestions from '../packages/core/src/numericSuggestions.ts';
import * as calendar from '../packages/core/src/calendar.ts';
import * as entryFill from '../packages/core/src/entryFill.ts';
import { themeContextModule } from './theme-fixture.mjs';

// Execute the actual controllers/components with small native mocks. Never print
// native/browser object graphs, and release each browser/root after its test.
function load(file, modules) {
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
      Error,
      require(name) {
        if (!(name in modules)) throw new Error(`Unexpected module ${name}`);
        return modules[name];
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
  return async (element) => act(() => root.render(element));
}
const Container = ({ children }) => React.createElement('div', null, children);
const Text = ({ children }) => React.createElement('span', null, children);
let sequenceId = 0;
async function fixture() {
  const definitions = [
    { id: 'read', name: 'Read', type: 'number', color: '#BDA5FF' },
    {
      id: 'walk',
      name: 'Walk',
      type: 'checkbox',
      color: '#82E6BC',
      goals: [
        {
          id: 'goal',
          from: '2026-01-01',
          rule: { kind: 'unchecked' },
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          defaultChecked: true,
        },
      ],
    },
    {
      id: 'workout',
      name: 'Workout',
      type: 'categorical',
      color: '#82E6BC',
      categories: [
        { id: 'run', label: 'Run' },
        { id: 'gym', label: 'Gym' },
      ],
    },
  ];
  const meta = (sequence) => ({
    version: 17,
    id: `action_${++sequenceId}`,
    sequence,
    recordedAt: '2026-10-07T00:00:00.000Z',
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
  });
  const events = [{ ...meta(1), type: 'initialize', habits: definitions }];
  const store = new ChangeStore(
    {
      load: async () => ({ ...replayEvents(events), hasRecovery: false }),
      append: async (event) => {
        events.push(event);
      },
    },
    meta,
  );
  await store.load();
  assert.equal(store.getSnapshot().status, 'ready');
  const feedback = [],
    receipts = [];
  const { useDailyEntryActions } = load('useDailyEntryActions.ts', {
    ...common,
    '@onpurpose/core/calendar': calendar,
    '@onpurpose/core/entryFill': entryFill,
    '@onpurpose/core/entries': entries,
    '@onpurpose/core/habits': habits,
    '@onpurpose/core/habitGoals': goals,
    './haptics': { feedback: (kind) => feedback.push(kind) },
  });
  const capture = (change) => receipts.push(change);
  return {
    store,
    useDailyEntryActions,
    capture,
    feedback,
    receipts,
    definitions,
  };
}
const day = { key: '2026-10-07', fullLabel: 'Wednesday, 7 October 2026' };

test('numeric drafts stay local; Close cancels, invalid input cannot save, and Done uses the latest value with zero distinct from blank', async (t) => {
  const render = await mount(t);
  const { store, useDailyEntryActions, capture, definitions, receipts } =
    await fixture();
  const controls = new Map();
  let input,
    actions,
    rootRenders = 0;
  function Pressable(props) {
    controls.set(
      props.accessibilityLabel ?? props.children?.props?.children,
      props,
    );
    return React.createElement(
      'button',
      { disabled: props.disabled },
      props.children,
    );
  }
  const { NumericRecordDialog } = load('NumericRecordDialog.tsx', {
    ...common,
    'react-native': {
      Modal: Container,
      KeyboardAvoidingView: Container,
      ScrollView: Container,
      View: Container,
      Pressable,
      Platform: { OS: 'ios' },
      StyleSheet: { create: (value) => value },
    },
    './Typography': {
      Text,
      TextInput: (props) => {
        input = props;
        return null;
      },
    },
    // The card's entrance animation; values settle at once here.
    'react-native-reanimated': {
      default: { View: Container },
      __esModule: true,
      Easing: { out: (easing) => easing, cubic: (t) => t },
      useAnimatedStyle: () => ({}),
      useReducedMotion: () => false,
      useSharedValue: (value) => ({ get: () => value, set: () => {} }),
      withTiming: (value) => value,
    },
    '@onpurpose/core/calendar': calendar,
    '@onpurpose/core/colors': colors,
    './Icon': { Icon: () => null },
    './ThemeContext': themeContextModule(),
    '@onpurpose/core/numericSuggestions': suggestions,
    '@onpurpose/core/entries': entries,
    './haptics': { feedback: () => {} },
    './useKeyboardFocus': load('useKeyboardFocus.ts', {
      ...common,
      'react-native': { Platform: { OS: 'ios' } },
    }),
  });
  function Host() {
    const controller = useDailyEntryActions(store, capture);
    useLayoutEffect(() => {
      rootRenders++;
      actions = controller;
    });
    const editor = controller.editing;
    return editor
      ? React.createElement(NumericRecordDialog, {
          key: editor.key,
          habit: editor.habit,
          day: editor.day,
          initialValue: editor.value,
          values: store.getSnapshot().replay.state.values,
          editable: store.canEdit(),
          Heading: Text,
          onClose: controller.closeNumber,
          onSave: controller.saveNumber,
        })
      : null;
  }
  await render(React.createElement(Host));
  const press = async () => act(() => actions.pressCell(definitions[0], day));
  const type = async (text) => act(() => input.onChangeText(text));
  const done = async () => act(() => controls.get('Done').onPress());
  await press();
  const afterOpen = rootRenders;
  for (const text of ['1', '12', '12,5']) await type(text);
  assert.equal(rootRenders, afterOpen, 'typing must not revisit the app/host');
  assert.equal(store.getSnapshot().events.length, 1);
  await act(() => controls.get('Close').onPress());
  assert.equal(store.getSnapshot().events.length, 1);
  await press();
  assert.equal(input.value, '', 'cancelled draft must not reappear');
  for (const text of ['-1', 'NaN', '1e3', '9007199254740992']) {
    await type(text);
    assert.equal(controls.get('Done').disabled, true);
    await act(() => input.onSubmitEditing());
    assert.notEqual(actions.editing, null);
    assert.equal(store.getSnapshot().events.length, 1);
  }
  await type('0');
  await done();
  assert.equal(store.getSnapshot().replay.state.values['read:2026-10-07'], 0);
  assert.equal(receipts.at(-1).after, 0);
  await press();
  await type('12,5');
  store.change({
    kind: 'entry',
    habitId: 'read',
    date: day.key,
    before: 0,
    after: 7,
  });
  await done();
  assert.equal(
    receipts.at(-1).before,
    7,
    'Done must not reuse the opening value',
  );
  assert.equal(receipts.at(-1).after, 12.5);
  await press();
  await type('');
  await done();
  assert.equal(
    store.getSnapshot().replay.state.values['read:2026-10-07'],
    undefined,
  );
  assert.equal(receipts.at(-1).after, null);
  await press();
  await type('3');
  const change = store.change.bind(store);
  store.change = () => false;
  await done();
  assert.notEqual(actions.editing, null, 'rejected saves retain the draft');
  store.change = change;
  await done();
  assert.equal(actions.editing, null);
  await store.flush();
});

test('shared daily actions preserve dated checkbox defaults, grouped no-ops, blocked saves and stable grid callbacks', async (t) => {
  const render = await mount(t);
  const {
    store,
    useDailyEntryActions,
    capture,
    definitions,
    receipts,
    feedback,
  } = await fixture();
  let actions;
  function Host() {
    const controller = useDailyEntryActions(store, capture);
    useLayoutEffect(() => {
      actions = controller;
    });
    return null;
  }
  await render(React.createElement(Host));
  const press = actions.pressCell;
  await act(() => actions.pressCell(definitions[1], day));
  assert.equal(store.getSnapshot().replay.state.values['walk:2026-10-07'], 0);
  assert.equal(feedback.at(-1), 'undo');
  await act(() => actions.pressCell(definitions[1], day));
  assert.equal(
    store.getSnapshot().replay.state.values['walk:2026-10-07'],
    undefined,
  );
  assert.equal(
    store.getSnapshot().replay.undo.length,
    0,
    'net-zero toggling still coalesces',
  );
  await act(() => actions.pressCell(definitions[2], day));
  assert.equal(
    actions.pressCell,
    press,
    'opening a draft must not change the grid callback',
  );
  assert.equal(actions.saveRecord(['gym', 'run']), true);
  const count = receipts.length,
    events = store.getSnapshot().events.length;
  assert.equal(actions.saveRecord(['gym', 'run']), true);
  assert.equal(receipts.length, count);
  assert.equal(store.getSnapshot().events.length, events);
  // Exclusive backup work disables every entry path, including unchanged saves.
  await store.exclusive(async () => {
    assert.equal(actions.saveRecord(['gym', 'run']), false);
    await act(() => actions.pressCell(definitions[0], day));
    assert.equal(actions.editing, null);
  });
  await act(() => actions.closeEntries());
  assert.equal(actions.recording, null);
  await store.flush();
});

function backupHarness(chooseBackup, shareBackup) {
  const alerts = [],
    calls = [];
  const { useBackupActions } = load('useBackupActions.ts', {
    ...common,
    'react-native': { Alert: { alert: (...args) => alerts.push(args) } },
    './storage/backups': { chooseBackup, shareBackup },
  });
  const store = {
    exclusive: async (task) => {
      calls.push('exclusive:start');
      await task();
      calls.push('exclusive:end');
    },
    replace: async (events) => {
      calls.push(events);
    },
    recoveryEvents: async () => {
      calls.push('recovery');
      return ['recovery-events'];
    },
  };
  return { alerts, calls, store, useBackupActions };
}

test('backup restore still waits for named native confirmation and delegates replacement/recovery to the exclusive store', async (t) => {
  const render = await mount(t);
  const archive = {
    replay: { state: { habits: [{ id: 'walk' }] } },
    events: ['init', 'change'],
  };
  const harness = backupHarness(
    async () => archive,
    async () => {},
  );
  let actions;
  function Host() {
    actions = harness.useBackupActions(harness.store, false);
    return null;
  }
  await render(React.createElement(Host));
  let pending;
  await act(async () => {
    pending = actions.restoreBackup();
    await Promise.resolve();
  });
  assert.equal(actions.backupBusy, true);
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.alerts.at(-1)[0], 'Restore this backup?');
  await act(async () => {
    harness.alerts.at(-1)[2][0].onPress();
    await pending;
  });
  assert.equal(actions.backupBusy, false);
  assert.equal(harness.calls.length, 0, 'Cancel must never replace data');
  await act(async () => {
    pending = actions.restoreBackup();
    await Promise.resolve();
  });
  await act(async () => {
    harness.alerts.at(-1)[2][1].onPress();
    await pending;
  });
  assert.equal(harness.calls[0], 'exclusive:start');
  assert.equal(harness.calls[1], archive.events);
  assert.equal(harness.calls[2], 'exclusive:end');
  await act(() => actions.recoverPrevious());
  assert.equal(harness.calls.length, 3);
  await act(async () => harness.alerts.at(-1)[2][1].onPress());
  assert.equal(harness.calls[3], 'exclusive:start');
  assert.equal(harness.calls[4], 'recovery');
  assert.equal(harness.calls[5][0], 'recovery-events');
  assert.equal(harness.calls[6], 'exclusive:end');
});

test('backup work ignores rapid duplicate presses and sample mode, releases its busy guard after failure or cancelled picking', async (t) => {
  const render = await mount(t);
  let release,
    shares = 0;
  const harness = backupHarness(
    async () => null,
    async () => {
      shares++;
      await new Promise((resolve) => {
        release = resolve;
      });
      throw new Error('Share failed');
    },
  );
  let actions;
  function Host({ sample }) {
    actions = harness.useBackupActions(harness.store, sample);
    return null;
  }
  await render(React.createElement(Host, { sample: false }));
  let pending;
  await act(async () => {
    pending = actions.exportBackup();
    await actions.exportBackup();
  });
  assert.equal(shares, 1, 'the ref must guard even before React commits busy');
  assert.equal(actions.backupBusy, true);
  await act(async () => {
    release();
    await pending;
  });
  assert.equal(actions.backupBusy, false);
  assert.equal(harness.alerts.at(-1)[1], 'Share failed');
  await act(async () => actions.restoreBackup());
  assert.equal(actions.backupBusy, false);
  assert.equal(harness.calls.length, 0);
  await render(React.createElement(Host, { sample: true }));
  const alertCount = harness.alerts.length;
  await act(async () => {
    await actions.exportBackup();
    await actions.restoreBackup();
    actions.recoverPrevious();
  });
  assert.equal(harness.alerts.length, alertCount);
  assert.equal(shares, 1);
});

test('the shared chart frame supports tap, hold-and-drag tracking across rows, stepping, accessibility and date identity', async (t) => {
  const render = await mount(t);
  let chart;
  const controls = {};
  const scrub = {};
  const locks = [];
  function Pressable(props) {
    if (props.accessibilityLabel === 'Trend chart') chart = props;
    else controls[props.accessibilityLabel] = props;
    return React.createElement(
      'button',
      null,
      typeof props.children === 'function'
        ? props.children({ pressed: false })
        : props.children,
    );
  }
  // A recording stand-in for the gesture-handler pan used for thumb tracking.
  const pan = {
    activateAfterLongPress: (ms) => ((scrub.hold = ms), pan),
    runOnJS: () => pan,
    onStart: (f) => ((scrub.start = f), pan),
    onUpdate: (f) => ((scrub.update = f), pan),
    onFinalize: (f) => ((scrub.finalize = f), pan),
  };
  const frame = load('ChartFrame.tsx', {
    ...common,
    'react-native': {
      View: Container,
      Pressable,
      StyleSheet: { create: (value) => value },
    },
    'react-native-gesture-handler': {
      Gesture: { Pan: () => pan },
      GestureDetector: ({ children }) => children,
      GestureHandlerRootView: Container,
    },
    'react-native-svg': {
      default: Container,
      Line: () => null,
      Rect: () => null,
      __esModule: true,
    },
    './Typography': { Text },
    './Icon': { Icon: () => null },
    './ThemeContext': themeContextModule(),
    './haptics': { feedback: () => {} },
  });
  const { ChartFrame, ChartScrubLock } = frame;
  const first = {
    key: '2026-10-01',
    x0: 0,
    x1: 0.5,
    title: '1 Oct',
    value: '40%',
  };
  const second = {
    key: '2026-10-02',
    x0: 0.5,
    x1: 1,
    title: '2 Oct',
    value: '80%',
  };
  const show = (slots, height = 140) =>
    render(
      React.createElement(
        ChartScrubLock.Provider,
        { value: (locked) => locks.push(locked) },
        React.createElement(ChartFrame, {
          name: 'Trend chart',
          slots,
          ticks: [],
          axis: [],
          legend: 'Days completed (%)',
          colour: '#82E6BC',
          height,
          draw: () => null,
        }),
      ),
    );
  await show([first, second]);
  await act(() => chart.onLayout({ nativeEvent: { layout: { width: 300 } } }));
  await act(() =>
    chart.onPress({ nativeEvent: { locationX: 200, locationY: 50 } }),
  );
  assert.equal(chart.accessibilityValue.text, '2 Oct: 80%');
  await act(() => controls.Previous.onPress());
  assert.equal(chart.accessibilityValue.text, '1 Oct: 40%', 'steps back');
  await act(() =>
    chart.onPress({ nativeEvent: { locationX: 10, locationY: 50 } }),
  );
  assert.equal(chart.accessibilityValue.text, 'Nothing selected');
  // Hold, then drag: the reading follows the thumb and paging pauses.
  assert.ok(scrub.hold > 0, 'tracking starts after a hold');
  await act(() => scrub.start({ x: 20, y: 60 }));
  assert.equal(chart.accessibilityValue.text, '1 Oct: 40%');
  assert.deepEqual(locks, [true]);
  await act(() => scrub.update({ x: 280, y: 200 }));
  assert.equal(chart.accessibilityValue.text, '2 Oct: 80%', 'beyond the plot');
  await act(() => scrub.finalize());
  assert.deepEqual(locks, [true, false]);
  assert.equal(chart.accessibilityValue.text, '2 Oct: 80%', 'reading stays');
  await act(() =>
    chart.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }),
  );
  assert.equal(chart.accessibilityValue.text, '1 Oct: 40%');
  await show([second, first]);
  assert.equal(
    chart.accessibilityValue.text,
    '1 Oct: 40%',
    'selection follows the dated slot, not its old index',
  );
  // Two rows: one streak drawn in both, another below. Tracking follows rows,
  // and stepping treats a streak shown in two places as one item.
  const top = {
    key: 'a',
    x0: 0.5,
    x1: 1,
    y0: 0,
    y1: 0.4,
    title: 'A',
    value: '9 days',
  };
  const wrap = {
    key: 'a',
    x0: 0,
    x1: 0.2,
    y0: 0.6,
    y1: 1,
    title: 'A',
    value: '9 days',
  };
  const below = {
    key: 'b',
    x0: 0.6,
    x1: 0.8,
    y0: 0.6,
    y1: 1,
    title: 'B',
    value: '3 days',
  };
  await show([top, wrap, below], 100);
  await act(() => scrub.start({ x: 30, y: 85 }));
  assert.equal(chart.accessibilityValue.text, 'A: 9 days', 'second row, A');
  await act(() => scrub.update({ x: 200, y: 85 }));
  assert.equal(chart.accessibilityValue.text, 'B: 3 days', 'stays in the row');
  await act(() => scrub.update({ x: 200, y: 15 }));
  assert.equal(chart.accessibilityValue.text, 'A: 9 days', 'moves up a row');
  await act(() => scrub.finalize());
  await act(() => controls.Next.onPress());
  assert.equal(chart.accessibilityValue.text, 'B: 3 days', 'one step per item');
  await act(() => controls['Clear selection'].onPress());
  assert.equal(chart.accessibilityValue.text, 'Nothing selected');
  await show([]);
  await act(() =>
    chart.onPress({ nativeEvent: { locationX: 1, locationY: 1 } }),
  );
  await act(() =>
    chart.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }),
  );
  assert.equal(chart.accessibilityValue.text, 'Nothing selected');
});
