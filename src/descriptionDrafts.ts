import { descriptionDrafts } from './storage/descriptionDraft.native';
import { memoryDrafts } from '@onpurpose/core/storage/descriptionDraftModel';
const sampleDrafts = memoryDrafts();
export const draftsFor = (temporary: boolean) =>
  temporary ? sampleDrafts : descriptionDrafts;
// Note draft keys come from core `noteDraftKey`, shared with the web app.
