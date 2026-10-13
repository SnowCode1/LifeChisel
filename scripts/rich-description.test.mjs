import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';
import { act, createElement, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Slice } from '@tiptap/pm/model';
import { useEditorReady } from '../src/richText/useEditorReady.ts';
import {
  descriptionExtensions,
  descriptionSnapshot,
  serializeDescriptionDocument,
  prepareDescriptionSnapshot,
  formatDescription,
} from '../src/richText/extensions.ts';
import { clearDescriptionFormatting } from '../src/richText/clearFormatting.ts';
import {
  useEditorPosition,
  restoreEditorSelection,
  editorPosition,
} from '../src/richText/useEditorPosition.ts';
import { selectedHighlight, selectedLink } from '../src/richText/selection.ts';
import { markdownDocument } from '../src/richText/markdownDocument.ts';
import {
  highlightColours,
  highlightMarkdown,
} from '../packages/core/src/richText/highlights.ts';
import {
  parseDescription,
  descriptionSummary,
} from '../packages/core/src/description.ts';
import { presetDescriptions } from '../packages/core/src/presetDescriptions.ts';

const browser = new JSDOM('<html><body></body></html>', {
  pretendToBeVisual: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of [
  'window',
  'document',
  'navigator',
  'Node',
  'HTMLElement',
  'Element',
  'MutationObserver',
  'DOMParser',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
])
  Object.defineProperty(globalThis, key, {
    value: browser.window[key],
    configurable: true,
  });
function fixture(t, original = 'A simple habit.', onLimit) {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: descriptionExtensions(onLimit),
    content: markdownDocument(original),
  });
  t.after(() => editor.destroy());
  return { editor, snapshot: () => descriptionSnapshot(editor, original) };
}
function highlightIds(markdown) {
  return parseDescription(markdown)
    .flatMap((token) => token.children ?? [])
    .filter((token) => token.type === 'highlight_open')
    .map((token) => token.attrGet('colour'));
}
function pasteLink(editor, text) {
  const event = {
    clipboardData: { getData: (type) => (type === 'text/plain' ? text : '') },
  };
  return !!editor.view.someProp('handlePaste', (handle) =>
    handle(editor.view, event, Slice.empty),
  );
}

