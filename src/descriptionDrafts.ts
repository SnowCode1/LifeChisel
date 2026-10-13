import { descriptionDrafts } from './storage/descriptionDraft.native';
import { memoryDrafts } from '@onpurpose/core/storage/descriptionDraftModel';
const sampleDrafts = memoryDrafts();
export const draftsFor = (temporary: boolean) =>
  temporary ? sampleDrafts : descriptionDrafts;
export const descriptionDraftKey = (id?: string) =>
  id ? `habit-${id}` : 'new-habit';
