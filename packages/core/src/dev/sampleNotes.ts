import type { EventMeta, HabitNote, StoredEvent } from '../storage/model.ts';

// Fictional extra notes for the isolated sample store only, so both apps show
// several notes per habit. The v7 descriptions stay as each habit's Info
// note, exercising the description-to-note path the first time one is edited.
const extras: Record<string, HabitNote[]> = {
  walk: [
    {
      id: 'sample-why',
      title: 'Why',
      text: 'Walking is the one habit that makes the others easier.\n\n- I think more clearly afterwards.\n- It is the easiest way to get **outside** on a busy day.',
    },
    {
      id: 'sample-rules',
      title: 'Rules',
      text: '1. **Twenty minutes** counts, in one go or two.\n2. A walk to the shops counts; a treadmill counts.\n3. Rain is not an excuse, but a storm is.',
    },
  ],
  read: [
    {
      id: 'sample-links',
      title: 'Links',
      text: '- [Reading list](https://example.com/#reading-list)\n- [Library holds](https://example.com/#library)\n- [Notes app](obsidian://open?vault=Reading)',
    },
  ],
  meditate: [
    {
      id: 'sample-how',
      title: 'How',
      text: 'Sit, set a timer for ten minutes, and count breaths to ten. Start again at one whenever my mind wanders.\n\n> ==Starting again is the practice.==',
    },
  ],
};

export function withSampleNotes(
  events: StoredEvent[],
  today: string,
): StoredEvent[] {
  const seed = events[0];
  if (seed?.type !== 'initialize') throw new Error('Missing sample seed.');
  const result = [...events];
  const meta = (): EventMeta => ({
    version: 23,
    id: `sample_note_${result.length + 1}`,
    sequence: result.length + 1,
    recordedAt: `${today}T11:30:00.000Z`,
    timeZone: 'UTC',
    utcOffsetMinutes: 0,
  });
  for (const [habitId, notes] of Object.entries(extras)) {
    const habit = seed.habits.find((item) => item.id === habitId);
    if (!habit) continue;
    // After the description, which reads first as Info.
    const offset = habit.description === undefined ? 0 : 1;
    notes.forEach((note, index) => {
      const metadata = meta();
      result.push({
        ...metadata,
        type: 'change',
        groupId: metadata.id,
        change: {
          kind: 'note',
          habitId,
          before: null,
          after: { index: offset + index, note },
        },
      });
    });
  }
  return result;
}
