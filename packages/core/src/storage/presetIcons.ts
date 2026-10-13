import { demoHabits } from '../habits.ts';
import type { ChangeStore } from './store.ts';

// Founder-requested preset update, represented as ordinary v4 habit edits.
// The raw history remembers past icon choices even after Undo, so reopening
// never reapplies an assignment the user has undone or explicitly removed.
export function applyPresetIcons(store: ChangeStore): number {
  if (!store.canEdit()) return 0;
  const { events, replay } = store.getSnapshot();
  const seed = events[0];
  if (seed?.type !== 'initialize') return 0;
  // Recognize the complete original preset seed, not a custom habit that happens
  // to use an ID such as "read" in an imported archive.
  if (
    !demoHabits.every((preset) =>
      seed.habits.some(
        (habit) =>
          habit.id === preset.id &&
          habit.name === preset.name &&
          habit.unit === preset.unit,
      ),
    )
  )
    return 0;
  const previouslyChosen = new Set<string>();
  for (const event of events) {
    if (event.type === 'initialize') {
      for (const habit of event.habits)
        if (habit.icon) previouslyChosen.add(habit.id);
    } else if ('change' in event && event.change.kind === 'habit') {
      if (event.change.before?.icon || event.change.after?.icon)
        previouslyChosen.add(event.change.habitId);
    }
  }
  let applied = 0;
  for (const [index, before] of replay.state.habits.entries()) {
    const preset = demoHabits.find(
      (habit) => habit.id === before.id && habit.name === before.name,
    );
    if (!preset?.icon || before.icon || previouslyChosen.has(before.id))
      continue;
    if (
      !store.change({
        kind: 'habit',
        habitId: before.id,
        index,
        before,
        after: { ...before, icon: preset.icon },
      })
    )
      break;
    applied++;
  }
  return applied;
}