test('pasting a web or app URL links selected words, retains formatting and selection, and supports Undo/Redo', (t) => {
  for (const href of [
    'https://example.com/notes?q=habit#purpose',
    'obsidian://open?vault=Personal&file=Motivation',
    'mailto:hello@example.com',
  ]) {
    const { editor, snapshot } = fixture(t, '**My motivation**');
    editor.commands.setTextSelection({ from: 1, to: 14 });
    formatDescription(editor, () =>
      editor.commands.setHighlight({ color: 'blue' }),
    );
    const before = snapshot();
    assert.equal(pasteLink(editor, href), true);
    assert.equal(editor.getText(), 'My motivation');
    assert.equal(editor.getAttributes('link').href, href);
    assert.equal(editor.isActive('bold'), true);
    assert.equal(editor.isActive('highlight', { color: 'blue' }), true);
    assert.equal(editor.state.selection.from, 1);
    assert.equal(editor.state.selection.to, 14);
    assert.equal(editor.commands.undo(), true);
    assert.equal(snapshot(), before);
    assert.equal(editor.commands.redo(), true);
    assert.equal(editor.getAttributes('link').href, href);
    assert.ok(snapshot().includes(href));
  }
});
test('a pasted URL replaces a links destination without replacing its label or joining adjacent typing in Undo', (t) => {
  const { editor, snapshot } = fixture(t, '[Notes](https://example.com/old)');
  editor.commands.insertContentAt(6, ' today');
  const before = snapshot();
  editor.commands.setTextSelection({ from: 1, to: 6 });
  assert.equal(pasteLink(editor, ' \nhttps://example.com/new\n '), true);
  assert.equal(editor.getAttributes('link').href, 'https://example.com/new');
  assert.equal(editor.getText(), 'Notes today');
  editor.commands.undo();
  assert.equal(snapshot(), before);
  editor.commands.undo();
  assert.equal(snapshot(), '[Notes](https://example.com/old)');
});
test('ordinary text, unsafe URLs, empty cursors, code and multi-block selections keep the normal paste path', (t) => {
  const { editor, snapshot } = fixture(t, 'My motivation');
  editor.commands.setTextSelection({ from: 1, to: 14 });
  for (const text of [
    'Some normal text',
    'www.example.com',
    'https://example.com and some words',
    'https://example.com\nhttps://another.example.com',
    'Note:motivation',
    'javascript://alert(1)',
    'data:text/html,hello',
    'file:///private/notes',
    'https:/bad',
    '',
  ]) {
    assert.equal(pasteLink(editor, text), false);
    assert.equal(snapshot(), 'My motivation');
  }
  editor.commands.setTextSelection(1);
  assert.equal(pasteLink(editor, 'https://example.com'), false);
  const code = fixture(t, '`literal`').editor;
  code.commands.setTextSelection({ from: 1, to: 8 });
  assert.equal(pasteLink(code, 'https://example.com'), false);
  const block = fixture(t, '```\nliteral\n```').editor;
  block.commands.setTextSelection({ from: 1, to: 8 });
  assert.equal(pasteLink(block, 'https://example.com'), false);
  const multiple = fixture(t, 'First\n\nSecond').editor;
  multiple.commands.selectAll();
  assert.equal(pasteLink(multiple, 'https://example.com'), false);
  editor.setEditable(false);
  editor.commands.setTextSelection({ from: 1, to: 14 });
  assert.equal(pasteLink(editor, 'https://example.com'), false);
});
test('an oversized link paste is rejected without replacing selected text or changing the existing Undo history', (t) => {
  let limited = 0;
  const { editor, snapshot } = fixture(t, 'My motivation', () => limited++);
  editor.commands.setTextSelection({ from: 1, to: 14 });
  assert.equal(
    pasteLink(editor, `https://example.com/${'a'.repeat(20000)}`),
    true,
  );
  assert.equal(snapshot(), 'My motivation');
  assert.ok(limited > 0);
  assert.equal(editor.can().undo(), false);
});

