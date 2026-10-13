import type { HistoryAction } from './storage/model.ts';

// Match visible History's active actions and authoritative sequence order.
// Keep repeated content: its Before version may contain a different note.
// Filtering duplicates would hide that recoverable text.
export function descriptionVersions(
  actions: readonly HistoryAction[],
  habitId: string,
) {
  const versions: HistoryAction[] = [];
  for (let index = actions.length - 1; index >= 0; index--) {
    const action = actions[index]!;
    const change = action.change;
    if (
      change.kind !== 'habit' ||
      change.habitId !== habitId ||
      !change.after ||
      change.before?.description === change.after.description
    )
      continue;
    versions.push(action);
  }
  return versions;
}
