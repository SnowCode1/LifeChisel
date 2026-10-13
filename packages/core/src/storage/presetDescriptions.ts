import { demoHabits } from '../habits.ts';
import {
  genericPlaceholderDescription,
  presetDescriptions,
} from '../presetDescriptions.ts';
import type { ChangeStore } from './store.ts';

// Requested one-time population of habits that existed before descriptions.
// Raw history remembers an assignment/removal/Undo so it never reappears.
export function applyPlaceholderDescriptions(store: ChangeStore): number {
  if (!store.canEdit()) return 0;
  const { events, replay } = store.getSnapshot();
  const eligible = new Set<string>(),
    previouslyChosen = new Set<string>();
  for (const event of events) {
    if (event.type === 'initialize')
      for (const habit of event.habits) {
        if (event.version < 7) eligible.add(habit.id);
        if (habit.description !== undefined) previouslyChosen.add(habit.id);
      }
    else if (event.change.kind === 'habit') {
      if (
        event.version < 7 &&
        event.change.before === null &&
        event.change.after
      )
        eligible.add(event.change.habitId);
      if (
        event.change.before?.description !== undefined ||
        event.change.after?.description !== undefined
      )
        previouslyChosen.add(event.change.habitId);
    }
  }
  let applied = 0;
  for (const [index, before] of replay.state.habits.entries()) {
    if (
      !eligible.has(before.id) ||
      before.description !== undefined ||
      previouslyChosen.has(before.id)
    )
      continue;
    const preset = demoHabits.find(
      (habit) => habit.id === before.id && habit.name === before.name,
    );
    const description = preset
      ? presetDescriptions[before.id]
      : genericPlaceholderDescription;
    if (
      !store.change({
        kind: 'habit',
        habitId: before.id,
        index,
        before,
        after: { ...before, description },
      })
    )
      break;
    applied++;
  }
  return applied;
}
