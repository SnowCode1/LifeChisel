import { parseDescription, type DescriptionToken } from './description.ts';

export type DescriptionPassage = {
  tokens: DescriptionToken[];
  changed: boolean;
};
type Block = { tokens: DescriptionToken[]; signature: string };
function tokenSignature(token: DescriptionToken): unknown {
  // Source line maps move when text is inserted above an unchanged passage.
  return [
    token.type,
    token.tag,
    token.nesting,
    token.hidden,
    token.attrs,
    token.children ? null : token.content,
    token.children?.map(tokenSignature),
  ];
}
function blocks(text: string): Block[] {
  const result: Block[] = [];
  let passage: DescriptionToken[] = [],
    depth = 0;
  for (const token of parseDescription(text)) {
    passage.push(token);
    depth += token.nesting;
    if (depth === 0) {
      result.push({
        tokens: passage,
        signature: JSON.stringify(passage.map(tokenSignature)),
      });
      passage = [];
    }
  }
  return result;
}

// Compare complete Markdown passages so lists, code and nested formatting stay
// intact. Cap the LCS matrix; unrelated long notes must never allocate n*m RAM.
export function descriptionDiff(before: string, after: string) {
  const oldBlocks = blocks(before),
    newBlocks = blocks(after);
  const oldSame = new Set<number>(),
    newSame = new Set<number>();
  let start = 0,
    oldEnd = oldBlocks.length,
    newEnd = newBlocks.length;
  const same = (a: number, b: number) =>
    oldBlocks[a].signature === newBlocks[b].signature;
  while (start < oldEnd && start < newEnd && same(start, start)) {
    oldSame.add(start);
    newSame.add(start);
    start++;
  }
  while (oldEnd > start && newEnd > start && same(oldEnd - 1, newEnd - 1)) {
    oldSame.add(--oldEnd);
    newSame.add(--newEnd);
  }
  const rows = oldEnd - start,
    columns = newEnd - start;
  if (rows && columns && (rows + 1) * (columns + 1) <= 250000) {
    const width = columns + 1;
    const lengths = new Uint16Array((rows + 1) * width);
    for (let a = rows - 1; a >= 0; a--)
      for (let b = columns - 1; b >= 0; b--)
        lengths[a * width + b] = same(start + a, start + b)
          ? 1 + lengths[(a + 1) * width + b + 1]
          : Math.max(lengths[(a + 1) * width + b], lengths[a * width + b + 1]);
    let a = 0,
      b = 0;
    while (a < rows && b < columns) {
      if (same(start + a, start + b)) {
        oldSame.add(start + a++);
        newSame.add(start + b++);
      } else if (lengths[(a + 1) * width + b] >= lengths[a * width + b + 1])
        a++;
      else b++;
    }
  }
  // For a large unmatched middle, mark that whole region. Common ends stay quiet.
  const passages = (
    source: Block[],
    unchanged: Set<number>,
  ): DescriptionPassage[] =>
    source.map((block, index) => ({
      tokens: block.tokens,
      changed: !unchanged.has(index),
    }));
  return {
    before: passages(oldBlocks, oldSame),
    after: passages(newBlocks, newSame),
  };
}
