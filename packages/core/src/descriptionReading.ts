import {
  parseDescription,
  descriptionSummary,
  type DescriptionToken,
} from './description.ts';

export const DESCRIPTION_EXCERPT_LENGTH = 600;
// The card is a bounded text excerpt, not a hidden full rich-text document.
// Links are intentionally only interactive in the full reader.
export function descriptionExcerpt(text: string): string {
  let source = text.slice(0, DESCRIPTION_EXCERPT_LENGTH);
  if (source.length < text.length) {
    const boundary = Math.max(
      source.lastIndexOf(' '),
      source.lastIndexOf('\n'),
    );
    if (boundary > source.length / 2) source = source.slice(0, boundary);
    // Avoid an unmatched high surrogate at a character boundary.
    source = source.replace(/[\uD800-\uDBFF]$/, '');
  }
  const summary = descriptionSummary(source);
  if (summary) return summary;
  // A note consisting only of a code block still needs a readable card.
  return parseDescription(source)
    .filter((token) => token.type === 'fence' || token.type === 'code_block')
    .map((token) => token.content)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ReadingPassage = { key: string; tokens: DescriptionToken[] };
// Five near-limit documents at most; raw source is bounded too. This is a
// disposable read cache, never another projection or a saved note store.
const cache = new Map<string, ReadingPassage[]>();
let characters = 0;
const MAX_CACHED_CHARACTERS = 100000;
export function descriptionReadingPassages(text: string): ReadingPassage[] {
  const saved = cache.get(text);
  if (saved) {
    cache.delete(text);
    cache.set(text, saved);
    return saved;
  }
  const result: ReadingPassage[] = [];
  let block: DescriptionToken[] = [],
    depth = 0;
  function append(tokens: DescriptionToken[]) {
    result.push({ key: String(result.length), tokens });
  }
  function finish() {
    const opening = block[0];
    if (
      opening.type !== 'bullet_list_open' &&
      opening.type !== 'ordered_list_open'
    ) {
      append(block);
      return;
    }
    // Virtualize top-level list items as well, so one long checklist does not
    // become a single giant mounted row. Nested lists remain intact.
    let start = 1,
      level = 0,
      item = 0;
    for (let index = 1; index < block.length - 1; index++) {
      level += block[index].nesting;
      if (level !== 0) continue;
      const copy: DescriptionToken = Object.assign(
        Object.create(Object.getPrototypeOf(opening)),
        opening,
        { attrs: opening.attrs?.map((attribute) => [...attribute]) ?? null },
      );
      if (opening.type === 'ordered_list_open')
        copy.attrSet(
          'start',
          String(Number(opening.attrGet('start') ?? 1) + item),
        );
      append([copy, ...block.slice(start, index + 1), block.at(-1)!]);
      start = index + 1;
      item++;
    }
  }
  for (const token of parseDescription(text)) {
    block.push(token);
    depth += token.nesting;
    if (depth === 0) {
      finish();
      block = [];
    }
  }
  if (text.length <= MAX_CACHED_CHARACTERS) {
    cache.set(text, result);
    characters += text.length;
    while (cache.size > 5 || characters > MAX_CACHED_CHARACTERS) {
      const first = cache.keys().next().value!;
      cache.delete(first);
      characters -= first.length;
    }
  }
  return result;
}