test('bold and italic are reversible marks and each toolbar action is independently undoable', (t) => {
  const { editor, snapshot } = fixture(t, 'Focus');
  editor.commands.setTextSelection({ from: 1, to: 6 });
  formatDescription(editor, () => editor.commands.toggleBold());
  assert.equal(snapshot(), '**Focus**');
  formatDescription(editor, () => editor.commands.toggleBold());
  assert.equal(snapshot(), 'Focus');
  assert.ok(editor.commands.undo());
  assert.equal(snapshot(), '**Focus**');
  assert.ok(editor.commands.undo());
  assert.equal(snapshot(), 'Focus');
  assert.ok(editor.commands.redo());
  assert.equal(snapshot(), '**Focus**');
  formatDescription(editor, () => editor.commands.toggleItalic());
  assert.ok(editor.isActive('italic'));
  assert.ok(editor.isActive('bold'));
  assert.ok(editor.commands.undo());
  assert.ok(editor.isActive('bold'));
  assert.equal(editor.isActive('italic'), false);
});
test('formatting retains the selected range for repeated bold, italic and highlight actions', (t) => {
  const { editor } = fixture(t, 'Focus on one thing');
  const range = { from: 1, to: 6 };
  editor.commands.setTextSelection(range);
  for (const action of [
    () => editor.commands.toggleBold(),
    () => editor.commands.toggleBold(),
    () => editor.commands.toggleItalic(),
    () => editor.commands.setHighlight({ color: 'pink' }),
    () => editor.commands.setHighlight({ color: 'blue' }),
    () => editor.commands.unsetHighlight(),
  ]) {
    formatDescription(editor, action);
    assert.equal(editor.state.selection.from, range.from);
    assert.equal(editor.state.selection.to, range.to);
  }
});
test('native callback proxy replacements never rerun editor initialization or collapse a selection', async (t) => {
  const { editor } = fixture(t, 'Focus on one thing');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  let ready = 0;
  function Probe({ onReady }) {
    useEditorReady(editor, onReady);
    return null;
  }
  const render = () =>
    act(async () => {
      root.render(createElement(Probe, { onReady: async () => ready++ }));
    });
  await render();
  assert.equal(ready, 1);
  assert.equal(editor.state.selection.from, editor.state.doc.content.size - 1);
  editor.commands.setTextSelection({ from: 1, to: 6 });
  formatDescription(editor, () => editor.commands.toggleBold());
  await render();
  formatDescription(editor, () =>
    editor.commands.setHighlight({ color: 'green' }),
  );
  await render();
  assert.equal(ready, 1);
  assert.equal(editor.state.selection.from, 1);
  assert.equal(editor.state.selection.to, 6);
});
test('new typing after local Undo clears only the editor redo branch', (t) => {
  const { editor, snapshot } = fixture(t, 'Hello');
  formatDescription(editor, () => editor.commands.insertContentAt(6, ' there'));
  assert.equal(snapshot(), 'Hello there');
  editor.commands.undo();
  assert.equal(snapshot(), 'Hello');
  assert.ok(editor.can().redo());
  editor.commands.insertContentAt(6, '!');
  assert.equal(snapshot(), 'Hello!');
  assert.equal(editor.can().redo(), false);
});
test('unchanged notes and local Undo preserve original Markdown bytes instead of causing no-op canonical edits', (t) => {
  for (const original of [
    ...Object.values(presetDescriptions),
    '  text\n\n__bold__ and *italic*\n\n3. first\n4. second\n',
    'one\ntwo',
  ]) {
    const { editor, snapshot } = fixture(t, original);
    assert.equal(snapshot(), original);
    formatDescription(editor, () => editor.commands.insertContentAt(1, 'New '));
    assert.notEqual(snapshot(), original);
    editor.commands.undo();
    assert.equal(snapshot(), original);
  }
});
test('all highlight colours survive Markdown serialization, reader parsing and re-editing', (t) => {
  for (const colour of Object.keys(highlightColours)) {
    const { editor, snapshot } = fixture(t, 'Important');
    editor.commands.setTextSelection({ from: 1, to: 10 });
    formatDescription(editor, () =>
      editor.commands.setHighlight({ color: colour }),
    );
    const markdown = snapshot();
    assert.deepEqual(highlightIds(markdown), [colour]);
    const document = markdownDocument(markdown);
    assert.equal(document.content[0].content[0].marks[0].attrs.color, colour);
    formatDescription(editor, () => editor.commands.unsetHighlight());
    assert.equal(snapshot(), 'Important');
    editor.commands.undo();
    assert.deepEqual(highlightIds(snapshot()), [colour]);
  }
});
test('changing a highlight replaces its colour, keeps other formatting and creates no nested marks', (t) => {
  const { editor, snapshot } = fixture(t, '**Important**');
  editor.commands.setTextSelection({ from: 1, to: 10 });
  formatDescription(editor, () =>
    editor.commands.setHighlight({ color: 'pink' }),
  );
  formatDescription(editor, () =>
    editor.commands.setHighlight({ color: 'blue' }),
  );
  assert.deepEqual(highlightIds(snapshot()), ['blue']);
  assert.ok(editor.isActive('bold'));
  assert.equal(
    editor
      .getJSON()
      .content[0].content[0].marks.filter((mark) => mark.type === 'highlight')
      .length,
    1,
  );
  const reopened = fixture(t, snapshot()).editor;
  reopened.commands.setTextSelection({ from: 1, to: 10 });
  assert.ok(reopened.isActive('bold'));
  assert.ok(reopened.isActive('highlight', { color: 'blue' }));
  editor.commands.undo();
  assert.deepEqual(highlightIds(snapshot()), ['pink']);
});
test('headings, lists and quotes toggle without duplicated Markdown and Undo restores the original block', (t) => {
  const { editor, snapshot } = fixture(t, 'Start small');
  editor.commands.setTextSelection(1);
  for (const command of [
    () => editor.commands.toggleHeading({ level: 2 }),
    () => editor.commands.toggleBulletList(),
    () => editor.commands.toggleOrderedList(),
    () => editor.commands.toggleBlockquote(),
  ]) {
    formatDescription(editor, command);
    assert.notEqual(snapshot(), 'Start small');
    formatDescription(editor, command);
    assert.equal(snapshot(), 'Start small');
    editor.commands.undo();
    assert.notEqual(snapshot(), 'Start small');
    editor.commands.undo();
    assert.equal(snapshot(), 'Start small');
  }
});
test('links can be edited and removed without losing their selected text; executable URLs are refused', (t) => {
  const { editor, snapshot } = fixture(
    t,
    '[My notes](obsidian://open?vault=Personal)',
  );
  editor.commands.setTextSelection({ from: 1, to: 9 });
  formatDescription(editor, () =>
    editor.commands.setLink({ href: 'https://example.com/notes' }),
  );
  assert.equal(snapshot(), '[My notes](https://example.com/notes)');
  formatDescription(editor, () => editor.commands.unsetLink());
  assert.equal(snapshot(), 'My notes');
  editor.commands.undo();
  assert.equal(snapshot(), '[My notes](https://example.com/notes)');
  assert.equal(editor.commands.setLink({ href: 'javascript:alert(1)' }), false);
});
test('raw HTML stays literal and images retain metadata without loading remote resources', (t) => {
  const { editor, snapshot } = fixture(
    t,
    '<script>alert(1)</script>\n\n![Picture](https://example.com/image.png "Title")',
  );
  // ProseMirror uses a source-less img as a caret separator beside inline atoms.
  // Assert booleans: printing a failed assertion's jsdom element can recursively
  // inspect the entire browser graph and exhaust the test process's memory.
  assert.equal(editor.view.dom.querySelector('script') !== null, false);
  assert.equal(editor.view.dom.querySelector('img[src]') !== null, false);
  assert.ok(editor.getText().includes('<script>'));
  editor.commands.insertContentAt(1, 'More ');
  assert.ok(snapshot().includes('https://example.com/image.png'));
  assert.ok(snapshot().includes('Title'));
  assert.equal(
    parseDescription(snapshot()).some((token) => token.type === 'html_block'),
    false,
  );
});
test('a formatting-aware length limit rejects oversized pastes atomically and keeps Undo functional', (t) => {
  let limited = 0;
  const { editor, snapshot } = fixture(t, 'Keep me', () => limited++);
  editor.commands.insertContentAt(8, 'x'.repeat(20000));
  assert.equal(snapshot(), 'Keep me');
  assert.ok(limited > 0);
  editor.commands.insertContentAt(8, '!');
  assert.equal(snapshot(), 'Keep me!');
  editor.commands.undo();
  assert.equal(snapshot(), 'Keep me');
});
test('highlight syntax is bounded, handles escaped delimiters and never admits arbitrary style or HTML', () => {
  const markdown = highlightMarkdown('a==b **bold**', 'green');
  assert.deepEqual(highlightIds(markdown), ['green']);
  assert.equal(descriptionSummary(markdown), 'a==b bold');
  for (const literal of [
    '=={red}text==',
    '=={background:url(x)}text==',
    '==one\ntwo==',
    '\\==literal==',
    '== ==',
  ])
    assert.deepEqual(highlightIds(literal), []);
  assert.deepEqual(highlightIds('`==code==`'), []);
});

