import {
  serializedDrafts,
  validateDraft,
  type DraftPort,
} from '@onpurpose/core/storage/descriptionDraftModel';
export const descriptionDrafts: DraftPort = serializedDrafts({
  async get(key) {
    const raw = localStorage.getItem(`onpurpose.description-draft.${key}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    validateDraft(parsed);
    return parsed;
  },
  async put(key, draft) {
    validateDraft(draft);
    localStorage.setItem(
      `onpurpose.description-draft.${key}`,
      JSON.stringify(draft),
    );
  },
  async remove(key) {
    localStorage.removeItem(`onpurpose.description-draft.${key}`);
  },
});
