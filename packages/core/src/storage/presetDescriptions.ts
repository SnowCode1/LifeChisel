import { demoHabits } from '../habits.ts';
import {
  genericPlaceholderDescription,
  presetDescriptions,
} from '../presetDescriptions.ts';
import { addNote, habitNotes, LEGACY_NOTE_TITLE } from '../notes.ts';
import type { ChangeStore } from './store.ts';

// Requested one-time population of habits that existed before descriptions.
// Raw history remembers an assignment/removal/Undo so it never reappears.
// From v23 the placeholder is an ordinary undoable Info note.
export function applyPlaceholderDescriptions(store: ChangeStore): number {
  if (!store.canEdit()) return 0;
  const { events, replay } = store.getSnapshot();
  const eligible = new Set<string>(),
    previouslyChosen = new Set<string>();
  for (const event of events) {
    if (event.type === 'initialize')
      for (const habit of event.habits) {
        if (event.version < 7) eligible.add(habit.id);
        if (habit.description !== undefined || event.notes?.[habit.id])
          previouslyChosen.add(habit.id);
      }
    else if (event.change.kind === 'note')
      previouslyChosen.add(event.change.habitId);
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
  for (const before of replay.state.habits) {
    if (
      !eligible.has(before.id) ||
      habitNotes(replay.state, before).length ||
      previouslyChosen.has(before.id)
    )
      continue;
    const preset = demoHabits.find(
      (habit) => habit.id === before.id && habit.name === before.name,
    );
    const description = preset
      ? presetDescriptions[before.id]
      : genericPlaceholderDescription;
    const note = addNote(
      store.getSnapshot().replay.state,
      before.id,
      LEGACY_NOTE_TITLE,
      description,
      'info',
    );
    if (!note || !store.change(note)) break;
    applied++;
  }
  return applied;
}