test('highlight indicator reads uniform, mixed, partially highlighted and plain selections', (t) => {
  const { editor } = fixture(t, 'One Two');
  editor.commands.setTextSelection({ from: 1, to: 4 });
  for (const colour of Object.keys(highlightColours)) {
    editor.commands.setHighlight({ color: colour });
    assert.deepEqual(selectedHighlight(editor), { colour, mixed: false });
    editor.commands.setTextSelection(2);
    assert.deepEqual(selectedHighlight(editor), { colour, mixed: false });
    editor.commands.setTextSelection({ from: 1, to: 4 });
  }
  editor.commands.setTextSelection({ from: 1, to: 8 });
  assert.deepEqual(selectedHighlight(editor), { colour: null, mixed: true });
  editor.commands.setTextSelection({ from: 5, to: 8 });
  assert.deepEqual(selectedHighlight(editor), { colour: null, mixed: false });
  editor.commands.setHighlight({ color: 'blue' });
  editor.commands.setTextSelection({ from: 1, to: 8 });
  assert.deepEqual(selectedHighlight(editor), { colour: null, mixed: true });
  editor.commands.unsetHighlight();
  assert.deepEqual(selectedHighlight(editor), { colour: null, mixed: false });
});

test('link inspection expands across other marks and excludes plain or multiple-link selections', (t) => {
  const { editor } = fixture(
    t,
    'A [**bold** and _italic_](https://example.com/notes) tail',
  );
  const expected = { from: 3, to: 18, href: 'https://example.com/notes' };
  for (const range of [4, 10, 16, { from: 3, to: 18 }, { from: 5, to: 16 }]) {
    editor.commands.setTextSelection(range);
    assert.deepEqual(selectedLink(editor), expected);
  }
  for (const range of [1, 20, { from: 1, to: 18 }, { from: 3, to: 22 }]) {
    editor.commands.setTextSelection(range);
    assert.equal(selectedLink(editor), null);
  }
  const adjacent = fixture(
    t,
    '[One](https://one.example.com)[Two](https://two.example.com)',
  ).editor;
  adjacent.commands.setTextSelection({ from: 1, to: 7 });
  assert.equal(selectedLink(adjacent), null);
  adjacent.commands.setTextSelection(5);
  assert.deepEqual(selectedLink(adjacent), {
    from: 4,
    to: 7,
    href: 'https://two.example.com',
  });
});

