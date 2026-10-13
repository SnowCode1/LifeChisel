import MarkdownIt from 'markdown-it/browser';
import { readHighlight } from './richText/highlights.ts';

export const MAX_DESCRIPTION_LENGTH = 20000;
export function normalizeDescription(value: string): string | undefined {
  return value.trim() ? value.replace(/\r\n?/g, '\n') : undefined;
}
export function validDescription(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_DESCRIPTION_LENGTH
  );
}
// Remote resources never load merely by reading a note. Links open on a tap.
export function descriptionLink(value: string): string | null {
  const trimmed = value.trim();
  if (
    /\s/.test(trimmed) ||
    [...trimmed].some((character) => character.charCodeAt(0) < 32)
  )
    return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  if (
    !scheme ||
    ['javascript', 'vbscript', 'data', 'file', 'content', 'intent'].includes(
      scheme,
    )
  )
    return null;
  if (
    (scheme === 'http' || scheme === 'https') &&
    !/^https?:\/\/[^/\s]+/i.test(trimmed)
  )
    return null;
  return trimmed;
}
const parser = new MarkdownIt({ html: false, linkify: true, breaks: true });
parser.validateLink = (value: string) => descriptionLink(value) !== null;
parser.disable(['table']);
parser.inline.ruler.before('emphasis', 'habit_highlight', (state, silent) => {
  const match = readHighlight(state.src, state.pos);
  if (!match) return false;
  if (!silent) {
    const opening = state.push('highlight_open', 'mark', 1);
    opening.attrSet('colour', match.colour);
    const children: DescriptionToken[] = [];
    state.md.inline.parse(match.content, state.md, state.env, children);
    state.tokens.push(...children);
    state.push('highlight_close', 'mark', -1);
  }
  state.pos = match.end;
  return true;
});
export const parseDescription = (text: string) => parser.parse(text, {});
export type DescriptionToken = ReturnType<typeof parseDescription>[number];
export function descriptionSummary(text: string): string {
  return parseDescription(text)
    .filter((token) => token.type === 'inline')
    .map((token) =>
      (token.children ?? [])
        .map((child) =>
          child.type === 'text' ||
          child.type === 'code_inline' ||
          child.type === 'image'
            ? child.content
            : child.type === 'softbreak' || child.type === 'hardbreak'
              ? ' '
              : '',
        )
        .join(''),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function descriptionPreview(text: string, expanded: boolean) {
  const tokens = parseDescription(text);
  if (expanded) return { tokens, truncated: false };
  // Keep complete blocks (and complete lists) so collapsing preserves Markdown.
  let end = 0,
    depth = 0,
    blocks = 0;
  for (let index = 0; index < tokens.length; index++) {
    depth += tokens[index].nesting;
    if (
      depth === 0 &&
      (tokens[index].nesting === -1 || tokens[index].nesting === 0)
    ) {
      blocks++;
      if (blocks <= 4) end = index + 1;
      else break;
    }
  }
  const selected = tokens.slice(0, end || tokens.length);
  // A long single paragraph/list is bounded by measured height in the card.
  // Character count alone would show Read more even when every line fits.
  return {
    tokens: selected,
    truncated: end < tokens.length,
  };
}
