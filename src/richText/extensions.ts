import { Extension, Node, type Editor, type JSONContent } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Highlight } from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extension-placeholder';
import { closeHistory } from '@tiptap/pm/history';
import { Plugin } from '@tiptap/pm/state';
import type { Node as DocumentNode } from '@tiptap/pm/model';
import {
  descriptionLink,
  MAX_DESCRIPTION_LENGTH,
} from '@onpurpose/core/description';
import {
  highlightMarkdown,
  highlightVariable,
  isHighlightColour,
} from '@onpurpose/core/richText/highlights';
import { markdownDocument } from './markdownDocument.ts';
import { selectionLinkPaste } from './selectionLinkPaste.ts';

const ColouredHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: 'yellow',
        parseHTML: (element) =>
          isHighlightColour(element.getAttribute('data-highlight'))
            ? element.getAttribute('data-highlight')
            : 'yellow',
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const id = isHighlightColour(HTMLAttributes.color)
      ? HTMLAttributes.color
      : 'yellow';
    return [
      'mark',
      {
        'data-highlight': id,
        style: `background-color:${highlightVariable(id, 'bg')};color:${highlightVariable(id, 'text')}`,
      },
      0,
    ];
  },
  renderMarkdown: (node, helpers) =>
    highlightMarkdown(helpers.renderChildren(node), node.attrs?.color),
});
const ImageNote = Node.create({
  name: 'imageNote',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({
    alt: { default: '' },
    src: { default: '' },
    title: { default: null },
  }),
  renderHTML: ({ node }) => [
    'span',
    { 'data-image-note': '', class: 'image-note' },
    node.attrs.alt || 'Image',
  ],
  renderMarkdown: (node) =>
    `![${String(node.attrs?.alt ?? '').replace(/([\\\[\]])/g, '\\$1')}](${node.attrs?.src ?? ''}${node.attrs?.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : ''})`,
});
// Bound stored Markdown, including formatting, rather than only visible text.
export const DEFAULT_PLACEHOLDER =
  'Why this matters, a simple starting point, or a link to my notes…';
export function descriptionExtensions(
  onLimit: () => void = () => {},
  placeholder = DEFAULT_PLACEHOLDER,
) {
  return [
    StarterKit.configure({
      underline: false,
      trailingNode: false,
      undoRedo: { depth: 100, newGroupDelay: 500 },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: false,
        enableClickSelection: true,
        isAllowedUri: (value) => descriptionLink(value) !== null,
      },
    }),
    Markdown,
    ColouredHighlight,
    ImageNote,
    Extension.create({
      name: 'selectionLinkPaste',
      addProseMirrorPlugins() {
        return [selectionLinkPaste(this.editor)];
      },
    }),
    Placeholder.configure({ placeholder }),
    Extension.create({
      name: 'descriptionLimit',
      addProseMirrorPlugins() {
        const editor = this.editor;
        return [
          new Plugin({
            filterTransaction(transaction) {
              if (!transaction.docChanged) return true;
              const markdown = serializeDescriptionDocument(
                editor,
                transaction.doc,
              );
              if (markdown.length <= MAX_DESCRIPTION_LENGTH) return true;
              onLimit();
              return false;
            },
          }),
        ];
      },
    }),
  ];
}
export function formatDescription(editor: Editor, action: () => void) {
  editor.view.dispatch(closeHistory(editor.state.tr));
  action();
  editor.view.dispatch(closeHistory(editor.state.tr));
}
const initialDocuments = new WeakMap<
  Editor,
  { source: string; document: ReturnType<Editor['schema']['nodeFromJSON']> }
>();
// Use the already parsed startup content. First typing must not parse the
// original Markdown again just to preserve its bytes for an unchanged/undo case.
export function prepareDescriptionSnapshot(
  editor: Editor,
  source: string,
  content: JSONContent,
) {
  initialDocuments.set(editor, {
    source,
    document: editor.schema.nodeFromJSON(content),
  });
}
const serializedDocuments = new WeakMap<
  Editor,
  WeakMap<DocumentNode, string>
>();
const snapshots = new WeakMap<
  Editor,
  { document: DocumentNode; source: string; text: string }
>();
// ProseMirror documents are immutable. Validation, draft reporting and Done can
// share serialization for the exact document, without caching mutable JSON.
export function serializeDescriptionDocument(
  editor: Editor,
  document: DocumentNode,
): string {
  let cache = serializedDocuments.get(editor);
  if (!cache) {
    cache = new WeakMap();
    serializedDocuments.set(editor, cache);
  }
  const saved = cache.get(document);
  if (saved !== undefined) return saved;
  const markdown = editor.markdown?.serialize(document.toJSON()) ?? '';
  cache.set(document, markdown);
  return markdown;
}
export function descriptionSnapshot(editor: Editor, original: string): string {
  const saved = snapshots.get(editor);
  if (saved?.document === editor.state.doc && saved.source === original)
    return saved.text;
  let initial = initialDocuments.get(editor);
  if (!initial || initial.source !== original) {
    initial = {
      source: original,
      document: editor.schema.nodeFromJSON(markdownDocument(original)),
    };
    initialDocuments.set(editor, initial);
  }
  const text = editor.state.doc.eq(initial.document)
    ? original
    : serializeDescriptionDocument(editor, editor.state.doc);
  snapshots.set(editor, { document: editor.state.doc, source: original, text });
  return text;
}