test('inspected link removal preserves words and their other marks and is independently undoable', (t) => {
  const { editor, snapshot } = fixture(
    t,
    '[**My** =={blue}notes==](https://example.com)',
  );
  editor.commands.setTextSelection(3);
  const range = selectedLink(editor);
  assert.ok(range);
  const before = snapshot();
  formatDescription(editor, () =>
    editor.chain().setTextSelection(range).unsetLink().run(),
  );
  assert.equal(selectedLink(editor), null);
  assert.equal(editor.getText(), 'My notes');
  assert.deepEqual(highlightIds(snapshot()), ['blue']);
  assert.ok(snapshot().includes('**My**'));
  assert.equal(editor.commands.undo(), true);
  assert.equal(snapshot(), before);
  assert.equal(editor.commands.redo(), true);
  assert.equal(selectedLink(editor), null);
});

test('Clear formatting preserves distinct links and words while removing marks and block styles, with Undo/Redo', (t) => {
  const source =
    '> ## [**First**](https://first.example.com) and [=={blue}_second_==](obsidian://open?vault=Habits)';
  const { editor, snapshot } = fixture(t, source);
  editor.commands.selectAll();
  formatDescription(editor, () => clearDescriptionFormatting(editor));
  assert.equal(editor.getText(), 'First and second');
  const json = editor.getJSON();
  assert.equal(json.content[0].type, 'paragraph');
  const text = json.content[0].content;
  assert.deepEqual(
    text.flatMap((node) => (node.marks ?? []).map((mark) => mark.type)),
    ['link', 'link'],
  );
  assert.deepEqual(
    text.flatMap((node) => (node.marks ?? []).map((mark) => mark.attrs.href)),
    ['https://first.example.com', 'obsidian://open?vault=Habits'],
  );
  assert.equal(editor.commands.undo(), true);
  assert.equal(snapshot(), source);
  assert.equal(editor.commands.redo(), true);
  assert.equal(editor.getJSON().content[0].type, 'paragraph');
});

