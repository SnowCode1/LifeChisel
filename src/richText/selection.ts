import { getMarkRange, type Editor } from '@tiptap/core';
import { descriptionLink } from '@onpurpose/core/description';
import {
  isHighlightColour,
  type HighlightColour,
} from '@onpurpose/core/richText/highlights';

// Read the whole selection: the first text node alone cannot represent a mixed
// selection, or one that includes both highlighted and plain words.
export function selectedHighlight(editor: Editor) {
  const colours = new Set<HighlightColour | null>();
  const { from, to, empty } = editor.state.selection;
  if (empty) {
    const colour: unknown = editor.getAttributes('highlight').color;
    colours.add(isHighlightColour(colour) ? colour : null);
  } else {
    editor.state.doc.nodesBetween(from, to, (node, position) => {
      if (!node.isText || position >= to || position + node.nodeSize <= from)
        return;
      const mark = node.marks.find((item) => item.type.name === 'highlight');
      colours.add(
        isHighlightColour(mark?.attrs.color) ? mark.attrs.color : null,
      );
    });
  }
  return {
    colour: colours.size === 1 ? [...colours][0]! : null,
    mixed: colours.size > 1,
  };
}

// A link may span several text nodes (bold/italic/etc.). Inspect and change the
// complete contiguous link, only when the selection is contained within it.
export function selectedLink(editor: Editor) {
  const { $from, $to, from, to } = editor.state.selection;
  if (!$from.sameParent($to)) return null;
  const type = editor.schema.marks.link;
  if (!type) return null;
  const range = getMarkRange($from, type);
  if (!range || from < range.from || to > range.to) return null;
  const mark = editor.state.doc
    .nodeAt(range.from)
    ?.marks.find((item) => item.type === type);
  const href =
    typeof mark?.attrs.href === 'string'
      ? descriptionLink(mark.attrs.href)
      : null;
  return href ? { ...range, href } : null;
}
