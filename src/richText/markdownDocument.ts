import type { JSONContent } from '@tiptap/core';
import {
  parseDescription,
  type DescriptionToken,
} from '@onpurpose/core/description';

type TokenNode = { token: DescriptionToken; children: TokenNode[] };
function tree(tokens: DescriptionToken[]) {
  const root: TokenNode[] = [],
    stack = [root];
  for (const token of tokens) {
    if (token.nesting === -1) {
      stack.pop();
      continue;
    }
    const node = { token, children: [] as TokenNode[] };
    stack.at(-1)!.push(node);
    if (token.nesting === 1) stack.push(node.children);
  }
  return root;
}
function inline(
  nodes: TokenNode[],
  marks: NonNullable<JSONContent['marks']> = [],
): JSONContent[] {
  return nodes.flatMap(({ token, children }) => {
    const text = (content: string, extra = marks): JSONContent[] =>
      content
        ? [
            {
              type: 'text',
              text: content,
              ...(extra.length ? { marks: extra } : {}),
            },
          ]
        : [];
    if (token.type === 'text') return text(token.content);
    if (token.type === 'softbreak' || token.type === 'hardbreak')
      return [{ type: 'hardBreak' }];
    if (token.type === 'code_inline')
      return text(token.content, [...marks, { type: 'code' }]);
    if (token.type === 'image')
      return [
        {
          type: 'imageNote',
          attrs: {
            alt: token.content,
            src: token.attrGet('src'),
            title: token.attrGet('title'),
          },
        },
      ];
    const mark =
      token.type === 'strong_open'
        ? { type: 'bold' }
        : token.type === 'em_open'
          ? { type: 'italic' }
          : token.type === 's_open'
            ? { type: 'strike' }
            : token.type === 'highlight_open'
              ? { type: 'highlight', attrs: { color: token.attrGet('colour') } }
              : token.type === 'link_open'
                ? {
                    type: 'link',
                    attrs: {
                      href: token.attrGet('href'),
                      title: token.attrGet('title'),
                    },
                  }
                : null;
    return inline(children, mark ? [...marks, mark] : marks);
  });
}
function blocks(nodes: TokenNode[]): JSONContent[] {
  return nodes.flatMap(({ token, children }): JSONContent[] => {
    if (token.type === 'inline') return inline(tree(token.children ?? []));
    if (token.type === 'paragraph_open')
      return [{ type: 'paragraph', content: blocks(children) }];
    if (token.type === 'heading_open')
      return [
        {
          type: 'heading',
          attrs: { level: Number(token.tag.slice(1)) },
          content: blocks(children),
        },
      ];
    if (token.type === 'bullet_list_open')
      return [{ type: 'bulletList', content: blocks(children) }];
    if (token.type === 'ordered_list_open')
      return [
        {
          type: 'orderedList',
          attrs: { start: Number(token.attrGet('start') ?? 1) },
          content: blocks(children),
        },
      ];
    if (token.type === 'list_item_open')
      return [{ type: 'listItem', content: blocks(children) }];
    if (token.type === 'blockquote_open')
      return [{ type: 'blockquote', content: blocks(children) }];
    if (token.type === 'hr') return [{ type: 'horizontalRule' }];
    if (token.type === 'code_block' || token.type === 'fence') {
      const text = token.content.replace(/\n$/, '');
      return [
        {
          type: 'codeBlock',
          attrs: { language: token.info.trim().split(/\s+/)[0] || null },
          content: text ? [{ type: 'text', text }] : [],
        },
      ];
    }
    return blocks(children);
  });
}
// The same non-HTML parser as the native reader feeds the editor's safe schema.
// Images retain their Markdown metadata but display only alt text, never a URL.
export function markdownDocument(markdown: string): JSONContent {
  const content = blocks(tree(parseDescription(markdown)));
  return {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  };
}