test('Clear formatting keeps selection, leaves surrounding marks alone, and preserves a link for subsequent typing', (t) => {
  const { editor } = fixture(
    t,
    '[**First second**](https://example.com) **outside**',
  );
  editor.commands.setTextSelection({ from: 1, to: 6 });
  formatDescription(editor, () => clearDescriptionFormatting(editor));
  assert.equal(editor.state.selection.from, 1);
  assert.equal(editor.state.selection.to, 6);
  assert.equal(editor.isActive('bold'), false);
  assert.equal(editor.getAttributes('link').href, 'https://example.com');
  editor.commands.setTextSelection({ from: 7, to: 13 });
  assert.equal(editor.isActive('bold'), true);
  editor.commands.setTextSelection(3);
  editor.view.dispatch(
    editor.state.tr.setStoredMarks([
      editor.schema.marks.bold.create(),
      editor.schema.marks.link.create({ href: 'https://example.com' }),
    ]),
  );
  formatDescription(editor, () => clearDescriptionFormatting(editor));
  editor.commands.insertContent('X');
  editor.commands.setTextSelection({ from: 3, to: 4 });
  assert.equal(editor.isActive('bold'), false);
  assert.equal(editor.getAttributes('link').href, 'https://example.com');
});

test('editor positions preserve selection direction and scroll, clamp stale offsets and never create local Undo', (t) => {
  const { editor } = fixture(t, '# Heading\n\nBody text');
  restoreEditorSelection(editor, { anchor: 18, head: 12, scrollTop: 123 });
  assert.deepEqual(editorPosition(editor, { scrollTop: 123 }), {
    anchor: 18,
    head: 12,
    scrollTop: 123,
  });
  assert.equal(editor.can().undo(), false);
  restoreEditorSelection(editor, {
    anchor: 100000,
    head: 100000,
    scrollTop: 1000,
  });
  assert.equal(editor.state.selection.head, editor.state.doc.content.size - 1);
  const empty = fixture(t, '').editor;
  restoreEditorSelection(empty, { anchor: 0, head: 100000, scrollTop: 1 });
  assert.equal(empty.state.selection.from, 1);
  assert.equal(empty.state.selection.to, 1);
});

test('position initialization runs once across native callback changes and stops restoring scroll after user interaction', async (t) => {
  const { editor } = fixture(t, 'Long enough for a selection');
  const observers = [];
  const previous = globalThis.ResizeObserver;
  const previousScrollTo = window.HTMLElement.prototype.scrollTo;
  window.HTMLElement.prototype.scrollTo = function ({ top }) {
    this.scrollTop = top;
  };
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {}
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => {
    await act(async () => root.unmount());
    host.remove();
    if (previousScrollTo)
      window.HTMLElement.prototype.scrollTo = previousScrollTo;
    else delete window.HTMLElement.prototype.scrollTo;
    if (previous) globalThis.ResizeObserver = previous;
    else delete globalThis.ResizeObserver;
  });
  let ready = 0;
  const position = { anchor: 3, head: 9, scrollTop: 321 };
  function Probe({ onReady }) {
    const writing = useRef(null);
    const initialize = useEditorPosition(editor, writing, position, () => {});
    useEditorReady(editor, onReady, initialize);
    return createElement('div', { ref: writing });
  }
  const render = () =>
    act(async () =>
      root.render(createElement(Probe, { onReady: async () => ready++ })),
    );
  await render();
  const writing = host.firstChild;
  assert.equal(ready, 1);
  assert.deepEqual(editorPosition(editor, writing), position);
  writing.scrollTop = 0;
  observers[0].callback();
  assert.equal(writing.scrollTop, 321);
  editor.commands.setTextSelection({ from: 5, to: 10 });
  writing.dispatchEvent(new window.Event('pointerdown'));
  writing.scrollTop = 700;
  await render();
  observers[0].callback();
  assert.equal(ready, 1);
  assert.deepEqual(editorPosition(editor, writing), {
    anchor: 5,
    head: 10,
    scrollTop: 700,
  });
  assert.equal(editor.can().undo(), false);
});

