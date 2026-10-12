import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import {
  gridEntryTextLines,
  GRID_ENTRY_LINE_HEIGHT,
} from '../src/gridEntryText.ts';
import { gridRowHeight } from '../src/rowSpacing.ts';
import { combinedTextScale } from '../src/textSize.ts';

test('cell line capacity follows row height and combined text scale without fitting more through shrinking', () => {
  assert.equal(gridEntryTextLines(44, 1), 2);
  assert.equal(gridEntryTextLines(52, 1), 2);
  assert.equal(gridEntryTextLines(64, 1), 3);
  assert.equal(gridEntryTextLines(44, 2), 1);
  for (const app of [0.85, 1, 1.15, 1.5]) {
    for (const system of [1, 1.3, 2]) {
      const scale = combinedTextScale(system, app);
      for (const size of [40, 44, 'auto', 64, 80]) {
        const height = gridRowHeight(size, scale, 874);
        const lines = gridEntryTextLines(height, scale);
        assert.ok(lines >= 1 && lines <= 3);
        assert.ok(lines * GRID_ENTRY_LINE_HEIGHT * scale <= height - 12);
      }
    }
  }
});

function autosizingExpressions(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const expressions = [];
  function visit(node) {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(file) === 'adjustsFontSizeToFit'
    ) {
      expressions.push(
        node.initializer && ts.isJsxExpression(node.initializer)
          ? node.initializer.expression.getText(file)
          : 'true',
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return expressions;
}

test('recording-calendar text cannot enter iOS autosizing that ignores minimumFontScale', () => {
  // The canvas grid fits numbers itself (down to 65%); native text elsewhere
  // must not use autosizing, which ignores the advertised minimum on iOS.
  assert.deepEqual(autosizingExpressions('../src/RecordStatsScreen.tsx'), []);
});
