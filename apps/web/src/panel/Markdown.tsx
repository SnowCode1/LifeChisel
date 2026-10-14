import { createElement, type ReactNode } from 'react';
import {
  descriptionLink,
  parseDescription,
  type DescriptionToken,
} from '@onpurpose/core/description';
import {
  highlightPalette,
  isHighlightColour,
} from '@onpurpose/core/richText/highlights';

// Renders a note from the shared Markdown token stream as React elements:
// text is escaped by React, links are validated by core and open in a new
// tab, and images show only their alt text (nothing loads remotely).
const BLOCK_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
]);
const INLINE_TAGS = new Set(['strong', 'em', 's', 'a', 'mark']);

export function Markdown({
  text,
  scheme,
  colour,
}: {
  text: string;
  scheme: 'dark' | 'light';
  colour: string;
}) {
  const tokens = parseDescription(text);
  return <>{build(tokens, 0, tokens.length, scheme, colour)}</>;
}

function build(
  tokens: DescriptionToken[],
  start: number,
  end: number,
  scheme: 'dark' | 'light',
  colour: string,
): ReactNode[] {
  const out: ReactNode[] = [];
  for (let index = start; index < end; index++) {
    const token = tokens[index];
    if (token.nesting === 1) {
      // Find the matching close at the same depth.
      let depth = 1,
        close = index + 1;
      for (; close < end; close++) {
        depth += tokens[close].nesting;
        if (depth === 0) break;
      }
      const children = build(tokens, index + 1, close, scheme, colour);
      out.push(element(token, index, children, scheme, colour));
      index = close;
    } else if (token.type === 'inline')
      out.push(
        ...build(
          token.children ?? [],
          0,
          token.children?.length ?? 0,
          scheme,
          colour,
        ),
      );
    else out.push(leaf(token, index));
  }
  return out;
}

function element(
  token: DescriptionToken,
  key: number,
  children: ReactNode[],
  scheme: 'dark' | 'light',
  colour: string,
): ReactNode {
  // Tight list items keep their text without paragraph spacing.
  if (token.type === 'paragraph_open' && token.hidden)
    return <span key={key}>{children}</span>;
  if (token.type === 'link_open') {
    const href = descriptionLink(String(token.attrGet('href') ?? ''));
    return href ? (
      <a
        key={key}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: colour }}
      >
        {children}
      </a>
    ) : (
      <span key={key}>{children}</span>
    );
  }
  if (token.type === 'highlight_open') {
    const id = token.attrGet('colour');
    const palette =
      highlightPalette(scheme)[isHighlightColour(id) ? id : 'yellow'];
    return (
      <mark
        key={key}
        style={{ backgroundColor: palette.background, color: palette.text }}
      >
        {children}
      </mark>
    );
  }
  if (token.type === 'ordered_list_open') {
    const start = Number(token.attrGet('start') ?? 1);
    return (
      <ol key={key} start={Number.isFinite(start) ? start : 1}>
        {children}
      </ol>
    );
  }
  const tag =
    BLOCK_TAGS.has(token.tag) || INLINE_TAGS.has(token.tag)
      ? token.tag
      : 'span';
  return createElement(tag, { key }, children);
}

function leaf(token: DescriptionToken, key: number): ReactNode {
  switch (token.type) {
    case 'text':
    case 'html_inline':
    case 'html_block':
      return token.content;
    case 'softbreak':
    case 'hardbreak':
      return <br key={key} />;
    case 'code_inline':
      return <code key={key}>{token.content}</code>;
    case 'image':
      return token.content;
    case 'code_block':
    case 'fence':
      return (
        <pre key={key}>
          <code>{token.content}</code>
        </pre>
      );
    case 'hr':
      return <hr key={key} />;
    default:
      return null;
  }
}