test('validation and repeated snapshots share serialization for immutable documents through undo and redo', (t) => {
  const original = Array.from(
    { length: 80 },
    (_, i) =>
      `Paragraph ${i} with **a reminder** and [notes](https://example.com).`,
  ).join('\n\n');
  const { editor, snapshot } = fixture(t, original);
  let calls = 0;
  const serialize = editor.markdown.serialize.bind(editor.markdown);
  editor.markdown.serialize = (...args) => {
    calls++;
    return serialize(...args);
  };
  assert.equal(snapshot(), original);
  for (let i = 0; i < 12; i++) {
    editor.commands.insertContentAt(1, 'a');
    const value = snapshot();
    assert.equal(value, editor.getMarkdown());
    const counted = calls;
    for (let read = 0; read < 10; read++) assert.equal(snapshot(), value);
    serializeDescriptionDocument(editor, editor.state.doc);
    assert.equal(calls, counted);
  }
  assert.equal(calls, 24); // 12 validations plus 12 explicit parity checks.
  editor.commands.undo();
  assert.equal(snapshot(), original);
  editor.commands.redo();
  assert.equal(snapshot(), editor.getMarkdown());
});

test('prepared editor content keeps original Markdown spelling through first edit and Undo', (t) => {
  const original = '__Keep this spelling__\n\nA [note](https://example.com).';
  const { editor, snapshot } = fixture(t, original);
  prepareDescriptionSnapshot(editor, original, markdownDocument(original));
  editor.commands.insertContentAt(1, 'a');
  assert.ok(snapshot().startsWith('**aKeep'));
  editor.commands.undo();
  assert.equal(snapshot(), original);
});

test('first opening a long note puts the caret and viewport at the start and retains that target through keyboard resizing', async (t) => {
  const original =
    'A first reminder.\n\n' + 'A longer paragraph for editing.\n\n'.repeat(500);
  const { editor, snapshot } = fixture(t, original);
  const observers = [];
  const previousObserver = globalThis.ResizeObserver;
  const previousScrollTo = window.HTMLElement.prototype.scrollTo;
  window.HTMLElement.prototype.scrollTo = function ({ top }) {
    this.scrollTop = top;
  };
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      observers.push(this);
    }
    observe(element) {
      this.targets.push(element);
    }
    disconnect() {}
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => {
    await act(async () => root.unmount());
    host.remove();
    if (previousScrollTo)
      window.HTMLElement.prototype.scrollTo = previousScrollTo;
    else delete window.HTMLElement.prototype.scrollTo;
    if (previousObserver) globalThis.ResizeObserver = previousObserver;
    else delete globalThis.ResizeObserver;
  });
  let ready = 0;
  function Probe() {
    const writing = useRef(null);
    const initialize = useEditorPosition(editor, writing, undefined, () => {});
    useEditorReady(editor, async () => ready++, initialize);
    return createElement('div', { ref: writing });
  }
  // Start with the exact mismatch seen previously: a distant caret.
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  await act(async () => root.render(createElement(Probe)));
  const writing = host.firstChild;
  assert.equal(ready, 1);
  assert.equal(editor.state.selection.anchor, 1);
  assert.equal(editor.state.selection.head, 1);
  assert.equal(writing.scrollTop, 0);
  assert.equal(observers[0].targets.includes(editor.view.dom), true);
  writing.scrollTop = 5000;
  observers[0].callback();
  assert.equal(writing.scrollTop, 0);
  // Touch keyboards/dictation can send beforeinput without a physical keydown.
  writing.dispatchEvent(new window.Event('beforeinput'));
  writing.scrollTop = 6000;
  observers[0].callback();
  assert.equal(writing.scrollTop, 6000);
  assert.equal(snapshot(), original);
  assert.equal(editor.can().undo(), false);
});
