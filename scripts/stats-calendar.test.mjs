import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import * as calendar from '../src/calendar.ts';
import * as colors from '../src/colors.ts';
import * as display from '../src/displayPreferences.ts';
import * as entries from '../src/entries.ts';
import * as goals from '../src/habitGoals.ts';
import * as habits from '../src/habits.ts';
import * as statistics from '../src/statistics.ts';
import * as formatting from '../src/statisticsFormatting.ts';
import * as series from '../src/statsSeries.ts';
import * as theme from '../src/theme.ts';
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
      require(name) {
        if (!(name in modules)) throw new Error(`Unexpected module ${name}`);
        return modules[name];
      },
    },
    { timeout: 500 },
  );
  return module.exports;
}

const start = '2026-10-01',
  today = '2026-10-07';
const defaultOn = {
  id: 'walk',
  name: 'Walk',
  color: '#82E6BC',
  type: 'checkbox',
  startDate: start,
  goals: [
    {
      id: 'g',
      from: start,
      rule: { kind: 'checked' },
      weekdays: goals.allWeekdays,
      defaultChecked: true,
    },
  ],
};
const plain = { ...defaultOn, id: 'read', name: 'Read', goals: undefined };

test('calendar checkbox days announce the dated default, not only saved values', async (t) => {
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

  const presses = [];
  const passthrough = (tag) =>
    function Node({ children }) {
      return React.createElement(tag, null, children);
    };
  function Pressable(props) {
    presses.push(props);
    return React.createElement('div', null, props.children);
  }
  const modules = {
    react: React,
    'react/jsx-runtime': jsx,
    'react-native': { View: passthrough('div'), Pressable },
    'react-native-svg': {
      __esModule: true,
      default: passthrough('svg'),
      Rect: passthrough('rect'),
    },
    './Typography': {
      Text: passthrough('span'),
      useAppWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
    },
    './Icon': { Icon: () => null },
    './calendar': calendar,
    './colors': colors,
    './displayPreferences': display,
    './entries': entries,
    './habitGoals': goals,
    './habits': habits,
    './statistics': statistics,
    './statisticsFormatting': formatting,
    './statsSeries': series,
    './ThemeContext': themeContextModule(),
  };
  modules['./outcomeColours'] = load('../src/outcomeColours.ts', {
    './theme': theme,
  });
  const { StatsCalendar } = load('../src/StatsCalendar.tsx', modules);

  const from = statistics.dayNumber(start),
    to = statistics.dayNumber(today);
  async function render(habit, values) {
    presses.length = 0;
    const days = series.habitSeries(habit, values, start, today, from, to);
    await act(() =>
      root.render(
        React.createElement(StatsCalendar, {
          habit,
          days,
          from,
          to,
          today,
          weekStart: 'monday',
          editable: true,
          allowFuture: false,
          onDayPress: () => {},
        }),
      ),
    );
    return (date) => {
      const label = calendar.entryDay(date).fullLabel;
      const cell = presses.find((p) =>
        p.accessibilityLabel?.includes(`, ${label}`),
      );
      assert.ok(cell, `no calendar cell for ${date}`);
      return cell;
    };
  }

  // 4 October is untouched, so it inherits the default; 5 October is an
  // explicit Off override.
  const cell = await render(defaultOn, { 'walk:2026-10-05': 0 });
  const untouched = cell('2026-10-04'),
    off = cell('2026-10-05');
  assert.equal(untouched.accessibilityState.checked, true);
  assert.match(untouched.accessibilityLabel, /, checked/);
  assert.equal(off.accessibilityState.checked, false);
  assert.match(off.accessibilityLabel, /, unchecked/);

  // Without a default, an untouched day stays unchecked and says nothing extra.
  const plainCell = await render(plain, {});
  const blank = plainCell('2026-10-04');
  assert.equal(blank.accessibilityState.checked, false);
  assert.doesNotMatch(blank.accessibilityLabel, /checked/);
});
