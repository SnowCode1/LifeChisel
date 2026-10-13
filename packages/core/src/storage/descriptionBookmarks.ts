import {
  descriptionPositionKey,
  type DescriptionPosition,
} from '../descriptionPosition.ts';
import type { DescriptionDraft, DraftPort } from './descriptionDraftModel.ts';

export function descriptionResume(
  saved: DescriptionDraft | null,
  bookmark: DescriptionDraft | null,
  initial: string,
  base: string,
) {
  const matching =
    saved?.text === initial && saved.version === 2 && saved.position
      ? saved
      : bookmark?.text === initial
        ? bookmark
        : null;
  return {
    position: matching?.version === 2 ? matching.position : undefined,
    draft:
      saved &&
      saved.text !== initial &&
      !(saved.text === saved.base && saved.base !== base)
        ? saved
        : null,
  };
}

export async function rememberDescriptionPosition(
  port: DraftPort,
  key: string,
  text: string,
  position?: DescriptionPosition,
) {
  if (!position) return;
  await port.put(descriptionPositionKey(key), {
    version: 2,
    base: text,
    text,
    position,
  });
}

// Called when the outer habit form applies its draft. Keep the matching location
// before removing unfinished text; positions never enter the habit change log.
export async function completeDescriptionDraft(
  port: DraftPort,
  key: string,
  text: string,
  appliedKey = key,
) {
  await port.complete(key, text, appliedKey);
}
