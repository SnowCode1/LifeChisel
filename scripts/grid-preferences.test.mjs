import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import React, { act, createContext, memo, useContext, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';
import { useGridDisplayPreferences } from '../src/useGridDisplayPreferences.ts';

test('settings receive every choice while mounted grid geometry and typography wait for dismissal', async () => {
  const browser = new JSDOM('<html><body><div id="root"></div></body></html>');
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = browser.window;
  globalThis.document = browser.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.getElementById('root');
  const root = createRoot(host);
  const FontScale = createContext(1);
  let renders = 0;
  let mounts = 0;
  let grid;
  let settings;
  const Grid = memo(function Grid({
    rowSpacing,
    columnSpacing,
    nameColumnWidth,
    hideCompleted,
    checkboxStyle,
    weekDividers,
    tapAnimations,
    weekStart,
  }) {
    renders++;
    const scale = useContext(FontScale);
    const [scroll] = useState(() => {
      mounts++;
      return '2026-08-01';
    });
    grid = {
      rowSpacing,
      columnSpacing,
      nameColumnWidth,
      hideCompleted,
      checkboxStyle,
      weekDividers,
      tapAnimations,
      weekStart,
      scale,
      scroll,
    };
    return React.createElement('div', null, scroll);
  });
  function Presentation({ current, deferred }) {
    const displayed = useGridDisplayPreferences(current, deferred);
    settings = current;
    // Match App: Settings inherits current text size, grid has a stable override.
    return React.createElement(
      FontScale.Provider,
      { value: current.textScale },
      React.createElement(
        FontScale.Provider,
        { value: displayed.textScale },
        React.createElement(Grid, {
          rowSpacing: displayed.rowSpacing,
          columnSpacing: displayed.columnSpacing,
          nameColumnWidth: displayed.nameColumnWidth,
          hideCompleted: displayed.hideCompleted,
          checkboxStyle: displayed.checkboxStyle,
          weekDividers: displayed.weekDividers,
          tapAnimations: displayed.tapAnimations,
          weekStart: displayed.weekStart,
        }),
      ),
    );
  }
  const initial = {
    checkboxStyle: 'boxes',
    weekDividers: true,
    tapAnimations: true,
    weekStart: 'monday',
    rowSpacing: 'standard',
    columnSpacing: 'standard',
    nameColumnWidth: 'standard',
    textScale: 1,
    hideCompleted: false,
  };
  const render = async (current, deferred) =>
    act(() =>
      root.render(React.createElement(Presentation, { current, deferred })),
    );
  try {
    await render(initial, false);
    assert.equal(renders, 1);
    const node = host.firstChild;
    await render(initial, true);
    const choices = [
      { ...initial, rowSpacing: 'compact' },
      { ...initial, columnSpacing: 'roomy', textScale: 1.5 },
      {
        ...initial,
        nameColumnWidth: 'wide',
        rowSpacing: 'roomy',
        columnSpacing: 'standard',
        textScale: 1.15,
        hideCompleted: false,
        checkboxStyle: 'marks',
        weekDividers: false,
        tapAnimations: false,
        weekStart: 'sunday',
      },
    ];
    for (const current of choices) {
      await render(current, true);
      await render({ ...current }, true); // save acknowledgement / new projection
      assert.equal(settings.textScale, current.textScale);
      assert.equal(settings.rowSpacing, current.rowSpacing);
      assert.equal(settings.columnSpacing, current.columnSpacing);
      assert.equal(renders, 1);
      assert.equal(grid.scale, 1);
    }
    // Close starts dismissal; deferred remains true until native onDismiss.
    const latest = choices.at(-1);
    await render(latest, true);
    assert.equal(renders, 1);
    await render(latest, false);
    assert.equal(renders, 2);
    assert.equal(grid.rowSpacing, 'roomy');
    assert.equal(grid.columnSpacing, 'standard');
    assert.equal(grid.nameColumnWidth, 'wide');
    assert.equal(grid.scale, 1.15);
    assert.equal(grid.hideCompleted, false);
    assert.equal(grid.checkboxStyle, 'marks');
    assert.equal(grid.weekDividers, false);
    assert.equal(grid.tapAnimations, false);
    assert.equal(grid.weekStart, 'sunday');
    assert.equal(grid.scroll, '2026-08-01');
    assert.equal(mounts, 1);
    const hidden = { ...latest, hideCompleted: true, columnSpacing: 'compact' };
    await render(hidden, true);
    assert.equal(grid.hideCompleted, true);
    assert.equal(grid.columnSpacing, 'standard');
    assert.equal(mounts, 1);
    await render(latest, true);
    // Avoid DOM-object assertions: failures must never print a browser graph.
    assert.equal(host.firstChild === node, true);
    await render(latest, true);
    await render(initial, true);
    await render(latest, true); // user changes mind back to displayed values
    await render(latest, false);
    assert.equal(renders, 4);
  } finally {
    await act(() => root.unmount());
    browser.window.close();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});

test('actual panel dismissal handler releases geometry only after closing and ignores stale dismissal while reopened', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const file = ts.createSourceFile(
    'App.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let expression;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(file) === 'onDismiss')
      expression = node.initializer.expression.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(typeof expression, 'string');
  let panel = { page: 'settings', visible: false, deferGrid: true };
  const handler = runInNewContext(
    ts.transpileModule(`(${expression})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      setPanel: (update) => {
        panel = update(panel);
      },
    },
    { timeout: 100 },
  );
  handler();
  assert.equal(panel.deferGrid, false);
  assert.equal(panel.visible, false);
  panel = { page: 'settings', visible: true, deferGrid: true };
  handler();
  assert.equal(panel.deferGrid, true);
  assert.equal(panel.visible, true);
});
