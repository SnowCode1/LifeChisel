export const highlightColours = {
  yellow: { label: 'Yellow', background: '#4A3F1E', text: '#F5DF9A' },
  green: { label: 'Green', background: '#223E33', text: '#BCE8CD' },
  blue: { label: 'Blue', background: '#243950', text: '#B9D8FF' },
  purple: { label: 'Purple', background: '#3A2D4B', text: '#DCC5F6' },
  pink: { label: 'Pink', background: '#472C39', text: '#F2BDDA' },
} as const;
export type HighlightColour = keyof typeof highlightColours;
// Light backgrounds swap to pale marks with dark text of the same hue.
export const lightHighlightColours: Record<
  HighlightColour,
  { background: string; text: string }
> = {
  yellow: { background: '#FBEBB0', text: '#5C4700' },
  green: { background: '#CDEFD9', text: '#1D5236' },
  blue: { background: '#D3E5FF', text: '#1E4677' },
  purple: { background: '#E9DCFA', text: '#4B2D72' },
  pink: { background: '#FADAE8', text: '#6E2449' },
};
export function highlightPalette(scheme: 'dark' | 'light') {
  return scheme === 'dark' ? highlightColours : lightHighlightColours;
}
// The DOM editor reads these CSS variables so a theme change needs no re-render
// of document marks. Fallbacks keep the dark colours.
export const highlightVariable = (id: HighlightColour, part: 'bg' | 'text') =>
  `var(--highlight-${id}-${part}, ${
    highlightColours[id][part === 'bg' ? 'background' : 'text']
  })`;
export function isHighlightColour(value: unknown): value is HighlightColour {
  return typeof value === 'string' && Object.hasOwn(highlightColours, value);
}
export function highlightMarkdown(content: string, colour: unknown) {
  const id = isHighlightColour(colour) ? colour : 'yellow';
  return `==${id === 'yellow' ? '' : `{${id}}`}${content.replace(/==/g, '\\=\\=')}==`;
}
// Deliberately a small Markdown extension, never arbitrary HTML/style attributes.
export function readHighlight(source: string, start = 0) {
  if (source.slice(start, start + 2) !== '==') return null;
  let from = start + 2;
  let colour: HighlightColour = 'yellow';
  const label = /^\{([a-z]+)\}/.exec(source.slice(from));
  if (source[from] === '{' && !label) return null;
  if (label) {
    if (!isHighlightColour(label[1])) return null;
    colour = label[1];
    from += label[0].length;
  }
  for (let to = from; to < source.length - 1; to++) {
    if (source[to] === '\n') return null;
    if (source[to] === '\\') {
      to++;
      continue;
    }
    if (source.slice(to, to + 2) === '==') {
      const content = source.slice(from, to);
      return content.trim() ? { content, colour, end: to + 2 } : null;
    }
  }
  return null;
}
